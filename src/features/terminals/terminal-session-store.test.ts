import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScriptEvent } from "@/lib/api";

const apiMocks = vi.hoisted(() => ({
	spawnTerminalSession: vi.fn(),
	stopTerminal: vi.fn(),
	writeTerminalStdin: vi.fn(),
	resizeTerminal: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
	spawnTerminalSession: apiMocks.spawnTerminalSession,
	stopTerminal: apiMocks.stopTerminal,
	writeTerminalStdin: apiMocks.writeTerminalStdin,
	resizeTerminal: apiMocks.resizeTerminal,
}));

import {
	attach,
	closeSession,
	ensureSpawned,
	getBuffer,
	resize,
	writeStdin,
} from "./terminal-session-store";

let emit: ((event: ScriptEvent) => void) | null = null;

beforeEach(() => {
	vi.clearAllMocks();
	emit = null;
	apiMocks.spawnTerminalSession.mockImplementation(
		(_sessionId: string, onEvent: (event: ScriptEvent) => void) => {
			emit = onEvent;
			return Promise.resolve();
		},
	);
	apiMocks.stopTerminal.mockResolvedValue(true);
	apiMocks.writeTerminalStdin.mockResolvedValue(true);
	apiMocks.resizeTerminal.mockResolvedValue(true);
});

function uniqueId() {
	return `s-${Math.random().toString(36).slice(2)}`;
}

describe("terminal-session-store", () => {
	it("spawns once for a running session", () => {
		const id = uniqueId();
		ensureSpawned(id, "r1", "w1");
		ensureSpawned(id, "r1", "w1");
		expect(apiMocks.spawnTerminalSession).toHaveBeenCalledTimes(1);
	});

	it("buffers output chunks and replays via attach", () => {
		const id = uniqueId();
		ensureSpawned(id, "r1", "w1");
		emit?.({ type: "stdout", data: "hello " });
		emit?.({ type: "stdout", data: "world" });
		const chunks: string[] = [];
		const entry = attach(id, {
			onChunk: (data) => chunks.push(data),
			onStatusChange: () => {},
		});
		expect(entry?.chunks).toEqual(["hello ", "world"]);
		emit?.({ type: "stdout", data: "!" });
		expect(chunks).toEqual(["!"]);
	});

	it("marks the buffer exited with the exit code", () => {
		const id = uniqueId();
		ensureSpawned(id, "r1", "w1");
		const statuses: Array<[string, number | null]> = [];
		attach(id, {
			onChunk: () => {},
			onStatusChange: (status, code) => statuses.push([status, code]),
		});
		emit?.({ type: "exited", code: 137 });
		expect(getBuffer(id)?.runStatus).toBe("exited");
		expect(getBuffer(id)?.exitCode).toBe(137);
		expect(statuses).toEqual([["exited", 137]]);
	});

	it("respawns after exit but not while running", () => {
		const id = uniqueId();
		ensureSpawned(id, "r1", "w1");
		emit?.({ type: "exited", code: 0 });
		ensureSpawned(id, "r1", "w1");
		expect(apiMocks.spawnTerminalSession).toHaveBeenCalledTimes(2);
	});

	it("closeSession kills a running PTY and drops the buffer", () => {
		const id = uniqueId();
		ensureSpawned(id, "r1", "w1");
		closeSession(id);
		expect(apiMocks.stopTerminal).toHaveBeenCalledWith("r1", "w1", id);
		expect(getBuffer(id)).toBeNull();
	});

	it("closeSession skips the kill for exited sessions", () => {
		const id = uniqueId();
		ensureSpawned(id, "r1", "w1");
		emit?.({ type: "exited", code: 0 });
		closeSession(id);
		expect(apiMocks.stopTerminal).not.toHaveBeenCalled();
	});

	it("routes stdin and resize through the session's repo/workspace", () => {
		const id = uniqueId();
		ensureSpawned(id, "r2", "w2");
		writeStdin(id, "ls\r");
		resize(id, 120, 30);
		expect(apiMocks.writeTerminalStdin).toHaveBeenCalledWith(
			"r2",
			"w2",
			id,
			"ls\r",
		);
		expect(apiMocks.resizeTerminal).toHaveBeenCalledWith(
			"r2",
			"w2",
			id,
			120,
			30,
		);
	});
});

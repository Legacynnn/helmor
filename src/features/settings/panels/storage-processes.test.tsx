import { describe, expect, it } from "vitest";
import type { ProcessInfo } from "@/lib/api";
import { findStuckAgents } from "./storage-processes";

function proc(overrides: Partial<ProcessInfo>): ProcessInfo {
	return {
		pid: 1,
		parentPid: null,
		name: "claude",
		cpuPercent: 0,
		memoryBytes: 0,
		startTime: 0,
		workspaceId: null,
		kind: "agent",
		killable: true,
		...overrides,
	};
}

describe("findStuckAgents", () => {
	it("keeps agents without an active stream", () => {
		const procs = [
			proc({ pid: 1, workspaceId: "active-ws" }),
			proc({ pid: 2, workspaceId: "idle-ws" }),
			proc({ pid: 3, workspaceId: null }),
			proc({ pid: 4, kind: "devServer", workspaceId: "idle-ws" }),
			proc({ pid: 5, killable: false, workspaceId: "idle-ws" }),
		];
		const stuck = findStuckAgents(procs, new Set(["active-ws"]));
		expect(stuck.map((p) => p.pid)).toEqual([2, 3]);
	});
});

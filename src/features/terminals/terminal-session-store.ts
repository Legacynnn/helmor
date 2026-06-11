import {
	readTerminalScrollback,
	resizeTerminal,
	type ScriptEvent,
	spawnTerminalSession,
	stopTerminal,
	writeTerminalStdin,
} from "@/lib/api";

// Module-level buffer store for terminal sessions (PTY-backed agent CLIs
// threaded as workspace sessions). Mirrors the inspector terminal-store but
// keyed by sessionId — the session row persists in the DB; the scrollback
// here is in-memory only and dies with the app.

export type TerminalSessionRunStatus = "running" | "exited";

export type TerminalSessionBuffer = {
	sessionId: string;
	/** Stored so close/cleanup can address the PTY without re-threading
	 * repo/workspace ids (stdin/resize/stop reuse the inspector terminal
	 * commands with `instanceId = sessionId`). */
	repoId: string;
	workspaceId: string;
	chunks: string[];
	bufferedBytes: number;
	truncated: boolean;
	runStatus: TerminalSessionRunStatus;
	exitCode: number | null;
};

type Listener = {
	onChunk: (data: string) => void;
	onStatusChange: (
		status: TerminalSessionRunStatus,
		exitCode: number | null,
	) => void;
	/** Fired when the PTY process reports it has started. The pane uses this to
	 * push the current terminal size to the freshly booted process. */
	onStarted?: () => void;
};

/** ~2 MB ≈ 20k lines, well beyond xterm's scrollback. */
const MAX_CHUNK_BYTES = 2 * 1024 * 1024;

export const TRUNCATION_NOTICE =
	"\r\n\x1b[2m… earlier output truncated (buffer limit reached) …\x1b[0m\r\n";

const buffers = new Map<string, TerminalSessionBuffer>();
const listeners = new Map<string, Listener>();

function appendChunk(entry: TerminalSessionBuffer, data: string) {
	entry.chunks.push(data);
	entry.bufferedBytes += data.length;
	while (entry.bufferedBytes > MAX_CHUNK_BYTES && entry.chunks.length > 1) {
		const dropped = entry.chunks.shift();
		if (dropped === undefined) break;
		entry.bufferedBytes -= dropped.length;
		entry.truncated = true;
	}
}

export function getBuffer(sessionId: string): TerminalSessionBuffer | null {
	return buffers.get(sessionId) ?? null;
}

/** Spawn the agent CLI for this session (idempotent — the backend keeps the
 * existing PTY when one is already live, and an existing local buffer means
 * we're already attached). */
export function ensureSpawned(
	sessionId: string,
	repoId: string,
	workspaceId: string,
): TerminalSessionBuffer {
	const existing = buffers.get(sessionId);
	if (existing && existing.runStatus === "running") return existing;

	const entry: TerminalSessionBuffer = existing ?? {
		sessionId,
		repoId,
		workspaceId,
		chunks: [],
		bufferedBytes: 0,
		truncated: false,
		runStatus: "running",
		exitCode: null,
	};
	// Relaunch of an exited session: drop the prior scrollback. For a TUI agent
	// (Claude Code, Codex) that replayed frame is a full-screen snapshot that
	// doesn't scroll away — keeping it stacks a second copy of the UI under the
	// resumed CLI's redraw. The caller resets the xterm screen in tandem.
	entry.chunks = [];
	entry.bufferedBytes = 0;
	entry.truncated = false;
	entry.runStatus = "running";
	entry.exitCode = null;
	buffers.set(sessionId, entry);

	void spawnTerminalSession(sessionId, (event: ScriptEvent) => {
		const current = buffers.get(sessionId);
		if (!current) return;
		switch (event.type) {
			case "started":
				listeners.get(sessionId)?.onStarted?.();
				break;
			case "stdout":
			case "stderr": {
				appendChunk(current, event.data);
				listeners.get(sessionId)?.onChunk(event.data);
				break;
			}
			case "exited": {
				current.runStatus = "exited";
				current.exitCode = event.code;
				const tail = `\r\n\x1b[2m[Process exited with code ${
					event.code ?? "?"
				}]\x1b[0m\r\n`;
				appendChunk(current, tail);
				listeners.get(sessionId)?.onChunk(tail);
				listeners.get(sessionId)?.onStatusChange("exited", event.code);
				break;
			}
			case "error": {
				const msg = `\r\n\x1b[31m${event.message}\x1b[0m\r\n`;
				appendChunk(current, msg);
				current.runStatus = "exited";
				current.exitCode = current.exitCode ?? 1;
				listeners.get(sessionId)?.onChunk(msg);
				listeners.get(sessionId)?.onStatusChange("exited", current.exitCode);
				break;
			}
		}
	}).catch((err) => {
		const current = buffers.get(sessionId);
		if (!current) return;
		const msg = `\r\n\x1b[31mFailed to start agent: ${err}\x1b[0m\r\n`;
		appendChunk(current, msg);
		current.runStatus = "exited";
		current.exitCode = current.exitCode ?? 1;
		listeners.get(sessionId)?.onChunk(msg);
		listeners.get(sessionId)?.onStatusChange("exited", current.exitCode);
	});

	return entry;
}

/** Load persisted scrollback for a session WITHOUT spawning the agent CLI.
 * Used when re-opening a session whose in-memory buffer is gone (the app
 * restarted): we replay the saved output and surface the real exited state,
 * leaving the relaunch decision to the user. Idempotent — a buffer that
 * already exists this run is returned untouched. */
export async function loadPersisted(
	sessionId: string,
	repoId: string,
	workspaceId: string,
	status: TerminalSessionRunStatus,
): Promise<TerminalSessionBuffer> {
	const existing = buffers.get(sessionId);
	if (existing) return existing;

	const entry: TerminalSessionBuffer = {
		sessionId,
		repoId,
		workspaceId,
		chunks: [],
		bufferedBytes: 0,
		truncated: false,
		runStatus: status,
		exitCode: null,
	};
	buffers.set(sessionId, entry);

	try {
		const scrollback = await readTerminalScrollback(sessionId);
		// Don't clobber a buffer that a racing Relaunch already spawned into.
		if (
			buffers.get(sessionId) === entry &&
			entry.runStatus !== "running" &&
			entry.chunks.length === 0 &&
			scrollback?.data
		) {
			entry.chunks = [scrollback.data];
			entry.bufferedBytes = scrollback.data.length;
			entry.truncated = scrollback.truncated;
		}
	} catch (err) {
		// Non-fatal: show an empty pane rather than failing the session open.
		console.error("Failed to load terminal scrollback:", err);
	}
	return entry;
}

/** SIGTERM the PTY and drop the local buffer. Used when the session tab is
 * closed (the DB row is hidden separately by the caller). */
export function closeSession(sessionId: string) {
	const entry = buffers.get(sessionId);
	if (!entry) return;
	buffers.delete(sessionId);
	listeners.delete(sessionId);
	if (entry.runStatus === "running") {
		void stopTerminal(entry.repoId, entry.workspaceId, sessionId);
	}
}

/** Drop buffers for every terminal session in a workspace (workspace
 * archive/delete). */
export function closeAllForWorkspace(workspaceId: string) {
	for (const entry of [...buffers.values()]) {
		if (entry.workspaceId === workspaceId) closeSession(entry.sessionId);
	}
}

/** Attach the mounted xterm; returns the buffer for replay. */
export function attach(
	sessionId: string,
	listener: Listener,
): TerminalSessionBuffer | null {
	listeners.set(sessionId, listener);
	return buffers.get(sessionId) ?? null;
}

export function detach(sessionId: string) {
	listeners.delete(sessionId);
}

export function writeStdin(sessionId: string, data: string) {
	const entry = buffers.get(sessionId);
	if (!entry) return;
	void writeTerminalStdin(entry.repoId, entry.workspaceId, sessionId, data);
}

export function resize(sessionId: string, cols: number, rows: number) {
	const entry = buffers.get(sessionId);
	if (!entry) return;
	void resizeTerminal(entry.repoId, entry.workspaceId, sessionId, cols, rows);
}

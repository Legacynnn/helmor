import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	type TerminalHandle,
	TerminalOutput,
} from "@/components/terminal-output";
import { Button } from "@/components/ui/button";
import {
	attach,
	detach,
	ensureSpawned,
	getBuffer,
	loadPersisted,
	resize,
	TRUNCATION_NOTICE,
	writeStdin,
} from "./terminal-session-store";

// Serialize xterm mounts one-per-RAF (same rationale as the inspector
// terminal: N synchronous `new Terminal() + open()` calls in one commit
// stall the main thread).
const pendingXtermMounts: Array<() => void> = [];
let xtermDrainScheduled = false;
function drainXtermQueue() {
	if (pendingXtermMounts.length === 0) {
		xtermDrainScheduled = false;
		return;
	}
	requestAnimationFrame(() => {
		const cb = pendingXtermMounts.shift();
		if (cb) cb();
		drainXtermQueue();
	});
}
function scheduleXtermMount(callback: () => void): () => void {
	let cancelled = false;
	const wrapped = () => {
		if (!cancelled) callback();
	};
	pendingXtermMounts.push(wrapped);
	if (!xtermDrainScheduled) {
		xtermDrainScheduled = true;
		drainXtermQueue();
	}
	return () => {
		cancelled = true;
	};
}

type TerminalSessionPaneProps = {
	sessionId: string;
	repoId: string;
	workspaceId: string;
	/** Display name of the agent CLI, for the exited overlay. */
	agentLabel: string;
	/** The session's persisted DB status. An `exited` session (e.g. restored
	 * after an app restart) replays its history and waits for the user to
	 * relaunch — it is never auto-spawned. */
	initialStatus: string;
	isActive: boolean;
};

/** Full-pane terminal for one terminal session. Stays mounted across tab
 * switches (CSS-hidden) so scrollback survives; the PTY itself lives in the
 * backend keyed by sessionId. */
export function TerminalSessionPane({
	sessionId,
	repoId,
	workspaceId,
	agentLabel,
	initialStatus,
	isActive,
}: TerminalSessionPaneProps) {
	const termRef = useRef<TerminalHandle | null>(null);
	const [exitCode, setExitCode] = useState<number | null>(null);
	const [exited, setExited] = useState(false);

	const [renderXterm, setRenderXterm] = useState(false);
	useEffect(() => {
		const cancel = scheduleXtermMount(() => setRenderXterm(true));
		return cancel;
	}, []);

	// On mount: replay scrollback + attach the live listener. New sessions
	// spawn the agent CLI; restored (`exited`) sessions replay their persisted
	// history and wait for an explicit Relaunch instead of auto-spawning.
	useEffect(() => {
		let cancelled = false;
		let rafId: number | null = null;

		const replay = (chunks: string[], truncated: boolean) => {
			rafId = null;
			const t = termRef.current;
			if (!t) {
				rafId = requestAnimationFrame(() => replay(chunks, truncated));
				return;
			}
			if (chunks.length > 0) {
				t.clear();
				if (truncated) t.write(TRUNCATION_NOTICE);
				for (const chunk of chunks) t.write(chunk);
			}
			if (isActive) t.focus();
		};

		const listener = {
			onChunk: (data: string) => termRef.current?.write(data),
			onStatusChange: (status: "running" | "exited", code: number | null) => {
				if (cancelled) return;
				setExited(status === "exited");
				setExitCode(code);
			},
			// The PTY boots at a default size; the initial fit-resize can race the
			// spawn and be dropped. Re-push the real grid size once the process is
			// up so the CLI fills the pane width instead of rendering narrow.
			onStarted: () => {
				requestAnimationFrame(() => termRef.current?.syncSize());
			},
		};

		const live = getBuffer(sessionId);
		if (live) {
			// Already attached this run (tab switch or live session).
			setExited(live.runStatus === "exited");
			setExitCode(live.exitCode);
			attach(sessionId, listener);
			replay(live.chunks.slice(), live.truncated);
		} else if (initialStatus === "exited") {
			// Restored old session: replay history, do NOT spawn.
			setExited(true);
			const pending = loadPersisted(sessionId, repoId, workspaceId, "exited");
			attach(sessionId, listener);
			void pending.then((entry) => {
				if (!cancelled) replay(entry.chunks.slice(), entry.truncated);
			});
		} else {
			// New session: spawn the agent CLI.
			const entry = ensureSpawned(sessionId, repoId, workspaceId);
			setExited(entry.runStatus === "exited");
			setExitCode(entry.exitCode);
			attach(sessionId, listener);
			replay(entry.chunks.slice(), entry.truncated);
		}

		return () => {
			cancelled = true;
			if (rafId !== null) cancelAnimationFrame(rafId);
			detach(sessionId);
		};
		// isActive deliberately not in deps — handled by the [isActive] effect below.
	}, [sessionId, repoId, workspaceId, initialStatus]);

	// Refit + focus on activate (xterm size may have drifted while hidden).
	useEffect(() => {
		if (!isActive) return;
		const id = requestAnimationFrame(() => {
			const t = termRef.current;
			if (!t) return;
			t.refit();
			t.focus();
		});
		return () => cancelAnimationFrame(id);
	}, [isActive]);

	const handleData = useCallback(
		(data: string) => {
			writeStdin(sessionId, data);
		},
		[sessionId],
	);

	const handleResize = useCallback(
		(cols: number, rows: number) => {
			resize(sessionId, cols, rows);
		},
		[sessionId],
	);

	const handleRelaunch = useCallback(() => {
		setExited(false);
		setExitCode(null);
		// Wipe the replayed frame so the resumed CLI redraws onto a clean screen
		// (ensureSpawned drops the in-memory scrollback in tandem).
		termRef.current?.reset();
		ensureSpawned(sessionId, repoId, workspaceId);
		requestAnimationFrame(() => termRef.current?.focus());
	}, [sessionId, repoId, workspaceId]);

	return (
		<div
			hidden={!isActive}
			className="relative flex min-h-0 flex-1 flex-col bg-app-base"
		>
			{renderXterm ? (
				<TerminalOutput
					terminalRef={termRef}
					className="h-full"
					onData={handleData}
					onResize={handleResize}
				/>
			) : null}
			{exited ? (
				<div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-app-base/80 backdrop-blur-[2px]">
					<p className="text-sm text-app-muted-foreground">
						{agentLabel} exited
						{exitCode !== null ? ` with code ${exitCode}` : ""}
					</p>
					<Button
						size="sm"
						variant="secondary"
						className="cursor-pointer"
						onClick={handleRelaunch}
					>
						<RotateCcw className="size-3.5" />
						Relaunch {agentLabel}
					</Button>
				</div>
			) : null}
		</div>
	);
}

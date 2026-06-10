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

	// Spawn (idempotent) + attach + one-shot replay on mount.
	useEffect(() => {
		const entry = ensureSpawned(sessionId, repoId, workspaceId);
		setExited(entry.runStatus === "exited");
		setExitCode(entry.exitCode);
		const existing = attach(sessionId, {
			onChunk: (data) => termRef.current?.write(data),
			onStatusChange: (status, code) => {
				setExited(status === "exited");
				setExitCode(code);
			},
		});

		let rafId: number | null = null;
		const tryReplay = () => {
			rafId = null;
			const t = termRef.current;
			if (!t) {
				rafId = requestAnimationFrame(tryReplay);
				return;
			}
			if (existing && existing.chunks.length > 0) {
				const snapshot = existing.chunks.slice();
				t.clear();
				if (existing.truncated) t.write(TRUNCATION_NOTICE);
				for (const chunk of snapshot) t.write(chunk);
			}
			if (isActive) t.focus();
		};
		tryReplay();

		return () => {
			if (rafId !== null) cancelAnimationFrame(rafId);
			detach(sessionId);
		};
		// isActive deliberately not in deps — handled by the [isActive] effect below.
	}, [sessionId, repoId, workspaceId]);

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

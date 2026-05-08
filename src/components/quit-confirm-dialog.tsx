import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { requestQuit } from "@/lib/api";
import type { SessionRunState } from "@/lib/session-run-state";

export function QuitConfirmDialog({
	sessionRunStates,
	dirtyFileTabCount = 0,
}: {
	sessionRunStates: ReadonlyMap<string, SessionRunState>;
	dirtyFileTabCount?: number;
}) {
	const [open, setOpen] = useState(false);
	const runningRef = useRef(sessionRunStates);
	runningRef.current = sessionRunStates;
	const dirtyFileTabCountRef = useRef(dirtyFileTabCount);
	dirtyFileTabCountRef.current = dirtyFileTabCount;

	const handleQuit = useCallback(async (force: boolean) => {
		setOpen(false);
		await requestQuit(force);
	}, []);

	useEffect(() => {
		let disposed = false;
		let unlisten: (() => void) | undefined;

		// Rust intercepts every OS-level exit path (close button, Cmd+Q,
		// app-menu Quit, programmatic ExitRequested) and emits this
		// event. We're the only gate that knows about in-flight tasks and
		// unsaved in-memory file tabs.
		void listen("helmor://quit-requested", () => {
			if (runningRef.current.size === 0 && dirtyFileTabCountRef.current === 0) {
				void requestQuit(false);
				return;
			}
			setOpen(true);
		}).then((fn) => {
			if (disposed) {
				fn();
				return;
			}
			unlisten = fn;
		});

		return () => {
			disposed = true;
			unlisten?.();
		};
	}, []);

	const count = sessionRunStates.size;
	const hasRunning = count > 0;
	const hasDirtyFiles = dirtyFileTabCount > 0;
	const description = (() => {
		if (hasRunning && hasDirtyFiles) {
			return `There are ${count} tasks in progress and ${dirtyFileTabCount} file tabs with unsaved changes. Quitting now will cancel the tasks and discard those edits.`;
		}
		if (hasDirtyFiles) {
			return dirtyFileTabCount === 1
				? "There is 1 file tab with unsaved changes. Quitting now will discard those edits."
				: `There are ${dirtyFileTabCount} file tabs with unsaved changes. Quitting now will discard those edits.`;
		}
		return count === 1
			? "There is 1 task in progress. Quitting now will cancel it."
			: `There are ${count} tasks in progress. Quitting now will cancel them.`;
	})();

	return (
		<ConfirmDialog
			open={open}
			onOpenChange={setOpen}
			title="Quit Helmor?"
			description={description}
			confirmLabel="Quit anyway"
			onConfirm={() => void handleQuit(hasRunning)}
		/>
	);
}

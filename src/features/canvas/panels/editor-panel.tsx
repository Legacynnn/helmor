import { useEffect, useRef, useState } from "react";
import { stopEventPropagation } from "tldraw";
import { readEditorFile, writeEditorFile } from "@/lib/api";
import { createFileEditor } from "@/lib/monaco-runtime";
import { useCanvasWorkspace } from "../canvas-workspace-context";
import { parsePanelConfig } from "../panel-config";
import type { PanelShape } from "../shapes/panel-shape";

type FileEditorController = Awaited<ReturnType<typeof createFileEditor>>;

const SAVE_DEBOUNCE_MS = 600;

function joinPath(root: string, rel: string): string {
	return `${root.replace(/\/$/, "")}/${rel.replace(/^\//, "")}`;
}

type Status = "empty" | "loading" | "ready" | "error";

/** Monaco file editor bound to one workspace-relative file. Loads content from
 * disk on mount and debounce-saves edits back. `automaticLayout` handles panel
 * resizes. The open file is persisted in `config.filePath` so it reopens on
 * reload. */
export function EditorPanelBody({ shape }: { shape: PanelShape }) {
	const { workspaceRootPath } = useCanvasWorkspace();
	const filePath = parsePanelConfig(shape.props.config).filePath ?? null;
	const containerRef = useRef<HTMLDivElement>(null);
	const [status, setStatus] = useState<Status>("empty");

	useEffect(() => {
		if (!filePath || !workspaceRootPath || !containerRef.current) {
			setStatus("empty");
			return;
		}
		const abs = joinPath(workspaceRootPath, filePath);
		const container = containerRef.current;
		let disposed = false;
		let controller: FileEditorController | null = null;
		let saveTimer: ReturnType<typeof setTimeout> | null = null;
		setStatus("loading");

		void (async () => {
			try {
				const { content } = await readEditorFile(abs);
				if (disposed) return;
				controller = await createFileEditor({ container, path: abs, content });
				if (disposed) {
					controller.dispose();
					return;
				}
				controller.onDidChangeModelContent((value: string) => {
					if (saveTimer) clearTimeout(saveTimer);
					saveTimer = setTimeout(() => {
						void writeEditorFile(abs, value).catch(() => {});
					}, SAVE_DEBOUNCE_MS);
				});
				setStatus("ready");
			} catch {
				if (!disposed) setStatus("error");
			}
		})();

		return () => {
			disposed = true;
			if (saveTimer) clearTimeout(saveTimer);
			controller?.dispose();
		};
	}, [filePath, workspaceRootPath]);

	if (!filePath) {
		return (
			<div className="flex size-full items-center justify-center p-4 text-center text-app-muted-foreground text-xs">
				No file open. Open one from a File-manager panel.
			</div>
		);
	}

	return (
		<div className="relative size-full bg-app-base">
			<div
				ref={containerRef}
				className="size-full"
				onPointerDown={stopEventPropagation}
				onWheelCapture={stopEventPropagation}
			/>
			{status === "loading" ? (
				<Overlay text="Loading…" />
			) : status === "error" ? (
				<Overlay text="Failed to open file." />
			) : null}
		</div>
	);
}

function Overlay({ text }: { text: string }) {
	return (
		<div className="absolute inset-0 flex items-center justify-center bg-app-base text-app-muted-foreground text-xs">
			{text}
		</div>
	);
}

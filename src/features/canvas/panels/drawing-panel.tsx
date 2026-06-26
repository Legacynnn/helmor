import { useCallback, useEffect, useRef } from "react";
import { type Editor, Tldraw } from "tldraw";
import { parsePanelConfig } from "../panel-config";
import type { PanelShape } from "../shapes/panel-shape";
import { usePanelConfigWriter } from "../use-panel-config-writer";

const SNAPSHOT_DEBOUNCE_MS = 600;

/** Whiteboard panel: a nested, self-contained tldraw editor whose document
 * snapshot is persisted into `config.drawing`. Independent from the host
 * canvas (its own store/tools), so drawing here never touches panel layout. */
export function DrawingPanelBody({ shape }: { shape: PanelShape }) {
	const write = usePanelConfigWriter(shape.id);
	const initial = useRef(parsePanelConfig(shape.props.config).drawing);
	const cleanup = useRef<(() => void) | null>(null);

	useEffect(() => () => cleanup.current?.(), []);

	const handleMount = useCallback(
		(editor: Editor) => {
			if (initial.current) {
				try {
					editor.loadSnapshot(JSON.parse(initial.current));
				} catch {
					// Corrupt snapshot — start from a blank board.
				}
			}
			let timer: ReturnType<typeof setTimeout> | null = null;
			const unlisten = editor.store.listen(
				() => {
					if (timer) clearTimeout(timer);
					timer = setTimeout(() => {
						try {
							write({ drawing: JSON.stringify(editor.getSnapshot()) });
						} catch {
							// best-effort persistence
						}
					}, SNAPSHOT_DEBOUNCE_MS);
				},
				{ source: "user", scope: "document" },
			);
			cleanup.current = () => {
				if (timer) clearTimeout(timer);
				unlisten();
			};
		},
		[write],
	);

	return (
		<div className="relative size-full bg-app-base">
			<Tldraw onMount={handleMount} />
		</div>
	);
}

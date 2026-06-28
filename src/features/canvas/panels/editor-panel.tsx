import {
	type PointerEvent as ReactPointerEvent,
	useRef,
	useState,
} from "react";
import { parsePanelConfig } from "../panel-config";
import { usePanelConfigWriter } from "../use-panel-config-writer";
import { EditorPane } from "./editor-pane";
import { FileExplorer } from "./file-explorer";

const MIN_TREE_WIDTH = 160;
const MAX_TREE_WIDTH = 520;
const DEFAULT_TREE_WIDTH = 240;

/** Combined file browser + editor. One panel, two panes: the Monaco editor on
 * the left (content) and the workspace file tree on the right (files), split by
 * a draggable divider. Selecting a file in the tree loads it into the editor
 * and persists it as `config.filePath`, so a reload (or opening a file from the
 * Git panel) reopens the same file. */
export function EditorPanelBody({
	nodeId,
	config,
}: {
	nodeId: string;
	config: string;
}) {
	const write = usePanelConfigWriter(nodeId, config);
	const [selected, setSelected] = useState<string | null>(
		() => parsePanelConfig(config).filePath ?? null,
	);
	const [treeWidth, setTreeWidth] = useState(DEFAULT_TREE_WIDTH);
	const rootRef = useRef<HTMLDivElement>(null);

	const selectFile = (filePath: string) => {
		setSelected(filePath);
		write({ filePath });
	};

	// Resize the explorer by dragging the divider. Width is measured from the
	// panel's right edge so the tree grows leftward as the pointer moves left.
	const onDividerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation(); // don't let React Flow start a pan/selection
		const root = rootRef.current;
		if (!root) return;
		const rightEdge = root.getBoundingClientRect().right;
		const onMove = (ev: PointerEvent) => {
			const next = Math.min(
				MAX_TREE_WIDTH,
				Math.max(MIN_TREE_WIDTH, rightEdge - ev.clientX),
			);
			setTreeWidth(next);
		};
		const onUp = () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
		};
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
	};

	return (
		<div ref={rootRef} className="flex size-full">
			<div className="min-w-0 flex-1">
				<EditorPane filePath={selected} />
			</div>
			<div
				className="w-1 shrink-0 cursor-col-resize bg-app-border transition-colors hover:bg-app-accent"
				onPointerDown={onDividerDown}
			/>
			<div
				className="shrink-0 overflow-hidden border-app-border border-l"
				style={{ width: treeWidth }}
			>
				<FileExplorer
					selectedPath={selected ?? undefined}
					onSelect={selectFile}
				/>
			</div>
		</div>
	);
}

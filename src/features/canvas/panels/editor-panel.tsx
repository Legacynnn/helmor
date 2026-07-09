import { useState } from "react";
import { parsePanelConfig } from "../panel-config";
import { usePanelConfigWriter } from "../use-panel-config-writer";
import { EditorPane } from "./editor-pane";
import { FileExplorer } from "./file-explorer";

const TREE_WIDTH = 240;

/** The Editor panel: the Monaco editor (left) beside the workspace file tree
 * (right), both embedded inside — and scoped to — this panel. Selecting a file
 * in the tree loads it into the editor and persists it as `config.filePath`, so
 * a reload (or opening a file from the Git panel) reopens the same file. */
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

	const selectFile = (filePath: string) => {
		setSelected(filePath);
		write({ filePath });
	};

	return (
		<div className="flex size-full">
			<div className="min-w-0 flex-1">
				<EditorPane filePath={selected} />
			</div>
			<div
				className="shrink-0 overflow-hidden border-app-border border-l"
				style={{ width: TREE_WIDTH }}
			>
				<FileExplorer
					selectedPath={selected ?? undefined}
					onSelect={selectFile}
				/>
			</div>
		</div>
	);
}

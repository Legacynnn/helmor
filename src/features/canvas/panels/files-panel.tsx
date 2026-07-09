import { useState } from "react";
import { parsePanelConfig } from "../panel-config";
import { usePanelConfigWriter } from "../use-panel-config-writer";
import { EditorPane } from "./editor-pane";
import { FileExplorer } from "./file-explorer";

const TREE_WIDTH = 240;

/** The Files panel: the workspace file tree (left) beside an embedded editor
 * (right) at a fixed width. Selecting a file in the tree loads it into the
 * editor and persists it as `config.filePath`, so a reload (or opening a file
 * from the Git panel) reopens the same file. The plain Editor panel
 * (`editor-panel.tsx`) is tree-less — the tree lives here only. */
export function FilesPanelBody({
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
			<div
				className="shrink-0 overflow-hidden border-app-border border-r"
				style={{ width: TREE_WIDTH }}
			>
				<FileExplorer
					selectedPath={selected ?? undefined}
					onSelect={selectFile}
				/>
			</div>
			<div className="min-w-0 flex-1">
				<EditorPane filePath={selected} />
			</div>
		</div>
	);
}

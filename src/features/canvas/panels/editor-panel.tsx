import { useState } from "react";
import { parsePanelConfig } from "../panel-config";
import { EditorPane } from "./editor-pane";

/** The plain Editor panel: just the Monaco editor, no file tree. It shows the
 * file persisted in `config.filePath` (e.g. opened from the Git panel). The
 * file tree lives on the dedicated Files panel (`files-panel.tsx`). */
export function EditorPanelBody({
	config,
}: {
	nodeId: string;
	config: string;
}) {
	const [selected] = useState<string | null>(
		() => parsePanelConfig(config).filePath ?? null,
	);

	return (
		<div className="size-full">
			<EditorPane filePath={selected} />
		</div>
	);
}

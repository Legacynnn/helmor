import { AllFilesPanel } from "@/features/file-browser";
import { useEditorActions } from "@/shell/editor-actions-context";

interface Props {
	workspaceRootPath: string | null;
	workspaceId: string | null;
	activeAbsolutePath: string | null;
}

/**
 * Inspector mount-point for the file-browser tree. Routes file-opens through
 * the shared `EditorActionsContext` so palette, content-search, and tree all
 * share one path (and one recents LRU).
 */
export function AllFilesSection(props: Props) {
	const { openFile } = useEditorActions();
	return <AllFilesPanel {...props} onOpenFile={openFile} />;
}

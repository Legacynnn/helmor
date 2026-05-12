import type { ReactNode } from "react";

import {
	ContentSearchPanel,
	useContentSearchController,
} from "@/features/content-search";

interface Props {
	workspaceRootPath: string | null;
	/** Default sidebar content (workspace list). Rendered when content search is closed. */
	fallback: ReactNode;
}

/**
 * Push-view gate for the left sidebar. When content search is open, replaces
 * the workspace list with the search panel; the back button (or Esc, or the
 * shortcut toggle) restores the fallback view.
 */
export function LeftSidebarContent({ workspaceRootPath, fallback }: Props) {
	const controller = useContentSearchController();
	return (
		<div className="min-h-0 flex-1">
			{controller.isOpen ? (
				<ContentSearchPanel
					workspaceRootPath={workspaceRootPath}
					onClose={controller.close}
				/>
			) : (
				fallback
			)}
		</div>
	);
}

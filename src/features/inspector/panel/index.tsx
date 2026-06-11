import type { ReactNode, RefObject } from "react";
import { INSPECTOR_SECTION_HEADER_CLASS } from "../layout";
import type { PanelTabId } from "./state";
import { PanelTabStrip } from "./tab-strip";

type InspectorPanelProps = {
	/** Ref handed to the inspector's resize hook so it can write
	 * `style.height` directly during drag, bypassing React renders. */
	sectionRef?: RefObject<HTMLElement | null>;
	activeTab: PanelTabId;
	onTabChange: (tab: PanelTabId) => void;
	filesPage: ReactNode;
	gitPage: ReactNode;
	searchPage: ReactNode;
	actionsPage: ReactNode;
};

const PAGE_LABELS: Record<PanelTabId, string> = {
	files: "Inspector section Files",
	git: "Inspector section Git",
	search: "Inspector section Search",
	actions: "Inspector section Actions",
};

/**
 * First inspector section: an icon tab strip (Files / Git / Search / Actions)
 * with one page mounted at a time. The section is the inspector's vertical
 * slack absorber — height is written imperatively via `sectionRef`.
 */
export function InspectorPanel({
	sectionRef,
	activeTab,
	onTabChange,
	filesPage,
	gitPage,
	searchPage,
	actionsPage,
}: InspectorPanelProps) {
	const pages: Record<PanelTabId, ReactNode> = {
		files: filesPage,
		git: gitPage,
		search: searchPage,
		actions: actionsPage,
	};

	return (
		<section
			ref={sectionRef}
			aria-label="Inspector panel"
			data-focus-scope="inspector"
			className="flex min-h-0 shrink-0 flex-col overflow-hidden border-b border-border/60 bg-sidebar"
			// Height written via `sectionRef` by `useWorkspaceInspectorSidebar`
			// — kept out of JSX so incidental re-renders can't clobber it.
			style={{ contain: "layout style paint" }}
		>
			<div className={INSPECTOR_SECTION_HEADER_CLASS}>
				<PanelTabStrip activeTab={activeTab} onTabChange={onTabChange} />
			</div>
			<div
				role="tabpanel"
				id={`inspector-panel-page-${activeTab}`}
				aria-labelledby={`inspector-panel-tab-${activeTab}`}
				aria-label={PAGE_LABELS[activeTab]}
				className="flex min-h-0 flex-1 flex-col"
			>
				{pages[activeTab]}
			</div>
		</section>
	);
}

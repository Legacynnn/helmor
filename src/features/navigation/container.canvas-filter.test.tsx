import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceGroup, WorkspaceRow } from "@/lib/api";
import { WorkspacesSidebarContainer } from "./container";

const useControllerMock = vi.hoisted(() => vi.fn());
// Capture the props the container hands to the presentational sidebar, so we can
// assert canvas rows are stripped from BOTH the active groups and the archived
// list without depending on the archived section's collapsed render state.
const sidebarPropsSpy = vi.hoisted(() => vi.fn());

vi.mock("./hooks/use-controller", () => ({
	useWorkspacesSidebarController: useControllerMock,
}));

vi.mock("./index", () => ({
	WorkspacesSidebar: (props: unknown) => {
		sidebarPropsSpy(props);
		return null;
	},
}));

const normalRow: WorkspaceRow = {
	id: "normal-1",
	title: "Normal WS",
	state: "ready",
	hasUnread: false,
	space: "normal",
};

const canvasRow: WorkspaceRow = {
	id: "canvas-1",
	title: "Canvas WS",
	state: "ready",
	hasUnread: false,
	space: "canvas",
};

const groups: WorkspaceGroup[] = [
	{
		id: "progress",
		label: "In Progress",
		tone: "progress",
		rows: [normalRow, canvasRow],
	},
];

const archivedRows: WorkspaceRow[] = [
	{
		...normalRow,
		id: "normal-arch",
		title: "Normal Archived",
		state: "archived",
	},
	{
		...canvasRow,
		id: "canvas-arch",
		title: "Canvas Archived",
		state: "archived",
	},
];

describe("WorkspacesSidebarContainer canvas filtering", () => {
	beforeEach(() => {
		useControllerMock.mockImplementation(() => ({
			addingRepository: false,
			archivingWorkspaceIds: new Set<string>(),
			archivedRows,
			availableRepositories: [],
			creatingWorkspaceRepoId: null,
			cloneDefaultDirectory: null,
			groups,
			sidebarGrouping: "status",
			sidebarRepoFilterIds: [],
			sidebarSort: "custom",
			updateSettings: vi.fn(async () => {}),
			handleAddRepository: vi.fn(async () => {}),
			handleArchiveWorkspace: vi.fn(),
			handleCloneFromUrl: vi.fn(async () => {}),
			handleDeleteWorkspace: vi.fn(),
			handleMarkWorkspaceUnread: vi.fn(),
			handleMoveRepositoryInSidebar: vi.fn(),
			handleMoveWorkspaceInSidebar: vi.fn(),
			handleOpenCloneDialog: vi.fn(),
			handleRestoreWorkspace: vi.fn(),
			handleSelectWorkspace: vi.fn(),
			handleSetWorkspaceStatus: vi.fn(),
			handleTogglePin: vi.fn(),
			isCloneDialogOpen: false,
			prefetchWorkspace: vi.fn(),
			setIsCloneDialogOpen: vi.fn(),
		}));
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("strips canvas workspaces from active groups and the archived list", () => {
		render(
			<WorkspacesSidebarContainer
				selectedWorkspaceId={null}
				onSelectWorkspace={vi.fn()}
				pushWorkspaceToast={vi.fn()}
			/>,
		);

		const props = sidebarPropsSpy.mock.calls.at(-1)?.[0] as {
			groups: WorkspaceGroup[];
			archivedRows: WorkspaceRow[];
		};

		const activeIds = props.groups.flatMap((g) => g.rows.map((r) => r.id));
		expect(activeIds).toEqual(["normal-1"]);

		const archivedIds = props.archivedRows.map((r) => r.id);
		expect(archivedIds).toEqual(["normal-arch"]);
	});
});

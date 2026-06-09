import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceDiffStat, WorkspaceRow } from "@/lib/api";
import {
	DASHBOARD_COLUMNS,
	type DashboardColumn,
} from "./hooks/use-dashboard-board";
import { DashboardScreen } from "./index";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function col(id: DashboardColumn["id"], rows: WorkspaceRow[]): DashboardColumn {
	const meta = DASHBOARD_COLUMNS.find((c) => c.id === id);
	if (!meta) throw new Error(`unknown column ${id}`);
	return { ...meta, rows };
}
const r = (
	id: string,
	status: string,
	extra: Partial<WorkspaceRow> = {},
): WorkspaceRow => ({ id, title: id, status, ...extra }) as WorkspaceRow;

const columns: DashboardColumn[] = [
	col("backlog", []),
	col("progress", [r("a", "in-progress"), r("c", "in-progress")]),
	col("review", []),
	col("done", [r("b", "done")]),
	col("canceled", []),
];

function renderScreen(
	overrides: Partial<Parameters<typeof DashboardScreen>[0]> = {},
) {
	const props = {
		columns,
		runningWorkspaceIds: new Set<string>(),
		totalRunning: 0,
		diffStats: new Map<string, WorkspaceDiffStat>(),
		repos: [],
		selectedRepoIds: new Set<string>(),
		onSelectRepoIds: () => {},
		columnOptions: DASHBOARD_COLUMNS,
		visibleColumnIds: new Set(DASHBOARD_COLUMNS.map((c) => c.id)),
		onSelectColumnIds: () => {},
		onOpenWorkspace: () => {},
		onMoveWorkspace: () => {},
		...overrides,
	};
	return render(<DashboardScreen {...props} />);
}

/** Lay the five columns out side-by-side (100px each) so X hit-testing has
 *  real geometry — jsdom otherwise reports every rect as zero. */
function stubColumnGeometry() {
	const sections = document.querySelectorAll<HTMLElement>(
		"[data-kanban-column-id]",
	);
	sections.forEach((section, index) => {
		const left = index * 100;
		vi.spyOn(section, "getBoundingClientRect").mockReturnValue({
			left,
			right: left + 100,
			top: 0,
			bottom: 600,
			width: 100,
			height: 600,
			x: left,
			y: 0,
			toJSON: () => ({}),
		} as DOMRect);
	});
}

/** Centre X of a column index, given the 100px layout above. */
function columnCentreX(index: number) {
	return index * 100 + 50;
}

const POINTER_ID = 1;

function dispatchPointer(type: string, clientX: number, clientY: number) {
	const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
	// MouseEvent carries no pointerId; the hook matches it against the one from
	// pointerdown, so define it explicitly to keep the gesture alive.
	Object.defineProperty(event, "pointerId", { value: POINTER_ID });
	act(() => {
		window.dispatchEvent(event);
	});
}

/** Drag the card with `data-kanban-card-id` from its current spot to the centre
 *  of `targetColumnIndex`, exercising the real pointer pipeline. */
function dragCardToColumn(cardId: string, targetColumnIndex: number) {
	const card = document.querySelector<HTMLElement>(
		`[data-kanban-card-id="${cardId}"]`,
	);
	if (!card) throw new Error(`no card ${cardId}`);
	vi.spyOn(card, "getBoundingClientRect").mockReturnValue({
		left: 100,
		right: 200,
		top: 0,
		bottom: 40,
		width: 100,
		height: 40,
		x: 100,
		y: 0,
		toJSON: () => ({}),
	} as DOMRect);

	const startX = columnCentreX(1);
	fireEvent.pointerDown(card, {
		button: 0,
		clientX: startX,
		clientY: 10,
		pointerId: POINTER_ID,
	});
	// Cross the activation threshold, then travel to the target column.
	dispatchPointer("pointermove", startX + 8, 10);
	dispatchPointer("pointermove", columnCentreX(targetColumnIndex), 10);
	dispatchPointer("pointerup", columnCentreX(targetColumnIndex), 10);
}

describe("DashboardScreen", () => {
	it("renders all five columns with labels", () => {
		renderScreen();
		for (const label of DASHBOARD_COLUMNS.map((c) => c.label)) {
			expect(screen.getByText(label)).toBeInTheDocument();
		}
		expect(screen.getByText("a")).toBeInTheDocument();
		expect(screen.getByText("b")).toBeInTheDocument();
	});

	it("renders columns in backlog-first status order", () => {
		renderScreen();
		expect(
			screen
				.getAllByRole("region")
				.map((region) => region.getAttribute("aria-label")),
		).toEqual([
			"Backlog column",
			"In progress column",
			"Review column",
			"Done column",
			"Canceled column",
		]);
	});

	it("shows an empty placeholder in empty columns", () => {
		renderScreen();
		expect(screen.getAllByText("No workspaces").length).toBeGreaterThanOrEqual(
			3,
		);
	});

	it("invokes onOpenWorkspace when a card is clicked", () => {
		const onOpen = vi.fn();
		renderScreen({ onOpenWorkspace: onOpen });
		fireEvent.click(screen.getByRole("button", { name: "a" }));
		expect(onOpen).toHaveBeenCalledWith("a");
	});

	it("moves a card to the target column on a pointer drag", () => {
		const onMove = vi.fn();
		renderScreen({ onMoveWorkspace: onMove });
		stubColumnGeometry();
		// progress (index 1) → done (index 3).
		dragCardToColumn("a", 3);
		expect(onMove).toHaveBeenCalledWith({
			workspaceId: "a",
			targetColumnId: "done",
			beforeWorkspaceId: null,
		});
	});

	it("does not move on a click that never crosses the drag threshold", () => {
		const onMove = vi.fn();
		renderScreen({ onMoveWorkspace: onMove });
		stubColumnGeometry();
		const card = document.querySelector<HTMLElement>(
			`[data-kanban-card-id="a"]`,
		);
		const startX = columnCentreX(1);
		fireEvent.pointerDown(card!, {
			button: 0,
			clientX: startX,
			clientY: 10,
			pointerId: POINTER_ID,
		});
		// A 2px wobble stays under the activation threshold, so no drag starts.
		dispatchPointer("pointermove", startX + 2, 11);
		dispatchPointer("pointerup", startX + 2, 11);
		expect(onMove).not.toHaveBeenCalled();
	});

	it("suppresses the click that follows a drag so it doesn't open", () => {
		const onOpen = vi.fn();
		const onMove = vi.fn();
		renderScreen({ onOpenWorkspace: onOpen, onMoveWorkspace: onMove });
		stubColumnGeometry();
		dragCardToColumn("a", 3);
		// A real browser fires `click` after the drag's pointerup.
		fireEvent.click(screen.getByRole("button", { name: "a" }));
		expect(onOpen).not.toHaveBeenCalled();
	});

	it("renders a ghost card while dragging over a column", () => {
		renderScreen();
		stubColumnGeometry();
		const card = document.querySelector<HTMLElement>(
			`[data-kanban-card-id="a"]`,
		);
		vi.spyOn(card!, "getBoundingClientRect").mockReturnValue({
			left: 100,
			right: 200,
			top: 0,
			bottom: 40,
			width: 100,
			height: 40,
			x: 100,
			y: 0,
			toJSON: () => ({}),
		} as DOMRect);
		fireEvent.pointerDown(card!, {
			button: 0,
			clientX: columnCentreX(1),
			clientY: 10,
			pointerId: POINTER_ID,
		});
		dispatchPointer("pointermove", columnCentreX(3), 10);
		// Drop ghost (landing indicator) + floating drag ghost both show the title.
		expect(screen.getAllByText("a").length).toBeGreaterThanOrEqual(2);
	});
});

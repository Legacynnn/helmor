import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type ColumnBounds,
	computeBeforeId,
	pickColumnIdByX,
	resolveKanbanDropTarget,
} from "./resolve-drop";

afterEach(() => vi.restoreAllMocks());

/** Build a `[data-kanban-cards]` container holding `[data-kanban-card-id]`
 *  cards whose vertical geometry is stubbed (jsdom zeroes rects otherwise).
 *  Each card occupies a 40px-tall slot stacked from y=0. */
function makeContainer(ids: string[]): HTMLElement {
	const container = document.createElement("div");
	container.setAttribute("data-kanban-cards", "");
	ids.forEach((id, i) => {
		const card = document.createElement("div");
		card.dataset.kanbanCardId = id;
		const top = i * 40;
		vi.spyOn(card, "getBoundingClientRect").mockReturnValue({
			top,
			height: 40,
			bottom: top + 40,
			left: 0,
			right: 0,
			width: 0,
			x: 0,
			y: top,
			toJSON: () => ({}),
		} as DOMRect);
		container.appendChild(card);
	});
	return container;
}

describe("pickColumnIdByX", () => {
	const columns: ColumnBounds[] = [
		{ id: "backlog", left: 0, right: 100 },
		{ id: "progress", left: 100, right: 200 },
		{ id: "done", left: 200, right: 300 },
	];

	it("returns null when there are no columns", () => {
		expect(pickColumnIdByX([], 50)).toBeNull();
	});

	it("picks the column whose horizontal bounds contain the pointer", () => {
		expect(pickColumnIdByX(columns, 50)).toBe("backlog");
		expect(pickColumnIdByX(columns, 150)).toBe("progress");
		expect(pickColumnIdByX(columns, 250)).toBe("done");
	});

	it("clamps to the first column when the pointer is left of the board", () => {
		expect(pickColumnIdByX(columns, -40)).toBe("backlog");
	});

	it("clamps to the last column when the pointer is right of the board", () => {
		expect(pickColumnIdByX(columns, 9999)).toBe("done");
	});
});

describe("computeBeforeId", () => {
	it("returns null for a null container (empty column)", () => {
		expect(computeBeforeId(null, 10)).toBeNull();
	});

	it("inserts before the card whose midpoint the pointer is above", () => {
		const c = makeContainer(["a", "b", "c"]);
		expect(computeBeforeId(c, 10)).toBe("a");
		expect(computeBeforeId(c, 50)).toBe("b");
		expect(computeBeforeId(c, 90)).toBe("c");
	});

	it("returns null (append) when the pointer is past the last card", () => {
		const c = makeContainer(["a", "b"]);
		expect(computeBeforeId(c, 999)).toBeNull();
	});

	it("skips the dragged card so it is never its own neighbour", () => {
		const c = makeContainer(["a", "b", "c"]);
		// Pointer over a's slot, but a is the card being dragged → next is b.
		expect(computeBeforeId(c, 10, "a")).toBe("b");
	});
});

describe("resolveKanbanDropTarget", () => {
	function makeBoard(): HTMLElement {
		const root = document.createElement("div");
		const specs: Array<{ id: string; left: number; cards: string[] }> = [
			{ id: "backlog", left: 0, cards: [] },
			{ id: "progress", left: 100, cards: ["a", "b"] },
			{ id: "done", left: 200, cards: [] },
		];
		for (const spec of specs) {
			const section = document.createElement("section");
			section.dataset.kanbanColumnId = spec.id;
			vi.spyOn(section, "getBoundingClientRect").mockReturnValue({
				left: spec.left,
				right: spec.left + 100,
				top: 0,
				bottom: 500,
				width: 100,
				height: 500,
				x: spec.left,
				y: 0,
				toJSON: () => ({}),
			} as DOMRect);
			section.appendChild(makeContainer(spec.cards));
			root.appendChild(section);
		}
		return root;
	}

	it("returns null when no columns are mounted", () => {
		expect(
			resolveKanbanDropTarget(50, 50, null, document.createElement("div")),
		).toBeNull();
	});

	it("resolves the column under X and the insertion row under Y", () => {
		const board = makeBoard();
		// X=150 → progress column; Y=10 → before card "a".
		expect(resolveKanbanDropTarget(150, 10, null, board)).toEqual({
			columnId: "progress",
			beforeId: "a",
		});
	});

	it("appends to an empty column", () => {
		const board = makeBoard();
		expect(resolveKanbanDropTarget(250, 10, null, board)).toEqual({
			columnId: "done",
			beforeId: null,
		});
	});

	it("excludes the dragged card when computing the insertion row", () => {
		const board = makeBoard();
		// Over "a"'s slot while dragging "a" → lands before "b".
		expect(resolveKanbanDropTarget(150, 10, "a", board)).toEqual({
			columnId: "progress",
			beforeId: "b",
		});
	});
});

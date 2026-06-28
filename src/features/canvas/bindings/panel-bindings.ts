/** ⌘+digit sequence. Capped at 9: ⌘0 collides with the global `zoom.reset`
 * shortcut (app scope), which would mutually disable both. */
export const BINDING_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export type PanelBindingInput = { id: string; binding?: number };

function isValidDigit(d: number | undefined): d is number {
	return (
		typeof d === "number" &&
		Number.isInteger(d) &&
		(BINDING_DIGITS as readonly number[]).includes(d)
	);
}

/** Effective digit for every panel. Custom (valid, unique — first wins) bindings
 * claim their digit; the rest take free digits in array (creation) order. Panels
 * past the 9 available digits are absent from the map. */
export function resolvePanelBindings(
	panels: PanelBindingInput[],
): Map<string, number> {
	const result = new Map<string, number>();
	const claimed = new Set<number>();
	for (const panel of panels) {
		if (isValidDigit(panel.binding) && !claimed.has(panel.binding)) {
			claimed.add(panel.binding);
			result.set(panel.id, panel.binding);
		}
	}
	const free = BINDING_DIGITS.filter((d) => !claimed.has(d));
	let i = 0;
	for (const panel of panels) {
		if (result.has(panel.id)) continue;
		if (i < free.length) {
			result.set(panel.id, free[i]);
			i += 1;
		}
	}
	return result;
}

/** Label for a digit, e.g. 1 -> "⌘1". */
export function formatBinding(digit: number): string {
	return `⌘${digit}`;
}

/** True if assigning `digit` to `panelId` collides with a DIFFERENT panel's
 * existing custom binding. (Autos always flex, so they never conflict.) */
export function customBindingConflicts(
	panels: PanelBindingInput[],
	panelId: string,
	digit: number,
): boolean {
	return panels.some(
		(panel) =>
			panel.id !== panelId &&
			isValidDigit(panel.binding) &&
			panel.binding === digit,
	);
}

export type PanelRowInput = {
	id: string;
	title: string;
	typeLabel: string;
	binding?: number;
};

export type PanelRow = {
	id: string;
	label: string;
	/** Effective digit, or undefined when unbound (10th+ panel). */
	effective?: number;
	/** The panel's own custom digit, or null when on auto. */
	custom: number | null;
};

/** Presentation rows for the panels list: resolved label + binding fields. */
export function buildPanelRows(panels: PanelRowInput[]): PanelRow[] {
	const bindings = resolvePanelBindings(panels);
	return panels.map((panel, index) => ({
		id: panel.id,
		label: panel.title.trim() || `${panel.typeLabel} #${index + 1}`,
		effective: bindings.get(panel.id),
		custom: isValidDigit(panel.binding) ? panel.binding : null,
	}));
}

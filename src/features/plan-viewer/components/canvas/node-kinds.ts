/** The visual role of a canvas node, set via `<CanvasNode kind="...">`. */
export type CanvasNodeKind =
	| "note"
	| "resume"
	| "option"
	| "phase"
	| "wireframe";

const KINDS = new Set<CanvasNodeKind>([
	"note",
	"resume",
	"option",
	"phase",
	"wireframe",
]);

/** Resolve a kind string to a known kind, defaulting to `note`. */
export function normalizeKind(value: string | undefined): CanvasNodeKind {
	return value && KINDS.has(value as CanvasNodeKind)
		? (value as CanvasNodeKind)
		: "note";
}

/** Per-kind nominal node size (used by dagre layout AND the rendered node so
 * they stay in sync). */
export const NODE_SIZE: Record<
	CanvasNodeKind,
	{ width: number; height: number }
> = {
	note: { width: 220, height: 96 },
	resume: { width: 300, height: 120 },
	option: { width: 230, height: 110 },
	phase: { width: 200, height: 90 },
	wireframe: { width: 260, height: 160 },
};

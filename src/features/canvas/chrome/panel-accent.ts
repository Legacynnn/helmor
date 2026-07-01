import type { CanvasPanelType } from "@/lib/api";

/** Persistent per-type identity color, shown as the accent bar that frames a
 * panel's body (header bottom divider + footer top divider). Calm oklch chroma
 * so it reads as identity, not alarm, and stays legible on both the cream
 * (light) and near-black (dark) panel surfaces. Literals (not tokens) so they
 * resolve even before custom properties hot-load. */
export const PANEL_ACCENT: Record<CanvasPanelType, string> = {
	conversation: "oklch(0.62 0.14 250)", // blue
	git: "oklch(0.68 0.15 55)", // orange
	terminal: "oklch(0.66 0.14 150)", // green
	editor: "oklch(0.60 0.13 275)", // indigo
	"file-manager": "oklch(0.66 0.10 195)", // teal
	notes: "oklch(0.74 0.13 85)", // amber
	drawing: "oklch(0.62 0.15 310)", // violet
	placeholder: "oklch(0.62 0.02 260)", // neutral gray
};

/** Accent color for a panel type's divider bars. Falls back to the neutral
 * placeholder color for any unexpected type. */
export function accentDivider(type: CanvasPanelType): string {
	return PANEL_ACCENT[type] ?? PANEL_ACCENT.placeholder;
}

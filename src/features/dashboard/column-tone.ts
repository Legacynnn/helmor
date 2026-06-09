import type { DashboardColumnTone } from "./hooks/use-dashboard-board";

/** Per-column visual tone. Uses explicit Tailwind color utilities (not the
 *  app-* tokens, which are undefined in this codebase — see commit 660430da)
 *  at low opacity so the tint reads as a quiet accent, not a loud fill. */
type ColumnToneStyle = {
	/** Tinted strip behind the column header. */
	header: string;
	/** Status icon color. */
	icon: string;
};

const TONES: Record<DashboardColumnTone, ColumnToneStyle> = {
	progress: {
		header: "bg-blue-500/10",
		icon: "text-blue-500",
	},
	review: {
		header: "bg-amber-500/10",
		icon: "text-amber-500",
	},
	done: {
		header: "bg-emerald-500/10",
		icon: "text-emerald-500",
	},
	backlog: {
		header: "bg-slate-500/10",
		icon: "text-slate-400",
	},
	canceled: {
		header: "bg-rose-500/10",
		icon: "text-rose-400",
	},
};

export function columnTone(tone: DashboardColumnTone): ColumnToneStyle {
	return TONES[tone];
}

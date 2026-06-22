import type { TaskStatusKind } from "@/lib/api";
import { cn } from "@/lib/utils";

// Linear's default palette per lifecycle bucket; the workflow-state color from
// the API wins when present so custom states tint correctly.
const FALLBACK_TINT: Record<TaskStatusKind, string> = {
	backlog: "#bec2c8",
	unstarted: "#bec2c8",
	started: "#f2c94c",
	completed: "#5e6ad2",
	canceled: "#95a2b3",
};

/**
 * Linear-parity status glyphs, drawn as inline SVG (viewBox 14×14, center 7,7)
 * so they line up with Linear's real iconography:
 *   - backlog    → dotted ring
 *   - unstarted  → empty ring
 *   - started    → ring + half-filled progress pie
 *   - completed  → filled disc + check
 *   - canceled   → filled disc + ✕
 */
export function TaskStatusIcon({
	kind,
	color,
	size = 16,
	className,
	title,
}: {
	kind: TaskStatusKind;
	color?: string | null;
	size?: number;
	className?: string;
	title?: string;
}) {
	const tint = color || FALLBACK_TINT[kind];
	const label = title ?? `Status: ${kind}`;

	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 14 14"
			fill="none"
			className={cn("shrink-0", className)}
			role="img"
			aria-label={label}
		>
			<title>{label}</title>
			{kind === "backlog" && (
				<circle
					cx="7"
					cy="7"
					r="6"
					stroke={tint}
					strokeWidth="1.6"
					strokeLinecap="round"
					strokeDasharray="0.1 2.6"
				/>
			)}
			{kind === "unstarted" && (
				<circle cx="7" cy="7" r="6" stroke={tint} strokeWidth="1.6" />
			)}
			{kind === "started" && (
				<>
					<circle cx="7" cy="7" r="6" stroke={tint} strokeWidth="1.6" />
					<path d="M7 7 L7 3.6 A3.4 3.4 0 0 1 7 10.4 Z" fill={tint} />
				</>
			)}
			{kind === "completed" && (
				<>
					<circle cx="7" cy="7" r="6.4" fill={tint} />
					<path
						d="M4.1 7.1 L6.2 9.2 L10 5.1"
						stroke="#fff"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
						fill="none"
					/>
				</>
			)}
			{kind === "canceled" && (
				<>
					<circle cx="7" cy="7" r="6.4" fill={tint} />
					<path
						d="M4.7 4.7 L9.3 9.3 M9.3 4.7 L4.7 9.3"
						stroke="#fff"
						strokeWidth="1.5"
						strokeLinecap="round"
						fill="none"
					/>
				</>
			)}
		</svg>
	);
}

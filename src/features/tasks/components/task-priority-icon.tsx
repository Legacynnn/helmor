import type { TaskPriority } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Linear-parity priority glyphs (viewBox 16×16):
 *   - none    → three faint horizontal dashes
 *   - low     → one tall bar + two faint
 *   - medium  → two tall bars + one faint
 *   - high    → three tall bars
 *   - urgent  → amber rounded square with an exclamation mark
 */
export function TaskPriorityIcon({
	priority,
	size = 16,
	className,
	title,
}: {
	priority: TaskPriority;
	size?: number;
	className?: string;
	title?: string;
}) {
	const label = title ?? `Priority: ${priority}`;

	if (priority === "urgent") {
		return (
			<svg
				width={size}
				height={size}
				viewBox="0 0 16 16"
				className={cn("shrink-0", className)}
				role="img"
				aria-label={label}
			>
				<title>{label}</title>
				<rect x="1" y="1" width="14" height="14" rx="4" fill="#fc7840" />
				<rect x="7" y="3.75" width="2" height="5.5" rx="1" fill="#fff" />
				<rect x="7" y="10.75" width="2" height="2" rx="1" fill="#fff" />
			</svg>
		);
	}

	if (priority === "none") {
		return (
			<svg
				width={size}
				height={size}
				viewBox="0 0 16 16"
				className={cn("shrink-0", className)}
				role="img"
				aria-label={label}
			>
				<title>{label}</title>
				{[4.5, 7.5, 10.5].map((y) => (
					<rect
						key={y}
						x="2.5"
						y={y}
						width="11"
						height="1.5"
						rx="0.75"
						fill="currentColor"
						opacity="0.4"
					/>
				))}
			</svg>
		);
	}

	// Bars filled per level: low=1, medium=2, high=3.
	const filled = { low: 1, medium: 2, high: 3 }[priority];
	const bars = [
		{ x: 2, y: 9, h: 5 },
		{ x: 6.5, y: 6, h: 8 },
		{ x: 11, y: 3, h: 11 },
	];

	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			className={cn("shrink-0", className)}
			role="img"
			aria-label={label}
		>
			<title>{label}</title>
			{bars.map((bar, index) => (
				<rect
					key={bar.x}
					x={bar.x}
					y={bar.y}
					width="3"
					height={bar.h}
					rx="1"
					fill="currentColor"
					opacity={index < filled ? 1 : 0.3}
				/>
			))}
		</svg>
	);
}

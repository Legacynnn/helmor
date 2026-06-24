/**
 * Deterministic pixel-art identicon for a subagent — a small symmetric
 * blockies-style sprite seeded by the agent's stable key and tinted with its
 * identity color. Gives each running subagent a distinct "pixelated form" the
 * way GitHub identicons do, so chips are visually separable at a glance.
 *
 * Pure + stable: the same key always renders the same sprite, so a chip never
 * flickers its shape as the thread re-renders.
 */

import { useMemo } from "react";

// 5x5 grid, left half (3 cols) decided by the hash then mirrored → symmetric.
const GRID = 5;
const HALF = Math.ceil(GRID / 2);

// 32-bit FNV-1a — same family as `subagent-identity`, kept local so this
// component has no test-only dependency.
function fnv1a(input: string): number {
	let hash = 2166136261;
	for (let i = 0; i < input.length; i++) {
		hash = (hash ^ input.charCodeAt(i)) * 16777619;
		hash >>>= 0;
	}
	return hash;
}

/** A length-25 on/off mask for the 5x5 grid, mirrored across the vertical axis. */
function buildMask(seedKey: string): boolean[] {
	const mask = new Array<boolean>(GRID * GRID).fill(false);
	for (let row = 0; row < GRID; row++) {
		for (let col = 0; col < HALF; col++) {
			// Independent hash per cell so the sprite uses the full key entropy
			// rather than a handful of bits off one number.
			const on = fnv1a(`${seedKey}:${row}:${col}`) % 2 === 0;
			if (!on) continue;
			mask[row * GRID + col] = true;
			mask[row * GRID + (GRID - 1 - col)] = true;
		}
	}
	return mask;
}

export function SubagentPixelAvatar({
	seedKey,
	color,
	size = 16,
	className,
}: {
	seedKey: string;
	color: string;
	size?: number;
	className?: string;
}) {
	const mask = useMemo(() => buildMask(seedKey), [seedKey]);
	const cell = size / GRID;
	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			className={className}
			style={{ shapeRendering: "crispEdges" }}
			aria-hidden="true"
		>
			<title>subagent sprite</title>
			<rect
				width={size}
				height={size}
				rx={Math.max(2, size * 0.18)}
				className="fill-foreground/10"
			/>
			{mask.map((on, i) =>
				on ? (
					<rect
						key={`${i % GRID}:${Math.floor(i / GRID)}`}
						x={(i % GRID) * cell}
						y={Math.floor(i / GRID) * cell}
						width={cell}
						height={cell}
						fill={color}
					/>
				) : null,
			)}
		</svg>
	);
}

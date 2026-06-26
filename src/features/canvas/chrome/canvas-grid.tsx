import type { TLGridProps } from "tldraw";
import { useCanvasViewStore } from "../canvas-view-store";

/** Custom tldraw grid honoring the workspace's background pattern. Rendered
 * only when grid mode is on (blank pattern turns grid mode off upstream).
 * Camera-aligned via the `{x,y,z}` props so dots/lines track pan + zoom. */
export function CanvasGrid({ x, y, z, size }: TLGridProps) {
	const pattern = useCanvasViewStore((s) => s.backgroundPattern);
	if (pattern === "blank") return null;

	const step = size * z;
	if (step <= 0) return null;
	// Phase the tiling pattern by the camera offset so it scrolls with content.
	const offX = ((x * z) % step) - step;
	const offY = ((y * z) % step) - step;
	const patternId = pattern === "dots" ? "cv-grid-dots" : "cv-grid-lines";

	return (
		<svg
			aria-hidden
			className="tl-grid"
			style={{
				position: "absolute",
				inset: 0,
				width: "100%",
				height: "100%",
				pointerEvents: "none",
			}}
		>
			<defs>
				<pattern
					id={patternId}
					width={step}
					height={step}
					patternUnits="userSpaceOnUse"
					x={offX}
					y={offY}
				>
					{pattern === "dots" ? (
						<circle
							cx={step / 2}
							cy={step / 2}
							r={Math.max(0.5, z * 0.6)}
							fill="var(--color-grid, #9ca3af)"
							opacity={0.6}
						/>
					) : (
						<path
							d={`M ${step} 0 L 0 0 0 ${step}`}
							fill="none"
							stroke="var(--color-grid, #9ca3af)"
							strokeWidth={1}
							opacity={0.35}
						/>
					)}
				</pattern>
			</defs>
			<rect width="100%" height="100%" fill={`url(#${patternId})`} />
		</svg>
	);
}

import type { CanvasPanel, CanvasPanelType } from "@/lib/api";

const PREVIEW_W = 248;
const PREVIEW_H = 150;
const PAD = 10;

// Per-type accent so the schematic reads as "what kind of canvas is this".
const TYPE_COLOR: Record<CanvasPanelType, string> = {
	conversation: "var(--color-primary, #6366f1)",
	terminal: "#10b981",
	notes: "#f59e0b",
	drawing: "#ec4899",
	"file-manager": "#3b82f6",
	editor: "#8b5cf6",
	git: "#ef4444",
	placeholder: "#94a3b8",
};

/**
 * A cheap, dependency-free schematic of a workspace's canvas: each saved panel
 * drawn as a scaled rectangle within its bounding box. No tldraw needed — it
 * renders straight from the persisted `canvas_panels` geometry, so it's safe to
 * mount in a hover popover.
 */
export function CanvasPreview({ panels }: { panels: CanvasPanel[] }) {
	if (panels.length === 0) {
		return (
			<div
				className="flex items-center justify-center rounded-md bg-muted/50 text-[11px] text-muted-foreground"
				style={{ width: PREVIEW_W, height: PREVIEW_H }}
			>
				Empty canvas
			</div>
		);
	}

	const minX = Math.min(...panels.map((p) => p.x));
	const minY = Math.min(...panels.map((p) => p.y));
	const maxX = Math.max(...panels.map((p) => p.x + p.width));
	const maxY = Math.max(...panels.map((p) => p.y + p.height));
	const contentW = Math.max(1, maxX - minX);
	const contentH = Math.max(1, maxY - minY);
	const scale = Math.min(
		(PREVIEW_W - PAD * 2) / contentW,
		(PREVIEW_H - PAD * 2) / contentH,
	);
	// Centre the scaled content in the preview box.
	const offsetX = (PREVIEW_W - contentW * scale) / 2;
	const offsetY = (PREVIEW_H - contentH * scale) / 2;

	return (
		<div
			className="relative overflow-hidden rounded-md bg-muted/40 ring-1 ring-border/50"
			style={{ width: PREVIEW_W, height: PREVIEW_H }}
		>
			{panels.map((p) => (
				<div
					key={p.id}
					className="absolute rounded-[3px] border"
					style={{
						left: offsetX + (p.x - minX) * scale,
						top: offsetY + (p.y - minY) * scale,
						width: Math.max(3, p.width * scale),
						height: Math.max(3, p.height * scale),
						backgroundColor: `color-mix(in oklab, ${TYPE_COLOR[p.panelType]} 22%, transparent)`,
						borderColor: `color-mix(in oklab, ${TYPE_COLOR[p.panelType]} 55%, transparent)`,
					}}
				/>
			))}
		</div>
	);
}

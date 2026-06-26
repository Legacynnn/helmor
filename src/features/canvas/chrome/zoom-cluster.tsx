import { Maximize, Minus, Plus } from "lucide-react";
import { type Editor, useValue } from "tldraw";

/** Bottom-right spatial controls: zoom out / level / in / zoom-to-fit. */
export function CanvasZoomCluster({ editor }: { editor: Editor }) {
	const zoom = useValue("canvas-zoom", () => editor.getZoomLevel(), [editor]);

	return (
		<div className="pointer-events-auto absolute right-3 bottom-3 z-10 flex items-center gap-0.5 rounded-lg border border-app-border bg-app-base/90 p-0.5 shadow-lg backdrop-blur">
			<ZoomButton label="Zoom out" onClick={() => editor.zoomOut()}>
				<Minus className="size-3.5" />
			</ZoomButton>
			<button
				type="button"
				className="min-w-12 cursor-pointer rounded px-1.5 py-1 text-center text-app-muted-foreground text-xs tabular-nums hover:bg-app-muted hover:text-app-foreground"
				onClick={() => editor.resetZoom()}
				title="Reset zoom"
			>
				{Math.round(zoom * 100)}%
			</button>
			<ZoomButton label="Zoom in" onClick={() => editor.zoomIn()}>
				<Plus className="size-3.5" />
			</ZoomButton>
			<ZoomButton
				label="Zoom to fit"
				onClick={() => editor.zoomToFit({ animation: { duration: 200 } })}
			>
				<Maximize className="size-3.5" />
			</ZoomButton>
		</div>
	);
}

function ZoomButton({
	label,
	onClick,
	children,
}: {
	label: string;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			onClick={onClick}
			className="flex size-6 cursor-pointer items-center justify-center rounded text-app-muted-foreground hover:bg-app-muted hover:text-app-foreground"
		>
			{children}
		</button>
	);
}

// Canvas overlay for annotating a frozen-page screenshot when strict CSP blocks
// bridge injection. The screenshot is drawn into a <canvas>; clicks drop
// numbered coordinate pins (mapped from rendered → natural image space via the
// pure `annotations` helpers). The image source is injected so this component
// stays presentational and the host-capture path is decoupled.
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
	addAnnotation,
	type CanvasFit,
	type ImageAnnotation,
	toImagePoint,
	toRenderedPoint,
} from "./annotations";

type CanvasAnnotatorProps = {
	/** Data URL (or object URL) of the frozen-page screenshot to annotate. */
	screenshotSrc: string;
	annotations: ImageAnnotation[];
	onAddAnnotation: (next: ImageAnnotation[]) => void;
	className?: string;
};

const PIN_RADIUS = 12;

export function CanvasAnnotator({
	screenshotSrc,
	annotations,
	onAddAnnotation,
	className,
}: CanvasAnnotatorProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const imageRef = useRef<HTMLImageElement | null>(null);
	const [fit, setFit] = useState<CanvasFit | null>(null);

	// Load the screenshot, sizing the canvas to its natural dimensions.
	useEffect(() => {
		const image = new Image();
		image.onload = () => {
			imageRef.current = image;
			const canvas = canvasRef.current;
			if (!canvas) return;
			canvas.width = image.naturalWidth;
			canvas.height = image.naturalHeight;
			setFit({
				naturalWidth: image.naturalWidth,
				naturalHeight: image.naturalHeight,
				renderedWidth: canvas.clientWidth,
				renderedHeight: canvas.clientHeight,
			});
		};
		image.src = screenshotSrc;
		return () => {
			image.onload = null;
		};
	}, [screenshotSrc]);

	// Redraw the screenshot + numbered pins whenever annotations change.
	useEffect(() => {
		const canvas = canvasRef.current;
		const image = imageRef.current;
		if (!canvas || !image) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(image, 0, 0);
		for (const annotation of annotations) {
			drawPin(ctx, annotation);
		}
	}, [annotations]);

	const handleClick = useCallback(
		(event: React.MouseEvent<HTMLCanvasElement>) => {
			const canvas = canvasRef.current;
			if (!canvas || !fit) return;
			const bounds = canvas.getBoundingClientRect();
			const currentFit: CanvasFit = {
				...fit,
				renderedWidth: bounds.width,
				renderedHeight: bounds.height,
			};
			const point = toImagePoint(
				{ x: event.clientX - bounds.left, y: event.clientY - bounds.top },
				currentFit,
			);
			if (!point) return;
			onAddAnnotation(addAnnotation(annotations, point));
		},
		[annotations, fit, onAddAnnotation],
	);

	return (
		<canvas
			ref={canvasRef}
			onClick={handleClick}
			aria-label="Frozen page annotator"
			className={cn("h-auto w-full cursor-crosshair bg-app-base", className)}
		/>
	);
}

function drawPin(ctx: CanvasRenderingContext2D, annotation: ImageAnnotation) {
	// Pins are stored in natural image space and the canvas is sized to natural
	// dimensions, so draw directly at the point (no rescale needed here). The
	// rendered-space mapping is used by the click handler for hit-testing.
	const { x, y } = annotation.point;
	ctx.beginPath();
	ctx.arc(x, y, PIN_RADIUS, 0, Math.PI * 2);
	ctx.fillStyle = "oklch(0.7 0.2 250)";
	ctx.fill();
	ctx.fillStyle = "#fff";
	ctx.font = "bold 14px sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(String(annotation.seq), x, y);
}

// Re-exported for symmetry so consumers can map a pin into rendered space for
// HTML overlays without reaching into the pure module directly.
export { toRenderedPoint };

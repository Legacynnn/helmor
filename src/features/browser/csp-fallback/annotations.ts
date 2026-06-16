/**
 * Coordinate-based annotation model for the CSP screenshot fallback.
 *
 * When the inspector bridge cannot inject (strict CSP blocks the
 * `initialization_script`), the surface freezes the page to a screenshot and
 * annotates the IMAGE instead of the live DOM. Without a DOM there are no CSS
 * selectors, so each annotation is anchored by an image-space coordinate pin
 * (numbered like the live comment pins).
 *
 * Everything here is PURE — image dimensions and click points are passed in,
 * never read from a live canvas — so it unit-tests in jsdom.
 */

/** A point in the natural (unscaled) image coordinate space. */
export type ImagePoint = { x: number; y: number };

/** A numbered annotation pinned to an image coordinate. */
export type ImageAnnotation = {
	id: string;
	seq: number;
	point: ImagePoint;
	text: string;
};

/** Natural image size + the rendered (displayed) size of the canvas. */
export type CanvasFit = {
	naturalWidth: number;
	naturalHeight: number;
	renderedWidth: number;
	renderedHeight: number;
};

/**
 * Map a click in rendered (CSS-pixel) canvas space back to the natural image
 * coordinate space, so a pin stays anchored to the same image location
 * regardless of how the canvas is scaled to fit its container. Clamped to the
 * image bounds. Returns `null` for a degenerate (zero-size) rendered canvas.
 */
export function toImagePoint(
	clientPoint: ImagePoint,
	fit: CanvasFit,
): ImagePoint | null {
	if (fit.renderedWidth <= 0 || fit.renderedHeight <= 0) return null;
	const scaleX = fit.naturalWidth / fit.renderedWidth;
	const scaleY = fit.naturalHeight / fit.renderedHeight;
	const x = clamp(clientPoint.x * scaleX, 0, fit.naturalWidth);
	const y = clamp(clientPoint.y * scaleY, 0, fit.naturalHeight);
	return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Map a natural image coordinate back into rendered canvas space, for drawing
 * the pin marker over the displayed screenshot.
 */
export function toRenderedPoint(point: ImagePoint, fit: CanvasFit): ImagePoint {
	if (fit.naturalWidth <= 0 || fit.naturalHeight <= 0) {
		return { x: 0, y: 0 };
	}
	return {
		x: (point.x / fit.naturalWidth) * fit.renderedWidth,
		y: (point.y / fit.naturalHeight) * fit.renderedHeight,
	};
}

/** Next sequence number for a new annotation (1-based, max + 1). */
export function nextSeq(
	annotations: readonly Pick<ImageAnnotation, "seq">[],
): number {
	if (annotations.length === 0) return 1;
	return Math.max(...annotations.map((a) => a.seq)) + 1;
}

/** Append an annotation pinned at `point`, returning a NEW array. */
export function addAnnotation(
	annotations: readonly ImageAnnotation[],
	point: ImagePoint,
	text = "",
	id: string = makeId(),
): ImageAnnotation[] {
	return [...annotations, { id, seq: nextSeq(annotations), point, text }];
}

/** Remove an annotation by id, returning a NEW array. */
export function removeAnnotation(
	annotations: readonly ImageAnnotation[],
	id: string,
): ImageAnnotation[] {
	return annotations.filter((a) => a.id !== id);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function makeId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `a-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

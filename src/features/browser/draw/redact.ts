/**
 * Redaction: ACTUALLY mask pixels before any capture/send.
 *
 * A redact rectangle does NOT just paint an opaque overlay — it reads the
 * pixels of the region, runs a strong multi-pass box blur, and writes the
 * blurred pixels back so the original content is unrecoverable from the
 * resulting screenshot (html2canvas bakes canvas pixel data directly).
 *
 * Pure functions over `ImageData` — no DOM dependency, so the compositing /
 * region math is jsdom-unit-testable. `redactRegionOnCanvas` is the only
 * function that touches a live canvas context.
 */

/**
 * One horizontal-then-vertical box-blur pass of radius `r`.
 * Blurs RGB only; the alpha channel is preserved unchanged.
 */
export function boxBlurPass(src: ImageData, r: number): ImageData {
	const { width: w, height: h, data } = src;
	const tmp = new Uint8ClampedArray(data.length);
	const out = new Uint8ClampedArray(data.length);

	// Horizontal pass → tmp
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			let rSum = 0;
			let gSum = 0;
			let bSum = 0;
			let count = 0;
			for (let dx = -r; dx <= r; dx++) {
				const nx = Math.max(0, Math.min(w - 1, x + dx));
				const i = (y * w + nx) * 4;
				rSum += data[i];
				gSum += data[i + 1];
				bSum += data[i + 2];
				count++;
			}
			const i = (y * w + x) * 4;
			tmp[i] = rSum / count;
			tmp[i + 1] = gSum / count;
			tmp[i + 2] = bSum / count;
			tmp[i + 3] = data[i + 3]; // preserve alpha
		}
	}

	// Vertical pass → out
	for (let x = 0; x < w; x++) {
		for (let y = 0; y < h; y++) {
			let rSum = 0;
			let gSum = 0;
			let bSum = 0;
			let count = 0;
			for (let dy = -r; dy <= r; dy++) {
				const ny = Math.max(0, Math.min(h - 1, y + dy));
				const i = (ny * w + x) * 4;
				rSum += tmp[i];
				gSum += tmp[i + 1];
				bSum += tmp[i + 2];
				count++;
			}
			const i = (y * w + x) * 4;
			out[i] = rSum / count;
			out[i + 1] = gSum / count;
			out[i + 2] = bSum / count;
			out[i + 3] = tmp[i + 3]; // preserve alpha
		}
	}

	return { data: out, width: w, height: h } as unknown as ImageData;
}

/**
 * Apply `passes` iterations of box blur to `src`. The radius scales with the
 * region size (min 8px) so the result is unreadable at any zoom level. A
 * single degenerate dimension (1px) is handled without throwing.
 */
export function applyRedactToImageData(
	src: ImageData,
	passes: number,
): ImageData {
	if (src.width === 0 || src.height === 0) return src;
	const r = Math.max(8, Math.floor(Math.min(src.width, src.height) / 6));
	let current = src;
	for (let i = 0; i < passes; i++) {
		current = boxBlurPass(current, r);
	}
	return current;
}

/** A region within a canvas to redact, in canvas (device) pixels. */
export type RedactRegion = { x: number; y: number; w: number; h: number };

/**
 * Normalise a (possibly negatively-sized) region and clamp it to the canvas
 * bounds so `getImageData` never receives an out-of-range or zero/negative
 * extent. Returns a zero-size region when the rect lands fully off-canvas.
 */
export function clampRedactRegion(
	rect: RedactRegion,
	canvasWidth: number,
	canvasHeight: number,
): RedactRegion {
	const x0 = rect.w < 0 ? rect.x + rect.w : rect.x;
	const y0 = rect.h < 0 ? rect.y + rect.h : rect.y;
	const x1 = x0 + Math.abs(rect.w);
	const y1 = y0 + Math.abs(rect.h);

	const left = Math.max(0, Math.floor(x0));
	const top = Math.max(0, Math.floor(y0));
	const right = Math.min(canvasWidth, Math.ceil(x1));
	const bottom = Math.min(canvasHeight, Math.ceil(y1));

	return {
		x: left,
		y: top,
		w: Math.max(0, right - left),
		h: Math.max(0, bottom - top),
	};
}

/**
 * Apply destructive redaction to a sub-region of `ctx`. Reads the region's
 * pixels, blurs them past legibility, and writes them back via `putImageData`,
 * so the canvas now holds destroyed data (not a removable CSS filter). No-op
 * for a zero/negative-size region.
 */
export function redactRegionOnCanvas(
	ctx: CanvasRenderingContext2D,
	rect: RedactRegion,
	passes = 3,
): void {
	const { x, y, w, h } = rect;
	if (w <= 0 || h <= 0) return;
	const src = ctx.getImageData(x, y, w, h);
	if (src.width === 0 || src.height === 0) return;
	const blurred = applyRedactToImageData(src, passes);
	const outImageData = new ImageData(
		blurred.data,
		blurred.width,
		blurred.height,
	);
	ctx.putImageData(outImageData, x, y);
}

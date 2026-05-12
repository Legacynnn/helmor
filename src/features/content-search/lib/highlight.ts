export interface HighlightSegment {
	kind: "text" | "match";
	value: string;
}

/**
 * Split a line into alternating text / match segments using UTF-16 code-unit
 * offsets from the backend. Out-of-range or overlapping ranges are clamped
 * defensively so we never crash on malformed input.
 */
export function highlightLine(
	line: string,
	ranges: Array<[number, number]>,
): HighlightSegment[] {
	if (ranges.length === 0) return [{ kind: "text", value: line }];

	// Defensive copy + sort: ranges should already be sorted, but a re-render
	// with bad data shouldn't blow up the view.
	const sorted = [...ranges]
		.map(([s, e]) => [Math.max(0, s), Math.min(line.length, e)] as const)
		.filter(([s, e]) => e > s)
		.sort((a, b) => a[0] - b[0]);

	const out: HighlightSegment[] = [];
	let cursor = 0;
	for (const [start, end] of sorted) {
		if (start >= line.length) break;
		if (start > cursor) {
			out.push({ kind: "text", value: line.slice(cursor, start) });
		}
		const safeStart = Math.max(start, cursor);
		if (end > safeStart) {
			out.push({ kind: "match", value: line.slice(safeStart, end) });
			cursor = end;
		}
	}
	if (cursor < line.length) {
		out.push({ kind: "text", value: line.slice(cursor) });
	}
	return out;
}

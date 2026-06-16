/**
 * Best-effort element→source resolution for the inspector bridge.
 *
 * Reads framework debug attributes (`data-source`, `data-source-loc`,
 * `data-inspector-line`-style `__source` mirrors) off a clicked element and
 * parses `file:line:col`. Returns null when no source attribute resolves, so the
 * caller degrades to selector-only. PURE — the element is reached via the passed
 * node, never a global — so it runs identically in jsdom and the injected page.
 */

export type SourceRef = {
	path: string;
	line: number;
	column: number | undefined;
};

/** Attributes scanned in priority order for a `file:line:col` source ref. */
const SOURCE_ATTRS = [
	"data-source",
	"data-source-loc",
	"data-inspector-source",
];

/** Parse a `file:line[:col]` string into a `SourceRef`, or null. */
export function parseSourceRef(raw: string): SourceRef | null {
	const m = raw.match(/^(.+?):(\d+)(?::(\d+))?$/);
	if (!m) return null;
	return {
		path: m[1],
		line: Number.parseInt(m[2], 10),
		column: m[3] === undefined ? undefined : Number.parseInt(m[3], 10),
	};
}

/** Read a source ref from an element's debug attributes, or null. */
export function readSourceRef(el: Element): SourceRef | null {
	for (const attr of SOURCE_ATTRS) {
		const val = el.getAttribute(attr);
		if (val) {
			const ref = parseSourceRef(val);
			if (ref) return ref;
		}
	}
	return null;
}

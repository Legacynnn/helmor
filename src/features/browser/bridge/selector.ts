/**
 * CSS selector generation + re-anchoring for the inspector bridge.
 *
 * `cssSelectorFor` builds a reasonably stable, unique selector for an element
 * (id > stable attribute/class path > nth-of-type fallback). `resolveSelector`
 * re-anchors a stored selector against a (possibly reloaded) document.
 *
 * Both functions are PURE — the document is reached via the element's
 * `ownerDocument`, never a global — so they run identically in jsdom tests and
 * the injected page context.
 */

const STABLE_ATTRS = ["data-testid", "data-cy", "data-test", "aria-label"];

function escapeCss(value: string): string {
	// CSS.escape exists in jsdom and all webview engines; fall back defensively.
	if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
		return CSS.escape(value);
	}
	return value.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}

function uniqueInDoc(doc: Document, selector: string): boolean {
	try {
		return doc.querySelectorAll(selector).length === 1;
	} catch {
		return false;
	}
}

function idSelector(el: Element): string | null {
	const doc = el.ownerDocument;
	if (!el.id || !doc) return null;
	const sel = `#${escapeCss(el.id)}`;
	return uniqueInDoc(doc, sel) ? sel : null;
}

function stableAttrSelector(el: Element): string | null {
	const doc = el.ownerDocument;
	if (!doc) return null;
	for (const attr of STABLE_ATTRS) {
		const val = el.getAttribute(attr);
		if (!val) continue;
		const sel = `[${attr}="${escapeCss(val)}"]`;
		if (uniqueInDoc(doc, sel)) return sel;
	}
	return null;
}

/** Positional segment for one element relative to its parent. */
function segmentFor(el: Element): string {
	const tag = el.tagName.toLowerCase();
	const parent = el.parentElement;
	if (!parent) return tag;
	const sameTag = Array.from(parent.children).filter(
		(c) => c.tagName === el.tagName,
	);
	if (sameTag.length === 1) return tag;
	const idx = sameTag.indexOf(el) + 1;
	return `${tag}:nth-of-type(${idx})`;
}

export function cssSelectorFor(el: Element): string {
	const byId = idSelector(el);
	if (byId) return byId;

	const byAttr = stableAttrSelector(el);
	if (byAttr) return byAttr;

	const doc = el.ownerDocument;
	const parts: string[] = [];
	let current: Element | null = el;

	while (current && current !== doc?.documentElement) {
		// Anchor early on a uniquely-identified ancestor.
		const anchored = idSelector(current) ?? stableAttrSelector(current);
		if (anchored && current !== el) {
			parts.unshift(anchored);
			return parts.join(" > ");
		}
		parts.unshift(segmentFor(current));
		current = current.parentElement;
	}

	return parts.join(" > ");
}

export function resolveSelector(
	doc: Document,
	selector: string,
): Element | null {
	if (!selector) return null;
	try {
		return doc.querySelector(selector);
	} catch {
		return null;
	}
}

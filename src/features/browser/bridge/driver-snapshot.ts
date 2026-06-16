/**
 * Pure-ish DOM → snapshot builder for the agent-control preview driver.
 *
 * `buildInteractiveElements` walks the document for actionable controls and
 * emits a compact `{ role, name, selector }` list the agent can act on. The
 * selector prefers a stable id / data-attr (via `cssSelectorFor`), falling back
 * to an `href`-anchored selector for links so a reload-stable target survives.
 *
 * Runs identically in jsdom and the injected page context — the document is
 * passed in, never reached through a global.
 */

import { cssSelectorFor } from "./selector";

const ROLE_TAGS: Record<string, string> = {
	BUTTON: "button",
	A: "link",
	INPUT: "textbox",
	SELECT: "combobox",
	TEXTAREA: "textbox",
};

export type SnapshotElement = { role: string; name: string; selector: string };

/** Stable selector for one interactive element. */
function selectorFor(el: Element): string {
	// Anchor links on their href when there is no stronger stable id/attr.
	if (el.tagName === "A") {
		const href = el.getAttribute("href");
		const doc = el.ownerDocument;
		if (href && (!el.id || !doc)) {
			const sel = `a[href="${href}"]`;
			try {
				if (doc && doc.querySelectorAll(sel).length === 1) return sel;
			} catch {
				// fall through to the generic selector
			}
		}
	}
	return cssSelectorFor(el);
}

/** Accessible-ish name: aria-label > trimmed text > input value. */
function accessibleName(el: Element): string {
	const ariaLabel = el.getAttribute("aria-label");
	if (ariaLabel) return ariaLabel;
	const text = (el.textContent ?? "").trim();
	if (text) return text;
	return (el as HTMLInputElement).value || "";
}

export function buildInteractiveElements(doc: Document): SnapshotElement[] {
	const out: SnapshotElement[] = [];
	const nodes = doc.querySelectorAll(
		"button, a[href], input, select, textarea, [role]",
	);
	for (const el of Array.from(nodes)) {
		const explicitRole = el.getAttribute("role");
		const role = explicitRole ?? ROLE_TAGS[el.tagName] ?? "generic";
		const name = accessibleName(el);
		out.push({ role, name, selector: selectorFor(el) });
	}
	return out;
}

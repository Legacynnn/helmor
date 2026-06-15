// Detects whether the cursor sits in a place where Tailwind class completions
// make sense: inside a `class=`/`className=` attribute value, or after `@apply`
// in a stylesheet. Returns the fragment under the cursor so the provider can
// build an accurate replacement range. Single-line heuristics — they cover the
// overwhelming majority of real-world usage without a full parser.

export type TailwindCompletionContext = {
	/** True when completions should be offered. */
	active: boolean;
	/** Partial class token immediately before the cursor (may be ""). */
	fragment: string;
};

const CLASS_ATTR = /(?:class|className)\s*=\s*(?:["'`]|\{\s*["'`])[^"'`]*$/;
const APPLY = /@apply\s+[^;]*$/;
// Characters that can appear in a Tailwind class token (variants, fractions,
// arbitrary values, negatives, important).
const FRAGMENT = /[\w:/[\]\-.%!@]*$/;

const STYLE_LANGUAGES = new Set(["css", "scss", "less"]);
const MARKUP_LANGUAGES = new Set([
	"html",
	"javascript",
	"typescript",
	"javascriptreact",
	"typescriptreact",
]);

/**
 * @param before  Line text from column 1 up to (not including) the cursor.
 * @param languageId  Monaco language id of the active model.
 */
export function detectTailwindContext(
	before: string,
	languageId: string,
): TailwindCompletionContext {
	const inApply = STYLE_LANGUAGES.has(languageId) && APPLY.test(before);
	const inClassAttr =
		MARKUP_LANGUAGES.has(languageId) && CLASS_ATTR.test(before);

	if (!inApply && !inClassAttr) {
		return { active: false, fragment: "" };
	}

	const match = FRAGMENT.exec(before);
	return { active: true, fragment: match ? match[0] : "" };
}

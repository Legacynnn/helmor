// Detects whether the cursor sits in a place where Tailwind class completions
// make sense: inside a `class=`/`className=` attribute value, inside a
// class-name helper call like `cn("…")`, or after `@apply` in a stylesheet.
// Returns the fragment under the cursor so the provider can build an accurate
// replacement range.
//
// `before` may span multiple lines (the provider feeds a small look-back
// window) so the detector handles Prettier-wrapped `cn(` calls where the class
// string lives on its own line. To stay robust against arbitrary values that
// contain parentheses (e.g. `text-[color:var(--x)]`), complete string literals
// are blanked out before the structural regexes run — their inner parens then
// can't break the call-boundary heuristic. Still heuristic, not a full parser.

export type TailwindCompletionContext = {
	/** True when completions should be offered. */
	active: boolean;
	/** Partial class token immediately before the cursor (may be ""). */
	fragment: string;
};

const APPLY = /@apply\s+[^;]*$/;
// Characters that can appear in a Tailwind class token (variants, fractions,
// arbitrary values, negatives, important).
const FRAGMENT = /[\w:/[\]\-.%!@]*$/;

// Class-name helper functions whose string arguments hold Tailwind classes.
// Mirrors VSCode Tailwind IntelliSense's default `classFunctions`, plus `cn`
// (the convention this codebase uses).
const CLASS_FUNCTIONS = [
	"cn",
	"cx",
	"cva",
	"clsx",
	"classnames",
	"classNames",
	"twMerge",
	"tv",
];
// After string contents are blanked, the structural text immediately before the
// open string must end with one of these for the cursor to be in a class list:
//   • an open class-helper call — `cn(` / `clsx("a", ` (no closing `)` yet), or
const CLASS_FUNCTION_OPEN = new RegExp(
	`\\b(?:${CLASS_FUNCTIONS.join("|")})\\s*\\([^)]*$`,
);
//   • a `class=`/`className=` attribute opener, optionally with a `{`.
const CLASS_ATTRIBUTE_OPEN = /(?:class|className)\s*=\s*\{?\s*$/;

// A complete string literal. Used to blank out string contents so their inner
// parens/braces can't confuse the structural regexes above. Single-line only
// (`.` excludes newlines), which matches how class strings are actually
// written.
const COMPLETE_STRING = /(['"`])(?:\\.|(?!\1).)*?\1/g;

const STYLE_LANGUAGES = new Set(["css", "scss", "less"]);
const MARKUP_LANGUAGES = new Set([
	"html",
	"javascript",
	"typescript",
	"javascriptreact",
	"typescriptreact",
]);

/** Replace every complete string literal with same-length blanks, preserving
 * column offsets so the open-quote index stays accurate. */
function blankCompleteStrings(text: string): string {
	return text.replace(COMPLETE_STRING, (match) => " ".repeat(match.length));
}

/**
 * @param before  Text from the start of the look-back window up to (not
 *   including) the cursor. May contain newlines.
 * @param languageId  Monaco language id of the active model.
 */
export function detectTailwindContext(
	before: string,
	languageId: string,
): TailwindCompletionContext {
	const fragmentMatch = FRAGMENT.exec(before);
	const fragment = fragmentMatch ? fragmentMatch[0] : "";

	if (STYLE_LANGUAGES.has(languageId)) {
		return APPLY.test(before)
			? { active: true, fragment }
			: { active: false, fragment: "" };
	}

	if (!MARKUP_LANGUAGES.has(languageId)) {
		return { active: false, fragment: "" };
	}

	// Blank complete strings, then find the opening quote of the string the
	// cursor currently sits in — the last quote remaining after blanking.
	const blanked = blankCompleteStrings(before);
	const openQuote = Math.max(
		blanked.lastIndexOf('"'),
		blanked.lastIndexOf("'"),
		blanked.lastIndexOf("`"),
	);
	if (openQuote === -1) {
		return { active: false, fragment: "" };
	}

	const structural = blanked.slice(0, openQuote);
	const active =
		CLASS_FUNCTION_OPEN.test(structural) ||
		CLASS_ATTRIBUTE_OPEN.test(structural);
	return active ? { active: true, fragment } : { active: false, fragment: "" };
}

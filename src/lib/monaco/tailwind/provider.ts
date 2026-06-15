// Registers a Monaco completion provider that surfaces Tailwind utility classes
// inside class attributes and `@apply`. Color utilities render a swatch via
// CompletionItemKind.Color (Monaco parses the color from `documentation`).

import type * as Monaco from "monaco-editor";
import { resolveCssColor } from "@/lib/css-color";
import type { TailwindClass } from "./catalog";
import { detectTailwindContext } from "./context";

type MonacoModule = typeof Monaco;

const LANGUAGES = ["html", "javascript", "typescript", "css", "scss", "less"];
const TRIGGERS = ['"', "'", "`", " ", "-", ":", "/"];

type CompiledItem = Omit<Monaco.languages.CompletionItem, "range">;

/** Resolve a raw color value to a hex string, or null if unsupported. */
function toHex(value: string | undefined): string | null {
	if (!value) return null;
	try {
		return resolveCssColor(value);
	} catch {
		return null;
	}
}

function compile(
	monaco: MonacoModule,
	catalog: TailwindClass[],
): CompiledItem[] {
	const Kind = monaco.languages.CompletionItemKind;
	return catalog.map((entry, index) => {
		const hex = entry.color ? toHex(entry.color) : null;
		const isColor = Boolean(entry.color);
		return {
			label: entry.name,
			kind: isColor ? Kind.Color : Kind.Value,
			insertText: entry.name,
			filterText: entry.name,
			detail: hex ?? entry.detail,
			// Monaco reads the swatch color from documentation for Color items.
			documentation: hex ?? undefined,
			// Preserve catalog order (utilities before the long color list).
			sortText: index.toString().padStart(6, "0"),
		} satisfies CompiledItem;
	});
}

/**
 * Register the provider. `getCatalog` is polled lazily so the workspace catalog
 * can be swapped without re-registering. Returns a disposable.
 */
export function registerTailwindProvider(
	monaco: MonacoModule,
	getCatalog: () => TailwindClass[],
): Monaco.IDisposable {
	let cachedSource: TailwindClass[] | null = null;
	let compiled: CompiledItem[] = [];

	const ensureCompiled = () => {
		const source = getCatalog();
		if (source !== cachedSource) {
			cachedSource = source;
			compiled = compile(monaco, source);
		}
		return compiled;
	};

	const provider: Monaco.languages.CompletionItemProvider = {
		triggerCharacters: TRIGGERS,
		provideCompletionItems(model, position) {
			const before = model
				.getLineContent(position.lineNumber)
				.slice(0, position.column - 1);
			const context = detectTailwindContext(before, model.getLanguageId());
			if (!context.active) {
				return { suggestions: [] };
			}

			const startColumn = position.column - context.fragment.length;
			const range = new monaco.Range(
				position.lineNumber,
				startColumn,
				position.lineNumber,
				position.column,
			);

			const items = ensureCompiled();
			return {
				suggestions: items.map((item) => ({ ...item, range })),
			};
		},
	};

	const disposables = LANGUAGES.map((language) =>
		monaco.languages.registerCompletionItemProvider(language, provider),
	);

	return {
		dispose() {
			for (const disposable of disposables) {
				disposable.dispose();
			}
		},
	};
}

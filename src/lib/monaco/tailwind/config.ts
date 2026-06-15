// Reads the open workspace's Tailwind setup and turns its custom theme tokens
// into completion entries that layer on top of the static catalog.
//
// Two sources are supported, best-effort:
//   • Tailwind v4 CSS  — `@theme { --color-*, --font-* }` blocks (primary;
//     this is what modern projects, including Helmor itself, use).
//   • Tailwind v3 JS/TS — `theme.extend.colors` keys with literal values.
//
// The parse functions are pure (string in, tokens out) so they unit-test
// cleanly; file discovery/reading is the only async part.

import { readEditorFile } from "@/lib/api";
import { buildColorUtilities, type TailwindClass } from "./catalog";
import { COLOR_PREFIXES } from "./palette";

export type CustomToken = {
	kind: "color" | "font";
	name: string;
	/** Raw value (hex / oklch / var()/ font stack). Optional for v3 keys. */
	value?: string;
};

// Candidate entry stylesheets, relative to the workspace root. First few that
// exist and mention Tailwind are scanned. Order = most→least common.
const CSS_CANDIDATES = [
	"src/App.css",
	"src/app.css",
	"src/index.css",
	"src/main.css",
	"src/styles/globals.css",
	"src/styles/global.css",
	"src/app/globals.css",
	"app/globals.css",
	"styles/globals.css",
	"src/tailwind.css",
	"tailwind.css",
	"globals.css",
];

const CONFIG_CANDIDATES = [
	"tailwind.config.js",
	"tailwind.config.ts",
	"tailwind.config.cjs",
	"tailwind.config.mjs",
];

/** Extract `--color-*` and `--font-*` custom properties from `@theme` blocks. */
export function parseThemeTokens(css: string): CustomToken[] {
	const tokens: CustomToken[] = [];
	const seen = new Set<string>();
	// Match each `@theme [inline] { ... }` body (no nested braces in @theme).
	const themeBlocks = css.matchAll(/@theme[^{]*\{([\s\S]*?)\}/g);
	for (const block of themeBlocks) {
		const body = block[1];
		const decls = body.matchAll(
			/--(color|font)-([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g,
		);
		for (const decl of decls) {
			const kind = decl[1] === "color" ? "color" : "font";
			const name = decl[2].trim();
			const value = decl[3].trim();
			const key = `${kind}:${name}`;
			if (seen.has(key)) continue;
			seen.add(key);
			tokens.push({ kind, name, value });
		}
	}
	return tokens;
}

/** Best-effort extraction of custom color keys from a v3 JS/TS config. */
export function parseConfigColorKeys(source: string): CustomToken[] {
	const tokens: CustomToken[] = [];
	const seen = new Set<string>();
	// Find a `colors: { ... }` object and pull its top-level keys + literal
	// string values. Deliberately shallow: nested scales are skipped.
	const colorsBlock = /colors\s*:\s*\{([\s\S]*?)\n\s*\}/.exec(source);
	if (!colorsBlock) return tokens;
	const entries = colorsBlock[1].matchAll(
		/['"]?([a-zA-Z0-9-]+)['"]?\s*:\s*(?:(['"])(#[0-9a-fA-F]{3,8}|[a-z]+)\2)?/g,
	);
	for (const entry of entries) {
		const name = entry[1];
		if (!name || seen.has(name)) continue;
		seen.add(name);
		tokens.push({ kind: "color", name, value: entry[3] });
	}
	return tokens;
}

/** Turn custom tokens into completion classes (color + font utilities). */
export function customTokensToClasses(tokens: CustomToken[]): TailwindClass[] {
	const out: TailwindClass[] = [];
	for (const token of tokens) {
		if (token.kind === "color") {
			for (const prefix of COLOR_PREFIXES) {
				out.push({
					name: `${prefix}-${token.name}`,
					color: token.value,
					detail: "theme color",
				});
			}
		} else {
			out.push({ name: `font-${token.name}`, detail: "theme font" });
		}
	}
	return out;
}

async function tryRead(absPath: string): Promise<string | null> {
	try {
		const result = await readEditorFile(absPath);
		return result.content;
	} catch {
		return null;
	}
}

/**
 * Discover + parse the workspace Tailwind setup, returning derived completion
 * classes. Never throws — returns [] if nothing usable is found.
 */
export async function loadWorkspaceTailwindClasses(
	workspaceRootPath: string,
): Promise<TailwindClass[]> {
	const root = workspaceRootPath.replace(/\/+$/, "");
	const tokens: CustomToken[] = [];

	for (const candidate of CSS_CANDIDATES) {
		const content = await tryRead(`${root}/${candidate}`);
		if (!content) continue;
		if (!/@theme|@import\s+["']tailwindcss/.test(content)) continue;
		tokens.push(...parseThemeTokens(content));
	}

	if (tokens.length === 0) {
		for (const candidate of CONFIG_CANDIDATES) {
			const content = await tryRead(`${root}/${candidate}`);
			if (!content) continue;
			tokens.push(...parseConfigColorKeys(content));
			break;
		}
	}

	return customTokensToClasses(tokens);
}

// Re-export so the runtime can build the default color set if it ever needs to
// resolve swatches independently of the static catalog.
export { buildColorUtilities };

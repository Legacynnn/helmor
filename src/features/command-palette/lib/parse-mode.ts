export type PaletteMode = "files" | "commands";

/**
 * Read the palette input and return `{ mode, query }`. A leading `>` (with
 * optional trailing whitespace) switches to command mode; anything else is
 * file mode. Whitespace is trimmed before the prefix check so that a primed
 * `"> "` opens in command mode with an empty query.
 */
export function parseMode(input: string): { mode: PaletteMode; query: string } {
	const trimmedLeft = input.replace(/^\s+/, "");
	if (trimmedLeft.startsWith(">")) {
		return {
			mode: "commands",
			query: trimmedLeft.slice(1).replace(/^\s+/, ""),
		};
	}
	return { mode: "files", query: trimmedLeft };
}

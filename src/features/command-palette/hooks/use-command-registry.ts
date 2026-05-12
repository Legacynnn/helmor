import { useMemo } from "react";

export interface PaletteCommand {
	id: string;
	title: string;
	group?: string;
	run: () => void | Promise<void>;
}

/**
 * Stub command registry for the `>` palette mode. Real actions wire up
 * later; today it just renders a couple of placeholders so the mode is
 * visible and the parser path is exercised.
 */
export function useCommandRegistry(): PaletteCommand[] {
	return useMemo<PaletteCommand[]>(
		() => [
			{
				id: "editor.restart",
				title: "Editor: Restart",
				group: "Editor",
				run: () => console.warn("editor.restart not implemented"),
			},
			{
				id: "typescript.restartServer",
				title: "TypeScript: Restart Server",
				group: "Language",
				run: () => console.warn("typescript.restartServer not implemented"),
			},
		],
		[],
	);
}

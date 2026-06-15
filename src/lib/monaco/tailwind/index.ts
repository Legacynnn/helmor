// Orchestrates Tailwind editor support: registers the completion provider once
// and swaps in workspace-derived classes when the active workspace changes.
// The Monaco namespace is supplied by the caller (monaco-runtime) so this stays
// decoupled from Monaco's lazy-load.

import type * as Monaco from "monaco-editor";
import {
	buildStaticCatalog,
	mergeCatalogs,
	type TailwindClass,
} from "./catalog";
import { loadWorkspaceTailwindClasses } from "./config";
import { registerTailwindProvider } from "./provider";

type MonacoModule = typeof Monaco;

// The provider reads this array by reference; reassigning it live-updates the
// suggestions without re-registering.
let catalog: TailwindClass[] = [];
let registered = false;
let loadedRoot: string | null = null;

/**
 * Ensure the Tailwind completion provider is registered and its catalog
 * reflects `workspaceRootPath`. Idempotent and safe to call on every workspace
 * change. Never throws.
 */
export async function installTailwindSupport(
	monaco: MonacoModule,
	workspaceRootPath: string | null,
): Promise<void> {
	if (!registered) {
		catalog = buildStaticCatalog();
		registerTailwindProvider(monaco, () => catalog);
		registered = true;
	}

	if (!workspaceRootPath || workspaceRootPath === loadedRoot) {
		return;
	}
	loadedRoot = workspaceRootPath;

	try {
		const custom = await loadWorkspaceTailwindClasses(workspaceRootPath);
		// Guard against a newer root having superseded this load.
		if (loadedRoot === workspaceRootPath) {
			catalog = mergeCatalogs(buildStaticCatalog(), custom);
		}
	} catch {
		// best-effort: keep the static catalog
	}
}

export type { TailwindClass } from "./catalog";
export { buildStaticCatalog, mergeCatalogs } from "./catalog";

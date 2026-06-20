import { createContext, useContext } from "react";
import type { DiffOpenOptions } from "@/lib/editor-session";

type FileLinkContextValue = {
	/** Session whose thread is currently displayed. Used to session-scope
	 *  cross-component signals fired from message components (e.g. the MDX
	 *  plan card's "Open plan" button). */
	sessionId?: string | null;
	workspaceRootPath?: string | null;
	openInEditor?: (path: string, line?: number, column?: number) => void;
	/** Open the git diff view for a file (used by file-change rows in the
	 * conversation thread). */
	openDiff?: (path: string, options?: DiffOpenOptions) => void;
};

const FileLinkContext = createContext<FileLinkContextValue>({});

export const FileLinkProvider = FileLinkContext.Provider;

export function useFileLinkContext(): FileLinkContextValue {
	return useContext(FileLinkContext);
}

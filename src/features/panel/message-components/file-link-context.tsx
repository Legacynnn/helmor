import { createContext, useContext } from "react";
import type { DiffOpenOptions } from "@/lib/editor-session";

type FileLinkContextValue = {
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

import { createContext, useContext } from "react";

/** Workspace-level facts every canvas panel body needs to bind live content
 * (conversation/terminal) without each one re-querying. Provided once by
 * `CanvasSurface`, consumed by panel bodies. */
export type CanvasWorkspaceInfo = {
	workspaceId: string;
	repoId: string | null;
	workspaceRootPath: string | null;
	workspaceReady: boolean;
};

const CanvasWorkspaceContext = createContext<CanvasWorkspaceInfo | null>(null);

export const CanvasWorkspaceProvider = CanvasWorkspaceContext.Provider;

export function useCanvasWorkspace(): CanvasWorkspaceInfo {
	const ctx = useContext(CanvasWorkspaceContext);
	if (!ctx) {
		throw new Error("useCanvasWorkspace must be used inside a CanvasSurface");
	}
	return ctx;
}

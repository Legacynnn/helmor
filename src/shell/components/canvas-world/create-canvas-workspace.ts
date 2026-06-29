import { finalizeWorkspaceFromRepo, prepareWorkspaceFromRepo } from "@/lib/api";

/**
 * Create a canvas workspace directly — without the start composer / first
 * conversation. Runs the same two-phase create the start surface uses
 * (prepare → finalize), but pins `space: "canvas"` and never opens the chat
 * composer. Returns the new workspace id so the caller can select it.
 *
 * Defaults to a worktree off the repo's default branch (sourceBranch=null lets
 * the backend resolve it). Branch/mode customization stays in the full start
 * flow; this is the quick "new canvas" path.
 */
export async function createCanvasWorkspace(repoId: string): Promise<string> {
	const prepared = await prepareWorkspaceFromRepo(
		repoId,
		null,
		"worktree",
		"canvas",
		null,
		null,
		null,
	);
	await finalizeWorkspaceFromRepo(prepared.workspaceId);
	return prepared.workspaceId;
}

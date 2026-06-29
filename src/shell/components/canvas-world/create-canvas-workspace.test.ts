import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
	prepareWorkspaceFromRepo: vi.fn(),
	finalizeWorkspaceFromRepo: vi.fn(),
}));
vi.mock("@/lib/api", () => apiMocks);

import { createCanvasWorkspace } from "./create-canvas-workspace";

describe("createCanvasWorkspace", () => {
	beforeEach(() => {
		apiMocks.prepareWorkspaceFromRepo.mockReset();
		apiMocks.finalizeWorkspaceFromRepo.mockReset();
	});

	it("prepares a canvas-space worktree workspace then finalizes it", async () => {
		apiMocks.prepareWorkspaceFromRepo.mockResolvedValue({
			workspaceId: "ws-9",
		});
		apiMocks.finalizeWorkspaceFromRepo.mockResolvedValue({});

		const id = await createCanvasWorkspace("repo-1");

		expect(id).toBe("ws-9");
		expect(apiMocks.prepareWorkspaceFromRepo).toHaveBeenCalledWith(
			"repo-1",
			null,
			"worktree",
			"canvas",
			null,
			null,
			null,
		);
		expect(apiMocks.finalizeWorkspaceFromRepo).toHaveBeenCalledWith("ws-9");
	});
});

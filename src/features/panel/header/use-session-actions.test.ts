import { QueryClient } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceDetail } from "@/lib/api";

const apiMocks = vi.hoisted(() => ({
	createSession: vi.fn(),
	deleteSession: vi.fn(),
	renameSession: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
	const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
	return {
		...actual,
		createSession: apiMocks.createSession,
		deleteSession: apiMocks.deleteSession,
		renameSession: apiMocks.renameSession,
	};
});

import { useSessionActions } from "./use-session-actions";

const workspace = {
	id: "workspace-1",
	repoId: "repo-1",
} as unknown as WorkspaceDetail;

function setup() {
	const queryClient = new QueryClient();
	return renderHook(() =>
		useSessionActions({
			workspace,
			sessions: [],
			selectedSessionId: null,
			queryClient,
			pushToast: vi.fn(),
		}),
	);
}

describe("createSessionAction model arg", () => {
	beforeEach(() => {
		apiMocks.createSession.mockReset();
		apiMocks.createSession.mockResolvedValue({ sessionId: "session-new" });
	});

	it("passes the model when provided", async () => {
		const { result } = setup();
		await act(async () => {
			await result.current.createSession("gpt-5.5");
		});
		expect(apiMocks.createSession).toHaveBeenCalledWith("workspace-1", {
			model: "gpt-5.5",
		});
	});

	it("omits options when no model is provided", async () => {
		const { result } = setup();
		await act(async () => {
			await result.current.createSession();
		});
		expect(apiMocks.createSession).toHaveBeenCalledWith(
			"workspace-1",
			undefined,
		);
	});
});

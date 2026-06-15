import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceSessionSummary } from "@/lib/api";

vi.mock("@/lib/session-run-state-context", () => ({
	useBusySessionIds: () => new Set(["s-gui", "s-term"]),
}));
vi.mock("@/lib/session-thread-cache", () => ({
	sessionThreadCacheKey: (sessionId: string) => ["sessionThread", sessionId],
	readSessionThread: () => [
		{
			role: "assistant",
			content: [{ type: "text", id: "t1", text: "Refactoring the parser now" }],
		},
	],
}));
vi.mock("./workspace-hover-card", () => ({
	extractLiveActivity: () => [
		{
			kind: "markdown",
			key: "t1",
			text: "Refactoring the parser now",
			reasoning: false,
		},
	],
}));

import { WorkspaceRowSessionsPreview } from "./row-sessions-preview";

afterEach(() => cleanup());

function sess(over: Partial<WorkspaceSessionSummary>): WorkspaceSessionSummary {
	return {
		id: "s",
		workspaceId: "ws-1",
		title: "Session",
		status: "idle",
		permissionMode: "default",
		unreadCount: 0,
		fastMode: false,
		createdAt: "",
		updatedAt: "",
		isHidden: false,
		active: false,
		...over,
	} as WorkspaceSessionSummary;
}

function renderWith(sessions: WorkspaceSessionSummary[]) {
	const qc = new QueryClient();
	qc.setQueryData(["workspaceSessions", "ws-1"], sessions);
	return render(
		<QueryClientProvider client={qc}>
			<WorkspaceRowSessionsPreview workspaceId="ws-1" />
		</QueryClientProvider>,
	);
}

describe("WorkspaceRowSessionsPreview", () => {
	it("renders a line per running session and the gui live preview", () => {
		renderWith([
			sess({
				id: "s-gui",
				title: "Agent run",
				sessionKind: "gui",
				agentType: "claude",
			}),
			sess({ id: "s-term", title: "npm test", sessionKind: "terminal" }),
		]);
		expect(screen.getByText("Agent run")).toBeInTheDocument();
		expect(screen.getByText("npm test")).toBeInTheDocument();
		expect(screen.getByText(/Refactoring the parser/)).toBeInTheDocument();
		// The terminal row must NOT also render the preview (empty-id subscription).
		expect(screen.queryAllByText(/Refactoring the parser/)).toHaveLength(1);
	});

	it("excludes hidden, action, and non-running sessions", () => {
		renderWith([
			sess({ id: "s-gui", title: "Agent run", sessionKind: "gui" }),
			sess({
				id: "s-hidden",
				title: "Hidden",
				sessionKind: "gui",
				isHidden: true,
			}),
			sess({
				id: "s-action",
				title: "Create PR",
				sessionKind: "gui",
				actionKind: "create-pr",
			}),
			sess({ id: "s-idle", title: "Idle one", sessionKind: "gui" }),
		]);
		expect(screen.getByText("Agent run")).toBeInTheDocument();
		expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
		expect(screen.queryByText("Create PR")).not.toBeInTheDocument();
		expect(screen.queryByText("Idle one")).not.toBeInTheDocument();
	});

	it("renders nothing when no sessions are running", () => {
		const { container } = renderWith([
			sess({ id: "s-idle", title: "Idle one", sessionKind: "gui" }),
		]);
		expect(container).toBeEmptyDOMElement();
	});
});

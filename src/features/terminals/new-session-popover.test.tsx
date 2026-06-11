import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	AgentModelSection,
	TerminalAgentInfo,
	WorkspaceSessionSummary,
} from "@/lib/api";
import { createHelmorQueryClient, helmorQueryKeys } from "@/lib/query-client";
import { renderWithProviders } from "@/test/render-with-providers";

const apiMocks = vi.hoisted(() => ({
	listTerminalAgents: vi.fn(),
	createTerminalSession: vi.fn(),
	loadAgentModelSections: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/api")>()),
	listTerminalAgents: apiMocks.listTerminalAgents,
	createTerminalSession: apiMocks.createTerminalSession,
	loadAgentModelSections: apiMocks.loadAgentModelSections,
}));

import { NewSessionPopover } from "./new-session-popover";

const HARNESS_SECTIONS: AgentModelSection[] = [
	{
		id: "claude",
		label: "Claude Code",
		status: "ready",
		options: [
			{
				id: "default",
				provider: "claude",
				label: "Opus 4.8 1M",
				cliModel: "default",
				effortLevels: [],
				supportsContextUsage: true,
			},
		],
	},
	{
		id: "codex",
		label: "Codex",
		status: "ready",
		options: [
			{
				id: "gpt-5.5",
				provider: "codex",
				label: "GPT-5.5",
				cliModel: "gpt-5.5",
				effortLevels: [],
				supportsContextUsage: true,
			},
		],
	},
	{
		id: "opencode",
		label: "OpenCode",
		status: "unavailable",
		options: [],
	},
];

function agent(overrides: Partial<TerminalAgentInfo>): TerminalAgentInfo {
	return {
		id: "claude-code",
		displayName: "Claude Code",
		installed: true,
		version: "2.1.170",
		binaryPath: "/usr/local/bin/claude",
		firstClass: true,
		iconKey: "claude",
		skillCount: 3,
		extensionCount: 0,
		pluginCount: 1,
		docsUrl: "https://example.com",
		...overrides,
	};
}

function renderPopover(
	props: Partial<React.ComponentProps<typeof NewSessionPopover>> = {},
) {
	return renderWithProviders(
		<NewSessionPopover
			workspaceId="w1"
			onCreateConversation={props.onCreateConversation ?? vi.fn()}
			onSelectSession={props.onSelectSession}
			onSessionsChanged={props.onSessionsChanged}
			{...props}
		/>,
	);
}

afterEach(async () => {
	cleanup();
	// Radix Popover/Tooltip schedule async focus-restoration on unmount (rAF in
	// jsdom). Flush it while this test environment is still alive — otherwise the
	// deferred React commit runs after teardown, and React's getActiveElementDeep
	// throws "instanceof" against the destroyed window (surfacing as an uncaught
	// error attributed to whatever test file runs next).
	await new Promise((resolve) => setTimeout(resolve, 50));
});

beforeEach(() => {
	vi.clearAllMocks();
	apiMocks.listTerminalAgents.mockResolvedValue([
		agent({}),
		agent({
			id: "codex",
			displayName: "Codex CLI",
			firstClass: false,
			iconKey: "openai",
			skillCount: 0,
		}),
		agent({ id: "amp", displayName: "Amp", installed: false, version: null }),
	]);
	apiMocks.createTerminalSession.mockResolvedValue({ sessionId: "ts-1" });
	apiMocks.loadAgentModelSections.mockResolvedValue(HARNESS_SECTIONS);
});

describe("NewSessionPopover", () => {
	it("creates a conversation seeded with the harness's default model", async () => {
		const onCreateConversation = vi.fn();
		const user = userEvent.setup();
		renderPopover({ onCreateConversation });
		await user.click(screen.getByLabelText("New session"));
		await user.click(await screen.findByText("Claude Code"));
		expect(onCreateConversation).toHaveBeenCalledWith("default");
		expect(apiMocks.createTerminalSession).not.toHaveBeenCalled();
	});

	it("lists only ready harnesses and hides unavailable ones", async () => {
		const user = userEvent.setup();
		renderPopover();
		await user.click(screen.getByLabelText("New session"));
		await waitFor(() => {
			expect(screen.getByText("Claude Code")).toBeInTheDocument();
		});
		expect(screen.getByText("Codex")).toBeInTheDocument();
		expect(screen.queryByText("OpenCode")).not.toBeInTheDocument();
	});

	it("creates a conversation with the picked harness's first model id", async () => {
		const onCreateConversation = vi.fn();
		const user = userEvent.setup();
		renderPopover({ onCreateConversation });
		await user.click(screen.getByLabelText("New session"));
		await user.click(await screen.findByText("Codex"));
		expect(onCreateConversation).toHaveBeenCalledWith("gpt-5.5");
	});

	it("lists only installed terminal agents on the Terminal tab", async () => {
		const user = userEvent.setup();
		renderPopover();
		await user.click(screen.getByLabelText("New session"));
		await user.click(screen.getByRole("button", { name: /Terminal/ }));
		await waitFor(() => {
			expect(screen.getByText("Claude Code")).toBeInTheDocument();
		});
		expect(screen.getByText("Codex CLI")).toBeInTheDocument();
		expect(screen.queryByText("Amp")).not.toBeInTheDocument();
	});

	it("starts a terminal session via the digit quick-key", async () => {
		const onSelectSession = vi.fn();
		const user = userEvent.setup();
		renderPopover({ onSelectSession });
		await user.click(screen.getByLabelText("New session"));
		await user.click(screen.getByRole("button", { name: /Terminal/ }));
		await waitFor(() => {
			expect(screen.getByText("Claude Code")).toBeInTheDocument();
		});
		await user.keyboard("1");
		await waitFor(() => {
			expect(apiMocks.createTerminalSession).toHaveBeenCalledWith(
				"w1",
				"claude-code",
			);
		});
		await waitFor(() => {
			expect(onSelectSession).toHaveBeenCalledWith("ts-1");
		});
	});

	it("seeds the new terminal session into the cache as the active session", async () => {
		const queryClient = createHelmorQueryClient();
		const existingChat: WorkspaceSessionSummary = {
			id: "chat-1",
			workspaceId: "w1",
			title: "Existing",
			agentType: null,
			status: "idle",
			model: null,
			permissionMode: "default",
			providerSessionId: null,
			effortLevel: null,
			unreadCount: 0,
			fastMode: false,
			createdAt: "2026-01-01T00:00:00Z",
			updatedAt: "2026-01-01T00:00:00Z",
			lastUserMessageAt: null,
			isHidden: false,
			sessionKind: "chat",
			actionKind: null,
			active: true,
		};
		queryClient.setQueryData(helmorQueryKeys.workspaceSessions("w1"), [
			existingChat,
		]);

		const user = userEvent.setup();
		renderWithProviders(
			<NewSessionPopover workspaceId="w1" onCreateConversation={vi.fn()} />,
			{ queryClient },
		);
		await user.click(screen.getByLabelText("New session"));
		await user.click(screen.getByRole("button", { name: /Terminal/ }));
		await waitFor(() => {
			expect(screen.getByText("Claude Code")).toBeInTheDocument();
		});
		await user.keyboard("1");

		await waitFor(() => {
			const sessions = queryClient.getQueryData<WorkspaceSessionSummary[]>(
				helmorQueryKeys.workspaceSessions("w1"),
			);
			const seeded = sessions?.find((session) => session.id === "ts-1");
			expect(seeded?.active).toBe(true);
			expect(seeded?.sessionKind).toBe("terminal");
			expect(seeded?.agentType).toBe("claude-code");
			// The previously-active chat tab must be demoted so the new terminal
			// tab is the only active one.
			expect(sessions?.find((session) => session.id === "chat-1")?.active).toBe(
				false,
			);
		});
	});
});

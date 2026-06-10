import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TerminalAgentInfo } from "@/lib/api";
import { renderWithProviders } from "@/test/render-with-providers";

const apiMocks = vi.hoisted(() => ({
	listTerminalAgents: vi.fn(),
	createTerminalSession: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/api")>()),
	listTerminalAgents: apiMocks.listTerminalAgents,
	createTerminalSession: apiMocks.createTerminalSession,
}));

import { NewSessionPopover } from "./new-session-popover";

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

afterEach(() => cleanup());

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
});

describe("NewSessionPopover", () => {
	it("creates a conversation from the Conversation tab", async () => {
		const onCreateConversation = vi.fn();
		const user = userEvent.setup();
		renderPopover({ onCreateConversation });
		await user.click(screen.getByLabelText("New session"));
		await user.click(await screen.findByText("New conversation"));
		expect(onCreateConversation).toHaveBeenCalledTimes(1);
		expect(apiMocks.createTerminalSession).not.toHaveBeenCalled();
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
});

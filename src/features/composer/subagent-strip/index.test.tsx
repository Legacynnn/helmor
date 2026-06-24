import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSubagentFilterStore } from "@/features/conversation/state/subagent-filter-store";
import type { ThreadMessageLike, ToolCallPart } from "@/lib/api";
import { createHelmorQueryClient, helmorQueryKeys } from "@/lib/query-client";
import { SubagentStrip } from "./index";

const SESSION = "session-1";

function threadKey(sessionId: string) {
	return [...helmorQueryKeys.sessionMessages(sessionId), "thread"];
}

function runningTask(toolCallId: string, description: string): ToolCallPart {
	return {
		type: "tool-call",
		toolName: "Task",
		toolCallId,
		args: { description },
		argsText: "",
		result: null,
	};
}

function renderStrip(messages: ThreadMessageLike[]) {
	const queryClient = createHelmorQueryClient();
	queryClient.setQueryData(threadKey(SESSION), messages);
	return render(
		<QueryClientProvider client={queryClient}>
			<SubagentStrip sessionId={SESSION} />
		</QueryClientProvider>,
	);
}

describe("SubagentStrip", () => {
	beforeEach(() => {
		useSubagentFilterStore.setState({ activeBySession: {} });
	});
	afterEach(() => {
		cleanup();
		useSubagentFilterStore.setState({ activeBySession: {} });
	});

	it("collapses (aria-hidden) when no subagents are running", () => {
		renderStrip([
			{
				role: "assistant",
				id: "m1",
				content: [{ type: "text", id: "t", text: "hi" }],
			},
		]);
		expect(screen.getByTestId("subagent-strip")).toHaveAttribute(
			"aria-hidden",
			"true",
		);
	});

	it("renders a chip per running subagent and toggles the filter on click", () => {
		renderStrip([
			{
				role: "assistant",
				id: "m1",
				streaming: true,
				content: [
					runningTask("tc1", "Curie task"),
					runningTask("tc2", "Dewey task"),
				],
			},
		]);

		const strip = screen.getByTestId("subagent-strip");
		expect(strip).toHaveAttribute("aria-hidden", "false");

		const chip = screen.getByRole("button", { name: /Curie task/ });
		expect(chip).toHaveAttribute("aria-pressed", "false");

		fireEvent.click(chip);
		expect(useSubagentFilterStore.getState().activeBySession[SESSION]).toEqual({
			key: "tc1",
			name: "Curie task",
		});

		// Clicking the active chip again clears the filter.
		fireEvent.click(screen.getByRole("button", { name: /Curie task/ }));
		expect(
			useSubagentFilterStore.getState().activeBySession[SESSION],
		).toBeUndefined();
	});
});

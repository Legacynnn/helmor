import { describe, expect, test } from "bun:test";
import type {
	ModelInfo,
	PermissionRequest,
	SessionEvent,
} from "@github/copilot-sdk";
import {
	buildImageAttachments,
	describePermissionRequest,
	mapCopilotEvent,
	mapCopilotModels,
	parseReasoningEffort,
} from "./copilot-wire.js";

/** Minimal SDK event envelope — only `type` + `data` matter to the mapper. */
function sdkEvent(type: string, data: Record<string, unknown>): SessionEvent {
	return {
		type,
		data,
		id: "evt-1",
		parentId: null,
		timestamp: "2026-01-01T00:00:00Z",
	} as unknown as SessionEvent;
}

describe("mapCopilotEvent", () => {
	test("assistant.message_delta → copilot/assistant_delta", () => {
		expect(
			mapCopilotEvent(
				sdkEvent("assistant.message_delta", {
					deltaContent: "Hel",
					messageId: "m1",
				}),
			),
		).toEqual({ type: "copilot/assistant_delta", text: "Hel" });
	});

	test("assistant.message → copilot/assistant_message", () => {
		expect(
			mapCopilotEvent(sdkEvent("assistant.message", { content: "Hello" })),
		).toEqual({ type: "copilot/assistant_message", text: "Hello" });
	});

	test("assistant.reasoning_delta → copilot/reasoning_delta", () => {
		expect(
			mapCopilotEvent(
				sdkEvent("assistant.reasoning_delta", {
					deltaContent: "thi",
					reasoningId: "r1",
				}),
			),
		).toEqual({ type: "copilot/reasoning_delta", text: "thi" });
	});

	test("assistant.reasoning → copilot/reasoning_message", () => {
		expect(
			mapCopilotEvent(
				sdkEvent("assistant.reasoning", {
					content: "thinking",
					reasoningId: "r1",
				}),
			),
		).toEqual({ type: "copilot/reasoning_message", text: "thinking" });
	});

	test("tool.execution_start carries id, name, and arguments", () => {
		expect(
			mapCopilotEvent(
				sdkEvent("tool.execution_start", {
					toolCallId: "tc-1",
					toolName: "bash",
					arguments: { command: "ls" },
				}),
			),
		).toEqual({
			type: "copilot/tool_call_start",
			tool_call_id: "tc-1",
			tool_name: "bash",
			arguments: { command: "ls" },
		});
	});

	test("tool.execution_start omits absent arguments", () => {
		expect(
			mapCopilotEvent(
				sdkEvent("tool.execution_start", {
					toolCallId: "tc-2",
					toolName: "view",
				}),
			),
		).toEqual({
			type: "copilot/tool_call_start",
			tool_call_id: "tc-2",
			tool_name: "view",
		});
	});

	test("tool.execution_complete prefers detailedContent over content", () => {
		expect(
			mapCopilotEvent(
				sdkEvent("tool.execution_complete", {
					toolCallId: "tc-1",
					success: true,
					result: { content: "short", detailedContent: "full diff" },
				}),
			),
		).toEqual({
			type: "copilot/tool_call_end",
			tool_call_id: "tc-1",
			success: true,
			content: "full diff",
		});
	});

	test("tool.execution_complete failure carries error, omits content", () => {
		expect(
			mapCopilotEvent(
				sdkEvent("tool.execution_complete", {
					toolCallId: "tc-1",
					success: false,
					error: { message: "boom" },
				}),
			),
		).toEqual({
			type: "copilot/tool_call_end",
			tool_call_id: "tc-1",
			success: false,
			error: "boom",
		});
	});

	test("lifecycle/unknown events → null (not forwarded)", () => {
		expect(mapCopilotEvent(sdkEvent("session.idle", {}))).toBeNull();
		expect(
			mapCopilotEvent(sdkEvent("session.error", { message: "x" })),
		).toBeNull();
		expect(
			mapCopilotEvent(sdkEvent("user.message", { content: "" })),
		).toBeNull();
	});
});

function model(overrides: Partial<ModelInfo> & { id: string }): ModelInfo {
	return {
		name: overrides.id,
		capabilities: {
			supports: { vision: false, reasoningEffort: false },
			limits: { max_context_window_tokens: 128_000 },
		},
		...overrides,
	} as ModelInfo;
}

describe("mapCopilotModels", () => {
	test("maps id/name and sorts by label", () => {
		const out = mapCopilotModels([
			model({ id: "z-model", name: "Zed" }),
			model({ id: "a-model", name: "Alpha" }),
		]);
		expect(out.map((m) => m.label)).toEqual(["Alpha", "Zed"]);
		expect(out[0]).toEqual({
			id: "a-model",
			label: "Alpha",
			cliModel: "a-model",
		});
	});

	test("effortLevels from supportedReasoningEfforts when supported", () => {
		const out = mapCopilotModels([
			model({
				id: "gpt-5",
				name: "GPT-5",
				capabilities: {
					supports: { vision: false, reasoningEffort: true },
					limits: { max_context_window_tokens: 1 },
				},
				supportedReasoningEfforts: ["low", "high"],
			}),
		]);
		expect(out[0]?.effortLevels).toEqual(["low", "high"]);
	});

	test("falls back to the full effort set when the flag is on but the list is absent", () => {
		const out = mapCopilotModels([
			model({
				id: "gpt-5",
				name: "GPT-5",
				capabilities: {
					supports: { vision: false, reasoningEffort: true },
					limits: { max_context_window_tokens: 1 },
				},
			}),
		]);
		expect(out[0]?.effortLevels).toEqual(["low", "medium", "high", "xhigh"]);
	});

	test("no effortLevels key when reasoning effort is unsupported", () => {
		const out = mapCopilotModels([model({ id: "gpt-4.1", name: "GPT-4.1" })]);
		expect(out[0]).not.toHaveProperty("effortLevels");
	});
});

describe("describePermissionRequest", () => {
	test("shell → kind as tool name, full command text as description", () => {
		const request = {
			kind: "shell",
			fullCommandText: "rm -rf build",
			intention: "Clean the build directory",
		} as unknown as PermissionRequest;
		expect(describePermissionRequest(request)).toEqual({
			toolName: "shell",
			description: "rm -rf build",
		});
	});

	test("mcp → real tool name, intention-less requests omit description", () => {
		const request = {
			kind: "mcp",
			toolName: "query_db",
			serverName: "db",
		} as unknown as PermissionRequest;
		expect(describePermissionRequest(request)).toEqual({
			toolName: "query_db",
			description: undefined,
		});
	});

	test("write → kind + intention", () => {
		const request = {
			kind: "write",
			fileName: "a.ts",
			intention: "Update imports",
		} as unknown as PermissionRequest;
		expect(describePermissionRequest(request)).toEqual({
			toolName: "write",
			description: "Update imports",
		});
	});
});

describe("parseReasoningEffort", () => {
	test("accepts the SDK's union values", () => {
		expect(parseReasoningEffort("low")).toBe("low");
		expect(parseReasoningEffort("xhigh")).toBe("xhigh");
	});

	test("rejects stray values and absence", () => {
		expect(parseReasoningEffort("max")).toBeUndefined();
		expect(parseReasoningEffort("")).toBeUndefined();
		expect(parseReasoningEffort(undefined)).toBeUndefined();
	});
});

describe("buildImageAttachments", () => {
	test("maps image paths to file attachments", () => {
		expect(buildImageAttachments(["/tmp/a.png", "/tmp/b c.jpg"])).toEqual([
			{ type: "file", path: "/tmp/a.png" },
			{ type: "file", path: "/tmp/b c.jpg" },
		]);
	});

	test("empty → no attachments", () => {
		expect(buildImageAttachments([])).toEqual([]);
	});
});

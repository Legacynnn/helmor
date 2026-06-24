import { describe, expect, it } from "vitest";
import type {
	ExtendedMessagePart,
	ThreadMessageLike,
	ToolCallPart,
} from "@/lib/api";
import {
	extractRunningSubagents,
	selectSubagentBlock,
	summarizeSubagent,
} from "./extract-subagents";

function claudeTask(
	overrides: Partial<ToolCallPart> & { toolCallId: string },
): ToolCallPart {
	return {
		type: "tool-call",
		toolName: "Task",
		args: { description: "Research the API" },
		argsText: "",
		result: null,
		...overrides,
	};
}

function codexSpawn(
	toolCallId: string,
	agentsStates: Record<string, unknown>,
): ToolCallPart {
	return {
		type: "tool-call",
		toolName: "subagent_spawn",
		toolCallId,
		args: { agentsStates },
		argsText: "",
	};
}

function assistant(
	content: ExtendedMessagePart[],
	overrides: Partial<ThreadMessageLike> = {},
): ThreadMessageLike {
	return { role: "assistant", id: "m1", content, ...overrides };
}

describe("extractRunningSubagents", () => {
	it("returns empty when no subagents are present", () => {
		const messages = [assistant([{ type: "text", id: "t1", text: "hello" }])];
		expect(extractRunningSubagents(messages)).toEqual([]);
	});

	it("treats a Claude Task with null result on a streaming message as running", () => {
		const messages = [
			assistant([claudeTask({ toolCallId: "tc1", result: null })], {
				streaming: true,
			}),
		];
		const running = extractRunningSubagents(messages);
		expect(running).toHaveLength(1);
		expect(running[0]).toMatchObject({
			key: "tc1",
			toolCallId: "tc1",
			name: "Research the API",
		});
		expect(running[0]?.color).toMatch(/^var\(--subagent-/);
	});

	it("treats a finished Claude Task (result set, not streaming) as not running", () => {
		const messages = [
			assistant(
				[claudeTask({ toolCallId: "tc1", result: "done", children: [] })],
				{ streaming: false },
			),
		];
		expect(extractRunningSubagents(messages)).toEqual([]);
	});

	it("treats a Claude Task with streamingStatus=running as running regardless of message flag", () => {
		const messages = [
			assistant(
				[claudeTask({ toolCallId: "tc1", streamingStatus: "running" })],
				{ streaming: false },
			),
		];
		expect(extractRunningSubagents(messages)).toHaveLength(1);
	});

	it("keeps a Task running after input streaming finishes (streamingStatus=done, result still null)", () => {
		// Regression: `streamingStatus` flips to `done` once the args finish
		// arriving while the subagent keeps executing — the chip must NOT vanish.
		const messages = [
			assistant(
				[
					claudeTask({
						toolCallId: "tc1",
						streamingStatus: "done",
						result: null,
					}),
				],
				{ streaming: false },
			),
		];
		expect(extractRunningSubagents(messages)).toHaveLength(1);
	});

	it("treats an errored Task as not running", () => {
		const messages = [
			assistant(
				[
					claudeTask({
						toolCallId: "tc1",
						streamingStatus: "error",
						result: "boom",
					}),
				],
				{ streaming: true },
			),
		];
		expect(extractRunningSubagents(messages)).toEqual([]);
	});

	it("collects parallel Claude Tasks in a single message", () => {
		const messages = [
			assistant(
				[
					claudeTask({ toolCallId: "tc1", args: { description: "A" } }),
					claudeTask({ toolCallId: "tc2", args: { description: "B" } }),
				],
				{ streaming: true },
			),
		];
		const running = extractRunningSubagents(messages);
		expect(running.map((r) => r.key)).toEqual(["tc1", "tc2"]);
	});

	it("detects a nested subagent spawned inside a parent Task's children", () => {
		const messages = [
			assistant(
				[
					claudeTask({
						toolCallId: "parent",
						children: [
							claudeTask({
								toolCallId: "child",
								args: { description: "Nested" },
							}),
						],
					}),
				],
				{ streaming: true },
			),
		];
		const running = extractRunningSubagents(messages);
		expect(running.map((r) => r.key).sort()).toEqual(["child", "parent"]);
	});

	it("treats a Codex agentsStates entry with status=running as running", () => {
		const messages = [
			assistant([
				codexSpawn("sc1", {
					"thread-1": {
						agentNickname: "Curie",
						agentRole: "worker",
						status: "running",
					},
				}),
			]),
		];
		const running = extractRunningSubagents(messages);
		expect(running).toHaveLength(1);
		expect(running[0]).toMatchObject({
			key: "thread-1",
			name: "Curie",
			agentType: "worker",
		});
	});

	it("drops a Codex thread once a later sighting reports completed", () => {
		const messages = [
			assistant(
				[
					codexSpawn("sc1", {
						"thread-1": { agentNickname: "Curie", status: "running" },
					}),
				],
				{ id: "m1" },
			),
			assistant(
				[
					{
						type: "tool-call",
						toolName: "subagent_wait",
						toolCallId: "sc2",
						args: {
							agentsStates: {
								"thread-1": { agentNickname: "Curie", status: "completed" },
							},
						},
						argsText: "",
					},
				],
				{ id: "m2" },
			),
		];
		expect(extractRunningSubagents(messages)).toEqual([]);
	});

	it("falls back to the identity pool when a Codex nickname is missing", () => {
		const messages = [
			assistant([
				codexSpawn("sc1", {
					"thread-1": { status: "running" },
				}),
			]),
		];
		const running = extractRunningSubagents(messages);
		expect(running).toHaveLength(1);
		expect(running[0]?.name).toBeTruthy();
		expect(running[0]?.name).not.toBe("");
	});
});

describe("selectSubagentBlock", () => {
	it("surfaces a Claude Task's children as a single assistant message", () => {
		const children: ExtendedMessagePart[] = [
			{ type: "text", id: "c1", text: "child output" },
		];
		const messages = [
			assistant([claudeTask({ toolCallId: "tc1", children })], {
				streaming: true,
			}),
		];
		const block = selectSubagentBlock(messages, "tc1");
		expect(block?.role).toBe("assistant");
		expect(block?.content).toEqual(children);
	});

	it("surfaces Codex subagent parts referencing the thread", () => {
		const spawn = codexSpawn("sc1", {
			"thread-1": { agentNickname: "Curie", status: "running" },
		});
		const messages = [assistant([spawn])];
		const block = selectSubagentBlock(messages, "thread-1");
		expect(block?.content).toEqual([spawn]);
	});

	it("returns null for an unknown key", () => {
		const messages = [
			assistant([claudeTask({ toolCallId: "tc1" })], { streaming: true }),
		];
		expect(selectSubagentBlock(messages, "nope")).toBeNull();
	});
});

describe("summarizeSubagent", () => {
	it("counts tool uses, files touched and steps for a Claude Task", () => {
		const children: ExtendedMessagePart[] = [
			{ type: "text", id: "c0", text: "thinking" },
			{
				type: "tool-call",
				toolName: "Read",
				toolCallId: "k1",
				args: {},
				argsText: "",
			},
			{
				type: "tool-call",
				toolName: "Edit",
				toolCallId: "k2",
				args: {},
				argsText: "",
			},
		];
		const messages = [
			assistant(
				[
					claudeTask({
						toolCallId: "tc1",
						args: { description: "X", subagent_type: "Explore" },
						children,
					}),
				],
				{ streaming: true },
			),
		];
		const summary = summarizeSubagent(messages, "tc1");
		expect(summary).toMatchObject({
			agentType: "Explore",
			toolUses: 2,
			filesTouched: 1,
			steps: 3,
			running: true,
		});
		expect(summary?.color).toMatch(/^var\(--subagent-/);
	});

	it("reports running=false for a finished Task", () => {
		const messages = [
			assistant(
				[claudeTask({ toolCallId: "tc1", result: "done", children: [] })],
				{ streaming: false },
			),
		];
		expect(summarizeSubagent(messages, "tc1")?.running).toBe(false);
	});

	it("summarizes a Codex subagent by role + status", () => {
		const messages = [
			assistant([
				codexSpawn("sc1", {
					"thread-1": {
						agentNickname: "Curie",
						agentRole: "worker",
						status: "running",
					},
				}),
			]),
		];
		const summary = summarizeSubagent(messages, "thread-1");
		expect(summary).toMatchObject({ agentType: "worker", running: true });
	});

	it("returns null for an unknown key", () => {
		expect(
			summarizeSubagent(
				[assistant([claudeTask({ toolCallId: "tc1" })], { streaming: true })],
				"nope",
			),
		).toBeNull();
	});
});

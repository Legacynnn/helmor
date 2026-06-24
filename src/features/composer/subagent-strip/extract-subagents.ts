/**
 * Pure helpers that walk the rendered thread (`ThreadMessageLike[]`) and
 * surface *currently-running* spawned subagents, plus select the content for
 * one subagent when the thread is filtered.
 *
 * This is the single source of truth shared by the composer strip
 * (`use-running-subagents`) and the viewport filter (`thread-viewport`), so the
 * two can never disagree about which subagents exist or what a filtered view
 * shows. See the RiskCard in `.helmor/plans/subagent-composer-strip.mdx`.
 *
 * Two agent flavors:
 *   - Claude `Task` / `Agent`: a `ToolCallPart` whose `children` hold the
 *     subagent's nested work. Running while the part is streaming or its
 *     `result` is still null on a streaming message. `key` = `toolCallId`.
 *   - Codex `subagent_*`: per-agent lifecycle lives in `args.agentsStates`
 *     (keyed by `threadId`). Running when the latest sighting of that thread
 *     reports a live status. `key` = `threadId`. These parts carry no
 *     `children`; their outputs are the `agentsStates` messages themselves.
 */

import {
	type AgentState,
	isSubagentToolName,
	readAgentsStates,
} from "@/features/panel/message-components/subagent-tool";
import type {
	ExtendedMessagePart,
	ThreadMessageLike,
	ToolCallPart,
} from "@/lib/api";
import { getSubagentIdentity } from "@/lib/subagent-identity";

/** Claude tool names that spawn a subagent (mirror of the Rust
 *  `AGENT_TOOL_NAMES` constant in `pipeline/adapter/mod.rs`). */
const CLAUDE_AGENT_TOOL_NAMES = new Set(["Agent", "Task"]);

export interface RunningSubagent {
	/** Stable identity used by the filter store. Codex `threadId`, else the
	 *  Claude tool call id. */
	key: string;
	/** Display label — Codex nickname / Claude `description`, falling back to
	 *  the deterministic identity pool so chips never render blank. */
	name: string;
	/** A `var(--subagent-N)` reference from the identity pool. */
	color: string;
	/** Claude `subagent_type` / Codex role, when known. */
	agentType: string | null;
	/** Id of the top-level thread message that contains this subagent, for
	 *  locating it later. Null when the message had no id. */
	anchorMessageId: string | null;
	/** The originating tool call id (equals `key` for Claude). */
	toolCallId: string;
}

function isToolCallPart(part: ExtendedMessagePart): part is ToolCallPart {
	return part.type === "tool-call";
}

/** Codex per-agent live status. `running` per the plan, plus the
 *  `in_progress` variants the Codex client emits for an active thread. */
function isLiveAgentStatus(status: string | null | undefined): boolean {
	return (
		status === "running" || status === "in_progress" || status === "inProgress"
	);
}

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: null;
}

/**
 * Walk every message (recursing into `ToolCallPart.children`) and return the
 * subagents that are running right now. Codex threads are de-duplicated by
 * `threadId` with the latest sighting winning, so a thread that has since moved
 * to `completed` drops out even if an earlier spawn row still reads `running`.
 */
export function extractRunningSubagents(
	messages: readonly ThreadMessageLike[],
): RunningSubagent[] {
	// Insertion-ordered; Codex entries get overwritten as later parts report
	// newer statuses.
	const byKey = new Map<string, { entry: RunningSubagent; running: boolean }>();

	const visitParts = (
		parts: readonly ExtendedMessagePart[] | undefined,
		anchorMessageId: string | null,
	) => {
		if (!parts) return;
		for (const part of parts) {
			if (part.type === "collapsed-group") {
				visitParts(part.tools, anchorMessageId);
				continue;
			}
			if (!isToolCallPart(part)) continue;

			if (CLAUDE_AGENT_TOOL_NAMES.has(part.toolName)) {
				collectClaude(part, anchorMessageId, byKey);
			} else if (isSubagentToolName(part.toolName)) {
				collectCodex(part, anchorMessageId, byKey);
			}

			// Recurse regardless: a subagent can itself spawn nested subagents.
			visitParts(part.children, anchorMessageId);
		}
	};

	for (const message of messages) {
		visitParts(message.content, message.id ?? null);
	}

	const result: RunningSubagent[] = [];
	for (const { entry, running } of byKey.values()) {
		if (running) result.push(entry);
	}
	return result;
}

function collectClaude(
	part: ToolCallPart,
	anchorMessageId: string | null,
	byKey: Map<string, { entry: RunningSubagent; running: boolean }>,
): void {
	// A Claude subagent runs until its tool call yields a result. `streamingStatus`
	// only tracks *input* streaming — it flips to `done` once the args finish
	// arriving while the subagent keeps executing — so gating on it would drop the
	// chip seconds after spawn. Mirror `AgentChildrenBlock`'s `isRunning =
	// result == null`; a failed call (`streamingStatus === "error"`) is not running.
	const running = part.result == null && part.streamingStatus !== "error";
	const key = part.toolCallId;
	const name =
		readString(part.args.description) ??
		getSubagentIdentity(key, null).nickname;
	byKey.set(key, {
		running,
		entry: {
			key,
			name,
			color: getSubagentIdentity(key, name).color,
			agentType: readString(part.args.subagent_type),
			anchorMessageId,
			toolCallId: part.toolCallId,
		},
	});
}

function collectCodex(
	part: ToolCallPart,
	anchorMessageId: string | null,
	byKey: Map<string, { entry: RunningSubagent; running: boolean }>,
): void {
	const states = readAgentsStates(part.args);
	for (const state of states) {
		const key = state.threadId;
		const name = getSubagentIdentity(key, state.nickname).nickname;
		byKey.set(key, {
			running: isLiveAgentStatus(state.status),
			entry: {
				key,
				name,
				color: getSubagentIdentity(key, state.nickname).color,
				agentType: readString(state.role),
				anchorMessageId,
				toolCallId: part.toolCallId,
			},
		});
	}
}

/**
 * Build the single synthesized assistant message shown when the thread is
 * filtered to one subagent. Returns null when the key can't be resolved (the
 * caller then renders an empty filtered thread).
 *
 *   - Claude: the `Task`/`Agent` tool call's `children`.
 *   - Codex: every `subagent_*` tool call part referencing this `threadId`,
 *     since Codex outputs live on those parts (no `children`).
 */
export function selectSubagentBlock(
	messages: readonly ThreadMessageLike[],
	key: string,
): ThreadMessageLike | null {
	const claudeChildren = findClaudeChildren(messages, key);
	if (claudeChildren) {
		return {
			role: "assistant",
			id: `subagent-filter:${key}`,
			content: claudeChildren,
		};
	}

	const codexParts = findCodexParts(messages, key);
	if (codexParts.length > 0) {
		return {
			role: "assistant",
			id: `subagent-filter:${key}`,
			content: codexParts,
		};
	}

	return null;
}

function findClaudeTaskPart(
	messages: readonly ThreadMessageLike[],
	key: string,
): ToolCallPart | null {
	let found: ToolCallPart | null = null;
	const visit = (parts: readonly ExtendedMessagePart[] | undefined) => {
		if (!parts || found) return;
		for (const part of parts) {
			if (found) return;
			if (part.type === "collapsed-group") {
				visit(part.tools);
				continue;
			}
			if (!isToolCallPart(part)) continue;
			if (
				CLAUDE_AGENT_TOOL_NAMES.has(part.toolName) &&
				part.toolCallId === key
			) {
				found = part;
				return;
			}
			visit(part.children);
		}
	};
	for (const message of messages) {
		visit(message.content);
		if (found) break;
	}
	return found;
}

function findClaudeChildren(
	messages: readonly ThreadMessageLike[],
	key: string,
): ExtendedMessagePart[] | null {
	const part = findClaudeTaskPart(messages, key);
	return part?.children && part.children.length > 0 ? part.children : null;
}

function findCodexParts(
	messages: readonly ThreadMessageLike[],
	key: string,
): ToolCallPart[] {
	const parts: ToolCallPart[] = [];
	const referencesThread = (states: AgentState[]) =>
		states.some((state) => state.threadId === key);
	const visit = (children: readonly ExtendedMessagePart[] | undefined) => {
		if (!children) return;
		for (const part of children) {
			if (part.type === "collapsed-group") {
				visit(part.tools);
				continue;
			}
			if (!isToolCallPart(part)) continue;
			if (
				isSubagentToolName(part.toolName) &&
				referencesThread(readAgentsStates(part.args))
			) {
				parts.push(part);
			}
			visit(part.children);
		}
	};
	for (const message of messages) {
		visit(message.content);
	}
	return parts;
}

const FILE_EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "apply_patch"]);

/** Derived stats for the filter banner. Per-token usage is intentionally absent
 *  — it isn't carried on any rendered part (Task results / Codex `agentsStates`),
 *  so we surface the activity we *can* count instead. */
export interface SubagentSummary {
	key: string;
	color: string;
	agentType: string | null;
	/** Total tool-call parts inside the subagent's work (recursive). */
	toolUses: number;
	/** Top-level steps (parts) in the subagent's block. */
	steps: number;
	/** Tool calls that edited a file (Edit/Write/MultiEdit/apply_patch). */
	filesTouched: number;
	running: boolean;
}

function countStats(
	parts: readonly ExtendedMessagePart[],
	acc: { toolUses: number; filesTouched: number },
): void {
	for (const part of parts) {
		if (part.type === "collapsed-group") {
			countStats(part.tools, acc);
			continue;
		}
		if (!isToolCallPart(part)) continue;
		acc.toolUses += 1;
		if (FILE_EDIT_TOOLS.has(part.toolName)) acc.filesTouched += 1;
		if (part.children) countStats(part.children, acc);
	}
}

/**
 * Compute display stats for one subagent (for the filter banner). Returns null
 * when the key resolves to nothing in the current thread.
 */
export function summarizeSubagent(
	messages: readonly ThreadMessageLike[],
	key: string,
): SubagentSummary | null {
	const task = findClaudeTaskPart(messages, key);
	if (task) {
		const children = task.children ?? [];
		const acc = { toolUses: 0, filesTouched: 0 };
		countStats(children, acc);
		return {
			key,
			color: getSubagentIdentity(key, null).color,
			agentType: readString(task.args.subagent_type),
			toolUses: acc.toolUses,
			steps: children.length,
			filesTouched: acc.filesTouched,
			running: task.result == null && task.streamingStatus !== "error",
		};
	}

	const codexParts = findCodexParts(messages, key);
	if (codexParts.length > 0) {
		const acc = { toolUses: 0, filesTouched: 0 };
		countStats(codexParts, acc);
		// Latest sighting wins for role + status.
		let role: string | null = null;
		let running = false;
		for (const part of codexParts) {
			for (const state of readAgentsStates(part.args)) {
				if (state.threadId !== key) continue;
				role = readString(state.role) ?? role;
				running = isLiveAgentStatus(state.status);
			}
		}
		return {
			key,
			color: getSubagentIdentity(key, null).color,
			agentType: role,
			toolUses: acc.toolUses,
			steps: codexParts.length,
			filesTouched: acc.filesTouched,
			running,
		};
	}

	return null;
}

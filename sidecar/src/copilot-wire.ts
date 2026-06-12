// Pure mapping helpers for the Copilot provider: SDK session events →
// `copilot/*` wire events, `client.listModels()` → ProviderModelInfo[],
// permission-request presentation, and small input narrows. Kept separate
// from the manager so they stay unit-testable without a live client.

import type {
	ModelInfo,
	PermissionRequest,
	SessionConfigBase,
	SessionEvent,
} from "@github/copilot-sdk";
import type { ProviderModelInfo } from "./session-manager.js";

/** Not re-exported from the SDK's index — derive from the session config. */
export type ReasoningEffort = NonNullable<SessionConfigBase["reasoningEffort"]>;

export const REASONING_EFFORTS: readonly ReasoningEffort[] = [
	"low",
	"medium",
	"high",
	"xhigh",
];

/** SDK session event → `copilot/*` wire event, or null when unmapped.
 *  The shape is a fixed contract with the Rust accumulator — do not rename. */
export function mapCopilotEvent(
	event: SessionEvent,
): Record<string, unknown> | null {
	switch (event.type) {
		case "assistant.message_delta":
			return { type: "copilot/assistant_delta", text: event.data.deltaContent };
		case "assistant.message":
			return { type: "copilot/assistant_message", text: event.data.content };
		case "assistant.reasoning_delta":
			return { type: "copilot/reasoning_delta", text: event.data.deltaContent };
		case "assistant.reasoning":
			return { type: "copilot/reasoning_message", text: event.data.content };
		case "tool.execution_start":
			return {
				type: "copilot/tool_call_start",
				tool_call_id: event.data.toolCallId,
				tool_name: event.data.toolName,
				...(event.data.arguments !== undefined
					? { arguments: event.data.arguments }
					: {}),
			};
		case "tool.execution_complete": {
			const content =
				event.data.result?.detailedContent ?? event.data.result?.content;
			return {
				type: "copilot/tool_call_end",
				tool_call_id: event.data.toolCallId,
				success: event.data.success,
				...(content !== undefined ? { content } : {}),
				...(event.data.error ? { error: event.data.error.message } : {}),
			};
		}
		default:
			return null;
	}
}

/** Flatten `client.listModels()` to ProviderModelInfo[], sorted by label.
 *  Effort levels come from the model's own `supportedReasoningEfforts`,
 *  falling back to the SDK's full set when the capability flag is on. */
export function mapCopilotModels(
	models: readonly ModelInfo[],
): ProviderModelInfo[] {
	return models
		.map((model) => {
			const supportsEffort =
				model.capabilities?.supports?.reasoningEffort === true;
			const effortLevels = supportsEffort
				? (model.supportedReasoningEfforts ?? REASONING_EFFORTS)
				: [];
			return {
				id: model.id,
				label: model.name || model.id,
				cliModel: model.id,
				...(effortLevels.length > 0 ? { effortLevels: [...effortLevels] } : {}),
			};
		})
		.sort((a, b) => a.label.localeCompare(b.label));
}

/** UI-facing tool name + description for a permission request. The SDK's
 *  request is a `kind`-discriminated union; mcp/custom-tool carry a real
 *  tool name, shell carries the full command text. */
export function describePermissionRequest(request: PermissionRequest): {
	toolName: string;
	description: string | undefined;
} {
	const raw = request as unknown as Record<string, unknown>;
	const toolName =
		(request.kind === "mcp" || request.kind === "custom-tool") &&
		typeof raw.toolName === "string"
			? raw.toolName
			: request.kind;
	const description =
		typeof raw.fullCommandText === "string" && raw.fullCommandText
			? raw.fullCommandText
			: typeof raw.intention === "string" && raw.intention
				? raw.intention
				: undefined;
	return { toolName, description };
}

/** Narrow a raw effort string to the SDK's ReasoningEffort union. */
export function parseReasoningEffort(
	value: string | undefined,
): ReasoningEffort | undefined {
	return (REASONING_EFFORTS as readonly string[]).includes(value ?? "")
		? (value as ReasoningEffort)
		: undefined;
}

/** Structured composer image paths → SDK file attachments. */
export function buildImageAttachments(
	images: readonly string[],
): Array<{ type: "file"; path: string }> {
	return images.map((path) => ({ type: "file" as const, path }));
}

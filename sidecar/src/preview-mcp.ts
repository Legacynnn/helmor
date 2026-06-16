import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { callHost } from "./host-bridge.js";

type CallHost = (method: string, params: unknown) => Promise<unknown>;

/** Pure, testable forwarding layer: each verb → callHost("preview.<verb>", {workspaceId, ...}). */
export function buildPreviewToolCalls(workspaceId: string, call: CallHost) {
	const fwd = (verb: string, params: Record<string, unknown> = {}) =>
		call(`preview.${verb}`, { workspaceId, ...params });
	return {
		status: () => fwd("status"),
		open: (a: { target: string }) => fwd("open", a),
		navigate: (a: { url: string }) => fwd("navigate", a),
		snapshot: () => fwd("snapshot"),
		click: (a: { target: unknown }) => fwd("click", a),
		type: (a: { target: unknown; text: string }) => fwd("type", a),
		press: (a: { key: string }) => fwd("press", a),
		scroll: (a: { target?: unknown; dx: number; dy: number }) =>
			fwd("scroll", a),
		evaluate: (a: { script: string }) => fwd("evaluate", a),
		waitFor: (a: { condition: unknown; timeoutMs: number }) =>
			fwd("waitFor", a),
	};
}

const target = z.union([
	z.object({ by: z.literal("selector"), selector: z.string() }),
	z.object({ by: z.literal("role"), role: z.string(), name: z.string() }),
	z.object({ by: z.literal("coords"), x: z.number(), y: z.number() }),
]);

function ok(value: unknown) {
	return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

/** The in-process MCP server injected per Claude session. */
export function createPreviewMcpServer(workspaceId: string) {
	const c = buildPreviewToolCalls(workspaceId, callHost);
	return createSdkMcpServer({
		name: "helmor-preview",
		version: "1.0.0",
		tools: [
			tool(
				"preview_status",
				"Report whether a controllable preview surface exists.",
				{},
				async () => ok(await c.status()),
			),
			tool(
				"preview_open",
				"Open/show the preview surface and load a target.",
				{ target: z.string() },
				async (a) => ok(await c.open(a)),
			),
			tool(
				"preview_navigate",
				"Navigate the preview surface to a URL.",
				{ url: z.string() },
				async (a) => ok(await c.navigate(a)),
			),
			tool(
				"preview_snapshot",
				"Return title, URL, visible text, a11y tree, interactive elements, diagnostics, and a screenshot path.",
				{},
				async () => ok(await c.snapshot()),
			),
			tool(
				"preview_click",
				"Click an element by selector, role+name, or coords.",
				{ target },
				async (a) => ok(await c.click(a)),
			),
			tool(
				"preview_type",
				"Type text into a target element.",
				{ target, text: z.string() },
				async (a) => ok(await c.type(a)),
			),
			tool("preview_press", "Press a key.", { key: z.string() }, async (a) =>
				ok(await c.press(a)),
			),
			tool(
				"preview_scroll",
				"Scroll the viewport or a target.",
				{ target: target.optional(), dx: z.number(), dy: z.number() },
				async (a) => ok(await c.scroll(a)),
			),
			tool(
				"preview_evaluate",
				"Evaluate page JavaScript (browser surfaces only).",
				{ script: z.string() },
				async (a) => ok(await c.evaluate(a)),
			),
			tool(
				"preview_wait_for",
				"Wait for a selector/text/url/readiness.",
				{ condition: z.unknown(), timeoutMs: z.number() },
				async (a) =>
					ok(await c.waitFor(a as { condition: unknown; timeoutMs: number })),
			),
		],
	});
}

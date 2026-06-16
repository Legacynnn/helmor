import { describe, expect, test } from "bun:test";
import { buildPreviewToolCalls } from "../src/preview-mcp.js";

describe("preview tool host calls", () => {
	test("navigate forwards verb + workspaceId + url to callHost", async () => {
		const calls: Array<{ method: string; params: unknown }> = [];
		const fakeCallHost = async (method: string, params: unknown) => {
			calls.push({ method, params });
			return { ok: true };
		};
		const tools = buildPreviewToolCalls("ws-42", fakeCallHost);
		await tools.navigate({ url: "http://localhost:3000" });
		expect(calls).toEqual([
			{
				method: "preview.navigate",
				params: { workspaceId: "ws-42", url: "http://localhost:3000" },
			},
		]);
	});
});

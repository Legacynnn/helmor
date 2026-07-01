import { describe, expect, it } from "vitest";
import { conversationFooterModel } from "./conversation-footer";

describe("conversationFooterModel", () => {
	it("labels a streaming session as 'Streaming' regardless of stored status", () => {
		const m = conversationFooterModel({
			status: "idle",
			streaming: true,
			lastUserMessageAt: null,
			branch: "main",
		});
		expect(m.statusLabel).toBe("Streaming");
		expect(m.streaming).toBe(true);
	});
	it("labels a non-streaming session as 'Idle' when status is idle", () => {
		const m = conversationFooterModel({
			status: "idle",
			streaming: false,
			lastUserMessageAt: null,
			branch: null,
		});
		expect(m.statusLabel).toBe("Idle");
	});
	it("labels a working (non-idle) non-streaming session as 'Thinking'", () => {
		const m = conversationFooterModel({
			status: "running",
			streaming: false,
			lastUserMessageAt: null,
			branch: null,
		});
		expect(m.statusLabel).toBe("Thinking");
	});
	it("exposes a relative last-activity string when a timestamp exists", () => {
		const m = conversationFooterModel({
			status: "idle",
			streaming: false,
			lastUserMessageAt: new Date(Date.now() - 60_000).toISOString(),
			branch: "main",
		});
		expect(m.lastActivity).toMatch(/ago$/);
		expect(m.branch).toBe("main");
	});
});

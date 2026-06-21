import { describe, expect, it } from "bun:test";
import { createSidecarEmitter } from "./emitter";

describe("createSidecarEmitter", () => {
	describe("planCaptured", () => {
		it("emits planCaptured with plan content", () => {
			const events: object[] = [];
			const emitter = createSidecarEmitter((e) => events.push(e));

			emitter.planCaptured(
				"req-1",
				"tool-use-1",
				"1. Read files\n2. Edit code",
			);

			expect(events).toHaveLength(1);
			expect(events[0]).toEqual({
				id: "req-1",
				type: "planCaptured",
				toolUseId: "tool-use-1",
				plan: "1. Read files\n2. Edit code",
				planFilePath: null,
			});
		});

		it("emits planCaptured with null plan", () => {
			const events: object[] = [];
			const emitter = createSidecarEmitter((e) => events.push(e));

			emitter.planCaptured("req-2", "tool-use-2", null);

			expect(events).toHaveLength(1);
			expect(events[0]).toEqual({
				id: "req-2",
				type: "planCaptured",
				toolUseId: "tool-use-2",
				plan: null,
				planFilePath: null,
			});
		});

		it("threads the MDX plan file path through planCaptured", () => {
			const events: object[] = [];
			const emitter = createSidecarEmitter((e) => events.push(e));

			emitter.planCaptured(
				"req-3",
				"tool-use-3",
				"1. Author the plan",
				".helmor/plans/add-streaming.mdx",
			);

			expect(events).toHaveLength(1);
			expect(events[0]).toEqual({
				id: "req-3",
				type: "planCaptured",
				toolUseId: "tool-use-3",
				plan: "1. Author the plan",
				planFilePath: ".helmor/plans/add-streaming.mdx",
			});
		});
	});
});

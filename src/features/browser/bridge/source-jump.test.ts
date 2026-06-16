import { describe, expect, it, vi } from "vitest";
import { dispatchSourceJump } from "./source-jump";

describe("dispatchSourceJump", () => {
	it("opens the file at line/column when the ref resolves", () => {
		const openFileReference = vi.fn();
		const onUnresolved = vi.fn();
		dispatchSourceJump(
			{
				kind: "source-ref",
				ref: { path: "src/App.tsx", line: 12, column: 4 },
				selector: "#root",
			},
			{ openFileReference, onUnresolved },
		);
		expect(openFileReference).toHaveBeenCalledWith("src/App.tsx", 12, 4);
		expect(onUnresolved).not.toHaveBeenCalled();
	});

	it("degrades to selector-only when no ref", () => {
		const openFileReference = vi.fn();
		const onUnresolved = vi.fn();
		dispatchSourceJump(
			{ kind: "source-ref", ref: null, selector: "#root" },
			{ openFileReference, onUnresolved },
		);
		expect(openFileReference).not.toHaveBeenCalled();
		expect(onUnresolved).toHaveBeenCalledWith("#root");
	});
});

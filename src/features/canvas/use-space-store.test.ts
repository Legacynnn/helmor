import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSpaceStore } from "./use-space-store";

describe("useSpaceStore", () => {
	beforeEach(() => {
		localStorage.clear();
		useSpaceStore.setState({ activeSpace: "normal", lastSelected: {} });
	});

	it("defaults to normal", () => {
		expect(useSpaceStore.getState().activeSpace).toBe("normal");
	});

	it("switches space and persists it", () => {
		act(() => useSpaceStore.getState().setActiveSpace("canvas"));
		expect(useSpaceStore.getState().activeSpace).toBe("canvas");
		expect(localStorage.getItem("helmor.active_space")).toBe("canvas");
	});

	it("remembers last selected workspace per space independently", () => {
		act(() => useSpaceStore.getState().rememberSelection("normal", "wn"));
		act(() => useSpaceStore.getState().rememberSelection("canvas", "wc"));
		expect(useSpaceStore.getState().lastSelected).toEqual({
			normal: "wn",
			canvas: "wc",
		});
	});

	it("no-ops when setting the already-active space", () => {
		const before = useSpaceStore.getState();
		act(() => useSpaceStore.getState().setActiveSpace("normal"));
		expect(useSpaceStore.getState()).toBe(before);
	});
});

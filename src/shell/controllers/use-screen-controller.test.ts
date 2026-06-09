import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useScreenController } from "./use-screen-controller";

describe("useScreenController", () => {
	beforeEach(() => localStorage.clear());
	afterEach(() => localStorage.clear());

	it("defaults to 'none'", () => {
		const { result } = renderHook(() => useScreenController());
		expect(result.current.activeScreen).toBe("none");
	});

	it("sets and persists the active screen", () => {
		const { result } = renderHook(() => useScreenController());
		act(() => result.current.screenActions.setActiveScreen("dashboard"));
		expect(result.current.activeScreen).toBe("dashboard");
		expect(localStorage.getItem("helmor.activeScreen")).toBe("dashboard");
	});

	it("rehydrates a persisted screen on mount", () => {
		localStorage.setItem("helmor.activeScreen", "tasks");
		const { result } = renderHook(() => useScreenController());
		expect(result.current.activeScreen).toBe("tasks");
	});

	it("ignores an invalid persisted value", () => {
		localStorage.setItem("helmor.activeScreen", "bogus");
		const { result } = renderHook(() => useScreenController());
		expect(result.current.activeScreen).toBe("none");
	});

	it("openWorkspaceView resets to 'none'", () => {
		const { result } = renderHook(() => useScreenController());
		act(() => result.current.screenActions.setActiveScreen("history"));
		act(() => result.current.screenActions.openWorkspaceView());
		expect(result.current.activeScreen).toBe("none");
	});
});

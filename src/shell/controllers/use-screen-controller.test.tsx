import { QueryClient } from "@tanstack/react-query";
import { RouterContextProvider, RouterProvider } from "@tanstack/react-router";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { router } from "@/router/index";
import { useScreenController } from "./use-screen-controller";

// The screen controller is now backed by the router's `?screen` search param
// (see `use-screen-controller.ts`). The hook reads the router through context,
// so the harness mounts a real `<RouterProvider>` sibling (commits location
// synchronously) plus a bare `<RouterContextProvider>` around `children`, the
// same pattern `use-selection-controller.test.tsx` uses.
function routerWrapper({ children }: { children: ReactNode }) {
	return (
		<>
			<RouterProvider
				router={router}
				context={{
					queryClient: new QueryClient(),
					onOpenSettings: () => {},
					appShell: () => null,
				}}
			/>
			<RouterContextProvider router={router}>{children}</RouterContextProvider>
		</>
	);
}

// Reset the router to the boot index between tests so each starts from a clean
// "no screen" location.
async function resetRouter() {
	await router.navigate({
		to: "/",
		search: { screen: undefined },
		replace: true,
	});
}

describe("useScreenController", () => {
	beforeEach(async () => {
		await resetRouter();
	});
	afterEach(async () => {
		await resetRouter();
	});

	it("defaults to 'none'", () => {
		const { result } = renderHook(() => useScreenController(), {
			wrapper: routerWrapper,
		});
		expect(result.current.activeScreen).toBe("none");
	});

	it("sets the active screen via the router param", async () => {
		const { result } = renderHook(() => useScreenController(), {
			wrapper: routerWrapper,
		});
		act(() => result.current.screenActions.setActiveScreen("dashboard"));
		await waitFor(() => expect(result.current.activeScreen).toBe("dashboard"));
		expect((router.state.location.search as { screen?: string }).screen).toBe(
			"dashboard",
		);
	});

	it("reads a screen already present in the location on mount", async () => {
		await router.navigate({
			to: "/",
			search: { screen: "tasks" },
			replace: true,
		});
		const { result } = renderHook(() => useScreenController(), {
			wrapper: routerWrapper,
		});
		await waitFor(() => expect(result.current.activeScreen).toBe("tasks"));
	});

	it("ignores an invalid screen value", async () => {
		await router.navigate({
			to: "/",
			// biome-ignore lint/suspicious/noExplicitAny: testing invalid input
			search: { screen: "bogus" as any },
			replace: true,
		});
		const { result } = renderHook(() => useScreenController(), {
			wrapper: routerWrapper,
		});
		expect(result.current.activeScreen).toBe("none");
	});

	it("openWorkspaceView resets to 'none'", async () => {
		const { result } = renderHook(() => useScreenController(), {
			wrapper: routerWrapper,
		});
		act(() => result.current.screenActions.setActiveScreen("history"));
		await waitFor(() => expect(result.current.activeScreen).toBe("history"));
		act(() => result.current.screenActions.openWorkspaceView());
		await waitFor(() => expect(result.current.activeScreen).toBe("none"));
	});
});

// Top-level SCREEN controller (Dashboard / Tasks / History).
//
// Re-homed onto TanStack Router after the navigation merge: the active screen
// now lives in the router's `?screen` search param instead of the fork's
// original `useState` + `localStorage` store. The PUBLIC SHAPE is unchanged
// (`ActiveScreen` with its sentinel "none", `ScreenActions`, `ScreenController`)
// so every consumer — `app-shell.tsx`, `app-shell-layout.tsx`,
// `shell-sidebar-pane.tsx`, `screen-host.tsx`, and the Dashboard container —
// keeps working verbatim. Only the storage backing changed: "none" maps to "no
// `?screen` param", and the three real screens map to the param value.

import { useCallback, useMemo } from "react";
import type { ScreenParam } from "@/router/index";
import {
	setRouterActiveScreen,
	useRouterActiveScreen,
} from "@/router/use-router-screen";

export type ActiveScreen = "none" | ScreenParam;

export type ScreenActions = {
	setActiveScreen(screen: ActiveScreen): void;
	openWorkspaceView(): void;
};

export type ScreenController = {
	activeScreen: ActiveScreen;
	screenActions: ScreenActions;
};

export function useScreenController(): ScreenController {
	// `null` (no `?screen` param) is the "no top-level screen" state, surfaced to
	// consumers as the legacy "none" sentinel.
	const routerScreen = useRouterActiveScreen();
	const activeScreen: ActiveScreen = routerScreen ?? "none";

	const setActiveScreen = useCallback((screen: ActiveScreen) => {
		// "none" clears the param (drops back to the conversation/start surface);
		// any real screen writes it.
		setRouterActiveScreen(screen === "none" ? null : screen);
	}, []);

	const openWorkspaceView = useCallback(() => setRouterActiveScreen(null), []);

	const screenActions = useMemo<ScreenActions>(
		() => ({ setActiveScreen, openWorkspaceView }),
		[setActiveScreen, openWorkspaceView],
	);

	return { activeScreen, screenActions };
}

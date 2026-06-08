import { useCallback, useMemo, useState } from "react";

export type ActiveScreen = "none" | "dashboard" | "tasks" | "history";

const STORAGE_KEY = "helmor.activeScreen";
const VALID: readonly ActiveScreen[] = [
	"none",
	"dashboard",
	"tasks",
	"history",
];

function readStored(): ActiveScreen {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return VALID.includes(raw as ActiveScreen) ? (raw as ActiveScreen) : "none";
	} catch {
		return "none";
	}
}

export type ScreenActions = {
	setActiveScreen(screen: ActiveScreen): void;
	openWorkspaceView(): void;
};

export type ScreenController = {
	activeScreen: ActiveScreen;
	screenActions: ScreenActions;
};

export function useScreenController(): ScreenController {
	const [activeScreen, setActiveScreenState] =
		useState<ActiveScreen>(readStored);

	const setActiveScreen = useCallback((screen: ActiveScreen) => {
		setActiveScreenState(screen);
		try {
			localStorage.setItem(STORAGE_KEY, screen);
		} catch {
			// ignore persistence failures (private mode, etc.)
		}
	}, []);

	const openWorkspaceView = useCallback(
		() => setActiveScreen("none"),
		[setActiveScreen],
	);

	const screenActions = useMemo<ScreenActions>(
		() => ({ setActiveScreen, openWorkspaceView }),
		[setActiveScreen, openWorkspaceView],
	);

	return { activeScreen, screenActions };
}

// Router-backed top-level SCREEN state (Dashboard / Tasks / History).
//
// The fork shipped a custom `useScreenController` state machine (a `useState` +
// `localStorage`) to drive its top-level screens. After adopting upstream's
// TanStack Router, that screen state is re-homed onto the router's `?screen`
// search param (declared on the root route in `./index`, preserved across
// workspace navigations via `retainSearchParams`). This keeps the screen UI
// components (`ScreenHost`, the Dashboard kanban, Tasks, History views)
// untouched — only their navigation wiring moves from the bespoke store to the
// router, so the screen survives selection changes / reloads through the same
// URL the rest of navigation already lives in.

import { useRouterState } from "@tanstack/react-router";
import { router, type ScreenParam } from "./index";

const VALID_SCREENS: readonly ScreenParam[] = ["dashboard", "tasks", "history"];

// Read the active screen param off the router location. Returns `null` when no
// screen is active (the conversation / start surface should show instead). The
// route validator normally drops a bogus value, but a programmatic
// `navigate({ search })` can inject one unchecked, so we guard here too.
export function useRouterActiveScreen(): ScreenParam | null {
	return useRouterState({
		select: (state) => {
			const screen = (state.location.search as { screen?: unknown }).screen;
			return VALID_SCREENS.includes(screen as ScreenParam)
				? (screen as ScreenParam)
				: null;
		},
	});
}

// Imperatively set (or clear, with `null`) the active screen, preserving every
// other search param. Always `replace` — Helmor has no back/forward affordance
// and the memory history stack should not grow (matches the selection mirror).
export function setRouterActiveScreen(screen: ScreenParam | null): void {
	void router.navigate({
		to: ".",
		search: (prev: Record<string, unknown>) => ({
			...prev,
			screen: screen ?? undefined,
		}),
		replace: true,
	});
}

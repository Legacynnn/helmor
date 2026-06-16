import type { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRouteWithContext,
	createRoute,
	createRouter,
	retainSearchParams,
	stripSearchParams,
	useRouteContext,
} from "@tanstack/react-router";
import { type ComponentType, useMemo } from "react";
import type { SettingsSection } from "@/features/settings";

// Memory history: Helmor has no address bar and `window.location.hash` is owned
// by companion pairing (see `src/lib/ipc.ts`). Created at MODULE SCOPE so the
// StrictMode double-mount in `main.tsx` cannot spawn two histories.
const memoryHistory = createMemoryHistory({ initialEntries: ["/"] });

// Matches the `onOpenSettings` prop the AppShell already receives.
type OpenSettingsFn = (
	workspaceId: string | null,
	workspaceRepoId: string | null,
	initialSection?: SettingsSection,
) => void;

// Runtime values injected at render via `<RouterProvider context={...} />`
// (Pattern B). Threading `appShell` through context keeps App.tsx and its
// AppShell-injection seam untouched.
interface RouterContext {
	queryClient: QueryClient;
	onOpenSettings: OpenSettingsFn;
	appShell: ComponentType<{ onOpenSettings: OpenSettingsFn }>;
}

// The `?view` search param encodes conversation-vs-editor on the workspace
// routes. It is the URL representation of the non-"start" half of
// `ShellViewMode` ("conversation" | "editor"). Default is "conversation".
export type WorkspaceViewParam = "conversation" | "editor" | "browser";

export type WorkspaceSearch = {
	view: WorkspaceViewParam;
};

// The `?screen` search param drives the fork's top-level SCREEN host
// (Dashboard / Tasks / History). It is ORTHOGONAL to the workspace/start
// navigation — a screen can overlay any path — so it lives on the ROOT route's
// search and is preserved across workspace navigations via `retainSearchParams`
// below. Absence means "no screen" (the conversation/start surface shows).
export type ScreenParam = "dashboard" | "tasks" | "history";

const VALID_SCREENS: readonly ScreenParam[] = ["dashboard", "tasks", "history"];

export type RootSearch = {
	screen?: ScreenParam;
};

// Hand-written validator (no zod). Any value that is not a known screen drops
// the param entirely (so a bogus `?screen=garbage` collapses to "no screen"
// rather than throwing or white-screening).
function validateRootSearch(search: Record<string, unknown>): RootSearch {
	return VALID_SCREENS.includes(search.screen as ScreenParam)
		? { screen: search.screen as ScreenParam }
		: {};
}

// Hand-written validator (the frontend has NO zod dependency — do not add one).
// Anything other than "editor" collapses to the "conversation" default, so a
// bogus `?view=garbage` can never throw or white-screen. This doubles as the
// `.catch`-style fallback: it returns a valid value for every input rather than
// throwing, so no error boundary is needed.
function validateWorkspaceSearch(
	search: Record<string, unknown>,
): WorkspaceSearch & RootSearch {
	return {
		view:
			search.view === "editor" || search.view === "browser"
				? (search.view as WorkspaceViewParam)
				: "conversation",
		// Carry the root-level `screen` param through so the workspace routes
		// don't strip an active top-level screen out of the location.
		...validateRootSearch(search),
	};
}

// Keep the default ("conversation") OUT of the URL so round-trips stay clean
// and stable. After this middleware runs, navigating to conversation leaves
// `router.state.location.search` as `{}` (no `view` key); only `view: "editor"`
// survives into the location. The mirror's equality gate accounts for this by
// treating "absent view" and "view: conversation" as the same thing.
const stripDefaultView = stripSearchParams<WorkspaceSearch>({
	view: "conversation",
});

const rootRoute = createRootRouteWithContext<RouterContext>()({
	component: RootShell,
	// The `screen` param lives on the root so it is inherited by every child
	// route and can overlay any surface (start, conversation, editor).
	validateSearch: validateRootSearch,
	// Preserve `screen` across child navigations: selecting a workspace or
	// switching sessions must NOT silently drop an active top-level screen
	// unless the caller explicitly clears it (`screen: undefined`).
	search: { middlewares: [retainSearchParams(["screen"])] },
});

function RootShell() {
	const { appShell: AppShell, onOpenSettings } = useRouteContext({
		from: "__root__",
	});
	// PERF: memoize the shell element so router LOCATION changes (the Stage 1
	// store→router mirror navigates on every selection change) do NOT re-render
	// AppShell. RootShell re-runs on navigation, but the memoized element keeps a
	// stable identity unless `AppShell`/`onOpenSettings` (route-context values)
	// change — so AppShell re-renders only from its OWN hooks, exactly as before
	// the router existed. The child routes below render no UI; rendering stays
	// 100% store-driven through this single element.
	const el = useMemo(
		() => <AppShell onOpenSettings={onOpenSettings} />,
		[AppShell, onOpenSettings],
	);
	return el;
}

// The root keeps rendering today's full shell (above); these child routes exist
// ONLY as typed navigation targets so the store→router mirror can call
// `router.navigate({ to })` validly. They render NOTHING (`() => null`) — there
// is deliberately no `<Outlet/>` in AppShell, so the route tree never paints app
// content. Rendering remains entirely store-driven.
//
// `/` is the transient pre-auto-select BOOT index only. The Start surface has
// its own DISTINCT route, `/start`, so the mirror can tell "viewMode === start"
// apart from "conversation with no workspace yet" (both used to collapse to
// `/`, conflating the two — the bug this stage fixes).
const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: () => null,
});

const startRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/start",
	component: () => null,
});

const workspaceRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/w/$workspaceId",
	component: () => null,
	validateSearch: validateWorkspaceSearch,
	search: { middlewares: [stripDefaultView, retainSearchParams(["screen"])] },
});

const workspaceSessionRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/w/$workspaceId/s/$sessionId",
	component: () => null,
	validateSearch: validateWorkspaceSearch,
	search: { middlewares: [stripDefaultView, retainSearchParams(["screen"])] },
});

const routeTree = rootRoute.addChildren([
	indexRoute,
	startRoute,
	workspaceRoute,
	workspaceSessionRoute,
]);

export const router = createRouter({
	routeTree,
	history: memoryHistory,
	// Placeholder context; the real values are injected at render via
	// `<RouterProvider context={...} />`.
	context: {
		queryClient: undefined!,
		onOpenSettings: undefined!,
		appShell: undefined!,
	},
	defaultPreload: false,
	defaultPreloadStaleTime: 0,
	defaultStructuralSharing: true,
	defaultPendingMs: 1000,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

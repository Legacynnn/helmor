import { describe, expect, it } from "vitest";
import {
	locationToSelection,
	locationToViewInfo,
	selectionToLocation,
} from "./location-mapping";

// The plan called for `viewModeFromSearch` / `searchFromViewMode` helpers, but
// the real encode/decode of the `?view` param lives in `location-mapping.ts`
// via `selectionToLocation` (encode) and `locationToSelection` (decode). This
// test pins the `browser` view-mode round-trip through those real helpers.
describe("browser view-mode routing", () => {
	it("encodes browser + workspace as ?view=browser", () => {
		const location = selectionToLocation({
			viewMode: "browser",
			workspaceId: "ws",
			sessionId: null,
		});
		expect(location).toEqual({
			to: "/w/$workspaceId",
			params: { workspaceId: "ws" },
			search: { view: "browser" },
		});
	});

	it("decodes ?view=browser on a workspace path back to browser", () => {
		expect(
			locationToSelection({
				pathname: "/w/ws",
				search: { view: "browser" },
			}),
		).toEqual({ workspaceId: "ws", sessionId: null, viewMode: "browser" });
	});

	it("reports isBrowser from a browser location", () => {
		expect(
			locationToViewInfo({ pathname: "/w/ws", search: { view: "browser" } }),
		).toEqual({ isStart: false, isEditor: false, isBrowser: true });
	});

	it("keeps editor and conversation behavior identical", () => {
		expect(
			locationToSelection({ pathname: "/w/ws", search: { view: "editor" } }),
		).toEqual({ workspaceId: "ws", sessionId: null, viewMode: "editor" });
		expect(locationToSelection({ pathname: "/w/ws", search: {} })).toEqual({
			workspaceId: "ws",
			sessionId: null,
			viewMode: "conversation",
		});
	});
});

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { workspaceSessionsQueryOptions } from "@/lib/query-client";
import type { CanvasActions } from "./canvas-actions-context";
import {
	PANEL_DEFAULT_HEIGHT,
	PANEL_DEFAULT_WIDTH,
	type PanelNode,
} from "./types";

const GAP = 40;
const COLS = 3;

/** On first entry to an EMPTY canvas, transcribe the workspace's existing
 * (visible, GUI) sessions onto it as conversation panels laid out in a grid —
 * so opening canvas mode reflects the conversations you already have. Once the
 * canvas has any panels, the user's layout is respected and this does nothing.
 */
export function useSessionImport(
	workspaceId: string,
	hadPanelsOnEntry: boolean,
	nodes: PanelNode[],
	addPanel: CanvasActions["addPanel"],
) {
	const { data: sessions } = useQuery({
		...workspaceSessionsQueryOptions(workspaceId),
		enabled: !hadPanelsOnEntry,
	});
	const done = useRef(false);

	useEffect(() => {
		if (done.current || hadPanelsOnEntry) return;
		// Only seed a truly empty canvas, and only once sessions have loaded.
		if (nodes.length > 0 || !sessions) return;
		const importable = sessions.filter(
			(s) => !s.isHidden && (s.sessionKind ?? "gui") === "gui",
		);
		if (importable.length === 0) return;
		done.current = true;

		importable.forEach((session, i) => {
			const col = i % COLS;
			const row = Math.floor(i / COLS);
			void addPanel("conversation", {
				config: { sessionId: session.id },
				position: {
					x: col * (PANEL_DEFAULT_WIDTH + GAP),
					y: row * (PANEL_DEFAULT_HEIGHT + GAP),
				},
			});
		});
	}, [sessions, nodes.length, hadPanelsOnEntry, addPanel]);
}

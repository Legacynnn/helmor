import { useReactFlow } from "@xyflow/react";
import { useMemo, useRef } from "react";
import type { ShortcutId } from "@/features/shortcuts/types";
import {
	type ShortcutHandler,
	useAppShortcuts,
} from "@/features/shortcuts/use-app-shortcuts";
import { useSettings } from "@/lib/settings";
import { parsePanelConfig } from "../panel-config";
import type { PanelNode } from "../types";
import { focusPanel } from "./focus-panel";
import { BINDING_DIGITS, resolvePanelBindings } from "./panel-bindings";
import { usePanelsListStore } from "./panels-list-store";

/** Wire the canvas's ⌘1–⌘9 (focus panel N) and ⌘/ (toggle panels list)
 * shortcuts. Active only while the `canvas` focus scope is engaged (the
 * surface sets `data-focus-scope="canvas"`), so these never double-fire with
 * the chat's session shortcuts. Digits resolve from live nodes on every press,
 * so the handler identities stay stable as panels are added/removed. */
export function usePanelBindingShortcuts(nodes: PanelNode[]): void {
	const rf = useReactFlow();
	const { settings } = useSettings();

	// Read the latest nodes inside the (stable) callbacks via a ref so the
	// handler array doesn't churn every time a panel moves or is created.
	const nodesRef = useRef(nodes);
	nodesRef.current = nodes;

	const handlers = useMemo<ShortcutHandler[]>(() => {
		const focusByDigit = (digit: number) => {
			const bindings = resolvePanelBindings(
				nodesRef.current.map((n) => ({
					id: n.id,
					binding: parsePanelConfig(n.data.config).binding,
				})),
			);
			for (const [id, effective] of bindings) {
				if (effective === digit) {
					focusPanel(rf, id);
					return;
				}
			}
		};

		const digitHandlers: ShortcutHandler[] = BINDING_DIGITS.map((digit) => ({
			id: `canvas.panel${digit}` as ShortcutId,
			callback: () => focusByDigit(digit),
		}));

		return [
			...digitHandlers,
			{
				id: "canvas.panelList",
				callback: () => usePanelsListStore.getState().toggle(),
			},
		];
	}, [rf]);

	useAppShortcuts({ overrides: settings.shortcuts, handlers });
}

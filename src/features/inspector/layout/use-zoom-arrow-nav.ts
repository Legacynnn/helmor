// Capture-phase Left/Right tab navigation, active only while the inspector
// tabs panel is keyboard-zoomed. Intercepts the arrows BEFORE xterm sees them
// so the user can flip between terminal tabs from the expanded view. Plain
// arrows (no modifiers) only — so the existing Mod+Alt+Arrow prev/next
// shortcuts pass through untouched, and arrows reach the shell normally when
// the panel isn't keyboard-zoomed.
import { useEffect } from "react";

export function useZoomArrowNav({
	active,
	onNavigate,
}: {
	active: boolean;
	onNavigate: (offset: -1 | 1) => void;
}): void {
	useEffect(() => {
		if (!active) return;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
				return;
			}
			if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
			event.preventDefault();
			event.stopPropagation();
			onNavigate(event.key === "ArrowLeft" ? -1 : 1);
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [active, onNavigate]);
}

/**
 * Shared motion language for the task view: crisp, quiet, ease-out. No spring,
 * no bounce (matches the project's motion convention). Every consumer gates
 * these behind `useReducedMotion()` so motion-sensitive users get instant,
 * travel-free state changes.
 */
import type { Transition } from "motion/react";

/** ease-out-quart — quick attack, gentle settle. The task view default. */
export const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;
/** ease-out-expo — longer, more luxurious settle for larger surfaces. */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/** Card enter/exit + reflow on the kanban board. */
export const cardTransition: Transition = {
	duration: 0.2,
	ease: EASE_OUT_QUART,
};
export const cardLayoutTransition: Transition = {
	duration: 0.26,
	ease: EASE_OUT_QUART,
};

/** Staggered content reveal inside the detail drawer. */
export const drawerItemTransition: Transition = {
	duration: 0.34,
	ease: EASE_OUT_EXPO,
};

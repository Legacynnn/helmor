// Pure, framework-agnostic screenshot poller for the simulator surface.
//
// The simulator has no embeddable native surface, so its preview is driven by
// polling `simulatorScreenshot()` on an interval (Phase 4). That poll is the
// heaviest recurring cost of the surface, so the poller MUST be cleanly
// stoppable: `stop()` clears the interval and the host calls it whenever the
// surface is hidden or unmounted (PRD §6 — polling pauses when hidden/closed).
//
// Extracted as a pure factory (no React) so the start/stop/idempotence/
// drop-overlapping-tick contract is unit-testable with fake timers.

export type ScreenshotPoller = {
	start(): void;
	stop(): void;
	isRunning(): boolean;
};

export function createScreenshotPoller(opts: {
	intervalMs: number;
	capture: () => Promise<void>;
}): ScreenshotPoller {
	let timer: ReturnType<typeof setInterval> | null = null;
	let inFlight = false;

	const tick = () => {
		// Drop overlapping ticks so a slow `screencap` never queues up work and
		// janks the main thread.
		if (inFlight) return;
		inFlight = true;
		void opts
			.capture()
			.catch(() => undefined)
			.finally(() => {
				inFlight = false;
			});
	};

	return {
		start() {
			if (timer !== null) return; // idempotent
			timer = setInterval(tick, opts.intervalMs);
		},
		stop() {
			if (timer !== null) {
				clearInterval(timer);
				timer = null;
			}
		},
		isRunning() {
			return timer !== null;
		},
	};
}

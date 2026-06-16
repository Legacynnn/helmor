import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createScreenshotPoller } from "./screenshot-poller";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createScreenshotPoller", () => {
	it("does not capture before start()", () => {
		const capture = vi.fn().mockResolvedValue(undefined);
		createScreenshotPoller({ intervalMs: 500, capture });
		vi.advanceTimersByTime(2000);
		expect(capture).not.toHaveBeenCalled();
	});

	it("captures on the interval after start()", async () => {
		const capture = vi.fn().mockResolvedValue(undefined);
		const poller = createScreenshotPoller({ intervalMs: 500, capture });
		poller.start();
		// Async advance so the in-flight capture promise settles between ticks
		// (the drop-overlapping-tick guard reads `inFlight`, cleared on a
		// microtask). With sync `advanceTimersByTime` the microtask never flushes
		// and every tick after the first would be (correctly) dropped.
		await vi.advanceTimersByTimeAsync(1100);
		expect(capture.mock.calls.length).toBeGreaterThanOrEqual(2);
	});

	it("stop() clears the interval — zero captures after stop", () => {
		const capture = vi.fn().mockResolvedValue(undefined);
		const poller = createScreenshotPoller({ intervalMs: 500, capture });
		poller.start();
		vi.advanceTimersByTime(600);
		const countAtStop = capture.mock.calls.length;
		poller.stop();
		vi.advanceTimersByTime(5000);
		expect(capture.mock.calls.length).toBe(countAtStop);
	});

	it("start() is idempotent — no double interval", () => {
		const capture = vi.fn().mockResolvedValue(undefined);
		const poller = createScreenshotPoller({ intervalMs: 500, capture });
		poller.start();
		poller.start();
		vi.advanceTimersByTime(1100);
		// Two ticks worth, not four — only one interval is live.
		expect(capture.mock.calls.length).toBeLessThanOrEqual(2);
	});

	it("isRunning() reflects start/stop", () => {
		const capture = vi.fn().mockResolvedValue(undefined);
		const poller = createScreenshotPoller({ intervalMs: 500, capture });
		expect(poller.isRunning()).toBe(false);
		poller.start();
		expect(poller.isRunning()).toBe(true);
		poller.stop();
		expect(poller.isRunning()).toBe(false);
	});
});

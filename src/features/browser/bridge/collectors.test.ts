import { describe, expect, it, vi } from "vitest";
import { createConsoleCollector, createNetworkCollector } from "./collectors";

describe("createConsoleCollector", () => {
	it("buffers console.error and console.warn after start()", () => {
		const fake = {
			error: vi.fn(),
			warn: vi.fn(),
		} as unknown as Console;
		const collector = createConsoleCollector(fake);
		collector.start();
		fake.error("boom", 42);
		fake.warn("careful");
		const buffer = collector.stop();
		expect(buffer).toHaveLength(2);
		expect(buffer[0]!.level).toBe("error");
		expect(buffer[0]!.message).toContain("boom");
		expect(buffer[0]!.message).toContain("42");
		expect(buffer[1]!.level).toBe("warn");
		expect(typeof buffer[0]!.ts).toBe("number");
	});

	it("restores the original methods on stop()", () => {
		const origError = vi.fn();
		const fake = { error: origError, warn: vi.fn() } as unknown as Console;
		const collector = createConsoleCollector(fake);
		collector.start();
		expect(fake.error).not.toBe(origError);
		collector.stop();
		expect(fake.error).toBe(origError);
	});

	it("buffers nothing before start()", () => {
		const fake = { error: vi.fn(), warn: vi.fn() } as unknown as Console;
		const collector = createConsoleCollector(fake);
		fake.error("ignored");
		expect(collector.stop()).toHaveLength(0);
	});
});

describe("createNetworkCollector", () => {
	it("records a successful fetch", async () => {
		const fakeFetch = vi.fn(async () => new Response("ok", { status: 200 }));
		const host = { fetch: fakeFetch } as unknown as {
			fetch: typeof fetch;
		};
		const collector = createNetworkCollector(host);
		collector.start();
		await host.fetch("/api/data", { method: "GET" });
		const buffer = collector.stop();
		expect(buffer).toHaveLength(1);
		expect(buffer[0]!.url).toBe("/api/data");
		expect(buffer[0]!.method).toBe("GET");
		expect(buffer[0]!.status).toBe(200);
		expect(buffer[0]!.failed).toBe(false);
		expect(buffer[0]!.durationMs).toBeGreaterThanOrEqual(0);
	});

	it("records a failed fetch (rejection)", async () => {
		const fakeFetch = vi.fn(async () => {
			throw new Error("network down");
		});
		const host = { fetch: fakeFetch } as unknown as {
			fetch: typeof fetch;
		};
		const collector = createNetworkCollector(host);
		collector.start();
		await expect(host.fetch("/api/down")).rejects.toThrow("network down");
		const buffer = collector.stop();
		expect(buffer).toHaveLength(1);
		expect(buffer[0]!.failed).toBe(true);
		expect(buffer[0]!.status).toBeNull();
	});

	it("marks a 4xx/5xx response as failed", async () => {
		const fakeFetch = vi.fn(async () => new Response("nope", { status: 500 }));
		const host = { fetch: fakeFetch } as unknown as {
			fetch: typeof fetch;
		};
		const collector = createNetworkCollector(host);
		collector.start();
		await host.fetch("/api/boom");
		const buffer = collector.stop();
		expect(buffer[0]!.failed).toBe(true);
		expect(buffer[0]!.status).toBe(500);
	});

	it("restores the original fetch on stop()", () => {
		const orig = vi.fn();
		const host = { fetch: orig } as unknown as { fetch: typeof fetch };
		const collector = createNetworkCollector(host);
		collector.start();
		expect(host.fetch).not.toBe(orig);
		collector.stop();
		expect(host.fetch).toBe(orig);
	});
});

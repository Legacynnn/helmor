/**
 * Console + network collectors for the inspector bridge.
 *
 * Each collector wraps host APIs (`console.error/warn`, `fetch`) when
 * `start()`ed, buffers noteworthy events, and on `stop()` restores the
 * originals and returns the buffer. The host object (`console`, an object with
 * `fetch`) is INJECTED so tests can pass fakes — nothing is patched at import
 * time, keeping this module free of global side effects.
 */

import type { ConsoleEntry, NetworkEntry } from "./channel";

// ── console collector ──────────────────────────────────────────────────────

type ConsoleLevel = "error" | "warn";
const CONSOLE_LEVELS: ConsoleLevel[] = ["error", "warn"];

export type ConsoleCollector = {
	start(): void;
	stop(): ConsoleEntry[];
};

export function createConsoleCollector(
	host: Console = console,
): ConsoleCollector {
	let buffer: ConsoleEntry[] = [];
	const originals = new Map<ConsoleLevel, Console[ConsoleLevel]>();

	function start(): void {
		for (const level of CONSOLE_LEVELS) {
			const original = host[level];
			originals.set(level, original);
			host[level] = (...args: unknown[]) => {
				buffer.push({
					level,
					message: args.map((a) => stringifyArg(a)).join(" "),
					ts: Date.now(),
				});
				original.apply(host, args);
			};
		}
	}

	function stop(): ConsoleEntry[] {
		for (const level of CONSOLE_LEVELS) {
			const original = originals.get(level);
			if (original) host[level] = original;
		}
		originals.clear();
		const drained = buffer;
		buffer = [];
		return drained;
	}

	return { start, stop };
}

function stringifyArg(arg: unknown): string {
	if (typeof arg === "string") return arg;
	if (arg instanceof Error) return arg.message;
	try {
		return JSON.stringify(arg) ?? String(arg);
	} catch {
		return String(arg);
	}
}

// ── network collector ──────────────────────────────────────────────────────

/** Minimal shape the collector needs from the host (the page's window). */
export type FetchHost = { fetch: typeof fetch };

export type NetworkCollector = {
	start(): void;
	stop(): NetworkEntry[];
};

function urlOf(input: RequestInfo | URL): string {
	if (typeof input === "string") return input;
	if (input instanceof URL) return input.toString();
	return (input as Request).url ?? String(input);
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
	if (init?.method) return init.method;
	if (typeof input !== "string" && !(input instanceof URL)) {
		return (input as Request).method ?? "GET";
	}
	return "GET";
}

export function createNetworkCollector(host: FetchHost): NetworkCollector {
	let buffer: NetworkEntry[] = [];
	let original: typeof fetch | null = null;

	function start(): void {
		original = host.fetch;
		const orig = original;
		host.fetch = async (
			input: RequestInfo | URL,
			init?: RequestInit,
		): Promise<Response> => {
			const url = urlOf(input);
			const method = methodOf(input, init);
			const startedAt = Date.now();
			try {
				const res = await orig.call(host, input, init);
				buffer.push({
					url,
					method,
					status: res.status,
					durationMs: Date.now() - startedAt,
					failed: res.status >= 400,
				});
				return res;
			} catch (error) {
				buffer.push({
					url,
					method,
					status: null,
					durationMs: Date.now() - startedAt,
					failed: true,
				});
				throw error;
			}
		};
	}

	function stop(): NetworkEntry[] {
		if (original) host.fetch = original;
		original = null;
		const drained = buffer;
		buffer = [];
		return drained;
	}

	return { start, stop };
}

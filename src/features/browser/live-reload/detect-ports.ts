/**
 * Pure localhost dev-server port extraction.
 *
 * Scans a run-action command (from `RepoScripts.run_actions[].command`) for
 * localhost ports so the surface can decide which loaded URLs are "the dev
 * server" and worth live-reload watching. No I/O — unit-tested DOM-free.
 */

/** Common dev ports recognized as bare `-p 3000` / `PORT=5173` style. */
const COMMON_DEV_PORTS = new Set([3000, 4200, 5173, 8000, 8080]);

const HOST_PORT_RE = /(?:localhost|127\.0\.0\.1):(\d{2,5})/g;
const BARE_PORT_RE = /(?<![:.\d])(\d{2,5})(?![.\d])/g;

/** Extract a deduped, ordered list of localhost ports from `command`. */
export function extractLocalhostPorts(command: string): number[] {
	const ports: number[] = [];
	const seen = new Set<number>();
	const push = (n: number) => {
		if (!seen.has(n)) {
			seen.add(n);
			ports.push(n);
		}
	};

	for (const m of command.matchAll(HOST_PORT_RE)) {
		push(Number.parseInt(m[1], 10));
	}
	for (const m of command.matchAll(BARE_PORT_RE)) {
		const n = Number.parseInt(m[1], 10);
		if (COMMON_DEV_PORTS.has(n)) push(n);
	}
	return ports;
}

/** True when `url` points at localhost on one of `ports`. */
export function isDevServerUrl(url: string, ports: number[]): boolean {
	try {
		const u = new URL(url);
		if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return false;
		const port = Number.parseInt(u.port, 10);
		return ports.includes(port);
	} catch {
		return false;
	}
}

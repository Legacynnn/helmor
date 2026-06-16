// Pure URL normalization for the browser surface. Users type bare hosts like
// `localhost:3000` or `example.com`; the embedded webview (and Rust's
// `url.parse()`) needs a fully-qualified URL with a scheme. This module picks a
// sensible scheme so pages actually load without the user typing `http://` or
// `https://` explicitly.
//
// No React, no IPC — pure string math, fully unit-testable.

/** Hierarchical scheme (`http://`, `tauri://`, …). Case-insensitive. The `//`
 *  is what distinguishes a real scheme from a bare `host:port`. */
const HIERARCHICAL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Opaque schemes we accept as-is even without `//` (no authority component).
 *  A bare `localhost:3000` is NOT one of these, so it gets a scheme prepended. */
const OPAQUE_SCHEME_RE = /^(about|file|data|blob|mailto|tauri|javascript):/i;

function hasScheme(input: string): boolean {
	return HIERARCHICAL_SCHEME_RE.test(input) || OPAQUE_SCHEME_RE.test(input);
}

/** Hosts that should default to plaintext `http://` rather than `https://`. */
function isLocalHost(host: string): boolean {
	const h = host.toLowerCase();
	if (
		h === "localhost" ||
		h === "127.0.0.1" ||
		h === "0.0.0.0" ||
		h === "::1" ||
		h === "[::1]"
	) {
		return true;
	}
	if (h.endsWith(".local")) return true;
	// Private IPv4 ranges (RFC 1918): 10.x, 192.168.x, 172.16–31.x.
	if (h.startsWith("10.")) return true;
	if (h.startsWith("192.168.")) return true;
	const m = /^172\.(\d{1,3})\./.exec(h);
	if (m) {
		const second = Number.parseInt(m[1], 10);
		if (second >= 16 && second <= 31) return true;
	}
	return false;
}

/** Extract the bare host (no scheme, no port, no path) from raw input. */
function extractHost(input: string): string {
	const beforePath = input.split("/")[0];
	// Strip a trailing :port. For bracketed IPv6 (`[::1]:3000`) keep the bracket
	// content; `isLocalHost` handles both `[::1]` and `::1`.
	if (beforePath.startsWith("[")) {
		const end = beforePath.indexOf("]");
		return end === -1 ? beforePath : beforePath.slice(0, end + 1);
	}
	// Unbracketed IPv6 (e.g. `::1`): multiple colons mean it's an address, not a
	// `host:port`, so the whole thing is the host.
	if ((beforePath.match(/:/g) ?? []).length > 1) return beforePath;
	return beforePath.split(":")[0];
}

/**
 * Normalize a user-typed address into a fully-qualified URL.
 *
 * - Trims input; empty → `null`.
 * - Input that already carries a scheme (`http://`, `about:`, `file:`, …) is
 *   returned unchanged.
 * - Otherwise a scheme is chosen by host: localhost / loopback / `*.local` /
 *   private LAN ranges → `http://`; everything else → `https://`.
 */
export function normalizeUrl(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	if (hasScheme(trimmed)) return trimmed;

	const host = extractHost(trimmed);
	const scheme = isLocalHost(host) ? "http://" : "https://";
	return `${scheme}${trimmed}`;
}

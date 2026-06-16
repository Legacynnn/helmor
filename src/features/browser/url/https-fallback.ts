// Pure decision logic for the "typed a bare host, guessed wrong scheme" retry.
//
// When `normalizeUrl` auto-upgrades a scheme-less host to `https://` and that
// load fails (or never finishes), we retry the same host over `http://` once.
// We must NOT downgrade a URL the user typed `https://` into explicitly — only
// our own auto-upgrade is eligible for the fallback.
//
// No React, no IPC — pure string math, fully unit-testable.

/** True when `url` is an `https://` URL we may safely retry over `http://`. */
export function canFallbackToHttp(url: string, autoUpgraded: boolean): boolean {
	if (!autoUpgraded) return false;
	return /^https:\/\//i.test(url);
}

/**
 * The `http://` retry target for an auto-upgraded `https://` URL, or `null`
 * when no fallback should happen (explicit https, or not https at all).
 */
export function httpFallbackUrl(
	url: string,
	autoUpgraded: boolean,
): string | null {
	if (!canFallbackToHttp(url, autoUpgraded)) return null;
	return url.replace(/^https:\/\//i, "http://");
}

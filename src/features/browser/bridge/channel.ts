/**
 * Typed bidirectional message contract for the inspector bridge.
 *
 * The bridge is JS injected into the content webview. Messages flow in two
 * directions:
 *   - page → host  (`BridgeToHostMessage`): the injected bridge reports user
 *     actions and capture results back to the Tauri host / React layer.
 *   - host → page  (`HostToBridgeMessage`): the host drives the bridge —
 *     activating a mode, clearing comments, or requesting a capture.
 *
 * This module is PURE: types plus small structural (de)serialization guards.
 * It has no side effects at import time so it is safe to bundle as a string.
 */

/** Active inspector mode. `"none"` is fully passive (zero overhead). */
export type BridgeMode = "none" | "comment" | "pick" | "draw";

/** A rect in viewport coordinates. Plain object — serializable over IPC. */
export type BridgeRect = {
	x: number;
	y: number;
	width: number;
	height: number;
};

/** Structured selection emitted by comment-pin and element-pick. */
export type BridgeSelection = {
	selector: string;
	outerHTML: string;
	computedStyles?: Record<string, string>;
	rect: BridgeRect;
	/** Path to a cropped screenshot of the element's rect, when one was made. */
	cropPath?: string | null;
};

/** A buffered console entry from the console collector. */
export type ConsoleEntry = {
	level: "log" | "info" | "warn" | "error";
	message: string;
	ts: number;
};

/** A buffered network entry from the network collector. */
export type NetworkEntry = {
	url: string;
	method: string;
	status: number | null;
	durationMs: number;
	failed: boolean;
};

// ── page → host ──────────────────────────────────────────────────────────

export type BridgeToHostMessage =
	| {
			kind: "comment-added";
			id: string;
			text: string;
			selection: BridgeSelection;
	  }
	| { kind: "element-picked"; selection: BridgeSelection }
	| { kind: "console-error"; entry: ConsoleEntry }
	| { kind: "network-event"; entry: NetworkEntry }
	| { kind: "capture-result"; base64: string }
	| { kind: "driver-result"; id: string; value: unknown }
	| { kind: "reload-detected" }
	| {
			kind: "flow-event";
			eventType: "click" | "input" | "change" | "navigate";
			target: BridgeSelection;
			data?: string;
	  };

/** Resolve target for an agent-driver action. Mirrors Rust `PreviewTarget`. */
export type DriverTarget =
	| { by: "selector"; selector: string }
	| { by: "role"; role: string; name: string }
	| { by: "coords"; x: number; y: number };

/** Page-side operation requested by the agent-control broker. */
export type DriverRequestPayload =
	| { op: "snapshot" }
	| { op: "click"; target: DriverTarget }
	| { op: "type"; target: DriverTarget; text: string }
	| { op: "press"; key: string }
	| { op: "scroll"; target?: DriverTarget; dx: number; dy: number }
	| { op: "evaluate"; script: string }
	| { op: "waitFor"; condition: unknown; timeoutMs: number };

// ── host → page ──────────────────────────────────────────────────────────

export type HostToBridgeMessage =
	| { kind: "set-mode"; mode: BridgeMode }
	| { kind: "set-context"; workspaceId: string; url: string }
	| { kind: "clear-comments" }
	| { kind: "request-capture" }
	| { kind: "driver-request"; id: string; payload: DriverRequestPayload }
	| { kind: "set-flow-recording"; enabled: boolean };

/** Callback the host injects so the bridge can post messages out of the page. */
export type BridgePost = (message: BridgeToHostMessage) => void;

// ── (de)serialization guards ───────────────────────────────────────────────

const HOST_TO_BRIDGE_KINDS = new Set([
	"set-mode",
	"set-context",
	"clear-comments",
	"request-capture",
	"driver-request",
	"set-flow-recording",
]);

const BRIDGE_TO_HOST_KINDS = new Set([
	"comment-added",
	"element-picked",
	"console-error",
	"network-event",
	"capture-result",
	"driver-result",
	"reload-detected",
	"flow-event",
]);

const BRIDGE_MODES = new Set<BridgeMode>(["none", "comment", "pick", "draw"]);

export function isBridgeMode(value: unknown): value is BridgeMode {
	return typeof value === "string" && BRIDGE_MODES.has(value as BridgeMode);
}

function hasKind(value: unknown): value is { kind: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { kind?: unknown }).kind === "string"
	);
}

export function isHostToBridgeMessage(
	value: unknown,
): value is HostToBridgeMessage {
	if (!hasKind(value)) return false;
	if (!HOST_TO_BRIDGE_KINDS.has(value.kind)) return false;
	if (value.kind === "set-mode") {
		return isBridgeMode((value as { mode?: unknown }).mode);
	}
	return true;
}

export function isBridgeToHostMessage(
	value: unknown,
): value is BridgeToHostMessage {
	return hasKind(value) && BRIDGE_TO_HOST_KINDS.has(value.kind);
}

/** Parse a JSON string into a host→bridge message, or null if malformed. */
export function parseHostToBridgeMessage(
	raw: string,
): HostToBridgeMessage | null {
	try {
		const parsed: unknown = JSON.parse(raw);
		return isHostToBridgeMessage(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

/** Serialize a bridge→host message for transport. */
export function serializeBridgeToHostMessage(
	message: BridgeToHostMessage,
): string {
	return JSON.stringify(message);
}

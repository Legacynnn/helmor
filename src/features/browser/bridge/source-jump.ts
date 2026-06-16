/**
 * Host-side dispatch for an element→source jump.
 *
 * Given a `source-ref` bridge message, either jump to the file/line via the
 * editor controller's `openFileReference`, or degrade to a selector-only notice.
 * PURE routing decision (the side effects are injected callbacks) so it unit-tests
 * without a React tree.
 */
import type { BridgeToHostMessage } from "./channel";

type SourceRefMessage = Extract<BridgeToHostMessage, { kind: "source-ref" }>;

export type SourceJumpHandlers = {
	openFileReference: (path: string, line?: number, column?: number) => void;
	/** Called with the selector when the source ref could not be resolved. */
	onUnresolved: (selector: string) => void;
};

export function dispatchSourceJump(
	message: SourceRefMessage,
	handlers: SourceJumpHandlers,
): void {
	if (message.ref) {
		handlers.openFileReference(
			message.ref.path,
			message.ref.line,
			message.ref.column,
		);
		return;
	}
	handlers.onUnresolved(message.selector);
}

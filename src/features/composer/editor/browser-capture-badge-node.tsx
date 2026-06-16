/**
 * Lexical DecoratorNode for inline browser-capture badges in the composer.
 *
 * Renders a non-editable badge (globe icon + summary + remove button) inline
 * with text. Hovering the badge opens a preview of the annotated screenshot.
 * Mirrors image-badge-node.tsx; carries an annotated `capturePath` plus a
 * short `summary` label (e.g. "example.com · 2 comments").
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
	$applyNodeReplacement,
	$getNodeByKey,
	DecoratorNode,
	type DOMExportOutput,
	type LexicalNode,
	type NodeKey,
	type SerializedLexicalNode,
	type Spread,
} from "lexical";
import { Globe } from "lucide-react";
import type { ReactNode } from "react";
import { InlineBadge } from "@/components/inline-badge";

// ---------------------------------------------------------------------------
// Serialization type
// ---------------------------------------------------------------------------

type SerializedBrowserCaptureBadgeNode = Spread<
	{ capturePath: string; summary: string },
	SerializedLexicalNode
>;

// ---------------------------------------------------------------------------
// React badge component rendered inside the editor
// ---------------------------------------------------------------------------

function ComposerBrowserCaptureBadge({
	capturePath,
	summary,
	nodeKey,
}: {
	capturePath: string;
	summary: string;
	nodeKey: NodeKey;
}) {
	const [editor] = useLexicalComposerContext();

	return (
		<InlineBadge
			icon={
				<Globe className="size-3.5 shrink-0 text-chart-2" strokeWidth={1.8} />
			}
			label={summary}
			removeLabel="Remove browser capture"
			preview={{
				kind: "image",
				title: summary,
				path: capturePath,
			}}
			onRemove={() => {
				editor.update(() => {
					const node = $getBrowserCaptureBadgeNodeByKey(nodeKey);
					if (node) node.remove();
				});
			}}
		/>
	);
}

// ---------------------------------------------------------------------------
// Lexical node
// ---------------------------------------------------------------------------

export class BrowserCaptureBadgeNode extends DecoratorNode<ReactNode> {
	__capturePath: string;
	__summary: string;

	static getType(): string {
		return "browser-capture-badge";
	}

	static clone(node: BrowserCaptureBadgeNode): BrowserCaptureBadgeNode {
		return new BrowserCaptureBadgeNode(
			node.__capturePath,
			node.__summary,
			node.__key,
		);
	}

	static importJSON(
		serializedNode: SerializedBrowserCaptureBadgeNode,
	): BrowserCaptureBadgeNode {
		return $createBrowserCaptureBadgeNode(
			serializedNode.capturePath,
			serializedNode.summary,
		);
	}

	constructor(capturePath: string, summary: string, key?: NodeKey) {
		super(key);
		this.__capturePath = capturePath;
		this.__summary = summary;
	}

	exportJSON(): SerializedBrowserCaptureBadgeNode {
		return {
			type: "browser-capture-badge",
			version: 1,
			capturePath: this.__capturePath,
			summary: this.__summary,
		};
	}

	createDOM(): HTMLElement {
		const span = document.createElement("span");
		span.style.display = "inline-flex";
		span.style.alignItems = "center";
		span.style.justifyContent = "center";
		span.style.lineHeight = "1";
		span.style.verticalAlign = "-1px";
		return span;
	}

	updateDOM(): false {
		return false;
	}

	exportDOM(): DOMExportOutput {
		const span = document.createElement("span");
		span.textContent = `@${this.__capturePath}`;
		return { element: span };
	}

	isInline(): true {
		return true;
	}

	getCapturePath(): string {
		return this.__capturePath;
	}

	getSummary(): string {
		return this.__summary;
	}

	decorate(): ReactNode {
		return (
			<ComposerBrowserCaptureBadge
				capturePath={this.__capturePath}
				summary={this.__summary}
				nodeKey={this.__key}
			/>
		);
	}
}

// ---------------------------------------------------------------------------
// Factory & type guards
// ---------------------------------------------------------------------------

export function $createBrowserCaptureBadgeNode(
	capturePath: string,
	summary: string,
): BrowserCaptureBadgeNode {
	return $applyNodeReplacement(
		new BrowserCaptureBadgeNode(capturePath, summary),
	);
}

export function $isBrowserCaptureBadgeNode(
	node: LexicalNode | null | undefined,
): node is BrowserCaptureBadgeNode {
	return node instanceof BrowserCaptureBadgeNode;
}

function $getBrowserCaptureBadgeNodeByKey(
	key: NodeKey,
): BrowserCaptureBadgeNode | null {
	const node = $getNodeByKey(key);
	return $isBrowserCaptureBadgeNode(node) ? node : null;
}

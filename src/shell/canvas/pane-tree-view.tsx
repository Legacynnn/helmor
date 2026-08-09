// Recursive renderer for the split-canvas pane tree. A `split` node becomes a
// flex row/col with a draggable separator between each pair of children; a
// `leaf` node renders the caller-supplied conversation body wrapped in a
// focus-scope element. Resize writes new fractional `sizes` back through the
// `onResize(path, sizes)` callback (path = child-index sequence to the split).

import {
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useRef,
} from "react";
import { cn } from "@/lib/utils";
import type { PaneLeaf, PaneNode } from "./tree-model";

/** Smallest fraction a pane may shrink to during a resize drag. */
const MIN_PANE_FRACTION = 0.12;

export type PaneTreeViewProps = {
	node: PaneNode;
	focusedPaneId: string | null;
	/** Render a leaf's conversation body. */
	renderLeaf: (leaf: PaneLeaf) => React.ReactNode;
	onFocusPane: (paneId: string) => void;
	onResize: (path: number[], sizes: number[]) => void;
	/** Optional per-leaf overlay (split / close controls), absolutely
	 *  positioned inside the leaf wrapper. Kept caller-supplied so the renderer
	 *  stays free of conversation/session coupling. */
	renderPaneOverlay?: (leaf: PaneLeaf) => React.ReactNode;
	/** Child-index path from the root to `node`. Root call passes `[]`. */
	path?: number[];
};

export function PaneTreeView({
	node,
	focusedPaneId,
	renderLeaf,
	onFocusPane,
	onResize,
	renderPaneOverlay,
	path = [],
}: PaneTreeViewProps) {
	if (node.type === "leaf") {
		const isFocused = node.paneId === focusedPaneId;
		return (
			<div
				data-focus-scope="chat"
				data-canvas-leaf="true"
				data-pane-id={node.paneId}
				data-canvas-dropzone={node.paneId}
				// Pointer-down (capture) makes this leaf active before any inner
				// control handles the event, so chat shortcuts scope to it.
				onPointerDownCapture={() => onFocusPane(node.paneId)}
				className={cn(
					"relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
					"transition-shadow",
					isFocused
						? "shadow-[inset_0_0_0_1.5px_var(--color-ring,theme(colors.ring))]"
						: "shadow-[inset_0_0_0_1px_transparent]",
				)}
			>
				{renderLeaf(node)}
				{renderPaneOverlay ? renderPaneOverlay(node) : null}
			</div>
		);
	}

	const isRow = node.direction === "row";
	return (
		<div
			className={cn(
				"flex min-h-0 min-w-0 flex-1",
				isRow ? "flex-row" : "flex-col",
			)}
		>
			{node.children.map((child, index) => (
				<CanvasChild
					// Pane identity is stable per subtree position; index keys are
					// fine here because reorders go through a full tree replacement.
					key={childKey(child, index)}
					child={child}
					index={index}
					parent={node}
					path={path}
					focusedPaneId={focusedPaneId}
					renderLeaf={renderLeaf}
					onFocusPane={onFocusPane}
					onResize={onResize}
				/>
			))}
		</div>
	);
}

function childKey(child: PaneNode, index: number): string {
	return child.type === "leaf" ? child.paneId : `split-${index}`;
}

type CanvasChildProps = {
	child: PaneNode;
	index: number;
	parent: Extract<PaneNode, { type: "split" }>;
	path: number[];
	focusedPaneId: string | null;
	renderLeaf: (leaf: PaneLeaf) => React.ReactNode;
	onFocusPane: (paneId: string) => void;
	onResize: (path: number[], sizes: number[]) => void;
	renderPaneOverlay?: (leaf: PaneLeaf) => React.ReactNode;
};

function CanvasChild({
	child,
	index,
	parent,
	path,
	focusedPaneId,
	renderLeaf,
	onFocusPane,
	onResize,
	renderPaneOverlay,
}: CanvasChildProps) {
	const fraction = parent.sizes[index] ?? 1 / parent.children.length;
	const isRow = parent.direction === "row";
	const isLast = index === parent.children.length - 1;

	return (
		<>
			<div
				className="flex min-h-0 min-w-0"
				style={{ flexBasis: `${fraction * 100}%`, flexGrow: 0, flexShrink: 1 }}
			>
				<PaneTreeView
					node={child}
					focusedPaneId={focusedPaneId}
					renderLeaf={renderLeaf}
					onFocusPane={onFocusPane}
					onResize={onResize}
					renderPaneOverlay={renderPaneOverlay}
					path={[...path, index]}
				/>
			</div>
			{!isLast && (
				<CanvasResizeSeparator
					direction={isRow ? "row" : "col"}
					onResize={(deltaFraction) => {
						const a = parent.sizes[index] ?? 1 / parent.children.length;
						const b = parent.sizes[index + 1] ?? 1 / parent.children.length;
						const total = a + b;
						let nextA = a + deltaFraction;
						nextA = Math.max(
							MIN_PANE_FRACTION,
							Math.min(total - MIN_PANE_FRACTION, nextA),
						);
						const sizes = parent.sizes.slice();
						sizes[index] = nextA;
						sizes[index + 1] = total - nextA;
						onResize(path, sizes);
					}}
				/>
			)}
		</>
	);
}

type SeparatorProps = {
	direction: "row" | "col";
	/** Called per pointer-move with the fractional delta since drag start. */
	onResize: (deltaFraction: number) => void;
};

function CanvasResizeSeparator({ direction, onResize }: SeparatorProps) {
	const isRow = direction === "row";
	const stateRef = useRef<{
		origin: number;
		span: number;
		pointerId: number;
	} | null>(null);

	const handlePointerMove = useCallback(
		(event: PointerEvent) => {
			const state = stateRef.current;
			if (!state || state.span <= 0) {
				return;
			}
			const current = isRow ? event.clientX : event.clientY;
			onResize((current - state.origin) / state.span);
		},
		[isRow, onResize],
	);

	const handlePointerUp = useCallback(() => {
		stateRef.current = null;
		window.removeEventListener("pointermove", handlePointerMove);
		window.removeEventListener("pointerup", handlePointerUp);
		window.removeEventListener("pointercancel", handlePointerUp);
		document.documentElement.style.removeProperty("cursor");
	}, [handlePointerMove]);

	const handlePointerDown = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			// Resize is its own gesture — don't let it bubble into a leaf focus
			// or a tab drag.
			event.preventDefault();
			event.stopPropagation();
			const container = event.currentTarget.parentElement;
			if (!container) {
				return;
			}
			const rect = container.getBoundingClientRect();
			stateRef.current = {
				origin: isRow ? event.clientX : event.clientY,
				span: isRow ? rect.width : rect.height,
				pointerId: event.pointerId,
			};
			document.documentElement.style.cursor = isRow
				? "col-resize"
				: "row-resize";
			window.addEventListener("pointermove", handlePointerMove);
			window.addEventListener("pointerup", handlePointerUp);
			window.addEventListener("pointercancel", handlePointerUp);
		},
		[isRow, handlePointerMove, handlePointerUp],
	);

	return (
		// Pointer-only resize affordance (no keyboard/value semantics → no
		// `separator` role, which would require `aria-valuenow`).
		<div
			data-canvas-resize={direction}
			onPointerDown={handlePointerDown}
			className={cn(
				"group relative z-10 shrink-0 touch-none bg-border/60 transition-colors hover:bg-muted-foreground/60",
				isRow ? "w-px cursor-col-resize" : "h-px cursor-row-resize",
			)}
		>
			{/* Invisible widened hit-area so the 1px divider is easy to grab. */}
			<span
				aria-hidden="true"
				className={cn(
					"absolute",
					isRow
						? "inset-y-0 -left-1.5 -right-1.5"
						: "inset-x-0 -top-1.5 -bottom-1.5",
				)}
			/>
		</div>
	);
}

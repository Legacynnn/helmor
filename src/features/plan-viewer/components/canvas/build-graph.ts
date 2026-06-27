import type { PlanBlock } from "../../mdx/parse";
import type { PlanAccent } from "../shell/accent";
import {
	DEFAULT_FRAME_SIZE,
	type FrameDevice,
	type FrameKind,
	normalizeDevice,
	parseCoord,
	parseDimension,
	resolveFrameKind,
} from "./frame-kinds";
import { type CanvasTheme, normalizeAccent } from "./theme-modes";

/** Direction of a user-flow arrow, set via `<CanvasFlow kind="...">`. */
export type FlowKind = "primary" | "secondary" | "back";

const FLOW_KINDS = new Set<FlowKind>(["primary", "secondary", "back"]);

function normalizeFlowKind(value: string | undefined): FlowKind {
	return value && FLOW_KINDS.has(value as FlowKind)
		? (value as FlowKind)
		: "primary";
}

/** Data carried on each frame React Flow node (rendered by the frame nodes). */
export type FrameData = {
	title: string;
	frameKind: FrameKind;
	device: FrameDevice;
	theme: CanvasTheme;
	accent: PlanAccent;
	/** Raw React snippet for a preview frame (empty otherwise). */
	previewCode: string;
	/** Raw wireframe-DSL source for a wireframe frame (empty otherwise). */
	wireframeSource: string;
	/** Markdown body blocks for a note frame (empty otherwise). */
	bodyBlocks: PlanBlock[];
};

export type FrameNode = {
	id: string;
	frameKind: FrameKind;
	data: FrameData;
	/** Authored top-left position, or `undefined` → auto-layout assigns one. */
	position?: { x: number; y: number };
	width: number;
	height: number;
};

export type FlowEdge = {
	id: string;
	source: string;
	target: string;
	label: string;
	kind: FlowKind;
};

export type GroupSpec = {
	id: string;
	title: string;
	contains: string[];
	accent: PlanAccent;
};

export type CanvasGraph = {
	frames: FrameNode[];
	edges: FlowEdge[];
	groups: GroupSpec[];
	/** True when at least one frame carries an explicit position. */
	hasCoords: boolean;
};

function splitIds(value: string | undefined): string[] {
	if (!value) return [];
	return value
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

/** Find the first nested component block with the given name (e.g. Preview). */
function findChildComponent(
	block: Extract<PlanBlock, { kind: "component" }>,
	name: string,
): Extract<PlanBlock, { kind: "component" }> | undefined {
	for (const child of block.childBlocks) {
		if (child.kind === "component" && child.name === name) {
			return child;
		}
	}
	return undefined;
}

/**
 * Convert a `<PlanCanvas>`'s child blocks into a freeform frame graph:
 * - each `<CanvasNode>` → a positioned frame (preview / wireframe / note),
 * - each `<CanvasFlow>` (plus back-compat `connects=`) → a labeled flow edge,
 * - each `<CanvasGroup>` → a section spec (bbox computed after layout).
 * Positions are honored verbatim when authored; `auto-layout.ts` fills the rest.
 */
export function buildCanvasGraph(
	childBlocks: PlanBlock[],
	theme: CanvasTheme,
): CanvasGraph {
	const frames: FrameNode[] = [];
	const ids = new Set<string>();
	let hasCoords = false;

	for (const block of childBlocks) {
		if (block.kind !== "component" || block.name !== "CanvasNode") continue;
		const id = block.props.id?.trim() || block.id;
		if (ids.has(id)) continue;
		ids.add(id);

		const previewBlock = findChildComponent(block, "Preview");
		const wireframeBlock = findChildComponent(block, "Wireframe");
		const frameKind = resolveFrameKind(block.props.kind, {
			hasPreview: previewBlock != null,
			hasWireframe: wireframeBlock != null,
		});
		const device = normalizeDevice(
			block.props.device ?? wireframeBlock?.props.surface,
		);
		const accent = normalizeAccent(block.props.accent);
		const defaults = DEFAULT_FRAME_SIZE[frameKind];
		const width = parseDimension(block.props.w, defaults.width);
		const height = parseDimension(block.props.h, defaults.height);

		const x = parseCoord(block.props.x);
		const y = parseCoord(block.props.y);
		const position = x != null && y != null ? { x, y } : undefined;
		if (position) hasCoords = true;

		frames.push({
			id,
			frameKind,
			data: {
				title: block.props.title?.trim() || id,
				frameKind,
				device,
				theme,
				accent,
				previewCode: previewBlock?.rawText ?? "",
				wireframeSource: wireframeBlock?.rawText ?? "",
				bodyBlocks: block.childBlocks,
			},
			position,
			width,
			height,
		});
	}

	const edges = buildEdges(childBlocks, ids);
	const groups = buildGroups(childBlocks, ids);
	return { frames, edges, groups, hasCoords };
}

/** Flow edges from explicit `<CanvasFlow>` blocks AND back-compat `connects=`.
 * Cycles are kept (user journeys legitimately loop); only self-loops, dangling
 * ids, and duplicate ids are dropped. */
function buildEdges(childBlocks: PlanBlock[], ids: Set<string>): FlowEdge[] {
	const edges: FlowEdge[] = [];
	const seen = new Set<string>();
	const push = (
		source: string,
		target: string,
		label: string,
		kind: FlowKind,
		id: string,
	) => {
		if (!ids.has(source) || !ids.has(target)) return;
		if (source === target) return;
		if (seen.has(id)) return;
		seen.add(id);
		edges.push({ id, source, target, label, kind });
	};

	let flowIndex = 0;
	for (const block of childBlocks) {
		if (block.kind !== "component") continue;
		if (block.name === "CanvasFlow") {
			const source = block.props.from?.trim() ?? "";
			const target = block.props.to?.trim() ?? "";
			push(
				source,
				target,
				block.props.label?.trim() ?? "",
				normalizeFlowKind(block.props.kind),
				`flow-${flowIndex++}-${source}->${target}`,
			);
			continue;
		}
		if (block.name === "CanvasNode") {
			const source = block.props.id?.trim() || block.id;
			for (const target of splitIds(block.props.connects)) {
				push(source, target, "", "secondary", `connect-${source}->${target}`);
			}
		}
	}
	return edges;
}

/** Section specs from `<CanvasGroup contains="a,b">` blocks (known ids only). */
function buildGroups(childBlocks: PlanBlock[], ids: Set<string>): GroupSpec[] {
	const groups: GroupSpec[] = [];
	const seen = new Set<string>();
	for (const block of childBlocks) {
		if (block.kind !== "component" || block.name !== "CanvasGroup") continue;
		const id = block.props.id?.trim() || block.id;
		if (seen.has(id)) continue;
		seen.add(id);
		const contains = splitIds(block.props.contains).filter((m) => ids.has(m));
		if (contains.length === 0) continue; // an empty section frames nothing
		groups.push({
			id,
			title: block.props.title?.trim() || "",
			contains,
			accent: normalizeAccent(block.props.accent),
		});
	}
	return groups;
}

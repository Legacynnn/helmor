import type { ComponentType, ReactNode } from "react";
import { AnnotatedCode } from "../components/annotated-code";
import { PlanCanvas } from "../components/canvas";
import { Decision } from "../components/decision";
import { Diagram } from "../components/diagram";
import { FileMap } from "../components/file-map";
import { OpenQuestions } from "../components/open-questions";
import { RiskCard } from "../components/risk-card";
import { Steps } from "../components/steps";

/** Standalone fallback: a CanvasNode authored outside a PlanCanvas just renders
 * its body blocks inline so content is never lost. */
function CanvasNodeFallback({ children }: { children?: ReactNode }) {
	return <>{children}</>;
}

/** Sub-components (Option, Before, After, Phase) are consumed by their parent
 * (Decision / BeforeAfter / Timeline). Authored standalone, they just render
 * their body blocks so content is never lost. */
function SubComponentFallback({ children }: { children?: ReactNode }) {
	return <>{children}</>;
}

/**
 * How a plan component's children are interpreted:
 * - `"blocks"`: children are nested plan blocks (recursively parsed + rendered).
 *   The component receives them as already-rendered `React.ReactNode`.
 * - `"raw"`: children are a verbatim text string (the component owns parsing —
 *   e.g. mermaid source, code body, a line list).
 * - `"structured"`: children are passed as the raw parsed `PlanBlock[]` so the
 *   component can inspect node ids/props itself (e.g. PlanCanvas).
 */
export type PlanChildMode = "blocks" | "raw" | "structured";

export type PlanComponentDef = {
	// biome-ignore lint/suspicious/noExplicitAny: heterogeneous prop shapes per component
	render: ComponentType<any>;
	childMode: PlanChildMode;
};

/**
 * Allowlist of plan component names → typed definitions. Only names present
 * here are rendered; anything else falls back to `UnsupportedBlock`. The parser
 * never evaluates JSX, so this map is the sole bridge from component name to
 * rendered UI. It is also the source of truth for `childMode`: the parser
 * imports {@link planChildMode} to decide whether to recurse into children.
 */
export const PLAN_COMPONENTS: Record<string, PlanComponentDef> = {
	RiskCard: { render: RiskCard, childMode: "blocks" },
	Steps: { render: Steps, childMode: "blocks" },
	FileMap: { render: FileMap, childMode: "raw" },
	OpenQuestions: { render: OpenQuestions, childMode: "blocks" },
	AnnotatedCode: { render: AnnotatedCode, childMode: "raw" },
	Diagram: { render: Diagram, childMode: "raw" },
	PlanCanvas: { render: PlanCanvas, childMode: "structured" },
	CanvasNode: { render: CanvasNodeFallback, childMode: "blocks" },
	Decision: { render: Decision, childMode: "structured" },
	Option: { render: SubComponentFallback, childMode: "blocks" },
};

/** Resolve a component's child mode, or `null` when the name is unknown. */
export function planChildMode(name: string): PlanChildMode | null {
	return PLAN_COMPONENTS[name]?.childMode ?? null;
}

import type { ComponentType } from "react";
import { AnnotatedCode } from "../components/annotated-code";
import { Diagram } from "../components/diagram";
import { FileMap } from "../components/file-map";
import { OpenQuestions } from "../components/open-questions";
import { RiskCard } from "../components/risk-card";
import { Steps } from "../components/steps";

/**
 * Allowlist of plan component names → React components. Only names present here
 * are rendered; anything else falls back to `UnsupportedBlock`. The parser
 * never evaluates JSX, so this map is the sole bridge from component name to
 * rendered UI.
 */
// biome-ignore lint/suspicious/noExplicitAny: heterogeneous prop shapes per component
export const PLAN_COMPONENTS: Record<string, ComponentType<any>> = {
	RiskCard,
	Steps,
	FileMap,
	OpenQuestions,
	AnnotatedCode,
	Diagram,
};

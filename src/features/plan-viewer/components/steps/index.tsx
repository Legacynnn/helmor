import { ListChecksIcon } from "lucide-react";
import { PlanBlockShell } from "../shell/plan-block-shell";
import { parseSteps } from "./parse-steps";
import { Stepper } from "./stepper";

/**
 * `Steps` renders step-by-step plan content as a connected visual stepper. The
 * raw body is one step per line (a normal markdown ordered/unordered list);
 * lines may carry an optional `done:` / `active:` status prefix.
 */
export function Steps({ children = "" }: { children?: string }) {
	const steps = parseSteps(children);
	if (steps.length === 0) {
		return null;
	}
	return (
		<PlanBlockShell accent="neutral" icon={ListChecksIcon} title="Steps">
			<Stepper steps={steps} />
		</PlanBlockShell>
	);
}

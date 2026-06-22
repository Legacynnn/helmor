import { AlertTriangleIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { PlanAccent } from "./shell/accent";
import { PlanBlockShell } from "./shell/plan-block-shell";

type Severity = "low" | "medium" | "high";

const SEVERITY: Record<Severity, { accent: PlanAccent; label: string }> = {
	low: { accent: "info", label: "Low risk" },
	medium: { accent: "warning", label: "Medium risk" },
	high: { accent: "danger", label: "High risk" },
};

function normalizeSeverity(value?: string): Severity {
	if (value === "low" || value === "medium" || value === "high") {
		return value;
	}
	return "medium";
}

export function RiskCard({
	severity,
	children,
}: {
	severity?: string;
	children?: ReactNode;
}) {
	const { accent, label } = SEVERITY[normalizeSeverity(severity)];
	return (
		<PlanBlockShell accent={accent} icon={AlertTriangleIcon} title={label}>
			{children}
		</PlanBlockShell>
	);
}

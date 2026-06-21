import { AlertTriangleIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Severity = "low" | "medium" | "high";

const SEVERITY_STYLES: Record<
	Severity,
	{ container: string; label: string; text: string }
> = {
	low: {
		container: "border-sky-500/40 bg-sky-500/5",
		label: "text-sky-600 dark:text-sky-400",
		text: "Low risk",
	},
	medium: {
		container: "border-amber-500/40 bg-amber-500/5",
		label: "text-amber-600 dark:text-amber-400",
		text: "Medium risk",
	},
	high: {
		container: "border-red-500/45 bg-red-500/5",
		label: "text-red-600 dark:text-red-400",
		text: "High risk",
	},
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
	const level = normalizeSeverity(severity);
	const style = SEVERITY_STYLES[level];

	return (
		<div className={cn("my-4 rounded-lg border p-4", style.container)}>
			<div
				className={cn(
					"mb-2 flex items-center gap-2 font-medium text-small",
					style.label,
				)}
			>
				<AlertTriangleIcon className="size-4 shrink-0" />
				<span>{style.text}</span>
			</div>
			{children}
		</div>
	);
}

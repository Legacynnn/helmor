import { Activity } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatBytes, formatCpu } from "./format";
import { useResourceSnapshot } from "./hooks/use-resource-snapshot";
import { ResourcePopoverContent } from "./popover";

export function ResourceWidget() {
	const [open, setOpen] = useState(false);
	const { data, history, isError } = useResourceSnapshot(open);

	const cpu = data?.totalCpuPercent ?? 0;
	const tone =
		cpu > 80
			? "text-red-500"
			: cpu > 50
				? "text-amber-500"
				: "text-muted-foreground";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className={cn(
								"w-auto gap-1 px-1.5 text-muted-foreground hover:text-foreground",
								tone,
							)}
							aria-label="Helmor resource usage"
						>
							<Activity className="size-[15px]" strokeWidth={1.8} />
							{data && !isError ? (
								<span className="text-mini tabular-nums leading-none">
									{formatCpu(data.totalCpuPercent)} ·{" "}
									{formatBytes(data.totalMemoryBytes)}
								</span>
							) : null}
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent
					side="top"
					sideOffset={6}
					className="flex h-[22px] items-center rounded-md px-1.5 text-mini leading-none"
				>
					<span className="leading-none">Helmor resource usage</span>
				</TooltipContent>
			</Tooltip>
			<PopoverContent side="top" align="start" className="w-[340px] p-0">
				<ResourcePopoverContent
					snapshot={data}
					history={history}
					isError={isError}
					onClose={() => setOpen(false)}
				/>
			</PopoverContent>
		</Popover>
	);
}

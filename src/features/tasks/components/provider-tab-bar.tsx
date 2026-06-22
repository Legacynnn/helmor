import { ListTodo } from "lucide-react";
import type { ReactNode } from "react";
import { GithubBrandIcon, LinearBrandIcon } from "@/components/brand-icon";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { IntegrationProvider } from "@/lib/api";
import { cn } from "@/lib/utils";

type ProviderTab = {
	id: IntegrationProvider;
	label: string;
	icon: ReactNode;
	enabled: boolean;
};

const TABS: ProviderTab[] = [
	{
		id: "linear",
		label: "Linear",
		icon: <LinearBrandIcon size={15} />,
		enabled: true,
	},
	// Future providers — visible but disabled until their modules land.
	{
		id: "github",
		label: "GitHub Issues",
		icon: <GithubBrandIcon size={15} />,
		enabled: true,
	},
	{
		id: "clickup" as IntegrationProvider,
		label: "ClickUp",
		icon: <ListTodo className="size-[15px]" />,
		enabled: false,
	},
];

export function ProviderTabBar({
	active,
	connected,
	onSelect,
}: {
	active: IntegrationProvider;
	connected: boolean;
	onSelect: (provider: IntegrationProvider) => void;
}) {
	return (
		<div className="flex items-center gap-1">
			{TABS.map((tab) => {
				const isActive = tab.id === active;
				const button = (
					<button
						key={tab.id}
						type="button"
						disabled={!tab.enabled}
						aria-label={tab.label}
						aria-pressed={isActive}
						onClick={() => tab.enabled && onSelect(tab.id)}
						className={cn(
							"relative flex h-8 items-center gap-1.5 rounded-md px-2.5 text-ui transition-colors",
							tab.enabled
								? "cursor-pointer hover:bg-accent"
								: "cursor-not-allowed opacity-40",
							isActive
								? "bg-accent/70 text-foreground"
								: "text-muted-foreground",
						)}
					>
						{tab.icon}
						<span className="font-medium">{tab.label}</span>
						{tab.enabled && isActive && connected ? (
							<span
								className="size-1.5 rounded-full bg-green-400"
								aria-label="Connected"
							/>
						) : null}
					</button>
				);
				return tab.enabled ? (
					button
				) : (
					<Tooltip key={tab.id}>
						<TooltipTrigger asChild>{button}</TooltipTrigger>
						<TooltipContent>Coming soon</TooltipContent>
					</Tooltip>
				);
			})}
		</div>
	);
}

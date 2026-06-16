import { Button } from "@/components/ui/button";
import { previewStopAgentControl } from "@/lib/api";
import { useAgentControlStore } from "./use-agent-control";

export function AgentControlBanner({ workspaceId }: { workspaceId: string }) {
	const controlled = useAgentControlStore((s) => s.controlled.has(workspaceId));
	if (!controlled) return null;
	return (
		<div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 bg-amber-500/90 px-3 py-1.5 text-black text-sm">
			<span className="font-medium">Agent is controlling this surface</span>
			<Button
				size="sm"
				variant="secondary"
				className="cursor-pointer"
				onClick={() => void previewStopAgentControl(workspaceId)}
			>
				Stop
			</Button>
		</div>
	);
}

import { ScreenHeader } from "@/shell/components/screen-header";

export function TasksScreen() {
	return (
		<div aria-label="Tasks screen" className="flex min-h-0 flex-1 flex-col">
			<ScreenHeader>
				<span className="font-semibold text-foreground">Tasks</span>
			</ScreenHeader>
			<div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
				Tasks — coming soon
			</div>
		</div>
	);
}

import { ScreenHeader } from "@/shell/components/screen-header";

export function HistoryScreen() {
	return (
		<div aria-label="History screen" className="flex min-h-0 flex-1 flex-col">
			<ScreenHeader>
				<span className="font-semibold text-foreground">History</span>
			</ScreenHeader>
			<div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
				History — coming soon
			</div>
		</div>
	);
}

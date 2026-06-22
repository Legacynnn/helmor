import { DashboardContainer } from "@/features/dashboard/container";
import { HistoryScreen } from "@/features/history";
import { TasksScreen } from "@/features/tasks";
import type {
	ActiveScreen,
	ScreenActions,
} from "@/shell/controllers/use-screen-controller";
import type { SelectionActions } from "@/shell/controllers/use-selection-controller";

type Props = {
	activeScreen: Exclude<ActiveScreen, "none">;
	selectionActions: SelectionActions;
	screenActions: ScreenActions;
};

export function ScreenHost({
	activeScreen,
	selectionActions,
	screenActions,
}: Props) {
	return (
		<section
			aria-label="Top-level screen"
			className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
			style={{ contain: "layout style" }}
		>
			<div
				aria-label="Screen drag region"
				className="absolute inset-x-0 top-0 z-10 h-9 bg-transparent"
				data-tauri-drag-region
			/>
			{activeScreen === "dashboard" && (
				<DashboardContainer
					selectionActions={selectionActions}
					screenActions={screenActions}
				/>
			)}
			{activeScreen === "tasks" && (
				<TasksScreen
					selectionActions={selectionActions}
					screenActions={screenActions}
				/>
			)}
			{activeScreen === "history" && <HistoryScreen />}
		</section>
	);
}

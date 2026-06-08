import { DashboardScreen } from "@/features/dashboard";
import { HistoryScreen } from "@/features/history";
import { TasksScreen } from "@/features/tasks";
import type { ActiveScreen } from "@/shell/controllers/use-screen-controller";

type Props = {
	activeScreen: Exclude<ActiveScreen, "none">;
};

export function ScreenHost({ activeScreen }: Props) {
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
			{activeScreen === "dashboard" && <DashboardScreen />}
			{activeScreen === "tasks" && <TasksScreen />}
			{activeScreen === "history" && <HistoryScreen />}
		</section>
	);
}

import type { ScreenActions } from "@/shell/controllers/use-screen-controller";
import type { SelectionActions } from "@/shell/controllers/use-selection-controller";
import { TasksContainer } from "./container";

export type TasksScreenProps = {
	selectionActions: SelectionActions;
	screenActions: ScreenActions;
};

export function TasksScreen(props: TasksScreenProps) {
	return <TasksContainer {...props} />;
}

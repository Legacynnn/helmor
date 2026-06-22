import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type Task, type TaskPatchInput, updateTask } from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";

/**
 * Push an inline edit to the provider. The `taskChanged` UiMutationEvent
 * invalidates the list; we also seed the per-task cache from the response so a
 * detail view re-renders immediately.
 */
export function useUpdateTask() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (args: { taskId: string; patch: TaskPatchInput }) =>
			updateTask(args.taskId, args.patch),
		onSuccess: (task: Task) => {
			queryClient.setQueryData(helmorQueryKeys.task(task.id), task);
		},
	});
}

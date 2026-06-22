import { useMutation } from "@tanstack/react-query";
import {
	type CreateWorkspaceFromTaskInput,
	createWorkspaceFromTask,
	reviewTaskWithAgent,
} from "@/lib/api";

/**
 * Both actions create a session and seed a prompt; the backend queues a
 * `pending_cli_send`, and the app's pending-queue controller navigates to the
 * new workspace and auto-submits — so callers don't navigate themselves.
 */
export function useReviewTask() {
	return useMutation({
		mutationFn: (taskId: string) => reviewTaskWithAgent(taskId),
	});
}

export function useCreateWorkspaceFromTask() {
	return useMutation({
		mutationFn: (input: CreateWorkspaceFromTaskInput) =>
			createWorkspaceFromTask(input),
	});
}

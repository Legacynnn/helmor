import { create } from "zustand";

export type AgentControlState = { controlled: Set<string> };
export type AgentControlAction =
	| { type: "start"; workspaceId: string }
	| { type: "end"; workspaceId: string };

export function emptyAgentControl(): AgentControlState {
	return { controlled: new Set() };
}

export function agentControlReducer(
	state: AgentControlState,
	action: AgentControlAction,
): AgentControlState {
	const next = new Set(state.controlled);
	if (action.type === "start") next.add(action.workspaceId);
	else next.delete(action.workspaceId);
	return { controlled: next };
}

type Store = AgentControlState & {
	apply: (action: AgentControlAction) => void;
	isControlled: (workspaceId: string) => boolean;
};

export const useAgentControlStore = create<Store>((set, get) => ({
	...emptyAgentControl(),
	apply: (action) => set((s) => agentControlReducer(s, action)),
	isControlled: (workspaceId) => get().controlled.has(workspaceId),
}));

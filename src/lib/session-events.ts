/**
 * Window event used to create a fresh, prefilled session. Shared across the
 * inspector's "create run action" flow, the plan surface's handoff flow, and
 * consumed by `features/panel/container.tsx`, so feature surfaces stay decoupled
 * from session-creation plumbing. The detail shape is
 * `{ workspaceId, intro, body }`.
 */
export const CREATE_PREFILLED_SESSION_EVENT = "helmor:create-prefilled-session";

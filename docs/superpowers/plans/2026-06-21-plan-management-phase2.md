# Plan Management — Phase 2 (features) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** (D) Shift+Tab toggles plan mode + dashed/recolored composer border; (E) plan-mode read-only write gate in the sidecar; (F) inline "Plan updated — open" trigger when the agent edits a plan.

**Architecture:** D reuses the already-wired composer plan-toggle capture handler (only the default hotkey + border change). E adds a pure gate helper in the Claude sidecar `canUseTool`. F derives an inline trigger at render time from existing tool-call message parts. Per user: Bash stays ungated (per-command prompt); build all three.

---

## Task D: Shift+Tab toggles plan mode + dashed composer border

The toggle is ALREADY wired: `src/features/composer/index.tsx` `handleComposerKeyDownCapture` (~lines 761-809) flips `permissionMode` `plan ⇄ bypassPermissions` when `hotkey === togglePlanShortcut && supportsPlanMode && focusScope === "workspace-composer"`. Only the default hotkey and the border styling are missing.

**Files:** `src/features/shortcuts/registry.ts`, `src/features/shortcuts/registry.test.ts`, `src/features/composer/index.tsx`

- [ ] **Step 1: Change the default hotkey.** In `src/features/shortcuts/registry.ts`, the `composer.togglePlanMode` entry (~line 382-390) has `defaultHotkey: "Mod+Shift+P"`. Change it to:
```ts
		defaultHotkey: "Shift+Tab",
```
Verify there is no real conflict: the other `Shift+Tab` (~line 404) and `Control+Shift+Tab` (~line 37) are in different, non-overlapping scopes (`composer.togglePlanMode` is scoped `["workspace-composer"]`). Read the entries to confirm scopes don't overlap; if a conflict assertion exists, this is fine because scopes differ.

- [ ] **Step 2: Update the registry test.** In `src/features/shortcuts/registry.test.ts`, find the assertion `...togglePlanMode...defaultHotkey).toBe("Mod+Shift+P")` (~line 165) and change the expected value to `"Shift+Tab"`. Run `bun x vitest run src/features/shortcuts/registry.test.ts` — confirm PASS. If any overlap/conflict test now fails, READ it and report (do not loosen a real conflict check); only update the literal expectation.

- [ ] **Step 3: Dashed, recolored border when plan mode is active.** In `src/features/composer/index.tsx` (~lines 824-836), the outer wrapper className currently includes `border border-border/70 bg-sidebar dark:border-border/40` inside a `cn(...)`. `permissionMode` (= `effectivePermissionMode`) is in scope. Make the border conditional:
```ts
	"@container/composer relative flex flex-col rounded-xl bg-sidebar",
	permissionMode === "plan"
		? "border border-dashed border-amber-500/70 dark:border-amber-400/50"
		: "border border-border/70 dark:border-border/40",
```
(Keep all other classes in the `cn(...)` intact; only the border/static-border classes move into the conditional. Read the exact current className first and preserve everything else.)

- [ ] **Step 4: Typecheck + composer tests.** `bun run typecheck`; `bun x vitest run src/features/composer src/features/shortcuts`. Confirm clean/PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/features/shortcuts/registry.ts src/features/shortcuts/registry.test.ts src/features/composer/index.tsx
git commit -m "feat(composer): Shift+Tab toggles plan mode; dashed amber border when active"
```

---

## Task E: Plan-mode read-only write gate (sidecar)

**Files:** `sidecar/src/claude-session-manager.ts`, `sidecar/src/claude-session-manager.test.ts`

When `permissionMode === "plan"`, deny file-mutating tools (`Write`/`Edit`/`MultiEdit`/`NotebookEdit`) unless the target path is under `.helmor/plans/`. Bash and all other tools keep current behavior (fall through to the existing permission request).

- [ ] **Step 1: Write failing tests.** Add to `sidecar/src/claude-session-manager.test.ts` (uses `bun:test`; it already imports from `./claude-session-manager`). Add `planModeWriteDecision` to the import, then:
```ts
describe("planModeWriteDecision", () => {
	const cwd = "/repo";
	it("denies Write outside .helmor/plans", () => {
		expect(planModeWriteDecision("Write", { file_path: "src/x.ts" }, cwd)).toBe("deny");
	});
	it("allows Write under .helmor/plans (relative)", () => {
		expect(planModeWriteDecision("Write", { file_path: ".helmor/plans/foo.mdx" }, cwd)).toBe("allow");
	});
	it("allows Edit under .helmor/plans (absolute)", () => {
		expect(planModeWriteDecision("Edit", { file_path: "/repo/.helmor/plans/foo.mdx" }, cwd)).toBe("allow");
	});
	it("uses notebook_path for NotebookEdit", () => {
		expect(planModeWriteDecision("NotebookEdit", { notebook_path: ".helmor/plans/n.ipynb" }, cwd)).toBe("allow");
		expect(planModeWriteDecision("NotebookEdit", { notebook_path: "nb.ipynb" }, cwd)).toBe("deny");
	});
	it("allows non-write tools (Bash) to fall through", () => {
		expect(planModeWriteDecision("Bash", { command: "rm -rf x" }, cwd)).toBe("allow");
	});
	it("denies a write tool with no path", () => {
		expect(planModeWriteDecision("Write", {}, cwd)).toBe("deny");
	});
});
```
Run `cd sidecar && bun test src/claude-session-manager.test.ts` — confirm the new block FAILS (not exported).

- [ ] **Step 2: Implement the helper.** In `sidecar/src/claude-session-manager.ts`, after `extractExitPlanContent` (~line 1355), add (confirm `resolve` is imported from `node:path` at the top — line ~8; if not, add it):
```ts
/** File-mutating tools and the input field each uses for its target path. */
const WRITE_TOOL_PATH_FIELDS: Record<string, string> = {
	Write: "file_path",
	Edit: "file_path",
	MultiEdit: "file_path",
	NotebookEdit: "notebook_path",
};

/** Matches `.helmor/plans/` anywhere in an absolute/relative path. */
const PLAN_DIR_RE = /(?:^|\/)\.helmor\/plans\//;

/**
 * Plan-mode write gate. In `permissionMode === "plan"`, file-mutating tools
 * (Write/Edit/MultiEdit/NotebookEdit) are denied unless their target path is
 * under `.helmor/plans/`. Every other tool returns "allow" (the caller falls
 * through to its normal permission flow — so Bash/reads are unchanged).
 */
export function planModeWriteDecision(
	toolName: string,
	input: Record<string, unknown>,
	cwd?: string,
): "deny" | "allow" {
	const field = WRITE_TOOL_PATH_FIELDS[toolName];
	if (!field) return "allow";
	const raw = input[field];
	if (typeof raw !== "string" || !raw.trim()) return "deny";
	const resolved = cwd ? resolve(cwd, raw) : raw;
	return PLAN_DIR_RE.test(resolved) ? "allow" : "deny";
}
```

- [ ] **Step 3: Run the helper tests — confirm PASS.** `cd sidecar && bun test src/claude-session-manager.test.ts`.

- [ ] **Step 4: Insert the gate in `canUseTool`.** In `sidecar/src/claude-session-manager.ts`, between the `ExitPlanMode` intercept (ends ~line 636) and the generic `permissionRequest` (`const permissionId = options.toolUseID;` ~line 637), insert. `permissionMode` (destructured ~line 377) and `cwd` (~line 375) are in scope:
```ts
					// Plan-mode read-only gate: in plan mode, deny file mutations
					// outside `.helmor/plans/`. Bash and all other tools fall
					// through to the normal permission request below.
					if (
						permissionMode === "plan" &&
						planModeWriteDecision(
							_toolName,
							input as Record<string, unknown>,
							cwd,
						) === "deny"
					) {
						return {
							behavior: "deny" as const,
							message:
								"Plan mode is read-only outside `.helmor/plans/`. Write the plan " +
								"to a `.helmor/plans/<slug>.mdx` file, or exit plan mode to make changes.",
						};
					}
```
(Match the surrounding indentation exactly — read the lines around 636 first.)

- [ ] **Step 5: Typecheck sidecar + run full sidecar tests.** `cd sidecar && bunx tsc --noEmit` (or `bun run typecheck` at repo root which covers sidecar); `cd sidecar && bun test`. Confirm clean/PASS.

- [ ] **Step 6: Commit.**
```bash
git add sidecar/src/claude-session-manager.ts sidecar/src/claude-session-manager.test.ts
git commit -m "feat(sidecar): plan mode denies file writes outside .helmor/plans"
```

---

## Task F: Inline "Plan updated — open" trigger on agent plan edits

**Files:** `src/features/panel/message-components/content-parts.tsx`, `src/features/panel/message-components/assistant-message.tsx`, a test.

Detect, at render time, an assistant tool-call (`Write`/`Edit`/`MultiEdit`) whose `args.file_path` is an MDX plan path, and render an inline "Plan updated — open" card after that tool call. (Initial creation is a separate `plan-review` part rendered by `PlanReviewCard`, so this only fires on edits.)

- [ ] **Step 1: Add `PlanUpdatedTrigger`.** In `src/features/panel/message-components/content-parts.tsx`, add (read the file's existing imports first — `dispatchOpenPlan`, `planSlugFromPath`, `isMdxPlanPath`, `useSettings`, `useFileLinkContext`, `ClipboardList` are likely already imported; add `usePlanList` from `@/features/plan-viewer/use-plan`):
```tsx
export function PlanUpdatedTrigger({ planFilePath }: { planFilePath: string }) {
	const { settings } = useSettings();
	const { sessionId } = useFileLinkContext();
	const planningEnabled = settings.mdxPlanningEnabled;
	const slug = planSlugFromPath(planFilePath);
	const { data: plans } = usePlanList(planningEnabled ? sessionId : null);
	if (!planningEnabled || !slug) return null;
	const title = plans?.find((p) => p.slug === slug)?.title ?? slug;
	return (
		<div className="my-1 flex items-center gap-2.5 rounded-xl border-[1.5px] border-border/70 bg-background/60 px-3.5 py-2">
			<ClipboardList className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
			<span className="min-w-0 flex-1 truncate text-ui leading-5 text-foreground">
				Plan updated — {title}
			</span>
			<button
				type="button"
				onClick={() => dispatchOpenPlan({ slug, sessionId })}
				className="shrink-0 cursor-pointer rounded-md border border-border/70 bg-background px-2.5 py-1 text-small font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
			>
				Open
			</button>
		</div>
	);
}
```

- [ ] **Step 2: Render it in the tool-call branch.** In `src/features/panel/message-components/assistant-message.tsx`, find the `isToolCallPart(part)` branch (~lines 256-288) that returns `<AssistantToolCall .../>`. Read it to get the exact prop names it passes. Wrap the return in a `Fragment` and append the trigger when the tool-call is an MDX-plan write:
```tsx
const isPlanWrite =
	(part.toolName === "Write" ||
		part.toolName === "Edit" ||
		part.toolName === "MultiEdit") &&
	isMdxPlanPath(
		typeof part.args.file_path === "string" ? part.args.file_path : null,
	);
return (
	<Fragment key={key}>
		{/* existing <AssistantToolCall .../> exactly as before, minus its key */}
		{isPlanWrite ? (
			<PlanUpdatedTrigger planFilePath={part.args.file_path as string} />
		) : null}
	</Fragment>
);
```
Add imports: `Fragment` from `react`; `isMdxPlanPath` from `@/lib/plan-review`; `PlanUpdatedTrigger` from `./content-parts` (next to the existing `PlanReviewCard` import). Move the existing `key` to the `Fragment`. Preserve every prop currently passed to `AssistantToolCall`.

- [ ] **Step 3: Test.** Create `src/features/panel/message-components/plan-updated-trigger.test.tsx`. Mock `usePlanList`/`useSettings` like `plan-link-strip.test.tsx` does. Render `PlanUpdatedTrigger` directly:
```tsx
// mock usePlanList → [{slug:"foo",title:"Foo plan",...}], useSettings → { mdxPlanningEnabled: true }, useFileLinkContext → { sessionId: "s1" }
it("renders title + Open and dispatches open-plan", () => { /* assert "Plan updated — Foo plan", click Open → helmor:open-plan {slug:"foo",sessionId:"s1"} */ });
it("renders nothing when planning disabled", () => { /* mdxPlanningEnabled:false → null */ });
it("renders nothing for a non-plan path", () => { /* planFilePath without .helmor/plans → slug null → null */ });
```
Mock `@/features/panel/message-components/file-link-context`'s `useFileLinkContext` to return `{ sessionId: "s1" }` (read how other tests handle it; if it needs a provider, wrap or mock the module).
Run `bun x vitest run src/features/panel/message-components/plan-updated-trigger.test.tsx` — confirm PASS.

- [ ] **Step 4: Typecheck + panel tests.** `bun run typecheck`; `bun x vitest run src/features/panel`. Confirm clean/PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/features/panel/message-components/content-parts.tsx src/features/panel/message-components/assistant-message.tsx src/features/panel/message-components/plan-updated-trigger.test.tsx
git commit -m "feat(panel): inline 'Plan updated' trigger when the agent edits a plan"
```

---

## Task G: Phase-2 verification

- [ ] `bun run typecheck` — clean.
- [ ] `bun x vitest run src/features/composer src/features/shortcuts src/features/panel` — PASS.
- [ ] `cd sidecar && bun test` — PASS.
- [ ] `bun x biome check` on touched files — clean.
- [ ] Manual smoke (`bun run dev`): (a) focus composer, Shift+Tab toggles plan mode and the composer border turns dashed/amber; (b) in plan mode, the agent can read + write the plan file but a Write to a source file is denied; (c) when the agent edits an existing plan, an inline "Plan updated — Open" card appears in that message.

## Notes / limitations
- Bash is intentionally NOT gated in plan mode (user choice) — the per-command permission prompt still applies. So plan mode is read-only for the structured Write/Edit tools, not airtight against shell writes.
- The inline trigger's title may briefly show the slug until `usePlanList` refetches after the `planFileChanged` watcher fires.

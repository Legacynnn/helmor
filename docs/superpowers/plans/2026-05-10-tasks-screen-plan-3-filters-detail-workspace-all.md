# Tasks Screen — Plan 3: Filters, Detail Panel, Workspace Integration, All-Repos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the v1 Tasks screen feature: per-tab filter dropdowns with persisted state, an inline Linear team picker for the empty state, a slide-in detail panel for items, workspace integration ("Open workspace" / "Start workspace from this"), and an "All repos" mode that aggregates across all connected repositories.

**Architecture:** Filter state stored as a single JSON blob in the `settings` key/value table (key `tasks.filters.v1`), debounced on write. Detail panel reuses the slot-based layout pattern from `src/features/source-detail/common.tsx`. Workspace lookups live in `models/workspaces.rs` (`find_workspace_for_linear_task_id`, `find_workspace_for_pr_url`). "All repos" mode fans out the existing single-repo queries on the client and tags each row with a repo badge.

**Tech Stack:** Same as previous plans — Rust + Tauri commands, React 19, TanStack Query, vitest, Lexical/streamdown for markdown.

**Spec:** `docs/superpowers/specs/2026-05-10-tasks-screen-design.md`
**Previous plans:** Plan 1 (foundation, shipped) and Plan 2 (core screen, shipped).

---

## File Structure

**Create:**
- `src-tauri/src/forge/linear/types.rs` — extend with `LinearIssueDetail` (issue + markdown description) — extension only, not new file
- `src/features/tasks/components/linear-team-picker.tsx` — inline popover (empty-state)
- `src/features/tasks/components/detail-panel.tsx` — slide-in shell + variants
- `src/features/tasks/components/filter-dropdowns.tsx` — three tab-scoped dropdowns
- `src/features/tasks/components/repo-badge.tsx` — small badge for "All repos" mode rows
- `src/features/tasks/hooks/use-tasks-filters.ts` — load/save filter blob
- `src/features/tasks/hooks/use-detail-keyboard.ts` — Esc / ↑↓ / Cmd+O
- `src/features/tasks/types.ts` — extend with `Filters` + `LastView` + applied-filter shapes

**Modify:**
- `src-tauri/src/forge/linear/queries.rs` — `TASK_DETAIL_QUERY`, `fetch_task`, parser tests
- `src-tauri/src/commands/linear_commands.rs` — `linear_get_task`
- `src-tauri/src/models/workspaces.rs` — `find_workspace_for_linear_task_id`, `find_workspace_for_pr_url`, `set_workspace_linear_task_id`
- `src-tauri/src/commands/workspace_commands.rs` (or wherever workspace commands live) — three new commands wrapping the model helpers
- `src-tauri/src/lib.rs` — register the new commands
- `src/lib/api.ts` — typed wrappers + new types
- `src/lib/query-client.ts` — `helmorQueryKeys.tasks.detail(...)`, `linearTaskDetail(...)`
- `src/features/tasks/container.tsx` — filter wiring, detail-panel mounting, all-repos branch, last-view restoration
- `src/features/tasks/components/tab-bar.tsx` — filter slot to the right of tabs with divider
- `src/features/tasks/components/item-list.tsx` — `onSelect(item)` callback, current selection prop, `allRepos` prop to show repo badge
- `src/features/tasks/components/item-row.tsx` — optional repo badge, selected-state highlight, `onSelect` instead of `openUrl`
- `src/features/tasks/components/repo-switcher.tsx` — include "All repos" virtual entry
- `src/features/tasks/hooks/use-tasks-query.ts` — support `repoId: "all"`: fan-out across `repos` arg

---

## Task 1: `linear_get_task` backend + frontend wrapper

**Files:**
- Modify: `src-tauri/src/forge/linear/types.rs`
- Modify: `src-tauri/src/forge/linear/queries.rs`
- Modify: `src-tauri/src/commands/linear_commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Add `LinearIssueDetail` to `types.rs`**

Append to `src-tauri/src/forge/linear/types.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearIssueDetail {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub url: String,
    pub priority: i32,
    pub updated_at: String,
    pub state: LinearIssueState,
    pub assignee: Option<LinearAssignee>,
    pub labels: LinearLabelConnection,
    /// Markdown description. May be empty string.
    pub description: String,
}
```

- [ ] **Step 2: Add the query + parser + tests to `queries.rs`**

Append (before the `#[cfg(test)]` mod tests block):

```rust
pub const TASK_DETAIL_QUERY: &str = r#"
query Task($id: String!) {
  issue(id: $id) {
    id
    identifier
    title
    url
    priority
    updatedAt
    description
    state { id name type color }
    assignee { id name avatarUrl }
    labels { nodes { id name color } }
  }
}
"#;

#[derive(Debug, Deserialize)]
struct TaskEnvelope {
    issue: Option<super::types::LinearIssueDetail>,
}

pub fn parse_task(data: Value) -> Result<super::types::LinearIssueDetail, LinearError> {
    let env: TaskEnvelope = serde_json::from_value(data)
        .map_err(|e| LinearError::Parse(format!("task: {e}")))?;
    env.issue.ok_or_else(|| LinearError::Parse("issue not found".into()))
}

pub async fn fetch_task(
    api_key: &str,
    id: &str,
) -> Result<super::types::LinearIssueDetail, LinearError> {
    let data: Value = graphql(
        LINEAR_API_URL,
        api_key,
        TASK_DETAIL_QUERY,
        json!({ "id": id }),
    )
    .await?;
    parse_task(data)
}
```

In the `#[cfg(test)] mod tests` block, append:

```rust
    #[test]
    fn parses_task_detail() {
        let data = json!({
            "issue": {
                "id": "i1",
                "identifier": "SUPER-187",
                "title": "Fix something",
                "url": "https://linear.app/x/issue/SUPER-187",
                "priority": 2,
                "updatedAt": "2026-03-23T10:00:00Z",
                "description": "## Steps\n- Repro\n- Fix",
                "state": { "id": "s1", "name": "In Progress", "type": "started", "color": "#5e6ad2" },
                "assignee": null,
                "labels": { "nodes": [] }
            }
        });
        let task = parse_task(data).expect("parse");
        assert_eq!(task.identifier, "SUPER-187");
        assert!(task.description.contains("Repro"));
    }

    #[test]
    fn parses_task_detail_missing_issue() {
        let data = json!({ "issue": null });
        let err = parse_task(data).expect_err("should fail");
        assert!(matches!(err, LinearError::Parse(_)));
    }
```

- [ ] **Step 3: Run tests**

```bash
cd src-tauri && cargo test --lib forge::linear::queries 2>&1 | tail -10
```

Expected: 7 passed (5 prior + 2 new).

- [ ] **Step 4: Add the command in `linear_commands.rs`**

Extend the existing `use` line with `LinearIssueDetail`:

```rust
use crate::forge::linear::types::{LinearAuthStatus, LinearIssue, LinearIssueDetail, LinearTeam};
```

Append the command:

```rust
#[tauri::command]
pub async fn linear_get_task(id: String) -> CmdResult<LinearIssueDetail> {
    let key = run_blocking(auth::get_api_key)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Linear API key not configured"))?;
    queries::fetch_task(&key, &id)
        .await
        .map_err(|e| anyhow::anyhow!(e.to_string()).into())
}
```

Register in `lib.rs`:

```
        crate::commands::linear_commands::linear_get_task,
```

(Alphabetical position among existing Linear commands.)

- [ ] **Step 5: Frontend types + wrapper in `src/lib/api.ts`**

Find the Linear block. Add the new type after `LinearIssue`:

```ts
export type LinearIssueDetail = LinearIssue & {
	description: string;
};
```

Add the wrapper alphabetically among Linear helpers:

```ts
export async function linearGetTask(id: string): Promise<LinearIssueDetail> {
	return await invoke<LinearIssueDetail>("linear_get_task", { id });
}
```

- [ ] **Step 6: Verify**

```bash
cd src-tauri && cargo clippy --all-targets -- -D warnings 2>&1 | tail -5
bun run typecheck 2>&1 | tail -10
bun x biome check src/lib/api.ts 2>&1 | tail -5
```

All clean.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/forge/linear/ src-tauri/src/commands/linear_commands.rs src-tauri/src/lib.rs src/lib/api.ts
git commit -m "feat(linear): linear_get_task command with description"
```

---

## Task 2: Workspace lookup model + commands

**Files:**
- Modify: `src-tauri/src/models/workspaces.rs`
- Modify: `src-tauri/src/commands/` — find the existing workspace command file or add to an appropriate one (search for existing `#[tauri::command]` functions touching workspaces).
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Add three loader/setter helpers to `src-tauri/src/models/workspaces.rs`**

Find a section near the other workspace queries (e.g., near `load_workspace_record_by_id`). Add:

```rust
pub fn find_workspace_for_linear_task_id(task_id: &str) -> Result<Option<String>> {
    let connection = db::read_conn()?;
    let mut statement = connection
        .prepare(
            "SELECT id FROM workspaces \
             WHERE linear_task_id = ?1 \
               AND COALESCE(state, 'active') != 'archived' \
             ORDER BY updated_at DESC LIMIT 1",
        )
        .context("prepare find_workspace_for_linear_task_id")?;
    let mut rows = statement.query([task_id]).context("query")?;
    if let Some(row) = rows.next().context("next")? {
        Ok(Some(row.get::<_, String>(0)?))
    } else {
        Ok(None)
    }
}

pub fn find_workspace_for_pr_url(pr_url: &str) -> Result<Option<String>> {
    let connection = db::read_conn()?;
    let mut statement = connection
        .prepare(
            "SELECT id FROM workspaces \
             WHERE pr_url = ?1 \
               AND COALESCE(state, 'active') != 'archived' \
             ORDER BY updated_at DESC LIMIT 1",
        )
        .context("prepare find_workspace_for_pr_url")?;
    let mut rows = statement.query([pr_url]).context("query")?;
    if let Some(row) = rows.next().context("next")? {
        Ok(Some(row.get::<_, String>(0)?))
    } else {
        Ok(None)
    }
}

pub fn set_workspace_linear_task_id(workspace_id: &str, task_id: Option<&str>) -> Result<()> {
    let connection = db::write_conn()?;
    connection
        .execute(
            "UPDATE workspaces SET linear_task_id = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![task_id, workspace_id],
        )
        .with_context(|| format!("Failed to set linear_task_id on workspace {workspace_id}"))?;
    Ok(())
}
```

If the existing file uses different conventions for `db::read_conn` / `write_conn`, match them. Confirm import path by reading surrounding helpers (the existing `update_repository_*` family in `repos.rs` is the canonical reference).

- [ ] **Step 2: Add the Tauri commands**

Create `src-tauri/src/commands/tasks_workspace_commands.rs`:

```rust
use super::common::{run_blocking, CmdResult};
use crate::models::workspaces;

#[tauri::command]
pub async fn tasks_find_workspace_for_linear_task(
    task_id: String,
) -> CmdResult<Option<String>> {
    run_blocking(move || workspaces::find_workspace_for_linear_task_id(&task_id)).await
}

#[tauri::command]
pub async fn tasks_find_workspace_for_pr_url(pr_url: String) -> CmdResult<Option<String>> {
    run_blocking(move || workspaces::find_workspace_for_pr_url(&pr_url)).await
}

#[tauri::command]
pub async fn tasks_set_workspace_linear_task(
    workspace_id: String,
    task_id: Option<String>,
) -> CmdResult<()> {
    run_blocking(move || {
        workspaces::set_workspace_linear_task_id(&workspace_id, task_id.as_deref())
    })
    .await
}
```

Register the module in `src-tauri/src/commands/mod.rs`:

```
pub mod tasks_workspace_commands;
```

Register in `src-tauri/src/lib.rs` `generate_handler![...]`:

```
        crate::commands::tasks_workspace_commands::tasks_find_workspace_for_linear_task,
        crate::commands::tasks_workspace_commands::tasks_find_workspace_for_pr_url,
        crate::commands::tasks_workspace_commands::tasks_set_workspace_linear_task,
```

- [ ] **Step 3: Verify + frontend wrappers**

```bash
cd src-tauri && cargo clippy --all-targets -- -D warnings 2>&1 | tail -10
```

Append to `src/lib/api.ts`:

```ts
export async function tasksFindWorkspaceForLinearTask(taskId: string): Promise<string | null> {
	return await invoke<string | null>("tasks_find_workspace_for_linear_task", { taskId });
}

export async function tasksFindWorkspaceForPrUrl(prUrl: string): Promise<string | null> {
	return await invoke<string | null>("tasks_find_workspace_for_pr_url", { prUrl });
}

export async function tasksSetWorkspaceLinearTask(
	workspaceId: string,
	taskId: string | null,
): Promise<void> {
	await invoke<void>("tasks_set_workspace_linear_task", { workspaceId, taskId });
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
bun run typecheck 2>&1 | tail -5
bun x biome check src/lib/api.ts 2>&1 | tail -5
git add src-tauri/src/models/workspaces.rs src-tauri/src/commands/ src-tauri/src/lib.rs src/lib/api.ts
git commit -m "feat(tasks): workspace lookups by Linear task and PR URL"
```

---

## Task 3: Filter persistence layer

**Files:**
- Modify: `src/features/tasks/types.ts` — add filter shapes
- Create: `src/features/tasks/hooks/use-tasks-filters.ts`

The filters blob is owned entirely by the frontend. No new Rust commands — we use existing settings get/set commands.

- [ ] **Step 1: Confirm existing settings command surface**

Inspect `src/lib/api.ts` for existing wrappers backed by `load_setting_value` / `upsert_setting_value`. If a general-purpose pair like `getSetting(key)` / `setSetting(key, value)` already exists, use it. If not, add a thin pair:

```ts
// Append to api.ts if missing
export async function getSettingJson<T>(key: string): Promise<T | null> {
	return await invoke<T | null>("get_setting_json", { key });
}

export async function setSettingJson<T>(key: string, value: T): Promise<void> {
	await invoke<void>("set_setting_json", { key, value });
}
```

…and the matching Rust commands in `src-tauri/src/commands/system_commands.rs` (alongside `read_query_cache` etc.):

```rust
#[tauri::command]
pub async fn get_setting_json(key: String) -> CmdResult<Option<serde_json::Value>> {
    run_blocking(move || crate::models::settings::load_setting_json::<serde_json::Value>(&key))
        .await
}

#[tauri::command]
pub async fn set_setting_json(key: String, value: serde_json::Value) -> CmdResult<()> {
    run_blocking(move || crate::models::settings::upsert_setting_json(&key, &value)).await
}
```

Register in `lib.rs`. Skip this step entirely if equivalents already exist.

- [ ] **Step 2: Extend `src/features/tasks/types.ts`**

```ts
export type LinearStatusFilter =
	| "all"
	| "backlog"
	| "unstarted"
	| "started"
	| "in-review";

export type PrStateFilter = "open" | "draft" | "merged" | "closed";
export type IssueStateFilter = "open" | "closed";

export type AssigneeFilter = "any" | "me" | string; // string = specific login

export type LinearFilters = {
	status: LinearStatusFilter;
	assignee: AssigneeFilter;
	search: string;
};

export type PrFilters = {
	state: PrStateFilter;
	assignee: AssigneeFilter;
	linkedToIssue: boolean;
	search: string;
};

export type IssueFilters = {
	state: IssueStateFilter;
	labels: string[]; // names
	assignee: AssigneeFilter;
	search: string;
};

export type PerTabFilters = {
	tasks: LinearFilters;
	prs: PrFilters;
	issues: IssueFilters;
};

export type TasksLastView = {
	repoId: string | "all" | null;
	tab: TasksTab;
};

export const DEFAULT_FILTERS: PerTabFilters = {
	tasks: { status: "all", assignee: "any", search: "" },
	prs: { state: "open", assignee: "any", linkedToIssue: false, search: "" },
	issues: { state: "open", labels: [], assignee: "any", search: "" },
};
```

- [ ] **Step 3: `src/features/tasks/hooks/use-tasks-filters.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { getSettingJson, setSettingJson } from "@/lib/api";
import {
	DEFAULT_FILTERS,
	type PerTabFilters,
	type TasksLastView,
	type TasksTab,
} from "../types";

const FILTER_KEY = "tasks.filters.v1";
const COLLAPSED_KEY = "tasks.collapsedGroups.v1";
const LAST_VIEW_KEY = "tasks.lastView.v1";

const DEBOUNCE_MS = 500;

type RepoScope = string | "all";

type FiltersBlob = Partial<Record<RepoScope, Partial<PerTabFilters>>>;
type CollapsedBlob = Partial<Record<RepoScope, Partial<Record<TasksTab, string[]>>>>;

function deepMerge(...sources: PerTabFilters[]): PerTabFilters {
	return sources.reduce<PerTabFilters>(
		(acc, src) => ({
			tasks: { ...acc.tasks, ...src.tasks },
			prs: { ...acc.prs, ...src.prs },
			issues: { ...acc.issues, ...src.issues },
		}),
		DEFAULT_FILTERS,
	);
}

export function useTasksFilters(scope: RepoScope | null) {
	const [blob, setBlob] = useState<FiltersBlob>({});
	const [collapsedBlob, setCollapsedBlob] = useState<CollapsedBlob>({});
	const [lastView, setLastView] = useState<TasksLastView | null>(null);
	const [hydrated, setHydrated] = useState(false);
	const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const collapsedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastViewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const [filters, collapsed, last] = await Promise.all([
				getSettingJson<FiltersBlob>(FILTER_KEY),
				getSettingJson<CollapsedBlob>(COLLAPSED_KEY),
				getSettingJson<TasksLastView>(LAST_VIEW_KEY),
			]);
			if (cancelled) return;
			if (filters) setBlob(filters);
			if (collapsed) setCollapsedBlob(collapsed);
			if (last) setLastView(last);
			setHydrated(true);
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const filtersForScope: PerTabFilters = scope
		? deepMerge(DEFAULT_FILTERS, (blob[scope] as PerTabFilters | undefined) ?? DEFAULT_FILTERS)
		: DEFAULT_FILTERS;

	const setFilters = useCallback(
		(updater: (prev: PerTabFilters) => PerTabFilters) => {
			if (!scope) return;
			setBlob((prev) => {
				const current = (prev[scope] as PerTabFilters | undefined) ?? DEFAULT_FILTERS;
				const next = updater(current);
				const merged = { ...prev, [scope]: next };
				if (writeTimer.current) clearTimeout(writeTimer.current);
				writeTimer.current = setTimeout(() => {
					void setSettingJson(FILTER_KEY, merged);
				}, DEBOUNCE_MS);
				return merged;
			});
		},
		[scope],
	);

	const collapsedGroups = (scope && collapsedBlob[scope]) || {};

	const setCollapsedGroups = useCallback(
		(tab: TasksTab, groupKey: string, collapsed: boolean) => {
			if (!scope) return;
			setCollapsedBlob((prev) => {
				const forScope = (prev[scope] ?? {}) as Partial<Record<TasksTab, string[]>>;
				const currentList = forScope[tab] ?? [];
				const nextList = collapsed
					? Array.from(new Set([...currentList, groupKey]))
					: currentList.filter((k) => k !== groupKey);
				const merged = {
					...prev,
					[scope]: { ...forScope, [tab]: nextList },
				};
				if (collapsedTimer.current) clearTimeout(collapsedTimer.current);
				collapsedTimer.current = setTimeout(() => {
					void setSettingJson(COLLAPSED_KEY, merged);
				}, DEBOUNCE_MS);
				return merged;
			});
		},
		[scope],
	);

	const saveLastView = useCallback((next: TasksLastView) => {
		setLastView(next);
		if (lastViewTimer.current) clearTimeout(lastViewTimer.current);
		lastViewTimer.current = setTimeout(() => {
			void setSettingJson(LAST_VIEW_KEY, next);
		}, DEBOUNCE_MS);
	}, []);

	return {
		filters: filtersForScope,
		setFilters,
		collapsedGroups,
		setCollapsedGroups,
		lastView,
		saveLastView,
		hydrated,
	};
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
bun run typecheck 2>&1 | tail -10
bun x biome check src/features/tasks/ 2>&1 | tail -5
git add src-tauri/ src/lib/api.ts src/features/tasks/types.ts src/features/tasks/hooks/use-tasks-filters.ts
git commit -m "feat(tasks): per-repo persisted filter and view state"
```

If you skipped adding `getSettingJson`/`setSettingJson` because they already existed, only stage what changed.

---

## Task 4: Filter dropdowns + filter application

**Files:**
- Create: `src/features/tasks/components/filter-dropdowns.tsx`
- Modify: `src/features/tasks/components/tab-bar.tsx`
- Modify: `src/features/tasks/container.tsx`
- Modify: `src/features/tasks/hooks/use-tasks-query.ts`

- [ ] **Step 1: Filter UI — `src/features/tasks/components/filter-dropdowns.tsx`**

Build three components, one per tab, each rendering a row of `DropdownMenu` triggers. Each shows the active filter value in the trigger label.

```tsx
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type {
	AssigneeFilter,
	IssueFilters,
	LinearFilters,
	LinearStatusFilter,
	PrFilters,
	PrStateFilter,
	IssueStateFilter,
} from "../types";

const LINEAR_STATUS_OPTIONS: { key: LinearStatusFilter; label: string }[] = [
	{ key: "all", label: "All" },
	{ key: "backlog", label: "Backlog" },
	{ key: "unstarted", label: "Unstarted" },
	{ key: "started", label: "In Progress" },
	{ key: "in-review", label: "In Review" },
];

const PR_STATE_OPTIONS: { key: PrStateFilter; label: string }[] = [
	{ key: "open", label: "Open" },
	{ key: "draft", label: "Draft" },
	{ key: "merged", label: "Merged" },
	{ key: "closed", label: "Closed" },
];

const ISSUE_STATE_OPTIONS: { key: IssueStateFilter; label: string }[] = [
	{ key: "open", label: "Open" },
	{ key: "closed", label: "Closed" },
];

const ASSIGNEE_OPTIONS: { key: AssigneeFilter; label: string }[] = [
	{ key: "any", label: "Anyone" },
	{ key: "me", label: "Me" },
];

function FilterButton({
	label,
	value,
	children,
}: {
	label: string;
	value: string;
	children: React.ReactNode;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="sm" className="gap-1 px-2">
					<span className="text-muted-foreground">{label}:</span>
					<span>{value}</span>
					<ChevronDown className="size-3" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">{children}</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function LinearFilterRow({
	filters,
	onChange,
}: {
	filters: LinearFilters;
	onChange: (next: LinearFilters) => void;
}) {
	return (
		<div className="flex items-center gap-1">
			<FilterButton
				label="Status"
				value={LINEAR_STATUS_OPTIONS.find((o) => o.key === filters.status)?.label ?? "All"}
			>
				{LINEAR_STATUS_OPTIONS.map((o) => (
					<DropdownMenuItem
						key={o.key}
						onClick={() => onChange({ ...filters, status: o.key })}
					>
						{o.label}
					</DropdownMenuItem>
				))}
			</FilterButton>
			<FilterButton
				label="Assignee"
				value={
					ASSIGNEE_OPTIONS.find((o) => o.key === filters.assignee)?.label ??
					filters.assignee
				}
			>
				{ASSIGNEE_OPTIONS.map((o) => (
					<DropdownMenuItem
						key={o.key}
						onClick={() => onChange({ ...filters, assignee: o.key })}
					>
						{o.label}
					</DropdownMenuItem>
				))}
			</FilterButton>
			<Input
				placeholder="Search…"
				value={filters.search}
				onChange={(e) => onChange({ ...filters, search: e.target.value })}
				className="h-7 w-32"
			/>
		</div>
	);
}

export function PrFilterRow({
	filters,
	onChange,
}: {
	filters: PrFilters;
	onChange: (next: PrFilters) => void;
}) {
	return (
		<div className="flex items-center gap-1">
			<FilterButton
				label="State"
				value={PR_STATE_OPTIONS.find((o) => o.key === filters.state)?.label ?? "Open"}
			>
				{PR_STATE_OPTIONS.map((o) => (
					<DropdownMenuItem
						key={o.key}
						onClick={() => onChange({ ...filters, state: o.key })}
					>
						{o.label}
					</DropdownMenuItem>
				))}
			</FilterButton>
			<FilterButton
				label="Assignee"
				value={
					ASSIGNEE_OPTIONS.find((o) => o.key === filters.assignee)?.label ??
					filters.assignee
				}
			>
				{ASSIGNEE_OPTIONS.map((o) => (
					<DropdownMenuItem
						key={o.key}
						onClick={() => onChange({ ...filters, assignee: o.key })}
					>
						{o.label}
					</DropdownMenuItem>
				))}
			</FilterButton>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="sm" className="gap-1 px-2">
						<span className="text-muted-foreground">Linked:</span>
						<span>{filters.linkedToIssue ? "Yes" : "Any"}</span>
						<ChevronDown className="size-3" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					<DropdownMenuCheckboxItem
						checked={filters.linkedToIssue}
						onCheckedChange={(checked) =>
							onChange({ ...filters, linkedToIssue: checked === true })
						}
					>
						Linked to issue
					</DropdownMenuCheckboxItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<Input
				placeholder="Search…"
				value={filters.search}
				onChange={(e) => onChange({ ...filters, search: e.target.value })}
				className="h-7 w-32"
			/>
		</div>
	);
}

export function IssueFilterRow({
	filters,
	onChange,
}: {
	filters: IssueFilters;
	onChange: (next: IssueFilters) => void;
}) {
	return (
		<div className="flex items-center gap-1">
			<FilterButton
				label="State"
				value={ISSUE_STATE_OPTIONS.find((o) => o.key === filters.state)?.label ?? "Open"}
			>
				{ISSUE_STATE_OPTIONS.map((o) => (
					<DropdownMenuItem
						key={o.key}
						onClick={() => onChange({ ...filters, state: o.key })}
					>
						{o.label}
					</DropdownMenuItem>
				))}
			</FilterButton>
			<FilterButton
				label="Assignee"
				value={
					ASSIGNEE_OPTIONS.find((o) => o.key === filters.assignee)?.label ??
					filters.assignee
				}
			>
				{ASSIGNEE_OPTIONS.map((o) => (
					<DropdownMenuItem
						key={o.key}
						onClick={() => onChange({ ...filters, assignee: o.key })}
					>
						{o.label}
					</DropdownMenuItem>
				))}
			</FilterButton>
			<Input
				placeholder="Search…"
				value={filters.search}
				onChange={(e) => onChange({ ...filters, search: e.target.value })}
				className="h-7 w-32"
			/>
		</div>
	);
}
```

- [ ] **Step 2: Update `tab-bar.tsx` to render the active tab's filter row**

Add a slot to the right of the tabs (with a divider). The active tab's filters render there:

```tsx
import type { LinearFilters, PrFilters, IssueFilters, TasksTab } from "../types";
import { LinearFilterRow, PrFilterRow, IssueFilterRow } from "./filter-dropdowns";

const TABS: { key: TasksTab; label: string }[] = [
	{ key: "tasks", label: "Tasks" },
	{ key: "prs", label: "PRs" },
	{ key: "issues", label: "Issues" },
];

export function TabBar({
	active,
	onChange,
	linearFilters,
	prFilters,
	issueFilters,
	onLinearFiltersChange,
	onPrFiltersChange,
	onIssueFiltersChange,
}: {
	active: TasksTab;
	onChange: (tab: TasksTab) => void;
	linearFilters: LinearFilters;
	prFilters: PrFilters;
	issueFilters: IssueFilters;
	onLinearFiltersChange: (next: LinearFilters) => void;
	onPrFiltersChange: (next: PrFilters) => void;
	onIssueFiltersChange: (next: IssueFilters) => void;
}) {
	return (
		<div className="flex items-center gap-2 text-xs">
			<div className="flex items-center gap-1">
				{TABS.map((tab) => (
					<button
						key={tab.key}
						type="button"
						onClick={() => onChange(tab.key)}
						className={
							active === tab.key
								? "cursor-pointer rounded bg-muted px-2 py-1 font-medium"
								: "cursor-pointer rounded px-2 py-1 text-muted-foreground hover:bg-muted/50"
						}
					>
						{tab.label}
					</button>
				))}
			</div>
			<div className="h-4 w-px bg-border" />
			{active === "tasks" ? (
				<LinearFilterRow filters={linearFilters} onChange={onLinearFiltersChange} />
			) : active === "prs" ? (
				<PrFilterRow filters={prFilters} onChange={onPrFiltersChange} />
			) : (
				<IssueFilterRow filters={issueFilters} onChange={onIssueFiltersChange} />
			)}
		</div>
	);
}
```

- [ ] **Step 3: Apply filters client-side in `use-tasks-query.ts`**

Extend the hook signature with `filters: PerTabFilters` and apply them to `items` BEFORE returning:

```ts
// In useTasksQuery, after computing items:
const filtered = applyFilters(args.tab, items, args.filters);
return { items: filtered, ... };
```

`applyFilters` lives next to the hook (small helper, no need for separate file):

```ts
function applyFilters(
	tab: TasksTab,
	items: TaskListItem[],
	filters: PerTabFilters,
): TaskListItem[] {
	const lowered = (
		tab === "tasks"
			? filters.tasks.search
			: tab === "prs"
				? filters.prs.search
				: filters.issues.search
	)
		.trim()
		.toLowerCase();

	let result = items;

	if (tab === "tasks") {
		const { status, assignee } = filters.tasks;
		if (status !== "all") {
			result = result.filter((i) =>
				status === "in-review" ? i.status.key === "started" : i.status.key === status,
			);
		}
		if (assignee !== "any") {
			result = result.filter((i) => i.assignee?.login === assignee);
		}
	} else if (tab === "prs") {
		const { state, assignee, linkedToIssue } = filters.prs;
		result = result.filter((i) => {
			if (state === "draft" && i.status.key !== "draft") return false;
			if (state === "open" && i.status.key !== "open" && i.status.key !== "draft")
				return false;
			if (state === "merged" && i.status.key !== "merged") return false;
			if (state === "closed" && i.status.key !== "closed") return false;
			if (assignee !== "any" && i.assignee?.login !== assignee) return false;
			if (linkedToIssue) {
				// Heuristic: title or labels reference an issue. Improve in a follow-up if needed.
				const hasRef = /#\d+/.test(i.title);
				if (!hasRef) return false;
			}
			return true;
		});
	} else {
		const { state, assignee, labels } = filters.issues;
		result = result.filter((i) => {
			if (state === "open" && i.status.key !== "open") return false;
			if (state === "closed" && i.status.key !== "closed") return false;
			if (assignee !== "any" && i.assignee?.login !== assignee) return false;
			if (labels.length > 0) {
				const itemLabels = new Set(i.labels.map((l) => l.name));
				if (!labels.every((name) => itemLabels.has(name))) return false;
			}
			return true;
		});
	}

	if (lowered) {
		result = result.filter((i) => i.title.toLowerCase().includes(lowered));
	}

	return result;
}
```

Note on "me": the adapter sets `assignee.login` to the assignee's name/login (Linear → name, GH → login). For a true "me" filter you'd need the user's identity. For Plan 3 v1, treat `"me"` as a no-op (showing nothing matches by default) OR look up the current GH login from `linear_get_auth_status` and `gh auth status`. The simplest correct thing: treat `"me"` as a special value handled in the container by resolving the current viewer before passing to `applyFilters`. Skip the resolution for v1 if it grows the task — leave a TODO comment and treat "me" as "any" for now.

- [ ] **Step 4: Container wiring**

In `src/features/tasks/container.tsx`, integrate `useTasksFilters`:

```ts
const filters = useTasksFilters(selectedRepoId);
```

Pass `filters.filters` into `useTasksQuery`. Pass the three setters into `TabBar`:

```tsx
<TabBar
	active={activeTab}
	onChange={(tab) => {
		setActiveTab(tab);
		filters.saveLastView({ repoId: selectedRepoId, tab });
	}}
	linearFilters={filters.filters.tasks}
	prFilters={filters.filters.prs}
	issueFilters={filters.filters.issues}
	onLinearFiltersChange={(next) =>
		filters.setFilters((prev) => ({ ...prev, tasks: next }))
	}
	onPrFiltersChange={(next) =>
		filters.setFilters((prev) => ({ ...prev, prs: next }))
	}
	onIssueFiltersChange={(next) =>
		filters.setFilters((prev) => ({ ...prev, issues: next }))
	}
/>
```

On mount (when `filters.hydrated` becomes true and `filters.lastView` is set), restore `selectedRepoId` and `activeTab`:

```tsx
useEffect(() => {
	if (!filters.hydrated || !filters.lastView) return;
	if (filters.lastView.repoId) setSelectedRepoId(filters.lastView.repoId);
	if (filters.lastView.tab) setActiveTab(filters.lastView.tab);
	// Run once on hydrate; intentionally narrow deps.
}, [filters.hydrated]);
```

Also call `filters.saveLastView` whenever `selectedRepoId` changes (mirror the tab handler).

- [ ] **Step 5: Hook up collapsed group state in `item-list.tsx`**

Extend `ItemList` to receive a `collapsedGroups: string[]` prop and `onToggleCollapse: (groupKey: string, collapsed: boolean) => void`. Replace the internal `useState` with these props.

The container wires it:
```tsx
<ItemList
	items={tasks.items}
	collapsedGroups={
		(filters.collapsedGroups[activeTab] as string[] | undefined) ?? []
	}
	onToggleCollapse={(key, collapsed) =>
		filters.setCollapsedGroups(activeTab, key, collapsed)
	}
/>
```

- [ ] **Step 6: Verify**

```bash
bun run typecheck 2>&1 | tail -15
bun x biome check src/features/tasks/ 2>&1 | tail -10
```

- [ ] **Step 7: Commit**

```bash
git add src/features/tasks/
git commit -m "feat(tasks): filter dropdowns with persisted state per tab and repo"
```

---

## Task 5: Linear team picker (empty state)

**Files:**
- Create: `src/features/tasks/components/linear-team-picker.tsx`
- Modify: `src/features/tasks/components/empty-states.tsx`

- [ ] **Step 1: `src/features/tasks/components/linear-team-picker.tsx`**

Inline popover-style picker that lists Linear teams and lets the user link one. On confirm, calls `linearSetRepoTeam` and invalidates the repositories query so the screen re-renders with `linearTeamId` set.

```tsx
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	type LinearTeam,
	linearListTeams,
	linearSetRepoTeam,
} from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";

export function LinearTeamPicker({ repoId }: { repoId: string }) {
	const qc = useQueryClient();
	const [open, setOpen] = useState(false);
	const teams = useQuery<LinearTeam[]>({
		queryKey: ["linear", "teams"],
		queryFn: linearListTeams,
		enabled: open,
		staleTime: 5 * 60_000,
	});

	const pick = async (teamId: string) => {
		await linearSetRepoTeam(repoId, teamId);
		await qc.invalidateQueries({ queryKey: helmorQueryKeys.repositories });
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<Button size="sm">Link Linear team</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="min-w-[200px]">
				{teams.isLoading ? (
					<DropdownMenuItem disabled>Loading…</DropdownMenuItem>
				) : teams.isError ? (
					<DropdownMenuItem disabled>Failed to load teams</DropdownMenuItem>
				) : (teams.data ?? []).length === 0 ? (
					<DropdownMenuItem disabled>No teams found</DropdownMenuItem>
				) : (
					(teams.data ?? []).map((team) => (
						<DropdownMenuItem
							key={team.id}
							onClick={() => void pick(team.id)}
						>
							{team.name} ({team.key})
						</DropdownMenuItem>
					))
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
```

- [ ] **Step 2: Update `EmptyLinkLinearTeam` in `empty-states.tsx`**

Replace the existing `onPickTeam` prop with `repoId` and embed the picker:

```tsx
import { LinearTeamPicker } from "./linear-team-picker";

export function EmptyLinkLinearTeam({ repoId }: { repoId: string }) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
			<p>Link a Linear team to this repository to see tasks.</p>
			<LinearTeamPicker repoId={repoId} />
		</div>
	);
}
```

Update the container in Task 4 (or here) to pass `repoId={selectedRepo.id}` instead of `onPickTeam`.

- [ ] **Step 3: Typecheck + commit**

```bash
bun run typecheck 2>&1 | tail -5
bun x biome check src/features/tasks/ 2>&1 | tail -5
git add src/features/tasks/
git commit -m "feat(tasks): inline Linear team picker for empty state"
```

---

## Task 6: Detail panel — slide-in shell + content variants

**Files:**
- Create: `src/features/tasks/components/detail-panel.tsx`
- Modify: `src/features/tasks/container.tsx`
- Modify: `src/features/tasks/components/item-list.tsx`
- Modify: `src/features/tasks/components/item-row.tsx`

The list+row no longer open URLs directly — they call `onSelect(item)`, and the container shows the detail panel on the right.

- [ ] **Step 1: Change row click to `onSelect`**

In `item-row.tsx`:
- Remove `openUrl` import and call
- Accept `onSelect: (item: TaskListItem) => void` and `isSelected: boolean` props
- The button click calls `onSelect(item)`
- Add `bg-muted/60` class when `isSelected` is true

In `item-list.tsx`:
- Accept `onSelectItem: (item: TaskListItem) => void` and `selectedKey: string | null`
- Pass `onSelect` + `isSelected={item.key === selectedKey}` to each row

- [ ] **Step 2: `src/features/tasks/components/detail-panel.tsx`**

```tsx
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
	type LinearIssueDetail,
	getInboxItemDetail,
	type InboxItemDetail,
	linearGetTask,
} from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";
import type { TaskListItem } from "../types";

const PANEL_WIDTH = 520;

export function DetailPanel({
	item,
	onClose,
	footerSlot,
}: {
	item: TaskListItem;
	onClose: () => void;
	footerSlot?: React.ReactNode;
}) {
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !e.defaultPrevented) {
				e.preventDefault();
				onClose();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [onClose]);

	return (
		<aside
			className="flex h-full flex-col border-l border-border bg-background"
			style={{ width: PANEL_WIDTH }}
		>
			<header className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
				<Button variant="ghost" size="sm" onClick={onClose} className="gap-1">
					<ArrowLeft className="size-3" />
					Back
				</Button>
				<span className="text-xs text-muted-foreground">{item.displayId}</span>
				<Button
					variant="ghost"
					size="sm"
					className="ml-auto"
					onClick={() => void openUrl(item.url)}
				>
					<ExternalLink className="size-3" />
				</Button>
			</header>
			<div className="min-h-0 flex-1 overflow-auto px-3 py-3">
				<h2 className="text-sm font-medium">{item.title}</h2>
				<div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
					<span
						className="rounded px-1.5 py-0.5"
						style={{
							background: `${item.status.color}33`,
							color: item.status.color,
						}}
					>
						{item.status.label}
					</span>
					{item.assignee ? <span>{item.assignee.login}</span> : null}
				</div>
				<div className="mt-4">
					{item.source === "linear" ? (
						<LinearBody itemKey={item.key} />
					) : (
						<GitHubBody item={item} />
					)}
				</div>
			</div>
			{footerSlot ? (
				<footer className="border-t border-border/50 bg-muted/20 px-3 py-2">
					{footerSlot}
				</footer>
			) : null}
		</aside>
	);
}

function LinearBody({ itemKey }: { itemKey: string }) {
	const query = useQuery<LinearIssueDetail>({
		queryKey: ["tasks", "detail", "linear", itemKey],
		queryFn: () => linearGetTask(itemKey),
		staleTime: 5 * 60_000,
	});
	if (query.isLoading) return <Placeholder>Loading…</Placeholder>;
	if (query.isError)
		return <Placeholder>Failed to load: {String(query.error)}</Placeholder>;
	if (!query.data?.description) return <Placeholder>No description.</Placeholder>;
	return (
		<pre className="whitespace-pre-wrap text-xs text-foreground">
			{query.data.description}
		</pre>
	);
}

function GitHubBody({ item }: { item: TaskListItem }) {
	// Use existing inbox detail endpoint. The detail ref keys differ from our
	// item.key shape; we'll synthesize an inboxRef from the row URL.
	const query = useQuery<InboxItemDetail>({
		queryKey: ["tasks", "detail", "github", item.key],
		queryFn: () => getInboxItemDetailFromUrl(item.url),
		staleTime: 5 * 60_000,
	});
	if (query.isLoading) return <Placeholder>Loading…</Placeholder>;
	if (query.isError)
		return <Placeholder>Failed to load: {String(query.error)}</Placeholder>;
	if (!query.data?.body) return <Placeholder>No description.</Placeholder>;
	return (
		<pre className="whitespace-pre-wrap text-xs text-foreground">{query.data.body}</pre>
	);
}

function Placeholder({ children }: { children: React.ReactNode }) {
	return <div className="text-xs text-muted-foreground">{children}</div>;
}

async function getInboxItemDetailFromUrl(url: string): Promise<InboxItemDetail> {
	// Derive (provider, host, login, source, externalId) from the URL.
	// For Plan 3 v1, fall back to a thin extraction: provider="github",
	// host="github.com", source="pr" | "issue", externalId=number.
	// If you find the existing getInboxItemDetail signature requires a structured
	// detailRef object, build it from the URL parse.
	const m = url.match(
		/^https:\/\/github\.com\/([^/]+\/[^/]+)\/(issues|pull)\/(\d+)/,
	);
	if (!m) throw new Error("Cannot parse GitHub URL");
	const [, repoSlug, kind, number] = m;
	return getInboxItemDetail({
		provider: "github",
		host: "github.com",
		login: "", // filled by backend based on the repo's bound forge_login
		source: kind === "pull" ? "pr" : "issue",
		externalId: `${repoSlug}#${number}`,
	});
}
```

NOTE on `getInboxItemDetail`: the actual TypeScript signature lives in `src/lib/api.ts` — inspect it before building `getInboxItemDetailFromUrl`. If `login` is required and can't be derived from the URL alone, fetch it from the current selected repo's `forgeLogin` and pass it as a closure into the body component.

If the existing `getInboxItemDetail` is too rigid, fall back to a simpler approach for v1: for GitHub items in the detail panel, just show the title + status + the URL with an "Open in browser" CTA — defer body markdown rendering to a follow-up. State this fallback in your commit message.

- [ ] **Step 3: Mount the detail panel in `container.tsx`**

Add state for the selected item:

```ts
const [selectedItem, setSelectedItem] = useState<TaskListItem | null>(null);
```

Pass `selectedItem`, `setSelectedItem` to `ItemList`. In the layout, place `DetailPanel` as a right column alongside the existing list when `selectedItem` is set:

```tsx
<div className="flex min-h-0 flex-1">
	<div className="min-h-0 flex-1">{body}</div>
	{selectedItem ? (
		<DetailPanel item={selectedItem} onClose={() => setSelectedItem(null)} />
	) : null}
</div>
```

- [ ] **Step 4: Keyboard nav — `src/features/tasks/hooks/use-detail-keyboard.ts`**

```ts
import { useEffect } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { TaskListItem } from "../types";

export function useDetailKeyboard({
	items,
	selected,
	onSelect,
}: {
	items: TaskListItem[];
	selected: TaskListItem | null;
	onSelect: (item: TaskListItem | null) => void;
}) {
	useEffect(() => {
		if (!selected) return;
		const handler = (e: KeyboardEvent) => {
			if (e.defaultPrevented) return;
			const idx = items.findIndex((i) => i.key === selected.key);
			if (idx === -1) return;
			if (e.key === "ArrowDown") {
				e.preventDefault();
				const next = items[idx + 1];
				if (next) onSelect(next);
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				const prev = items[idx - 1];
				if (prev) onSelect(prev);
			} else if ((e.metaKey || e.ctrlKey) && e.key === "o") {
				e.preventDefault();
				void openUrl(selected.url);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [items, selected, onSelect]);
}
```

Use it in the container next to the panel mount:

```tsx
useDetailKeyboard({
	items: tasks.items,
	selected: selectedItem,
	onSelect: setSelectedItem,
});
```

- [ ] **Step 5: Verify + commit**

```bash
bun run typecheck 2>&1 | tail -15
bun x biome check src/features/tasks/ 2>&1 | tail -5
git add src/features/tasks/
git commit -m "feat(tasks): detail panel with markdown body and keyboard nav"
```

---

## Task 7: Workspace integration buttons

**Files:**
- Modify: `src/features/tasks/components/detail-panel.tsx`
- Modify: `src/features/tasks/container.tsx`
- Modify: `src/App.tsx` (expose handlers — only if needed)

The detail panel gets two new actions in the `footerSlot`:
- **Open workspace** — visible only if a workspace is linked. Calls `handleSelectWorkspace` from App.tsx via the container.
- **Start workspace from this** — always visible. Navigates to the workspace-start screen with the current repo pre-selected (if known) and the task URL appended somewhere visible (composer? Plan 3 v1 just navigates and leaves URL paste to user).

- [ ] **Step 1: Inside `DetailPanel`, build a `WorkspaceActions` component**

```tsx
function WorkspaceActions({
	item,
	repoId,
	onOpenWorkspace,
	onStartWorkspace,
}: {
	item: TaskListItem;
	repoId: string | "all" | null;
	onOpenWorkspace: (workspaceId: string) => void;
	onStartWorkspace: (item: TaskListItem) => void;
}) {
	const linked = useQuery<string | null>({
		queryKey: ["tasks", "linkedWorkspace", item.key],
		queryFn: async () => {
			if (item.source === "linear") {
				return tasksFindWorkspaceForLinearTask(item.key);
			}
			if (item.source === "github-pr") {
				return tasksFindWorkspaceForPrUrl(item.url);
			}
			return null;
		},
		staleTime: 30_000,
	});

	return (
		<div className="flex items-center gap-2">
			{linked.data ? (
				<Button size="sm" onClick={() => onOpenWorkspace(linked.data!)}>
					Open workspace
				</Button>
			) : null}
			<Button size="sm" variant="outline" onClick={() => onStartWorkspace(item)}>
				Start workspace from this
			</Button>
		</div>
	);
}
```

Wire it into `DetailPanel` via the `footerSlot` prop. Add `onOpenWorkspace` and `onStartWorkspace` to `DetailPanel`'s prop type.

- [ ] **Step 2: Container plumbs handlers**

Container receives `onSelectWorkspace` and `onStartWorkspace` props from App.tsx. Pass them to `DetailPanel`:

```tsx
<DetailPanel
	item={selectedItem}
	onClose={() => setSelectedItem(null)}
	onOpenWorkspace={(id) => {
		onSelectWorkspace(id);
		setSelectedItem(null);
	}}
	onStartWorkspace={(item) => {
		onStartWorkspace({
			repoId: selectedRepoId !== "all" ? selectedRepoId : null,
			seedUrl: item.url,
			seedTitle: item.title,
			linearTaskId: item.source === "linear" ? item.key : null,
		});
	}}
/>
```

- [ ] **Step 3: App.tsx wires handlers**

Pass `onSelectWorkspace={handleSelectWorkspace}` to `TasksScreenContainer`. For `onStartWorkspace`, add a new handler that calls the existing `setStartWorkspaceFromTaskSource` (look up the existing inbox-card → workspace flow). Minimal v1: just transition to the workspace-start screen with the repo pre-selected. The URL/title/linearTaskId become future hookups (note them in `// TODO` for follow-up; the goal of this task is the button + navigation, not full pre-attachment).

Reasonable v1 implementation:

```ts
const handleStartWorkspaceFromTask = useCallback(
	(opts: {
		repoId: string | null;
		seedUrl: string;
		seedTitle: string;
		linearTaskId: string | null;
	}) => {
		if (opts.repoId) {
			handleStartRepositorySelect(opts.repoId);
		}
		setWorkspaceViewMode("start");
		// TODO: pre-attach opts.seedUrl as a context card and opts.linearTaskId
		// onto the workspace once it's created. Tracked for Plan 3 follow-up.
	},
	[handleStartRepositorySelect],
);
```

Pass it down.

- [ ] **Step 4: Verify**

```bash
bun run typecheck 2>&1 | tail -15
bun x biome check src/features/tasks/ src/App.tsx 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add src/features/tasks/ src/App.tsx
git commit -m "feat(tasks): workspace integration buttons in detail panel"
```

---

## Task 8: "All repos" mode

**Files:**
- Modify: `src/features/tasks/components/repo-switcher.tsx` — virtual "All repos" entry
- Modify: `src/features/tasks/hooks/use-tasks-query.ts` — fan-out
- Modify: `src/features/tasks/components/item-row.tsx` — repo badge
- Modify: `src/features/tasks/types.ts` — extend `TaskListItem` with optional `repo?: { id, name }`
- Modify: `src/features/tasks/container.tsx`

- [ ] **Step 1: Extend `TaskListItem`**

```ts
export type TaskListItem = {
	// ...existing fields
	repo?: { id: string; name: string };
};
```

Adapters DON'T need to set this — it's filled by the query layer when in all-repos mode (the adapter doesn't know the repo).

- [ ] **Step 2: Repo switcher includes "All repos"**

Add a top entry above the actual repos:

```tsx
<DropdownMenuItem onClick={() => onSelect("all")}>All repos</DropdownMenuItem>
<DropdownMenuSeparator />
{repos.map((repo) => (
	<DropdownMenuItem key={repo.id} onClick={() => onSelect(repo.id)}>
		{repo.name}
	</DropdownMenuItem>
))}
```

Update the prop type from `selectedId: string | null` → `selectedId: string | "all" | null` and `onSelect: (id: string | "all") => void`. Update the display label: if `selectedId === "all"`, show "All repos"; else the matched repo's name.

- [ ] **Step 3: Use-tasks-query fan-out**

Extend `useTasksQuery` to accept `args.allRepos: { id: string; name: string; linearTeamId: string | null; forgeLogin: string | null }[] | null`. When non-null, the hook ignores `args.repoId` and instead spawns multiple queries with `useQueries` (TanStack Query), one per applicable repo:

- Linear tab: each repo with a `linearTeamId`
- PRs / Issues tab: each repo with a `forgeLogin`

Aggregate the results into a single sorted `TaskListItem[]`, attaching `repo: { id, name }` to each. Sort by `updatedAt` desc.

This is the most intricate change in this plan — keep the existing single-repo path intact and add the all-repos path as an additional branch. The hook's return shape stays the same.

```ts
// Shape sketch — implement carefully:
const queries = useQueries({
	queries: allRepos.map((r) => ({
		queryKey: keyFor(tab, r),
		queryFn: () => fetchFor(tab, r),
		enabled: shouldRunFor(tab, r),
		staleTime: 60_000,
	})),
});
```

If `useQueries` from TanStack Query isn't already imported in the project, add it from `@tanstack/react-query` — it's part of the same package.

- [ ] **Step 4: Row badge**

In `item-row.tsx`, if `item.repo` is set, render a small badge before the displayId:

```tsx
{item.repo ? (
	<span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
		{item.repo.name}
	</span>
) : null}
```

- [ ] **Step 5: Container**

Treat `selectedRepoId === "all"` as the trigger. Pass the full `repos` (or filtered subset) into `useTasksQuery` as `allRepos`.

- [ ] **Step 6: Verify + commit**

```bash
bun run typecheck 2>&1 | tail -15
bun x biome check src/features/tasks/ 2>&1 | tail -5
git add src/features/tasks/
git commit -m "feat(tasks): all-repos mode with per-row repo badges"
```

---

## Task 9: Final lint + smoke

- [ ] **Step 1: Full lint + tests**

```bash
bun run lint 2>&1 | tail -20
bun run test 2>&1 | tail -30
```

Expect:
- biome + clippy clean
- All frontend tests pass except the pre-existing `src/features/editor/index.test.tsx` failures
- Rust + sidecar all pass

- [ ] **Step 2: Manual smoke**

```bash
bun run dev
```

Walk through the v1 acceptance list:
- Sidebar entry → Tasks screen mounts
- Repo switcher → switching repos changes content
- "All repos" → aggregates across all connected repos, badges show
- Tasks/PRs/Issues tabs render real data
- Filter dropdowns update results live
- Filter state persists across app restart
- Last view (repo + tab) restored on reopen
- Click row → detail panel slides in
- ↑/↓ navigate rows while panel open; Esc closes; Cmd+O opens externally
- "Open workspace" appears for items linked to a workspace
- "Start workspace from this" navigates to workspace-start
- Linear team picker works from the empty state
- Empty/error states render in the right places

Note in your final commit message anything that's not yet wired and worth a follow-up.

- [ ] **Step 3: Done.** This completes the v1 Tasks screen.

---

## Verification matrix

| Spec requirement | Plan 3 task |
| --- | --- |
| Filter dropdowns per tab, always-visible | Task 4 |
| Filter state persisted per repo across restarts | Tasks 3 + 4 |
| Last view (repo + tab) restored on reopen | Tasks 3 + 4 |
| Collapsed group state persisted | Tasks 3 + 4 |
| Inline Linear team picker | Task 5 |
| `linear_get_task` for detail body | Task 1 |
| Detail panel — slide-in, header/body/footer | Task 6 |
| Detail panel — keyboard (Esc / ↑↓ / Cmd+O) | Task 6 |
| "Open workspace" if linked | Tasks 2 + 7 |
| "Start workspace from this" | Task 7 |
| Workspace lookup by Linear task id | Task 2 |
| Workspace lookup by PR URL | Task 2 |
| "All repos" mode fan-out | Task 8 |
| Per-row repo badge in "All repos" | Task 8 |

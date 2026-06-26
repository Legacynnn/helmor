# Canvas Chrome Redesign + Image Backgrounds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the canvas's left manage-rail and right create-toolbar with two vertically-centered Apple liquid-glass rails, add 5 curated (+ uploadable) image backgrounds, and add a new `git` canvas panel type.

**Architecture:** Both rails drive the existing `useCanvasCreateStore` arm→drag-to-place flow; appearance moves into a "Customize canvas" popover. A new nullable `background_image` column on `canvas_view_state` persists the chosen preset key or uploaded asset path, rendered as a cover layer behind React Flow. A new `git` panel type reuses the inspector's changes data.

**Tech Stack:** React 19, `@xyflow/react`, Zustand, Tailwind v4, Tauri v2 (Rust + rusqlite), Vitest, cargo + insta.

**Spec:** `docs/superpowers/specs/2026-06-26-canvas-chrome-redesign-design.md`

**Conventions reminder:** `@/` → `src/`. Every clickable element needs `cursor-pointer`. Run `bun run typecheck`, `bun run lint`, `bun run test:frontend`, and `cd src-tauri && cargo test` before declaring done. Commit only with clear messages; do NOT push unless the user asks.

---

## Phase A — Backend: `background_image` persistence

### Task A1: Add `background_image` column + migration (Rust)

**Files:**
- Modify: `src-tauri/src/schema.rs` (CREATE TABLE ~1030-1041; migration block)
- Modify: `src-tauri/src/models/canvas.rs` (struct ~58-76; `map_view_state` ~142-155; `VIEW_STATE_COLUMNS` ~157; `upsert_view_state` ~270-301; default builder)
- Test: `src-tauri/src/models/canvas.rs` (`#[cfg(test)]` module) or `src-tauri/tests/` round-trip

- [ ] **Step 1: Write the failing Rust round-trip test**

Add to the test module in `src-tauri/src/models/canvas.rs` (create a `#[cfg(test)] mod tests` if none exists; mirror an existing model test's in-memory `Connection` setup — search the repo for `rusqlite::Connection::open_in_memory` to copy the pattern, then call `crate::schema::run_migrations`/`init` against it):

```rust
#[test]
fn view_state_round_trips_background_image() {
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    crate::schema::initialize(&conn).unwrap(); // use this repo's actual schema-init fn name
    let mut view = CanvasViewState {
        workspace_id: "ws1".into(),
        pan_x: 1.0, pan_y: 2.0, zoom: 1.5,
        translucency: 0.8,
        background_pattern: "dots".into(),
        background_color: None,
        background_theme: "system".into(),
        snap_to_grid: false,
        background_image: Some("aurora".into()),
        updated_at: String::new(),
    };
    upsert_view_state(&conn, &view).unwrap();
    let loaded = get_view_state(&conn, "ws1").unwrap();
    assert_eq!(loaded.background_image.as_deref(), Some("aurora"));

    view.background_image = None;
    upsert_view_state(&conn, &view).unwrap();
    let cleared = get_view_state(&conn, "ws1").unwrap();
    assert_eq!(cleared.background_image, None);
}
```

- [ ] **Step 2: Run it — expect compile failure (`background_image` field missing)**

Run: `cd src-tauri && cargo test view_state_round_trips_background_image`
Expected: compile error — `CanvasViewState` has no field `background_image`.

- [ ] **Step 3: Add the column to the schema CREATE TABLE + idempotent migration**

In `schema.rs`, update the `canvas_view_state` CREATE TABLE to include `background_image TEXT` (nullable, no default needed):

```sql
CREATE TABLE IF NOT EXISTS canvas_view_state (
    workspace_id TEXT PRIMARY KEY,
    pan_x REAL NOT NULL DEFAULT 0,
    pan_y REAL NOT NULL DEFAULT 0,
    zoom REAL NOT NULL DEFAULT 1,
    translucency REAL NOT NULL DEFAULT 1,
    background_pattern TEXT NOT NULL DEFAULT 'dots',
    background_color TEXT,
    background_theme TEXT NOT NULL DEFAULT 'system',
    snap_to_grid INTEGER NOT NULL DEFAULT 0,
    background_image TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

And in the migrations section (mirror the repo's existing `add_column_if_missing` / `has_column` helper — use whichever exists):

```rust
add_column_if_missing(
    connection,
    "canvas_view_state",
    "background_image",
    "TEXT",
)?;
```

- [ ] **Step 4: Add the struct field**

In `models/canvas.rs`, add to `CanvasViewState` (after `snap_to_grid`):

```rust
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_image: Option<String>,
```

- [ ] **Step 5: Wire the column through read + write**

Update `VIEW_STATE_COLUMNS` to append `, background_image` BEFORE `updated_at` so positional indexes stay aligned with `map_view_state`:

```rust
const VIEW_STATE_COLUMNS: &str =
    "workspace_id, pan_x, pan_y, zoom, translucency, background_pattern, background_color, background_theme, snap_to_grid, background_image, updated_at";
```

Update `map_view_state` (note indexes shift — `background_image` is index 9, `updated_at` becomes 10):

```rust
fn map_view_state(row: &rusqlite::Row<'_>) -> rusqlite::Result<CanvasViewState> {
    Ok(CanvasViewState {
        workspace_id: row.get(0)?,
        pan_x: row.get(1)?,
        pan_y: row.get(2)?,
        zoom: row.get(3)?,
        translucency: row.get(4)?,
        background_pattern: row.get(5)?,
        background_color: row.get(6)?,
        background_theme: row.get(7)?,
        snap_to_grid: row.get::<_, i64>(8)? != 0,
        background_image: row.get(9)?,
        updated_at: row.get(10)?,
    })
}
```

Update `upsert_view_state` INSERT column list + `VALUES` (now `?10` for background_image, updated_at uses `datetime('now')`), the `ON CONFLICT DO UPDATE SET` clause (`background_image = excluded.background_image`), and the `params!` list (add `view.background_image` in the matching position):

```rust
pub fn upsert_view_state(conn: &Connection, view: &CanvasViewState) -> Result<()> {
    conn.execute(
        r#"
        INSERT INTO canvas_view_state
            (workspace_id, pan_x, pan_y, zoom, translucency, background_pattern,
             background_color, background_theme, snap_to_grid, background_image, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, datetime('now'))
        ON CONFLICT(workspace_id) DO UPDATE SET
            pan_x = excluded.pan_x,
            pan_y = excluded.pan_y,
            zoom = excluded.zoom,
            translucency = excluded.translucency,
            background_pattern = excluded.background_pattern,
            background_color = excluded.background_color,
            background_theme = excluded.background_theme,
            snap_to_grid = excluded.snap_to_grid,
            background_image = excluded.background_image,
            updated_at = datetime('now')
        "#,
        rusqlite::params![
            view.workspace_id,
            view.pan_x,
            view.pan_y,
            view.zoom,
            view.translucency,
            view.background_pattern,
            view.background_color,
            view.background_theme,
            view.snap_to_grid as i64,
            view.background_image,
        ],
    )?;
    Ok(())
}
```

Also update any `CanvasViewState` default/constructor in `canvas.rs` (e.g. `get_view_state`'s default-when-missing branch) to set `background_image: None`.

- [ ] **Step 6: Run the test — expect PASS**

Run: `cd src-tauri && cargo test view_state_round_trips_background_image`
Expected: PASS.

- [ ] **Step 7: Build + clippy**

Run: `cd src-tauri && cargo build && cargo clippy --all-targets -- -D warnings`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/schema.rs src-tauri/src/models/canvas.rs
git commit -m "feat(canvas): persist background_image on canvas_view_state"
```

### Task A2: Background-upload command (Rust)

**Files:**
- Modify: `src-tauri/src/commands/canvas_commands.rs`
- Modify: `src-tauri/src/lib.rs` (invoke_handler ~730-735)
- Modify: `src-tauri/src/models/canvas.rs` or a small helper for the backgrounds dir (reuse `crate::data_dir`)

- [ ] **Step 1: Add the command**

In `canvas_commands.rs`, add a command that writes uploaded bytes to `{data_dir}/canvas-backgrounds/{workspace_id}-{uuid}.{ext}` and returns the absolute path. Use the existing `run_blocking` + `data_dir` helpers (match how other commands resolve the data dir):

```rust
#[tauri::command]
pub async fn save_canvas_background(
    workspace_id: String,
    bytes: Vec<u8>,
    ext: String,
) -> CmdResult<String> {
    run_blocking(move || {
        let dir = crate::data_dir::resolve()?.join("canvas-backgrounds");
        std::fs::create_dir_all(&dir)?;
        let safe_ext = match ext.to_ascii_lowercase().as_str() {
            "png" | "jpg" | "jpeg" | "webp" | "gif" => ext.to_ascii_lowercase(),
            _ => "png".to_string(),
        };
        let file = dir.join(format!("{workspace_id}-{}.{safe_ext}", uuid::Uuid::new_v4()));
        std::fs::write(&file, &bytes)?;
        Ok(file.to_string_lossy().into_owned())
    })
    .await
}
```

> Note: confirm the exact `data_dir` accessor (`crate::data_dir::resolve()` vs another name) and `CmdResult`/`run_blocking` imports by reading the top of `canvas_commands.rs`; match them. If the repo already depends on `uuid`, use it; otherwise generate the name with the existing id helper used elsewhere.

- [ ] **Step 2: Register it in `lib.rs`**

Add to the `invoke_handler!` list beside the other canvas commands:

```rust
commands::canvas_commands::save_canvas_background,
```

- [ ] **Step 3: Build + clippy**

Run: `cd src-tauri && cargo build && cargo clippy --all-targets -- -D warnings`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/canvas_commands.rs src-tauri/src/lib.rs
git commit -m "feat(canvas): add save_canvas_background upload command"
```

---

## Phase B — Frontend types + view store

### Task B1: Extend API types + wrapper

**Files:**
- Modify: `src/lib/api.ts` (`CanvasPanelType` ~5941-5948; `CanvasViewState` ~5984-5996; add `saveCanvasBackground`)

- [ ] **Step 1: Add `"git"` to `CanvasPanelType`**

```ts
export type CanvasPanelType =
	| "placeholder"
	| "conversation"
	| "terminal"
	| "notes"
	| "drawing"
	| "file-manager"
	| "editor"
	| "git";
```

- [ ] **Step 2: Add `backgroundImage` to `CanvasViewState`**

After `backgroundTheme` (keep order matching the Rust serde camelCase):

```ts
	backgroundImage?: string | null;
```

- [ ] **Step 3: Add the upload wrapper**

Near the other canvas API functions (after `saveCanvasViewState` ~6026):

```ts
/** Persist an uploaded canvas background image to the data dir; returns the
 * absolute file path to store in `backgroundImage` and render via convertFileSrc. */
export async function saveCanvasBackground(
	workspaceId: string,
	bytes: Uint8Array,
	ext: string,
): Promise<string> {
	return invoke<string>("save_canvas_background", {
		workspaceId,
		bytes: Array.from(bytes),
		ext,
	});
}
```

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: passes (downstream files compile; `backgroundImage` optional so no break yet).

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(canvas): add git panel type + backgroundImage API"
```

### Task B2: Thread `backgroundImage` through the view store

**Files:**
- Modify: `src/features/canvas/canvas-view-store.ts`
- Test: `src/features/canvas/canvas-view-store.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `src/features/canvas/canvas-view-store.test.ts`:

```ts
import { beforeEach, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
	saveCanvasViewState: vi.fn(async () => {}),
}));
vi.mock("@/lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/api")>();
	return { ...actual, saveCanvasViewState: apiMocks.saveCanvasViewState };
});

const { useCanvasViewStore } = await import("./canvas-view-store");

beforeEach(() => {
	apiMocks.saveCanvasViewState.mockClear();
	useCanvasViewStore.getState().hydrate({
		workspaceId: "ws1",
		panX: 0, panY: 0, zoom: 1,
		translucency: 1,
		backgroundPattern: "dots",
		backgroundColor: null,
		backgroundTheme: "system",
		snapToGrid: false,
		backgroundImage: null,
		updatedAt: "",
	});
});

it("setAppearance updates backgroundImage and schedules a save", async () => {
	vi.useFakeTimers();
	useCanvasViewStore.getState().setAppearance({ backgroundImage: "aurora" });
	expect(useCanvasViewStore.getState().backgroundImage).toBe("aurora");
	await vi.advanceTimersByTimeAsync(600);
	expect(apiMocks.saveCanvasViewState).toHaveBeenCalledWith(
		expect.objectContaining({ backgroundImage: "aurora" }),
	);
	vi.useRealTimers();
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `bun x vitest run src/features/canvas/canvas-view-store.test.ts`
Expected: FAIL — `backgroundImage` not in store / not in save payload.

- [ ] **Step 3: Add `backgroundImage` to the store**

In `canvas-view-store.ts`: add to `CanvasAppearance`:

```ts
	backgroundImage: string | null;
```

Add to the initial state (after `snapToGrid: false,`):

```ts
	backgroundImage: null,
```

Add to the `scheduleSave` payload (inside `saveCanvasViewState({...})`):

```ts
		backgroundImage: s.backgroundImage,
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `bun x vitest run src/features/canvas/canvas-view-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/canvas/canvas-view-store.ts src/features/canvas/canvas-view-store.test.ts
git commit -m "feat(canvas): backgroundImage in view store"
```

---

## Phase C — Backgrounds: registry + render layer

### Task C1: Curated background registry

**Files:**
- Create: `src/features/canvas/backgrounds/index.ts`
- Create: `src/features/canvas/backgrounds/*.{webp,jpg}` (5 images)

- [ ] **Step 1: Add 5 image assets**

Place 5 cohesive, low-contrast images in `src/features/canvas/backgrounds/` (e.g. `mesh.webp`, `aurora.webp`, `topography.webp`, `dusk.webp`, `mist.webp`). Generate them as an out-of-band step (canvas-design skill or hand-supplied). Keep each ≤ ~400 KB; webp preferred. They are imported as Vite asset URLs.

- [ ] **Step 2: Create the registry**

```ts
import aurora from "./aurora.webp";
import dusk from "./dusk.webp";
import mesh from "./mesh.webp";
import mist from "./mist.webp";
import topography from "./topography.webp";

export type CanvasBackgroundPreset = {
	key: string;
	label: string;
	/** Vite-resolved URL for both thumbnail and full render (single asset). */
	url: string;
};

export const CANVAS_BACKGROUND_PRESETS: CanvasBackgroundPreset[] = [
	{ key: "mesh", label: "Mesh", url: mesh },
	{ key: "aurora", label: "Aurora", url: aurora },
	{ key: "topography", label: "Topography", url: topography },
	{ key: "dusk", label: "Dusk", url: dusk },
	{ key: "mist", label: "Mist", url: mist },
];

const BY_KEY = new Map(CANVAS_BACKGROUND_PRESETS.map((p) => [p.key, p]));

/** Resolve a stored `backgroundImage` value to a CSS url(). A preset key maps to
 * its bundled asset; anything else is treated as a custom file path served via
 * the asset protocol. Returns null when unset. */
export function resolveBackgroundUrl(
	value: string | null | undefined,
	convertFileSrc: (p: string) => string,
): string | null {
	if (!value) return null;
	const preset = BY_KEY.get(value);
	if (preset) return preset.url;
	return convertFileSrc(value);
}
```

- [ ] **Step 3: Test the resolver**

Create `src/features/canvas/backgrounds/resolve.test.ts`:

```ts
import { expect, it, vi } from "vitest";

vi.mock("./mesh.webp", () => ({ default: "mesh-url" }));
vi.mock("./aurora.webp", () => ({ default: "aurora-url" }));
vi.mock("./topography.webp", () => ({ default: "topo-url" }));
vi.mock("./dusk.webp", () => ({ default: "dusk-url" }));
vi.mock("./mist.webp", () => ({ default: "mist-url" }));

const { resolveBackgroundUrl } = await import("./index");

it("maps a preset key to its bundled asset", () => {
	expect(resolveBackgroundUrl("aurora", (p) => `file:${p}`)).toBe("aurora-url");
});
it("treats unknown values as custom file paths", () => {
	expect(resolveBackgroundUrl("/data/x.png", (p) => `file:${p}`)).toBe("file:/data/x.png");
});
it("returns null when unset", () => {
	expect(resolveBackgroundUrl(null, (p) => p)).toBeNull();
});
```

- [ ] **Step 4: Run — expect PASS**

Run: `bun x vitest run src/features/canvas/backgrounds/resolve.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/canvas/backgrounds/
git commit -m "feat(canvas): curated background registry + resolver"
```

### Task C2: Render the background layer

**Files:**
- Modify: `src/features/canvas/index.tsx` (subscribe to `backgroundImage`; render cover layer ~191-197)

- [ ] **Step 1: Subscribe + resolve**

In `CanvasInner`, near the other appearance selectors (after line 175):

```tsx
	const backgroundImage = useCanvasViewStore((s) => s.backgroundImage);
```

Add the import at top:

```tsx
import { convertFileSrc } from "@/lib/ipc";
import { resolveBackgroundUrl } from "./backgrounds";
```

And compute the URL (inside the component body, before `return`):

```tsx
	const backgroundUrl = useMemo(
		() => resolveBackgroundUrl(backgroundImage, convertFileSrc),
		[backgroundImage],
	);
```

- [ ] **Step 2: Render the cover layer behind React Flow**

Inside the wrapper `<div>` (the one with `ref={wrapperRef}`), as the FIRST child (before `<ReactFlow>`), add:

```tsx
						{backgroundUrl ? (
							<div
								className="pointer-events-none absolute inset-0 z-0 bg-center bg-cover"
								style={{ backgroundImage: `url("${backgroundUrl}")` }}
							>
								<div className="absolute inset-0 bg-app-base/40" />
							</div>
						) : null}
```

The React Flow surface and grid render above (React Flow's own container is positioned; the absolute layer at `z-0` sits behind the panels which carry their own stacking). Verify panels remain interactive after this change.

- [ ] **Step 3: Typecheck + run frontend tests**

Run: `bun run typecheck && bun run test:frontend`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/features/canvas/index.tsx
git commit -m "feat(canvas): render selectable background image layer"
```

---

## Phase D — Glass rails + chrome

### Task D1: Shared glass-rail primitive

**Files:**
- Create: `src/features/canvas/chrome/glass-rail.tsx`

- [ ] **Step 1: Create the primitive**

```tsx
import type { ComponentType, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const SELECTED_COLOR = "var(--color-selected, #3b82f6)";

/** Vertically-centered Apple liquid-glass rail pinned to a screen edge. */
export function GlassRail({
	side,
	children,
}: {
	side: "left" | "right";
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				"-translate-y-1/2 pointer-events-auto absolute top-1/2 z-10 flex flex-col gap-1 rounded-[20px] p-1.5",
				"border border-white/15 bg-app-base/40 shadow-2xl ring-1 ring-white/10 backdrop-blur-2xl",
				side === "left" ? "left-3" : "right-3",
			)}
		>
			{children}
		</div>
	);
}

/** One icon button inside a GlassRail. */
export function RailButton({
	icon: Icon,
	label,
	armed = false,
	disabled = false,
	onClick,
}: {
	icon: ComponentType<{ className?: string }>;
	label: string;
	armed?: boolean;
	disabled?: boolean;
	onClick?: () => void;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-pressed={armed}
					disabled={disabled}
					onClick={onClick}
					className={cn(
						"flex size-9 cursor-pointer items-center justify-center rounded-[14px] text-app-foreground/80 transition-colors hover:bg-white/10 hover:text-app-foreground",
						disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
					)}
					style={
						armed
							? {
									backgroundColor: `color-mix(in oklab, ${SELECTED_COLOR} 18%, transparent)`,
									color: SELECTED_COLOR,
									boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${SELECTED_COLOR} 45%, transparent)`,
								}
							: undefined
					}
				>
					<Icon className="size-4.5" />
				</button>
			</TooltipTrigger>
			<TooltipContent side={label.length ? "right" : "right"}>{label}</TooltipContent>
		</Tooltip>
	);
}
```

> Confirm the tooltip import path (`@/components/ui/tooltip`) and `cn` location (`@/lib/utils`) match the repo by grepping an existing component; adjust if different. If rails need a `TooltipProvider`, wrap them once in `index.tsx`.

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/features/canvas/chrome/glass-rail.tsx
git commit -m "feat(canvas): glass rail primitive"
```

### Task D2: Left rail

**Files:**
- Create: `src/features/canvas/chrome/left-rail.tsx`
- Reference: `src/features/canvas/canvas-create-store.ts` (`pendingType`, `toggle`); `src/features/canvas/chrome/workspace-controls.tsx` for the `setMode` exit pattern (`useCanvasModeStore.getState().setMode(workspaceId, false)`)

- [ ] **Step 1: Create the left rail**

```tsx
import { ArrowLeft, MessageSquare, Palette, SquareTerminal } from "lucide-react";
import { useCanvasModeStore } from "@/features/canvas/canvas-mode-store"; // confirm path/name
import { useCanvasCreateStore } from "../canvas-create-store";
import { GlassRail, RailButton } from "./glass-rail";

export function CanvasLeftRail({
	workspaceId,
	onCustomize,
	customizeOpen,
}: {
	workspaceId: string;
	onCustomize: () => void;
	customizeOpen: boolean;
}) {
	const pendingType = useCanvasCreateStore((s) => s.pendingType);
	const toggle = useCanvasCreateStore((s) => s.toggle);
	return (
		<GlassRail side="left">
			<RailButton
				icon={ArrowLeft}
				label="Back to workspace"
				onClick={() =>
					useCanvasModeStore.getState().setMode(workspaceId, false)
				}
			/>
			<RailButton
				icon={MessageSquare}
				label="New conversation"
				armed={pendingType === "conversation"}
				onClick={() => toggle("conversation")}
			/>
			<RailButton
				icon={SquareTerminal}
				label="New terminal"
				armed={pendingType === "terminal"}
				onClick={() => toggle("terminal")}
			/>
			<RailButton
				icon={Palette}
				label="Customize canvas"
				armed={customizeOpen}
				onClick={onCustomize}
			/>
		</GlassRail>
	);
}
```

> Confirm the canvas-mode store import (`workspace-controls.tsx` already calls `useCanvasModeStore.getState().setMode(...)` — copy its exact import).

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/features/canvas/chrome/left-rail.tsx
git commit -m "feat(canvas): left glass rail"
```

### Task D3: Right rail (with More popover + Browser stub)

**Files:**
- Create: `src/features/canvas/chrome/right-rail.tsx`
- Reference: `src/components/ui/popover.tsx`, `src/components/ui/dropdown-menu.tsx`

- [ ] **Step 1: Create the right rail**

```tsx
import {
	FolderTree,
	GitBranch,
	Globe,
	MoreHorizontal,
	NotebookPen,
	Pencil,
	SquarePen,
} from "lucide-react";
import type { ComponentType } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CanvasPanelType } from "@/lib/api";
import { useCanvasCreateStore } from "../canvas-create-store";
import { GlassRail, RailButton } from "./glass-rail";

const MORE: { type: CanvasPanelType; label: string; icon: ComponentType<{ className?: string }> }[] = [
	{ type: "notes", label: "Notes", icon: NotebookPen },
	{ type: "drawing", label: "Drawing", icon: Pencil },
];

export function CanvasRightRail() {
	const pendingType = useCanvasCreateStore((s) => s.pendingType);
	const toggle = useCanvasCreateStore((s) => s.toggle);
	return (
		<GlassRail side="right">
			<RailButton icon={Globe} label="Browser (coming soon)" disabled />
			<RailButton
				icon={FolderTree}
				label="Files"
				armed={pendingType === "file-manager"}
				onClick={() => toggle("file-manager")}
			/>
			<RailButton
				icon={GitBranch}
				label="Git"
				armed={pendingType === "git"}
				onClick={() => toggle("git")}
			/>
			<RailButton
				icon={SquarePen}
				label="Editor"
				armed={pendingType === "editor"}
				onClick={() => toggle("editor")}
			/>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="flex size-9 cursor-pointer items-center justify-center rounded-[14px] text-app-foreground/80 transition-colors hover:bg-white/10 hover:text-app-foreground"
						title="More panels"
					>
						<MoreHorizontal className="size-4.5" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent side="left" align="end">
					{MORE.map((m) => (
						<DropdownMenuItem
							key={m.type}
							onClick={() => toggle(m.type)}
							className="cursor-pointer"
						>
							<m.icon className="size-3.5 opacity-70" />
							<span>{m.label}</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</GlassRail>
	);
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/features/canvas/chrome/right-rail.tsx
git commit -m "feat(canvas): right glass rail"
```

### Task D4: Customize popover (appearance)

**Files:**
- Create: `src/features/canvas/chrome/customize-popover.tsx`
- Reference: old appearance controls in `src/features/canvas/chrome/manage-rail.tsx` (translucency Slider, pattern buttons, theme); `src/components/ui/{popover,slider,label}.tsx`

- [ ] **Step 1: Create the popover content**

Build a controlled popover (open state owned by `index.tsx`, anchored near the left rail) with: background thumbnails grid (`CANVAS_BACKGROUND_PRESETS`) + a "None" tile + an "Upload" tile (hidden `<input type="file" accept="image/*">`); translucency slider; pattern buttons (None/Dots/Lines → `backgroundPattern` `blank|dots|lines`); theme select. Wire each to `useCanvasViewStore.getState().setAppearance(...)`.

```tsx
import { ImageOff, Upload } from "lucide-react";
import { useRef } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { saveCanvasBackground } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CANVAS_BACKGROUND_PRESETS } from "../backgrounds";
import { useCanvasViewStore } from "../canvas-view-store";

export function CustomizePopover({
	workspaceId,
	open,
	onOpenChange,
	anchor,
}: {
	workspaceId: string;
	open: boolean;
	onOpenChange: (v: boolean) => void;
	anchor: React.ReactNode;
}) {
	const fileRef = useRef<HTMLInputElement>(null);
	const translucency = useCanvasViewStore((s) => s.translucency);
	const backgroundImage = useCanvasViewStore((s) => s.backgroundImage);
	const pattern = useCanvasViewStore((s) => s.backgroundPattern);
	const set = useCanvasViewStore.getState().setAppearance;

	async function onUpload(file: File) {
		const buf = new Uint8Array(await file.arrayBuffer());
		const ext = file.name.split(".").pop() ?? "png";
		const path = await saveCanvasBackground(workspaceId, buf, ext);
		set({ backgroundImage: path });
	}

	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>{anchor}</PopoverTrigger>
			<PopoverContent side="right" align="start" className="w-72 p-3">
				<div className="mb-1 font-medium text-xs">Background</div>
				<div className="grid grid-cols-3 gap-2">
					{CANVAS_BACKGROUND_PRESETS.map((p) => (
						<button
							key={p.key}
							type="button"
							onClick={() => set({ backgroundImage: p.key })}
							className={cn(
								"aspect-video cursor-pointer overflow-hidden rounded-md border border-app-border bg-center bg-cover",
								backgroundImage === p.key && "ring-2 ring-[var(--color-selected,#3b82f6)]",
							)}
							style={{ backgroundImage: `url("${p.url}")` }}
							title={p.label}
						/>
					))}
					<button
						type="button"
						onClick={() => set({ backgroundImage: null })}
						className={cn(
							"flex aspect-video cursor-pointer items-center justify-center rounded-md border border-app-border text-app-muted-foreground",
							!backgroundImage && "ring-2 ring-[var(--color-selected,#3b82f6)]",
						)}
						title="None"
					>
						<ImageOff className="size-4" />
					</button>
					<button
						type="button"
						onClick={() => fileRef.current?.click()}
						className="flex aspect-video cursor-pointer items-center justify-center rounded-md border border-app-border border-dashed text-app-muted-foreground hover:text-app-foreground"
						title="Upload"
					>
						<Upload className="size-4" />
					</button>
					<input
						ref={fileRef}
						type="file"
						accept="image/*"
						className="hidden"
						onChange={(e) => {
							const f = e.target.files?.[0];
							if (f) void onUpload(f);
							e.target.value = "";
						}}
					/>
				</div>

				<div className="mt-3 mb-1 font-medium text-xs">
					Translucency · {Math.round(translucency * 100)}%
				</div>
				<Slider
					min={20}
					max={100}
					step={5}
					value={[translucency * 100]}
					onValueChange={([v]) => set({ translucency: v / 100 })}
				/>

				<div className="mt-3 mb-1 font-medium text-xs">Grid</div>
				<div className="flex gap-1">
					{(["blank", "dots", "lines"] as const).map((g) => (
						<button
							key={g}
							type="button"
							onClick={() => set({ backgroundPattern: g })}
							className={cn(
								"flex-1 cursor-pointer rounded-md border border-app-border px-2 py-1 text-xs capitalize",
								pattern === g && "bg-app-muted text-app-foreground",
							)}
						>
							{g === "blank" ? "none" : g}
						</button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}
```

> Match the actual `Slider`/`Popover` prop shapes used in `manage-rail.tsx`/`selection-toolbar.tsx`. If a `setAppearance` reference captured via `getState()` is stale, call `useCanvasViewStore.getState().setAppearance(...)` inline instead.

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/features/canvas/chrome/customize-popover.tsx
git commit -m "feat(canvas): customize-canvas appearance popover"
```

### Task D5: Wire rails into the canvas, remove old chrome

**Files:**
- Modify: `src/features/canvas/index.tsx` (imports ~22-31; render ~232-240)
- Delete: `src/features/canvas/canvas-create-toolbar.tsx`
- Delete: `src/features/canvas/chrome/manage-rail.tsx`
- Restyle: `src/features/canvas/chrome/workspace-controls.tsx`, `src/features/canvas/chrome/selection-toolbar.tsx` (glass container classes only)

- [ ] **Step 1: Swap the chrome in `index.tsx`**

Remove imports of `CanvasCreateToolbar` and `CanvasManageRail`. Add:

```tsx
import { useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CustomizePopover } from "./chrome/customize-popover";
import { CanvasLeftRail } from "./chrome/left-rail";
import { CanvasRightRail } from "./chrome/right-rail";
```

Replace the chrome block (was `<CanvasManageRail />`, `<CanvasCreateToolbar />`) with the new rails. Add a `customizeOpen` state in `CanvasInner`:

```tsx
	const [customizeOpen, setCustomizeOpen] = useState(false);
```

Render (inside the wrapper div, after `<CanvasCreateOverlay />`), wrapping rails in a `TooltipProvider`:

```tsx
						<TooltipProvider delayDuration={300}>
							<CanvasWorkspaceControls
								workspaceId={workspaceId}
								onSelectWorkspace={onSelectWorkspace}
							/>
							<CanvasLeftRail
								workspaceId={workspaceId}
								customizeOpen={customizeOpen}
								onCustomize={() => setCustomizeOpen((v) => !v)}
							/>
							<CanvasRightRail />
							<CanvasSelectionToolbar />
						</TooltipProvider>
						<CustomizePopover
							workspaceId={workspaceId}
							open={customizeOpen}
							onOpenChange={setCustomizeOpen}
							anchor={<span className="-translate-y-1/2 absolute top-1/2 left-14" />}
						/>
```

> The CustomizePopover anchor is an invisible element positioned next to the left rail's Customize button so the popover floats beside it. Adjust `left-14`/`top` offsets to align with the 4th rail button during visual QA.

- [ ] **Step 2: Delete the old chrome files**

```bash
git rm src/features/canvas/canvas-create-toolbar.tsx src/features/canvas/chrome/manage-rail.tsx
```

Search for any remaining imports of those modules and remove them:

Run: `grep -rn "manage-rail\|canvas-create-toolbar" src/`
Expected: no references (fix any that remain).

- [ ] **Step 3: Glass-restyle workspace-controls + selection-toolbar**

In both files, change the outer container className from the old `border border-app-border bg-app-base/90 ... shadow-lg backdrop-blur` to the glass language: `border border-white/15 bg-app-base/40 shadow-2xl ring-1 ring-white/10 backdrop-blur-2xl rounded-[16px]`. No logic changes.

- [ ] **Step 4: Typecheck + lint + frontend tests**

Run: `bun run typecheck && bun run lint && bun run test:frontend`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add -A src/features/canvas/
git commit -m "feat(canvas): mount glass rails, retire manage-rail + create-toolbar"
```

---

## Phase E — Git panel type

### Task E1: Git panel config + graph wiring

**Files:**
- Modify: `src/features/canvas/panel-config.ts`
- Modify: `src/features/canvas/use-canvas-graph.ts` (`buildConfig` ~68-84 — no live binding needed for git)

- [ ] **Step 1: Add the git config type**

In `panel-config.ts`, add (git is workspace-scoped, no per-panel binding):

```ts
export type GitPanelConfig = Record<string, never>;
```

and include it in the `PanelConfig` intersection (it adds nothing, but documents intent — optional). No change to `buildConfig` is required because the `git` type falls through to the default empty `base`.

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/features/canvas/panel-config.ts
git commit -m "feat(canvas): git panel config type"
```

### Task E2: Git panel body + render switch

**Files:**
- Create: `src/features/canvas/panel-bodies/git-panel-body.tsx` (or wherever sibling bodies live — match the existing `NotesPanelBody`/`FileManagerPanelBody` location)
- Modify: `src/features/canvas/panel-node.tsx` (switch ~124-159; `PANEL_META` ~31-42)
- Reference: `src/features/inspector/panel/git/index.tsx` (`ChangesSection`) and its data container — read the inspector container that supplies `ChangesSection`'s props to find the query hooks (changes list, branch, target branch). Reuse those hooks; the canvas `CanvasWorkspaceProvider` already exposes `workspaceId`, `repoId`, `workspaceRootPath`.

- [ ] **Step 1: Locate the inspector's changes data source**

Run: `grep -rn "ChangesSection" src/features/inspector` and read the parent that renders it to see which query options/hooks feed `changes`, `workspaceBranch`, `workspaceTargetBranch`, etc.

- [ ] **Step 2: Create `GitPanelBody`**

Build a focused body that pulls the same change data via the existing query options and renders `ChangesSection` (or, if its prop surface is too entangled with editor/commit wiring, render a lighter read-only changes list using the same query). Use the canvas workspace context for ids:

```tsx
import { useCanvasWorkspace } from "../canvas-workspace-context"; // confirm export name
// import { workspaceChangesQueryOptions } from "@/lib/query-client"; // use the real one found in Step 1
// import { ChangesSection } from "@/features/inspector/panel/git";

export function GitPanelBody() {
	const ws = useCanvasWorkspace();
	// Wire the same query hooks the inspector uses, keyed by ws.workspaceId.
	// Render ChangesSection with the resolved props, OR a minimal changes list
	// (path + status) for the MVP if the full section needs editor/commit context
	// not available on the canvas.
	return (/* changes UI */ null);
}
```

> Decision for the executor: prefer reusing `ChangesSection` if its required props can all be satisfied from existing query options + canvas context. If `onOpenEditorFile`/commit props would force pulling in editor state the canvas panel doesn't own, ship the MVP read-only list this round and note the follow-up. Keep the file < 200 lines.

- [ ] **Step 3: Add the `git` case to the render switch**

In `panel-node.tsx`, add to `PanelBody`'s switch (before `default`):

```tsx
		case "git":
			return <GitPanelBody />;
```

Import it at top. Add a `git` entry to `PANEL_META` (icon `GitBranch` from lucide, label "Git").

- [ ] **Step 4: Typecheck + lint + frontend tests**

Run: `bun run typecheck && bun run lint && bun run test:frontend`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/features/canvas/
git commit -m "feat(canvas): git panel renders workspace changes"
```

---

## Phase F — Verification + polish

### Task F1: Full test + lint sweep

- [ ] **Step 1: Run everything**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: all three suites green (frontend, sidecar, rust). `cargo clippy --all-targets -- -D warnings` clean.

- [ ] **Step 2: Manual QA in dev build (Tauri MCP)**

Per CLAUDE.md debugging rules: `bun run dev`, then via the Tauri MCP bridge verify:
- Both glass rails render centered, left + right, with working tooltips.
- Each rail item arms its type; drawing a box spawns a panel of that type at the drawn rect.
- Browser is disabled ("coming soon"); More opens Notes/Drawing.
- Customize opens the appearance popover; selecting a preset changes the background; upload works and persists across reload; "None" clears it; translucency/grid/theme still work.
- Git panel shows the workspace changes.
- Back exits canvas; workspace switcher still works.
- Reload the workspace → background + panels persist.

- [ ] **Step 3: Update CLAUDE.md canvas notes if needed**

If the canvas feature is documented anywhere, note the new chrome (rails replace manage-rail/create-toolbar) and the `git` panel type.

- [ ] **Step 4: Final commit (if any QA fixes)**

```bash
git add -A
git commit -m "fix(canvas): chrome redesign QA polish"
```

---

## Self-review notes (author)

- **Spec coverage:** glass rails (D1-D3, D5) ✓; workspace switcher + selection toolbar kept & restyled (D5) ✓; customize popover w/ 5 backgrounds + upload + translucency/grid/theme (D4) ✓; background persistence + render (A1, B1-B2, C1-C2) ✓; custom upload on disk (A2, D4) ✓; new git panel (E1-E2) ✓; Browser stub (D3) ✓; remove old chrome (D5) ✓; tests (A1, B2, C1, F1) ✓.
- **Deferred (per spec):** Browser panel, agent-canvas interaction — intentionally out of scope.
- **Known soft spots the executor must resolve by reading current code:** exact `data_dir`/`run_blocking`/`CmdResult` symbols in `canvas_commands.rs`; the canvas-mode store import; tooltip/`cn` import paths; the inspector changes query hook for `GitPanelBody`; schema migration helper name (`add_column_if_missing` vs inline `has_column`).

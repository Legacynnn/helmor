# Open git diff when a file change is clicked in the conversation

## Goal

When a user clicks a file change shown inside the conversation thread (an
agent `Edit` / `apply_patch` rendered as a file pill or row), open the **full
git diff for that file in the in-app editor** — the same diff view the
inspector's Changes section opens. Today, clicking does nothing beyond a hover
preview, and seeing a change means hovering for the floating popover or
expanding the tool row inline.

### Decisions (confirmed with user)

- **Hover preview stays.** Hovering a file change still shows the existing
  floating diff popover. Clicking is *added* on top — it opens the full diff.
- **File changes only.** Only file-change surfaces (`EditDiffTrigger`) get the
  click-to-open-diff behavior. Other tool rows (Bash output, search, etc.) keep
  their normal expand-to-show-output behavior. Plain file rows that have no
  inline diff (`f.rawDiff == null`) are out of scope and unchanged.

## Current behavior (what exists today)

- `src/features/panel/message-components/tool-info.tsx` turns a tool call into a
  `ToolInfo`. For `Edit` / `apply_patch` it sets `file` (and per-file `name`) to
  **`basename(file_path)`** — the full path is discarded.
- `src/features/panel/message-components/tool-call.tsx` renders the file change
  via `EditDiffTrigger` (pill variant in the summary for single edits; row
  variant in the expanded list for multi-file patches).
- `src/features/panel/message-components/edit-diff.tsx` (`EditDiffTrigger`)
  shows a hover popover preview of the diff. It has **no click handler**.
- The diff-opening machinery already exists:
  `editorSessionActions.openFile(path, { fileStatus, preview })` in
  `src/shell/controllers/use-editor-session-controller.tsx` opens a `kind:"diff"`
  editor session. The inspector calls it via `onOpenEditorFile`.
- The conversation subtree already has a context bridge,
  `FileLinkContext` (`file-link-context.tsx`), currently exposing
  `openInEditor` (= `openFileReference`, a *plain file* open) and
  `workspaceRootPath`. It is provided in `conversation/index.tsx`.

## Design

### Data flow

```
editorSessionActions.openFile (diff opener, already exists)
  └─ passed as new prop onOpenFileDiff -> WorkspaceConversationContainer
       └─ added to FileLinkContext value as `openDiff`
            └─ consumed by EditDiffTrigger (edit-diff.tsx)
                 └─ onClick: resolve abs path, call openDiff(path, {fileStatus:"M", preview:true})
```

We reuse the existing `FileLinkContext` rather than threading a prop through the
deep message tree — this mirrors how `openInEditor` already reaches chat file
links.

### Changes by file

1. **`shared.ts`** — add an optional **full path** to the tool-info types so the
   absolute path survives basename truncation:
   - `ToolInfo`: add `path?: string`.
   - `FileChangeInfo`: add `path?: string`.
   (`file` / `name` remain the basename used for display.)

2. **`tool-info.tsx`** — populate the new `path` for file-change tools only:
   - `Edit`: `path: filePath ?? undefined`.
   - `apply_patch`: keep the raw `str(c.path)` per parsed file as `path`; set
     `path: parsed[0]?.path` on the single-file branch.
   (`file_path` from Claude is absolute; Codex `apply_patch` paths may be
   relative — both handled by the resolver in step 6.)

3. **`editor-session.ts`** — export a small path resolver:
   `resolveWorkspacePath(workspaceRootPath, path)`:
   - returns `null` if no root or no path;
   - if `path` is absolute (`startsWith("/")`), return it as-is;
   - otherwise join root + relative path (reusing the existing slash-trim logic
     already present as the private `joinPath`).

4. **`file-link-context.tsx`** — extend the context value with
   `openDiff?: (path: string, options?: DiffOpenOptions) => void`
   (import `DiffOpenOptions` from `@/lib/editor-session`).

5. **`conversation/index.tsx`** — add prop
   `onOpenFileDiff?: (path: string, options?: DiffOpenOptions) => void`; include
   `openDiff: onOpenFileDiff` in the memoized `fileLinkValue`.

6. **`workspace-pane-surface.tsx` + `start-surface-pane.tsx`** — pass
   `onOpenFileDiff={editorSessionActions.openFile}` alongside the existing
   `onOpenFileReference`. (Both render sites already hold `editorSessionActions`.)

7. **`edit-diff.tsx`** (`EditDiffTrigger`) — the core behavior change:
   - Accept a new prop `path?: string | null` (the full path).
   - Consume `const { openDiff, workspaceRootPath } = useFileLinkContext()`.
   - Compute `const target = resolveWorkspacePath(workspaceRootPath, path)`.
   - `const clickable = Boolean(openDiff && target)`.
   - When `clickable`, attach an `onClick` to the trigger span that:
     - calls `event.preventDefault()` + `event.stopPropagation()` — the pill
       variant lives inside a `<summary>`, so a bare click would toggle the
       parent `<details>`; we suppress that and open the diff instead;
     - calls `openDiff!(target!, { fileStatus: "M", preview: true })`.
   - Keep `cursor-interactive` (already present) when clickable; otherwise the
     element behaves exactly as today (hover-only, no pointer affordance change).
   - Add `role="button"` + keyboard (`Enter`/`Space`) handling when clickable for
     a11y, consistent with other interactive rows.

8. **`tool-call.tsx`** — pass the full path down:
   - top-level pill: `path={info.path}`.
   - row variant in the expanded file list: `path={f.path}`.

### `fileStatus`

We don't reliably know the git status (M/A/D) of a file from a tool call, and it
is not worth deriving. We always pass `fileStatus: "M"`. `openFile` treats `"M"`
as a side-by-side diff against the working tree's git base, which is correct for
edits and degrades gracefully for new files (original side simply shows empty).
This matches the inspector's own `?? "M"` fallback in `changes-group.tsx`.

### `preview: true`

Open as a VS Code-style preview tab (reuses the single preview slot) so rapidly
clicking several changes doesn't pile up tabs — same as the inspector.

## Error / edge handling

- **No workspace root / no path** → `clickable` is false; the trigger stays
  hover-only. No toast, no dead click.
- **Pill inside `<summary>`** → `preventDefault`/`stopPropagation` keep the click
  from toggling the tool row's expand state.
- **Path outside root** → `openFile`'s existing out-of-root effect bounces the
  editor back to chat; acceptable and pre-existing.
- **Out-of-scope rows** (plain file rows without `rawDiff`) → untouched.

## Testing

Frontend only — no `pipeline/`, `schema.rs`, persistence, or storage-shape
changes, so no Rust snapshot coverage is required (per AGENTS.md).

- **`tool-info.test.tsx`** (extend): assert the new `path` is preserved for
  `Edit` (absolute) and `apply_patch` (single + multi, relative) while `file` /
  `name` stay basenames.
- **`editor-session` test** (resolver): absolute path passthrough; relative path
  joined to root; null when root or path missing.
- **`edit-diff.test.tsx`** (new): render `EditDiffTrigger` inside a
  `FileLinkProvider` with a mock `openDiff`:
  - clicking a clickable trigger calls `openDiff(resolvedAbsPath, { fileStatus:
    "M", preview: true })`;
  - click `preventDefault`s (does not toggle a wrapping `<details>`);
  - no `openDiff` / no root → click is a no-op and hover still works.

Commands: `bun run typecheck`, `bun run test:frontend`, `bun run lint`.

## Out of scope

- Deriving precise git status (A/D) for the opened diff.
- Making plain file rows (no inline diff) clickable.
- Changing the hover popover preview.
- Any backend / sidecar / pipeline changes.
```
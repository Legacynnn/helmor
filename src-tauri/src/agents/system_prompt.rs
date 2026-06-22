//! Helmor-aware system prompt prepended to every user turn.
//!
//! ## What the agent sees
//!
//! Every send to Claude Code / Codex (and any future SDK we route
//! through `streaming::stream_via_sidecar`) gets a small "you are
//! inside Helmor" preamble stitched onto the front of the user's
//! prompt. The preamble:
//!
//! - Names the workspace the agent is running on (so an agent
//!   spawned into a second workspace knows which one it is).
//! - Tells the agent where its working directory + target branch are,
//!   plus any `/add-dir`-linked directories.
//! - Points at the `.agent-contexts/` scratch dir as the canonical
//!   place to leave files for other sessions.
//! - Tells the agent it can drive Helmor itself via the bundled CLI,
//!   and points it at the CLI's own `--help` for the full command
//!   surface (clap's `after_help` blocks own the examples). The
//!   `helmor-cli` skill is still auto-loaded on demand for prose
//!   context, but the prompt never duplicates the command list — the
//!   CLI's `--help` is the single source of truth, which means dev
//!   and release stay in sync automatically without us re-injecting
//!   commands every turn.
//! - Mentions the feedback button so the agent can correctly redirect
//!   "how do I report a bug?"-style asks.
//!
//! ## Why the user doesn't see this
//!
//! `streaming::stream_via_sidecar` already supports a hidden preamble
//! (`AgentSendRequest::prompt_prefix`). The wire payload to the SDK
//! sees the combined string; the chat bubble + DB row persist only the
//! user's typed text. Helmor's system prompt is appended in front of
//! whatever caller-supplied prefix already exists, so e.g. the
//! repo-preferences preamble from `use-streaming.ts` remains visible
//! to the agent as task-level guidance after Helmor's container-level
//! framing.
//!
//! ## Why we re-inject every turn
//!
//! SDK conversation history persists across turns, but only the
//! agent's internal context window — not Helmor's contract with the
//! agent. Re-injecting per turn is cheap (~600 chars / ~150 tokens),
//! immune to context-window truncation, and keeps the helmor-cli
//! skill cue visible at turn N when the user finally asks for
//! orchestration.

use std::fmt::Write;

/// Context the prompt template consumes. Construct once per send.
#[derive(Debug, Clone)]
pub struct HelmorSystemPromptContext {
    /// Human-friendly label for the current workspace. Format
    /// `<repo>/<workspace-directory>` so the agent's self-locating
    /// statement matches what the user sees in the sidebar.
    pub workspace_label: String,
    /// Absolute on-disk path of the workspace worktree.
    pub workspace_root_path: String,
    /// Resolved target branch, e.g. `origin/main`. Used by the agent
    /// for `git diff` baselines and PR creation. `None` means we
    /// couldn't determine it — the prompt downgrades the surrounding
    /// hint into a "configure a target branch in the workspace
    /// settings" suggestion.
    pub target_branch: Option<String>,
    /// Plain branch name (no remote prefix) — what `gh pr create
    /// --base` wants.
    pub base_branch: Option<String>,
    /// Extra directories the user added via `/add-dir`. Empty list
    /// elides the entire linked-directories paragraph.
    pub linked_directories: Vec<String>,
    /// The CLI invocation string the agent should use to talk to
    /// THIS Helmor instance.
    ///
    /// - Release builds: `helmor` (the stable on-PATH symlink).
    /// - Dev builds: the absolute path of `helmor-cli` next to the
    ///   currently-running Helmor executable. Bare `helmor-dev` would
    ///   be ambiguous under the worktree-based dev workflow — multiple
    ///   Helmor dev instances coexist and a shared symlink can only
    ///   point at one of them, so we hand the agent an absolute path
    ///   that's unambiguously tied to this instance.
    ///
    /// Either way the agent is expected to call the value verbatim;
    /// it does NOT need to verify the binary first (`which`, `file`,
    /// `--version` etc.) because we already know it exists — it's the
    /// process the agent is talking to.
    pub cli_command_name: String,
    /// Stacked-PR awareness for this workspace. `Some` only when the workspace
    /// belongs to a multi-layer stack; drives the stack block in the preamble.
    /// Computed by the caller (it needs DB access to walk the chain).
    pub stack: Option<StackContext>,
    /// The permission mode this turn is running under (`"plan"`, `"auto"`,
    /// `"accept-edits"`, etc.). Drives the MDX plan-authoring block, which
    /// only applies in `"plan"` mode. `None` is treated as "not plan mode".
    pub permission_mode: Option<String>,
    /// Whether the experimental `app.mdx_planning_enabled` setting is on.
    /// When `true` AND `permission_mode == "plan"`, the preamble appends the
    /// MDX plan-authoring contract so the agent writes its plan as an MDX
    /// file under `.helmor/plans/` instead of an inline plan.
    pub mdx_planning: bool,
}

/// Lightweight stacked-PR context injected into the workspace preamble so the
/// agent knows its place in the stack and fetches the rest itself.
#[derive(Debug, Clone)]
pub struct StackContext {
    /// 1-based position from the bottom of the stack (root = 1).
    pub position: usize,
    /// Total number of layers in the stack.
    pub total: usize,
    /// Branch this layer is stacked on (its parent's branch); `None` for the
    /// bottom layer, whose base is the repo default.
    pub parent_branch: Option<String>,
}

/// Context the chat-mode prompt template consumes. Chat sessions are
/// not bound to a repository or worktree, so the workspace label /
/// working directory / target branch / `.agent-contexts/` story
/// doesn't apply — we surface a smaller preamble that only carries
/// the bits a "Just Chat" agent actually needs.
#[derive(Debug, Clone)]
pub struct HelmorChatPromptContext {
    /// Same CLI invocation rules as
    /// [`HelmorSystemPromptContext::cli_command_name`].
    pub cli_command_name: String,
}

/// Render the preamble. Deterministic, no I/O, side-effect-free —
/// safe to call from any context. The result already trims trailing
/// whitespace so the consumer can `format!("{prefix}\n\n{rest}")`
/// without doubling up newlines.
pub fn build_helmor_system_prompt(ctx: &HelmorSystemPromptContext) -> String {
    let mut out = String::with_capacity(640);

    out.push_str("<helmor_context>\n");
    out.push_str("You are running inside Helmor, a Mac app that lets the user run many coding agents in parallel.\n");
    let _ = writeln!(
        out,
        "You are working on the workspace `{}`. The user is watching this conversation live in Helmor's GUI.",
        ctx.workspace_label,
    );
    let _ = writeln!(
        out,
        "Your working directory is `{}` (unless redirected). Stay inside it for file edits and shell commands unless the user opens a linked directory.",
        ctx.workspace_root_path,
    );

    match (ctx.target_branch.as_deref(), ctx.base_branch.as_deref()) {
        (Some(target), Some(base)) => {
            let _ = writeln!(
                out,
                "Target branch for this workspace: `{target}`. Use it for diffs (`git diff {target}...`) and PRs (`gh pr create --base {base}`).",
            );
        }
        _ => {
            out.push_str(
                "Target branch for this workspace is not configured — ask the user before opening a PR.\n",
            );
        }
    }

    if let Some(stack) = &ctx.stack {
        let _ = write!(
            out,
            "\nStacked PR: this workspace is layer {} of {} in a PR stack",
            stack.position, stack.total,
        );
        if let Some(parent) = stack.parent_branch.as_deref() {
            let _ = write!(out, " (stacked on `{parent}`)");
        }
        let _ = writeln!(
            out,
            ". The layers below you are already in your branch — implement only THIS layer's slice, not the lower layers (already done) or the layer above (another agent's). Run `{cli} workspace stack` for the full chain; after a lower layer changes or merges, run `/helmor-cli restack` to re-sync the stack.",
            cli = ctx.cli_command_name,
        );
    }

    if !ctx.linked_directories.is_empty() {
        out.push_str(
            "You also have read/write access to the following linked directories (added via `/add-dir`):\n",
        );
        for dir in &ctx.linked_directories {
            let _ = writeln!(out, "  - {dir}");
        }
        out.push_str(
            "Treat them as part of your working context — file references and shell commands should resolve there the same way they do inside the workspace.\n",
        );
    }

    out.push_str(
        "\nFor any agent-created temporary or supporting files that are not intended as product changes, use `<workspace_root>/.agent-contexts/<short-task-slug>/`. This includes web-research notes, plans, findings, downloaded snippets, screenshots, logs, intermediate reports, and files meant for other agents or future sessions.\n",
    );
    out.push_str(
        "\nDo not create top-level scratch or research directories in the workspace root, such as `research_*`, `notes/`, `tmp/`, or `artifacts/`, unless the user explicitly asks for repo-tracked files there.\n",
    );
    out.push_str(
        "\nBefore finalizing, run `git status --short`; move any accidental scratch artifacts outside `.agent-contexts/` into `.agent-contexts/`, or remove them if they are no longer needed. `.agent-contexts/` is gitignored via the repo-local exclude file, so anything you write there stays out of every diff.\n",
    );

    let _ = write!(
        out,
        "\nHelmor itself is scriptable via `{cli}`. When you need to operate Helmor (spawn workspaces, dispatch ship actions, read other agents' sessions, etc.), run `{cli} --help` or `{cli} <subcommand> --help` — each subcommand's help block includes examples you can copy. Invoke `{cli}` verbatim; do NOT verify it first with `which`, `file`, `--version`, or by searching `target/debug` — it is already the binary this Helmor instance owns, and pre-verifying eats your turn.\n",
        cli = ctx.cli_command_name,
    );

    out.push_str(
        "\nIf the user asks for help with Helmor itself, point them at the feedback button at the bottom of Helmor's sidebar.\n",
    );

    if ctx.permission_mode.as_deref() == Some("plan") && ctx.mdx_planning {
        out.push_str(MDX_PLAN_AUTHORING_BLOCK);
    }

    out.push_str("</helmor_context>");
    out
}

/// Plan-mode + experimental-MDX-planning contract. Appended to the
/// preamble only when the turn runs under `permission_mode == "plan"`
/// AND `app.mdx_planning_enabled` is on. The agent authors its plan as
/// an MDX file with its OWN file tools (Write/Edit) — there is no
/// special tool — then calls ExitPlanMode pointing at the file so the
/// user reviews it in the Plan tab.
///
/// The block-element rule is load-bearing: Helmor's MDX parser only
/// recognises components whose opening/closing tags sit on their own
/// lines. Inline JSX is rendered as plain text, so the contract
/// emphasises it repeatedly.
///
/// IMPORTANT: the component names in this block MUST stay in sync with the
/// `PLAN_COMPONENTS` allowlist in `src/features/plan-viewer/mdx/registry.tsx`
/// (SYNC-WITH). A component listed here but absent there renders as
/// `<UnsupportedBlock>` with no error.
const MDX_PLAN_AUTHORING_BLOCK: &str = r#"
You are in plan mode with Helmor's MDX planning enabled. Do NOT reply with an inline plan. Instead, author the implementation plan as an MDX document and save it to `.helmor/plans/<slug>.mdx`, where `<slug>` is a short kebab-case slug derived from the task (create the `.helmor/plans/` directory first if it does not exist). Write the file with your normal file tools (Write/Edit) — there is no special plan tool.

Begin the file with YAML frontmatter delimited by `---` lines, containing exactly:
  - `title:` a quoted one-line title.
  - `status: draft`
  - `summary:` a quoted one-line summary.

In the body, use ONLY the components listed below for structured content, and use normal markdown prose for everything else. CRITICAL: write every component as a BLOCK element — its opening and closing tags must each sit on their OWN line, never inline within a paragraph. Helmor's MDX parser renders inline JSX as plain text, so a component written inline will NOT render. All props must be plain string literals; never use `{expressions}`.

Allowed components:
  - `<RiskCard severity="low|medium|high">` … markdown … `</RiskCard>` — a risk or gotcha callout.
  - `<Steps>` containing a markdown ordered list (`1. …`, `2. …`) of implementation steps. There is NO `<Step>` component — do NOT nest a `<Step>` tag; put a `1. …` markdown ordered list directly inside `<Steps>`. Each step should name what it reuses before what it adds.
  - `<FileMap>` whose contents are lines of the form `create path/to/file`, `modify path/to/file`, or `delete path/to/file`.
  - `<OpenQuestions>` containing a markdown list of decisions that need the user's input.
  - `<AnnotatedCode code="…" lang="…" note="…" />` for an annotated snippet (the code may instead be passed as the component's children).
  - `<Diagram>` containing mermaid diagram source (no code fences) for architecture or data flow.
  - `<PlanCanvas direction="TB|LR">` containing `<CanvasNode>` children — an interactive mind-map shown at the TOP of the plan that visualises how the task's pieces connect. Prefer placing one PlanCanvas first, before the prose sections, as a high-level overview. Keep it focused (roughly 3–8 nodes).
  - `<CanvasNode id="unique-id" title="Short title" connects="other-id,another-id">` … short markdown … `</CanvasNode>` — one box in the PlanCanvas. `id` must be unique; `connects` is a comma-separated list of other node ids this box links to. Keep the body to a sentence or a short list. Use a self-closing `<CanvasNode ... />` when there is no body. CanvasNode is ONLY valid inside a PlanCanvas. Optionally set `kind="note|resume|option|phase|wireframe"` to style a node by its role (e.g. a `resume` summary box or an `option` box).
  - `<Decision>` containing `<Option title="..." recommended>` … markdown pros/cons … `</Option>` children — present 2–4 candidate approaches as cards and mark the best one with the boolean `recommended` attribute. `<Option>` is ONLY valid inside a `<Decision>`.
  - `<BeforeAfter>` containing exactly one `<Before>` … markdown … `</Before>` and one `<After>` … markdown … `</After>` — a side-by-side comparison of current vs. proposed behavior. `<Before>`/`<After>` are ONLY valid inside a `<BeforeAfter>`.
  - `<Diff lang="...">` whose contents are unified-diff lines: each line starts with `+` (added line), `-` (removed line), or a space (unchanged context). Use it for concrete before/after code changes. `lang` is an optional language label.
  - `<Timeline>` containing `<Phase title="..." status="done|active|todo">` … markdown … `</Phase>` children — a sequenced list of milestones or phases. `<Phase>` is ONLY valid inside a `<Timeline>`.
  - `<Wireframe label="..." surface="browser|app|mobile|panel|popover">` whose contents are low-fidelity mockup lines — one element per line, leading-space indentation = nesting, from this fixed set: `row`/`col`/`box` (containers) and `heading`/`text`/`field`/`input`/`pill`/`button`/`image`/`divider` (elements), each optionally followed by a label (e.g. `button Sign in`). `surface` picks the device/window chrome (defaults to `browser`). Compose real product content that fills the frame, not gray placeholder bars. Use it to sketch a proposed UI.
  - `<MultiPrototype>` containing 2–4 `<Variant label="..." recommended>` … usually a single `<Wireframe>` … `</Variant>` children — compares prototype options as tabs; mark the preferred one `recommended`. `<Variant>` is ONLY valid inside a `<MultiPrototype>`.
  - `<DataModel>` containing `<Entity name="...">` … `fieldName: type` lines … `</Entity>` children — typed entity/schema tables. `<Entity>` is ONLY valid inside a `<DataModel>`.

Keep explanatory prose between the components so the document reads as a coherent plan.

After writing the file, call ExitPlanMode and pass the plan file path as the `filePath` argument (the workspace-relative path `.helmor/plans/<slug>.mdx`) so Helmor can open it in the Plan tab. The `filePath` argument is required — without it the plan will not surface.
"#;

/// Render the "Just Chat" variant of the preamble. Used for
/// `WorkspaceMode::Chat` sessions that have no repo / no worktree /
/// no target branch — the workspace-bound prompt's workspace label,
/// working directory, target branch, and `.agent-contexts/` lines
/// would all be either wrong or misleading there. Same `<helmor_context>`
/// envelope so logs / SDK clients can spot Helmor's preamble at a glance.
pub fn build_helmor_chat_prompt(ctx: &HelmorChatPromptContext) -> String {
    let mut out = String::with_capacity(384);

    out.push_str("<helmor_context>\n");
    out.push_str("You are running inside Helmor, a Mac app that lets the user run many coding agents in parallel.\n");
    out.push_str(
        "This is a \"Just Chat\" session — it is not bound to any repository or workspace, so there is no working directory, no target branch, and no git context. Do not assume a project structure, and do not run commands that need one (no `git`, no project-relative file edits, no PRs) unless the user explicitly points you at one.\n",
    );

    let _ = write!(
        out,
        "\nHelmor itself is scriptable via `{cli}`. When you need to operate Helmor (spawn workspaces, dispatch ship actions, read other agents' sessions, etc.), run `{cli} --help` or `{cli} <subcommand> --help` — each subcommand's help block includes examples you can copy. Invoke `{cli}` verbatim; do NOT verify it first with `which`, `file`, `--version`, or by searching `target/debug` — it is already the binary this Helmor instance owns, and pre-verifying eats your turn.\n",
        cli = ctx.cli_command_name,
    );

    out.push_str(
        "\nIf the user asks for help with Helmor itself, point them at the feedback button at the bottom of Helmor's sidebar.\n",
    );

    out.push_str("</helmor_context>");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx_with_defaults() -> HelmorSystemPromptContext {
        HelmorSystemPromptContext {
            workspace_label: "dohooo/feature-x".to_string(),
            workspace_root_path: "/Users/me/helmor/workspaces/dohooo/feature-x".to_string(),
            target_branch: Some("origin/main".to_string()),
            base_branch: Some("main".to_string()),
            linked_directories: Vec::new(),
            cli_command_name: "helmor".to_string(),
            stack: None,
            permission_mode: None,
            mdx_planning: false,
        }
    }

    /// Sanity: every workspace-aware field reaches the rendered prompt
    /// so the agent can self-locate.
    #[test]
    fn renders_workspace_label_and_root_path() {
        let prompt = build_helmor_system_prompt(&ctx_with_defaults());
        assert!(prompt.contains("`dohooo/feature-x`"));
        assert!(prompt.contains("`/Users/me/helmor/workspaces/dohooo/feature-x`"));
    }

    /// Resolved target + base branch → the diff/PR commands are
    /// pre-substituted with the real branch names. This is the load-
    /// bearing line the agent uses to decide where to base PRs.
    #[test]
    fn target_branch_block_includes_diff_and_pr_commands() {
        let prompt = build_helmor_system_prompt(&ctx_with_defaults());
        assert!(prompt.contains("`origin/main`"));
        assert!(prompt.contains("git diff origin/main..."));
        assert!(prompt.contains("gh pr create --base main"));
    }

    /// Missing target branch → the prompt switches to a "ask the user"
    /// fallback instead of generating broken commands. Pins the
    /// degraded behaviour so a future "always assume origin/main"
    /// regression shows up here.
    #[test]
    fn target_branch_unresolved_downgrades_to_ask_user_hint() {
        let mut ctx = ctx_with_defaults();
        ctx.target_branch = None;
        ctx.base_branch = None;
        let prompt = build_helmor_system_prompt(&ctx);
        assert!(prompt.contains("not configured"));
        assert!(!prompt.contains("git diff"));
        assert!(!prompt.contains("gh pr create"));
    }

    /// Empty linked-directories list → the whole paragraph is elided.
    /// Without this guarantee the agent would see a dangling
    /// "you also have access to:" sentence with no bullets.
    #[test]
    fn linked_directories_paragraph_is_elided_when_list_empty() {
        let prompt = build_helmor_system_prompt(&ctx_with_defaults());
        assert!(!prompt.contains("linked directories"));
    }

    /// A multi-layer stack injects the stack-awareness block: position, base
    /// pointer, and the fetch-it-yourself pointers.
    #[test]
    fn stacked_workspace_injects_stack_block() {
        let mut ctx = ctx_with_defaults();
        ctx.stack = Some(StackContext {
            position: 2,
            total: 3,
            parent_branch: Some("demo/theme-schema".to_string()),
        });
        let prompt = build_helmor_system_prompt(&ctx);
        assert!(prompt.contains("layer 2 of 3"));
        assert!(prompt.contains("`demo/theme-schema`"));
        assert!(prompt.contains("workspace stack"));
        assert!(prompt.contains("/helmor-cli restack"));
    }

    /// A non-stacked workspace gets no stack block at all.
    #[test]
    fn non_stacked_workspace_has_no_stack_block() {
        let prompt = build_helmor_system_prompt(&ctx_with_defaults());
        assert!(!prompt.contains("Stacked PR:"));
        assert!(!prompt.contains("/helmor-cli restack"));
    }

    /// Non-empty list → the paragraph appears with each entry on its
    /// own bullet, and the trailing explanation sentence is present
    /// so the agent knows to treat them as in-scope.
    #[test]
    fn linked_directories_paragraph_renders_each_entry() {
        let mut ctx = ctx_with_defaults();
        ctx.linked_directories = vec!["/Users/me/lib-a".to_string(), "/Users/me/lib-b".to_string()];
        let prompt = build_helmor_system_prompt(&ctx);
        assert!(prompt.contains("linked directories"));
        assert!(prompt.contains("- /Users/me/lib-a"));
        assert!(prompt.contains("- /Users/me/lib-b"));
        assert!(prompt.contains("Treat them as part of your working context"));
    }

    /// The agent-contexts scratch-dir paragraph is always present —
    /// it's a feature contract, not a conditional. Pin so a future
    /// refactor that moves it behind a flag breaks loudly here.
    #[test]
    fn agent_contexts_scratch_paragraph_is_always_present() {
        let prompt = build_helmor_system_prompt(&ctx_with_defaults());
        assert!(prompt.contains(".agent-contexts/"));
        assert!(prompt.contains("gitignored"));
        assert!(prompt.contains("web-research notes"));
        assert!(prompt.contains("Do not create top-level scratch or research directories"));
        assert!(prompt.contains("git status --short"));
    }

    /// The prompt points the agent at the CLI's own `--help` instead
    /// of inlining a command cheat sheet. Two reasons: (a) per-turn
    /// token budget stays small, (b) the CLI's `--help` is the single
    /// source of truth, so dev/release stay in sync automatically.
    /// Pin so a future refactor that re-inlines a command list breaks
    /// loudly here.
    #[test]
    fn helmor_cli_paragraph_points_at_help_not_inlined_commands() {
        let prompt = build_helmor_system_prompt(&ctx_with_defaults());
        // The CLI name must be paired with `--help` so the agent
        // knows where to look.
        assert!(
            prompt.contains("`helmor --help`"),
            "release prompt should tell the agent to run `helmor --help`"
        );
        // We deliberately don't list subcommand recipes — that's
        // clap `after_help`'s job, lazily read when the agent
        // actually needs them.
        assert!(
            !prompt.contains("workspace new --repo"),
            "command recipes belong in clap after_help, not the prompt prefix"
        );
        assert!(
            !prompt.contains("session send-prompt"),
            "command recipes belong in clap after_help, not the prompt prefix"
        );
    }

    /// Trust signal: agent must be told the CLI invocation is
    /// reliable and pre-verification (`which`, `file`, `--version`,
    /// searching `target/debug`, etc.) is wasted effort. This pins
    /// the fix for the "agent spent 14 commands introspecting the
    /// CLI before doing anything" failure mode.
    #[test]
    fn helmor_cli_paragraph_tells_agent_not_to_pre_verify() {
        let prompt = build_helmor_system_prompt(&ctx_with_defaults());
        assert!(
            prompt.contains("do NOT verify"),
            "prompt must explicitly forbid pre-verification of the CLI binary"
        );
    }

    /// Dev builds hand the agent an absolute path so each Helmor
    /// instance's agent talks to the exact CLI binary that belongs to
    /// it — required under the worktree-based dev workflow where
    /// multiple dev instances coexist. Pin the substitution so a
    /// future "always use the bare `helmor-dev` name" regression
    /// breaks here.
    #[test]
    fn cli_command_name_is_threaded_through_for_dev_builds() {
        let mut ctx = ctx_with_defaults();
        ctx.cli_command_name =
            "/Users/me/helmor-wt/feature-x/src-tauri/target/debug/helmor-cli".to_string();
        let prompt = build_helmor_system_prompt(&ctx);
        assert!(
            prompt.contains("`/Users/me/helmor-wt/feature-x/src-tauri/target/debug/helmor-cli`"),
            "dev builds must surface the absolute CLI path"
        );
        // And the `--help` pairing must use the same path so the
        // agent can copy-paste it directly.
        assert!(
            prompt.contains(
                "`/Users/me/helmor-wt/feature-x/src-tauri/target/debug/helmor-cli --help`"
            ),
            "dev `--help` invocation must use the same absolute path"
        );
    }

    /// Release builds use the canonical `helmor` name. Pin so a
    /// future refactor that always emits an absolute path (or
    /// `helmor-dev`) regardless of build doesn't silently misadvise
    /// release agents.
    #[test]
    fn cli_command_name_uses_release_binary_in_release_builds() {
        let prompt = build_helmor_system_prompt(&ctx_with_defaults());
        assert!(prompt.contains("`helmor`"));
        assert!(prompt.contains("`helmor --help`"));
        assert!(
            !prompt.contains("target/debug/helmor-cli"),
            "release prompt must not mention dev-only paths"
        );
        assert!(
            !prompt.contains("helmor-dev"),
            "release prompt must not surface the dev binary name"
        );
    }

    /// Feedback line points at the sidebar button — matches the real
    /// UI location (`shell-sidebar-pane.tsx:155`). Pin so a copy
    /// drift here doesn't send users hunting in a menu that doesn't
    /// exist.
    #[test]
    fn feedback_pointer_points_at_sidebar_button() {
        let prompt = build_helmor_system_prompt(&ctx_with_defaults());
        assert!(prompt.contains("feedback button"));
        assert!(prompt.contains("sidebar"));
    }

    /// The whole thing is wrapped in a single `<helmor_context>` tag
    /// so the SDK / log viewer can spot Helmor's preamble at a glance.
    /// Keeping it as one block (not split between system + user) means
    /// the agent treats it as additional context, not an authoritative
    /// instruction, which is what we want.
    #[test]
    fn output_is_wrapped_in_helmor_context_tag() {
        let prompt = build_helmor_system_prompt(&ctx_with_defaults());
        assert!(prompt.starts_with("<helmor_context>"));
        assert!(prompt.ends_with("</helmor_context>"));
    }

    /// Plan mode + the experimental `mdx_planning` flag → the agent is
    /// handed the MDX plan-authoring contract: where to write the file,
    /// the frontmatter shape, the allowed components, and the
    /// block-element rule the MDX parser depends on. Pin the load-bearing
    /// markers so a copy drift that breaks the contract surfaces here.
    #[test]
    fn plan_mode_with_mdx_planning_injects_authoring_contract() {
        let mut ctx = ctx_with_defaults();
        ctx.permission_mode = Some("plan".to_string());
        ctx.mdx_planning = true;
        let prompt = build_helmor_system_prompt(&ctx);
        assert!(prompt.contains(".helmor/plans/"));
        assert!(prompt.contains("RiskCard"));
        assert!(prompt.contains("Steps"));
        assert!(prompt.contains("FileMap"));
        assert!(prompt.contains("OpenQuestions"));
        assert!(prompt.contains("AnnotatedCode"));
        assert!(prompt.contains("Diagram"));
        assert!(prompt.contains("PlanCanvas"));
        assert!(prompt.contains("CanvasNode"));
        assert!(prompt.contains("Decision"));
        assert!(prompt.contains("BeforeAfter"));
        assert!(prompt.contains("Diff"));
        assert!(prompt.contains("Timeline"));
        // Sub-components the agent must nest. "Before"/"After" are substrings
        // of "BeforeAfter" so they need no separate assertion; "Option" and
        // "Phase" are distinct names that would silently drop if the prose
        // edits lose them (the parent would then render with no children).
        assert!(prompt.contains("Option"));
        assert!(prompt.contains("Phase"));
        assert!(prompt.contains("Wireframe"));
        assert!(prompt.contains("MultiPrototype"));
        assert!(prompt.contains("Variant"));
        assert!(prompt.contains("DataModel"));
        assert!(prompt.contains("Entity"));
        // Wireframe primitives with distinct (non-common-word) names; the others
        // (input/button/row/col/box/text/image/divider) are common words that
        // appear elsewhere in the prompt, so only these three pin uniquely.
        assert!(prompt.contains("heading"));
        assert!(prompt.contains("field"));
        assert!(prompt.contains("pill"));
        assert!(prompt.contains("ExitPlanMode"));
        // The block-element rule is the one the MDX parser actually
        // depends on — inline JSX renders as plain text.
        assert!(prompt.contains("OWN line"));
        assert!(prompt.contains("BLOCK element"));
        // Frontmatter contract.
        assert!(prompt.contains("status: draft"));
    }

    /// The MDX contract is gated on BOTH plan mode AND the experimental
    /// flag. Flag off → no contract, even in plan mode.
    #[test]
    fn plan_mode_without_mdx_planning_flag_omits_contract() {
        let mut ctx = ctx_with_defaults();
        ctx.permission_mode = Some("plan".to_string());
        ctx.mdx_planning = false;
        let prompt = build_helmor_system_prompt(&ctx);
        assert!(!prompt.contains(".helmor/plans/"));
        assert!(!prompt.contains("RiskCard"));
    }

    /// The MDX contract is gated on plan mode. Flag on but a non-plan
    /// permission mode → no contract.
    #[test]
    fn non_plan_mode_with_mdx_planning_flag_omits_contract() {
        let mut ctx = ctx_with_defaults();
        ctx.permission_mode = Some("auto".to_string());
        ctx.mdx_planning = true;
        let prompt = build_helmor_system_prompt(&ctx);
        assert!(!prompt.contains(".helmor/plans/"));
        assert!(!prompt.contains("RiskCard"));
    }

    // ── Chat-mode preamble ────────────────────────────────────────────

    fn chat_ctx() -> HelmorChatPromptContext {
        HelmorChatPromptContext {
            cli_command_name: "helmor".to_string(),
        }
    }

    /// Chat sessions have no repo / no worktree / no target branch /
    /// no `.agent-contexts/` story. Pin that none of the workspace-
    /// bound lines leak into the chat preamble — a regression that
    /// reintroduces any of these would mislead the agent into looking
    /// for a git context that doesn't exist.
    #[test]
    fn chat_prompt_omits_workspace_bound_lines() {
        let prompt = build_helmor_chat_prompt(&chat_ctx());
        assert!(
            !prompt.contains("You are working on the workspace"),
            "chat prompt must not pin a workspace (chat sessions aren't bound to one)"
        );
        assert!(
            !prompt.contains("Your working directory is"),
            "chat prompt must not pin a working directory"
        );
        assert!(
            !prompt.contains("Target branch for this workspace"),
            "chat prompt must not advertise a target branch"
        );
        assert!(
            !prompt.contains("gh pr create"),
            "chat prompt must not pre-substitute PR creation commands"
        );
        assert!(
            !prompt.contains(".agent-contexts/"),
            "chat prompt must not advertise the agent-contexts scratch dir"
        );
        assert!(
            !prompt.contains("linked directories"),
            "chat prompt must not mention `/add-dir` linked directories"
        );
    }

    /// Chat sessions must be self-locating: the agent should know it's
    /// a "Just Chat" session and adjust expectations (no project, no
    /// PR). Pin the user-facing language so a future refactor doesn't
    /// silently drop the disclosure.
    #[test]
    fn chat_prompt_states_it_is_chat_and_warns_against_assuming_repo() {
        let prompt = build_helmor_chat_prompt(&chat_ctx());
        assert!(prompt.contains("Just Chat"));
        assert!(prompt.contains("not bound to any repository"));
    }

    /// CLI section + feedback pointer apply to chat sessions too —
    /// they can still drive Helmor and still need to report bugs.
    #[test]
    fn chat_prompt_keeps_cli_and_feedback_sections() {
        let prompt = build_helmor_chat_prompt(&chat_ctx());
        assert!(prompt.contains("`helmor`"));
        assert!(prompt.contains("`helmor --help`"));
        assert!(prompt.contains("do NOT verify"));
        assert!(prompt.contains("feedback button"));
    }

    /// Same `<helmor_context>` envelope so log viewers / SDK clients
    /// can spot the preamble regardless of which template emitted it.
    #[test]
    fn chat_prompt_is_wrapped_in_helmor_context_tag() {
        let prompt = build_helmor_chat_prompt(&chat_ctx());
        assert!(prompt.starts_with("<helmor_context>"));
        assert!(prompt.ends_with("</helmor_context>"));
    }
}

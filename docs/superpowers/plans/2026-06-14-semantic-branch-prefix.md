# Semantic (Conventional Commits) Branch Prefix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth per-repo branch-prefix mode, **Semantic**, where the LLM that already generates the branch slug also classifies the change into a Conventional-Commits type (`feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `style`, `build`, `ci`) and the branch becomes `<type>/<slug>` (e.g. `fix/auth-redirect`).

**Architecture:** Implemented as the **centralized** variant of Approach A. All type logic lives in the shared title helpers (`sidecar/src/title.ts` and its Rust mirror `src-tauri/src/local_llm/title.rs`). When the repo is in Semantic mode, a `semantic` flag is threaded from `agents/queries.rs` → the title-generation request → the shared `buildTitlePrompt`/`parseTitleAndBranch`. The type is parsed, lower-cased, validated against the allowed set (default `chore`), and joined to the slug **after** the slug-sanitizing regex runs — so the `/` separator is never stripped. The combined `type/slug` travels back through the existing single `branchName` field; no emitter, worker-protocol, or `titleGenerated` event-shape changes are needed. On the Rust side, `branch_name_for_directory` treats `Semantic` like `None` (empty prefix) because the type is already baked into the slug; before the first prompt the branch is the bare celestial name (`tokyo`).

**Tech Stack:** Rust (Tauri backend, `rusqlite`, `insta`-free unit tests), Bun + TypeScript (sidecar, `bun test`), React 19 + TypeScript (settings UI), Biome.

**Deviation from spec (intentional, approved):** The spec described adding a `semantic_type: Option<&str>` parameter to `branch_name_for_directory`. During planning we confirmed the centralized approach makes this unnecessary — the type arrives already embedded in the slug, so `Semantic` only needs an empty-prefix match arm and **no signature/caller changes**. This is simpler and is the chosen implementation.

---

## File Structure

**Rust (`src-tauri/src/`)**
- `models/settings.rs` — add `BranchPrefixType::Semantic` variant + `as_storage_str` + `FromStr` + unit tests. (`update_repository_branch_prefix` in `models/repos.rs` and the `update_repository_branch_prefix` command already round-trip via `as_storage_str` and clear `custom` for non-`Custom` — no change needed there.)
- `workspace/helpers.rs` — add the `Semantic => String::new()` arm to `branch_name_for_directory` + unit test.
- `local_llm/title.rs` — add `semantic` flag to `build_title_prompt`, `parse_title_response`, and `generate_title`; type set + join-after-sanitize + unit tests.
- `agents/queries.rs` — compute `is_semantic`; pass it to the local-LLM call and into the sidecar JSON params. No event-parsing change.

**Sidecar (`sidecar/src/`)**
- `title.ts` — type set, `buildTitlePrompt(..., semantic)`, `parseTitleAndBranch(raw, semantic)`, diagnostics + `TitleGenerationDiagnosticsOptions.semantic`.
- `session-manager.ts` — add `semantic?: boolean` to `GenerateTitleOptions`.
- `index.ts` — parse `params.semantic` and forward it in the options object.
- `claude-session-manager.ts`, `codex-app-server-manager.ts`, `copilot-session-manager.ts`, `cursor-worker/cursor-core.ts`, `opencode-protocol/session-manager.ts` — forward `options.semantic` into the two shared calls (`buildTitlePrompt`, `parseTitleAndBranchWithDiagnostics`). (`kimi-session-manager.ts` does not build a branch slug — no change.)

**Tests**
- `sidecar/test/title.test.ts` — semantic prompt + parse cases.
- `src-tauri/src/models/settings.rs` (`#[cfg(test)]`) — `Semantic` parse/round-trip.
- `src-tauri/src/workspace/helpers.rs` (`#[cfg(test)]`) — `Semantic` prefix behavior.
- `src-tauri/src/local_llm/title.rs` (`#[cfg(test)]`) — semantic parse/join + chore fallback.

**Frontend (`src/`)**
- `lib/api.ts` — extend `BranchPrefixType` union with `"semantic"`.
- `features/settings/panels/repository-settings/branch-prefix-section.tsx` — 4th radio + preview + persistence.

**Shared constant (the allowed type set + default), duplicated deliberately** in `title.ts` and `local_llm/title.rs` because the two LLM paths live in different languages/processes and must stay in sync (call this out in code comments).

---

## Task 1: Add the `Semantic` enum variant (Rust settings)

**Files:**
- Modify: `src-tauri/src/models/settings.rs:15-45` (enum, `as_storage_str`, `FromStr`)
- Test: `src-tauri/src/models/settings.rs` (existing `#[cfg(test)] mod tests`)

- [ ] **Step 1: Extend the round-trip + parse tests to expect `Semantic`**

In `src-tauri/src/models/settings.rs`, update the three relevant tests. Add to `branch_prefix_type_parses_canonical_variants`:

```rust
        assert_eq!(
            BranchPrefixType::from_str("semantic").unwrap(),
            BranchPrefixType::Semantic
        );
```

Add `BranchPrefixType::Semantic` to the array in `branch_prefix_type_round_trips_storage_strings`:

```rust
        for variant in [
            BranchPrefixType::Username,
            BranchPrefixType::Custom,
            BranchPrefixType::None,
            BranchPrefixType::Semantic,
        ] {
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test --lib models::settings::tests::branch_prefix_type`
Expected: FAIL — `no variant named Semantic found for enum BranchPrefixType` (compile error).

- [ ] **Step 3: Add the variant + mappings**

In the `BranchPrefixType` enum (after `None`):

```rust
    /// `<type>/<dir>` — Conventional-Commits type chosen automatically by
    /// the title LLM (feat/fix/refactor/...). The type is baked into the
    /// branch slug by the title pipeline; the prefix resolver treats this
    /// like `None` (empty prefix).
    Semantic,
```

In `as_storage_str`:

```rust
            BranchPrefixType::Semantic => "semantic",
```

In `FromStr::from_str` match:

```rust
            "semantic" => Ok(BranchPrefixType::Semantic),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test --lib models::settings::tests::branch_prefix_type`
Expected: PASS (all 4 branch-prefix tests green).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/models/settings.rs
git commit -m "feat(branch-prefix): add Semantic BranchPrefixType variant"
```

---

## Task 2: Resolve `Semantic` to an empty prefix (Rust helpers)

**Files:**
- Modify: `src-tauri/src/workspace/helpers.rs:615-631` (the `match prefix_type` in `branch_name_for_directory`)
- Test: `src-tauri/src/workspace/helpers.rs` (`#[cfg(test)] mod tests` — add if a tests module exists; otherwise add one)

**Why no signature change:** in Semantic mode the type is already part of the slug passed in (e.g. `fix/auth-redirect`), and at creation time only the celestial name is known (bare `tokyo`). Both cases want an empty prefix.

- [ ] **Step 1: Write the failing test**

Add to the tests module in `src-tauri/src/workspace/helpers.rs` (use a `EffectiveBranchPrefixSettings` literal like the existing tests in this file do):

```rust
    #[test]
    fn branch_name_semantic_mode_uses_empty_prefix() {
        use crate::settings::{BranchPrefixType, EffectiveBranchPrefixSettings};
        let settings = EffectiveBranchPrefixSettings {
            branch_prefix_type: Some(BranchPrefixType::Semantic),
            branch_prefix_custom: None,
            forge_provider: None,
            remote_url: None,
            forge_login: Some("alice".to_string()),
        };
        // Pre-prompt: bare celestial name, no guessed type.
        assert_eq!(super::branch_name_for_directory("tokyo", &settings), "tokyo");
        // Post-classification: the type is already in the slug; prefix stays empty.
        assert_eq!(
            super::branch_name_for_directory("fix/auth-redirect", &settings),
            "fix/auth-redirect"
        );
    }
```

> If `src-tauri/src/workspace/helpers.rs` has no `#[cfg(test)] mod tests`, add one at the end of the file: `#[cfg(test)] mod tests { use super::*; <test here> }`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src-tauri && cargo test --lib workspace::helpers::tests::branch_name_semantic_mode_uses_empty_prefix`
Expected: FAIL — non-exhaustive `match` compile error (`BranchPrefixType::Semantic` not covered).

- [ ] **Step 3: Add the match arm**

In `branch_name_for_directory`, inside `let prefix = match prefix_type {`, add:

```rust
        BranchPrefixType::Semantic => String::new(),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd src-tauri && cargo test --lib workspace::helpers::tests::branch_name_semantic_mode_uses_empty_prefix`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/workspace/helpers.rs
git commit -m "feat(branch-prefix): resolve Semantic mode to empty prefix"
```

---

## Task 3: Semantic type generation in shared `title.ts`

**Files:**
- Modify: `sidecar/src/title.ts:31-62` (`buildTitlePrompt`), `:109-134` (`parseTitleAndBranch`)
- Test: `sidecar/test/title.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `sidecar/test/title.test.ts`:

```ts
describe("buildTitlePrompt (semantic)", () => {
	test("asks for a type: line from the conventional set when semantic", () => {
		const prompt = buildTitlePrompt("fix the login redirect", null, true, true);
		expect(prompt).toContain("type:");
		expect(prompt).toContain("feat, fix, refactor, chore, docs, test, perf, style, build, ci");
		expect(prompt).toContain("chore");
	});

	test("omits the type: line when not semantic", () => {
		const prompt = buildTitlePrompt("fix the login redirect", null, true, false);
		expect(prompt).not.toContain("type:");
	});
});

describe("parseTitleAndBranch (semantic)", () => {
	test("joins a valid type with the slug after sanitization", () => {
		const raw = "title: Fix login redirect\ntype: fix\nbranch: login-redirect";
		expect(parseTitleAndBranch(raw, true).branchName).toBe("fix/login-redirect");
	});

	test("defaults to chore when type is unknown", () => {
		const raw = "title: Tidy things\ntype: wibble\nbranch: tidy-things";
		expect(parseTitleAndBranch(raw, true).branchName).toBe("chore/tidy-things");
	});

	test("defaults to chore when the type line is missing", () => {
		const raw = "title: Tidy things\nbranch: tidy-things";
		expect(parseTitleAndBranch(raw, true).branchName).toBe("chore/tidy-things");
	});

	test("ignores the type line when not semantic", () => {
		const raw = "title: Fix login\ntype: fix\nbranch: login-redirect";
		expect(parseTitleAndBranch(raw, false).branchName).toBe("login-redirect");
	});

	test("returns undefined branch when slug is empty even in semantic mode", () => {
		const raw = "title: Just a title\ntype: fix";
		expect(parseTitleAndBranch(raw, true).branchName).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd sidecar && bun test test/title.test.ts`
Expected: FAIL — `buildTitlePrompt` arity / `parseTitleAndBranch` ignores `type:` (assertions fail).

- [ ] **Step 3: Implement the type set + prompt + parse**

In `sidecar/src/title.ts`, after the existing `const CUSTOM_PREFERENCES_INTRO` block (near line 19), add:

```ts
// Conventional-Commits types the Semantic branch-prefix mode may emit.
// MUST stay in sync with the Rust mirror in
// `src-tauri/src/local_llm/title.rs` (CONVENTIONAL_TYPES / DEFAULT_TYPE).
export const CONVENTIONAL_TYPES = [
	"feat",
	"fix",
	"refactor",
	"chore",
	"docs",
	"test",
	"perf",
	"style",
	"build",
	"ci",
] as const;
const DEFAULT_CONVENTIONAL_TYPE = "chore";
const CONVENTIONAL_TYPE_SET: ReadonlySet<string> = new Set(CONVENTIONAL_TYPES);
```

Change `buildTitlePrompt`'s signature and body to accept `semantic`:

```ts
export function buildTitlePrompt(
	userMessage: string,
	branchRenamePrompt?: string | null,
	generateBranch = true,
	semantic = false,
): string {
	if (!generateBranch) {
		return [
			"Based on the following user message, generate a concise session title (use the same language as the user message, max 8 words).",
			"",
			"Output EXACTLY in this format (one line, nothing else):",
			"title: <the title>",
			"",
			"User message:",
			userMessage,
		].join("\n");
	}
	const lines = [
		"Based on the following user message, generate the following:",
		"1. A concise session title (use the same language as the user message, max 8 words)",
		"2. A git branch name segment (English only, lowercase, hyphens for spaces, max 4 words, no prefix)",
	];
	if (semantic) {
		lines.push(
			`3. A Conventional-Commits type for the change — one of: ${CONVENTIONAL_TYPES.join(", ")} — chosen from the nature of the work. If unsure, use ${DEFAULT_CONVENTIONAL_TYPE}.`,
		);
	}
	lines.push(
		"",
		"Additional branch naming instructions:",
		buildBranchRenameInstructions(branchRenamePrompt),
		"",
		semantic
			? "Output EXACTLY in this format (three lines, nothing else):"
			: "Output EXACTLY in this format (two lines, nothing else):",
		"title: <the title>",
		"branch: <the-branch-name>",
	);
	if (semantic) {
		lines.push("type: <the-type>");
	}
	lines.push("", "User message:", userMessage);
	return lines.join("\n");
}
```

Change `parseTitleAndBranch` to accept `semantic` and join after sanitization:

```ts
export function parseTitleAndBranch(raw: string, semantic = false): ParsedTitle {
	let title = "";
	let branch = "";
	let type = "";
	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		const lower = trimmed.toLowerCase();
		if (lower.startsWith("title:")) {
			title = normalizeGeneratedTitle(trimmed.slice(6));
		} else if (lower.startsWith("branch:")) {
			branch = trimmed
				.slice(7)
				.trim()
				.replace(BRANCH_INVALID_RE, "")
				.replace(BRANCH_DASH_COLLAPSE_RE, "-")
				.replace(BRANCH_TRIM_DASH_RE, "");
		} else if (lower.startsWith("type:")) {
			type = trimmed.slice(5).trim().toLowerCase();
		}
	}

	// If structured parsing failed but the model returned *something*, fall
	// back to using a bounded normalized preview as the title.
	if (!title && raw.trim()) {
		title = normalizeGeneratedTitle(raw);
	}

	// Semantic mode: join the validated type AFTER slug sanitization so the
	// `/` separator survives (BRANCH_INVALID_RE would otherwise strip it).
	let branchName = branch || undefined;
	if (semantic && branchName) {
		const resolvedType = CONVENTIONAL_TYPE_SET.has(type)
			? type
			: DEFAULT_CONVENTIONAL_TYPE;
		branchName = `${resolvedType}/${branchName}`;
	}

	return { title, branchName };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd sidecar && bun test test/title.test.ts`
Expected: PASS (existing + new cases).

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/title.ts sidecar/test/title.test.ts
git commit -m "feat(branch-prefix): semantic type generation in shared title helpers"
```

---

## Task 4: Thread `semantic` through diagnostics + options types (sidecar)

**Files:**
- Modify: `sidecar/src/title.ts:80-85` (`TitleGenerationDiagnosticsOptions`), `:136-167` (`parseTitleAndBranchWithDiagnostics`)
- Modify: `sidecar/src/session-manager.ts:92-101` (`GenerateTitleOptions`)

- [ ] **Step 1: Add `semantic` to the diagnostics options + pass it to the parser**

In `sidecar/src/title.ts`, add to `TitleGenerationDiagnosticsOptions`:

```ts
	readonly semantic?: boolean;
```

In `parseTitleAndBranchWithDiagnostics`, change the parse call:

```ts
	const parsed = parseTitleAndBranch(raw, options.semantic ?? false);
```

- [ ] **Step 2: Add `semantic` to `GenerateTitleOptions`**

In `sidecar/src/session-manager.ts`, inside `GenerateTitleOptions` (near `generateBranch?: boolean;`):

```ts
	/** When true, the title LLM also emits a Conventional-Commits type and the
	 * returned branch slug becomes `<type>/<slug>` (Semantic prefix mode). */
	readonly semantic?: boolean;
```

- [ ] **Step 3: Typecheck the sidecar**

Run: `cd sidecar && bun run --bun tsc --noEmit` (or `bun run typecheck` from repo root)
Expected: PASS — no type errors. (No managers reference `semantic` yet; defaults keep them valid.)

- [ ] **Step 4: Commit**

```bash
git add sidecar/src/title.ts sidecar/src/session-manager.ts
git commit -m "feat(branch-prefix): add semantic flag to title options + diagnostics"
```

---

## Task 5: Forward `semantic` from the request through every title manager (sidecar)

**Files:**
- Modify: `sidecar/src/index.ts:296-337` (parse `params.semantic`, forward in options)
- Modify each manager's `generateTitle` to read `options.semantic` and pass it to both `buildTitlePrompt` and `parseTitleAndBranchWithDiagnostics`:
  - `sidecar/src/claude-session-manager.ts:898-930`
  - `sidecar/src/codex-app-server-manager.ts:1089,1181-1213`
  - `sidecar/src/copilot-session-manager.ts:381-423`
  - `sidecar/src/cursor-worker/cursor-core.ts:339-378`
  - `sidecar/src/opencode-protocol/session-manager.ts:1026-1107`

There are no unit tests at these call sites; this is mechanical wiring verified by `tsc` + the existing `title.test.ts`. The pattern is identical in each manager.

- [ ] **Step 1: Parse `semantic` in `index.ts` and forward it**

In `handleGenerateTitle` (`sidecar/src/index.ts`), after the `generateBranch` parse (~line 306) add:

```ts
		const semantic = params.semantic === true;
```

Add it to the debug log object and to the options object passed to `generateTitle`:

```ts
			logger.debug(`[${id}] generateTitle`, {
				userMessage: userMessage.slice(0, 100),
				attempts: attempts.map((a) => `${a.provider}:${a.model ?? "(default)"}`),
				generateBranch,
				semantic,
			});
```

```ts
						{
							model: attempt.model,
							claudeEnvironment: attempt.claudeEnvironment,
							codexProvider: attempt.codexProvider,
							agentProxy,
							generateBranch,
							semantic,
						},
```

- [ ] **Step 2: Forward `semantic` in each manager**

Apply this identical pattern in all five managers. In each `generateTitle`, find the existing line:

```ts
		const generateBranch = options?.generateBranch ?? true;
```

and add directly below it:

```ts
		const semantic = options?.semantic ?? false;
```

Then update the two call sites in that same method:

`buildTitlePrompt(userMessage, branchRenamePrompt, generateBranch)` → add `semantic`:

```ts
		buildTitlePrompt(userMessage, branchRenamePrompt, generateBranch, semantic)
```

(In `codex-app-server-manager.ts` this is the multi-line `buildTitlePrompt(` call around line 1181 — add `semantic` as the 4th argument.)

`parseTitleAndBranchWithDiagnostics(requestId, raw, { ... generateBranch ... })` → add `semantic` to the options object:

```ts
		const { title, branchName } = parseTitleAndBranchWithDiagnostics(
			requestId,
			raw,
			{
				model,
				generateBranch,
				semantic,
				logError: (message, meta) => logger.error(message, meta),
			},
		);
```

> Keep each manager's existing `model`/`logError` wiring exactly as it is today — only add the `semantic` field. Do **not** touch `kimi-session-manager.ts` (it has no branch slug) or `cursor-session-manager.ts` (it delegates to `cursor-core` via the worker; `cursor-core` is the one that builds the prompt).

- [ ] **Step 3: Typecheck the sidecar**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Run the sidecar test suite**

Run: `cd sidecar && bun test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/index.ts sidecar/src/claude-session-manager.ts sidecar/src/codex-app-server-manager.ts sidecar/src/copilot-session-manager.ts sidecar/src/cursor-worker/cursor-core.ts sidecar/src/opencode-protocol/session-manager.ts
git commit -m "feat(branch-prefix): forward semantic flag through title managers"
```

---

## Task 6: Mirror semantic logic in the local LLM (Rust)

**Files:**
- Modify: `src-tauri/src/local_llm/title.rs:39-66` (`generate_title`), `:90-115` (`build_title_prompt`), `:117-144` (`parse_title_response`)
- Test: `src-tauri/src/local_llm/title.rs` (`#[cfg(test)] mod tests`)

- [ ] **Step 1: Write the failing tests**

Add to the tests module in `src-tauri/src/local_llm/title.rs`:

```rust
    #[test]
    fn parse_semantic_joins_valid_type() {
        let (_title, branch) =
            parse_title_response("title: Fix login\ntype: fix\nbranch: login-redirect", true);
        assert_eq!(branch.as_deref(), Some("fix/login-redirect"));
    }

    #[test]
    fn parse_semantic_defaults_to_chore_on_unknown() {
        let (_title, branch) =
            parse_title_response("title: Tidy\ntype: wibble\nbranch: tidy-up", true);
        assert_eq!(branch.as_deref(), Some("chore/tidy-up"));
    }

    #[test]
    fn parse_semantic_defaults_to_chore_when_missing() {
        let (_title, branch) = parse_title_response("title: Tidy\nbranch: tidy-up", true);
        assert_eq!(branch.as_deref(), Some("chore/tidy-up"));
    }

    #[test]
    fn parse_non_semantic_ignores_type_line() {
        let (_title, branch) =
            parse_title_response("title: Fix login\ntype: fix\nbranch: login-redirect", false);
        assert_eq!(branch.as_deref(), Some("login-redirect"));
    }

    #[test]
    fn build_prompt_semantic_requests_type_line() {
        let prompt = build_title_prompt("fix login", None, true, true);
        assert!(prompt.contains("type:"));
        assert!(prompt.contains("chore"));
    }
```

> If the existing tests call `parse_title_response(...)` / `build_title_prompt(...)` with the old arity, update those call sites to pass `false` for the new `semantic` argument in the same step.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test --lib local_llm::title::tests`
Expected: FAIL — arity mismatch (compile error: these functions take fewer arguments).

- [ ] **Step 3: Add the type set + semantic params**

In `src-tauri/src/local_llm/title.rs`, near the top constants, add:

```rust
// Conventional-Commits types the Semantic branch-prefix mode may emit.
// MUST stay in sync with the sidecar mirror in `sidecar/src/title.ts`
// (CONVENTIONAL_TYPES / DEFAULT_CONVENTIONAL_TYPE).
const CONVENTIONAL_TYPES: [&str; 10] = [
    "feat", "fix", "refactor", "chore", "docs", "test", "perf", "style", "build", "ci",
];
const DEFAULT_CONVENTIONAL_TYPE: &str = "chore";
```

Change `build_title_prompt` to take `semantic: bool` and append the type instruction + `type:` output line when `generate_branch && semantic`:

```rust
fn build_title_prompt(
    user_message: &str,
    branch_rename_prompt: Option<&str>,
    generate_branch: bool,
    semantic: bool,
) -> String {
    if !generate_branch {
        return format!(
            "Based on the following user message, generate a concise session title (use the same language as the user message, max 8 words).\n\n\
             Output EXACTLY in this format (one line, nothing else):\n\
             title: <the title>\n\n\
             User message:\n{user_message}"
        );
    }
    let type_instruction = if semantic {
        format!(
            "\n3. A Conventional-Commits type for the change — one of: {} — chosen from the nature of the work. If unsure, use {DEFAULT_CONVENTIONAL_TYPE}.",
            CONVENTIONAL_TYPES.join(", "),
        )
    } else {
        String::new()
    };
    let type_output_line = if semantic { "\ntype: <the-type>" } else { "" };
    format!(
        "Based on the following user message, generate the following:\n\
         1. A concise session title (use the same language as the user message, max 8 words)\n\
         2. A git branch name segment (English only, lowercase, hyphens for spaces, max 4 words, no prefix){type_instruction}\n\n\
         Additional branch naming instructions:\n\
         {branch_instructions}\n\n\
         Output EXACTLY in this format:\n\
         title: <the title>\n\
         branch: <the-branch-name>{type_output_line}\n\n\
         User message:\n{user_message}",
        branch_instructions = build_branch_rename_instructions(branch_rename_prompt),
    )
}
```

Change `parse_title_response` to take `semantic: bool` and join after sanitization:

```rust
fn parse_title_response(raw: &str, semantic: bool) -> (String, Option<String>) {
    let mut title = String::new();
    let mut branch = String::new();
    let mut type_segment = String::new();
    for line in raw.lines() {
        let trimmed = line.trim();
        let lower = trimmed.to_ascii_lowercase();
        if lower.starts_with("title:") {
            title = normalize_generated_title(&trimmed[6..]);
        } else if lower.starts_with("branch:") {
            branch = sanitize_branch(trimmed[7..].trim());
        } else if lower.starts_with("type:") {
            type_segment = trimmed[5..].trim().to_ascii_lowercase();
        }
    }
    if title.is_empty() {
        let r = raw.trim();
        if !r.is_empty() {
            title = normalize_generated_title(r);
        }
    }
    let branch_opt = if branch.is_empty() {
        None
    } else if semantic {
        // Join the validated type AFTER sanitization so the `/` survives.
        let resolved = if CONVENTIONAL_TYPES.contains(&type_segment.as_str()) {
            type_segment.as_str()
        } else {
            DEFAULT_CONVENTIONAL_TYPE
        };
        Some(format!("{resolved}/{branch}"))
    } else {
        Some(branch)
    };
    (title, branch_opt)
}
```

Change `generate_title` to accept and forward `semantic`:

```rust
    pub fn generate_title(
        &self,
        user_message: &str,
        branch_rename_prompt: Option<&str>,
        generate_branch: bool,
        semantic: bool,
    ) -> Result<(String, Option<String>)> {
```

and inside it, update the two helper calls:

```rust
        let user = build_title_prompt(&trimmed_user_message, branch_rename_prompt, generate_branch, semantic);
```

```rust
        let (title, branch_name) = parse_title_response(&raw, semantic);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test --lib local_llm::title::tests`
Expected: PASS. (The crate won't fully build until Task 7 updates the `generate_title` caller — run `cargo test --lib local_llm::title` which compiles the module's tests; if the whole-crate build is required, do Task 7 first, then return here. Either ordering ends green.)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/local_llm/title.rs
git commit -m "feat(branch-prefix): mirror semantic type generation in local LLM"
```

---

## Task 7: Wire `is_semantic` into the title pipeline (Rust queries)

**Files:**
- Modify: `src-tauri/src/agents/queries.rs:229-302` (compute `is_semantic`, pass to local call), `:371-376` (sidecar JSON params)

- [ ] **Step 1: Compute `is_semantic` from the resolved branch settings**

In `src-tauri/src/agents/queries.rs`, after the `branch_settings` binding (the `.unwrap_or(EffectiveBranchPrefixSettings { ... })` block ends ~line 240), add:

```rust
    let is_semantic = matches!(
        branch_settings.branch_prefix_type,
        Some(crate::settings::BranchPrefixType::Semantic)
    );
```

- [ ] **Step 2: Pass `is_semantic` to the local-LLM call**

In the local cascade block, update the `generate_title` call (~line 302):

```rust
            manager
                .inner()
                .generate_title(&user_message, branch_prompt.as_deref(), generate_branch, is_semantic)
```

The capturing closure already moves `generate_branch`; capture `is_semantic` the same way by referencing it inside the `spawn_blocking` closure (it is `Copy`, so it is captured by value automatically).

- [ ] **Step 3: Pass `semantic` in the sidecar JSON params**

Update the `serde_json::json!` params block (~line 371):

```rust
            let mut params = serde_json::json!({
                "userMessage": request.user_message,
                "branchRenamePrompt": branch_rename_prompt,
                "generateBranch": should_generate_branch,
                "semantic": is_semantic,
                "attempts": attempts,
            });
```

> No change to the `titleGenerated` event parsing (lines ~408-427): the sidecar already returns the combined `type/slug` in `branchName`, and `branch_name_for_directory` (Task 2) contributes an empty prefix in Semantic mode.

- [ ] **Step 4: Build + run the full backend test suite**

Run: `cd src-tauri && cargo test --lib`
Expected: PASS (this also compiles the `generate_title` caller against the new arity from Task 6).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/agents/queries.rs
git commit -m "feat(branch-prefix): pass semantic mode into title generation"
```

---

## Task 8: Settings UI — fourth radio option (frontend)

**Files:**
- Modify: `src/lib/api.ts:313` (`BranchPrefixType` union)
- Modify: `src/features/settings/panels/repository-settings/branch-prefix-section.tsx`

- [ ] **Step 1: Extend the `BranchPrefixType` union**

In `src/lib/api.ts`:

```ts
export type BranchPrefixType = "username" | "custom" | "none" | "semantic";
```

- [ ] **Step 2: Add `"semantic"` to the mode list + effective resolver**

In `branch-prefix-section.tsx`:

```ts
const PREFIX_TYPES: BranchPrefixType[] = ["username", "custom", "none", "semantic"];
```

In `effectivePrefixType`, accept the new value:

```ts
	if (
		stored === "username" ||
		stored === "custom" ||
		stored === "none" ||
		stored === "semantic"
	) {
		return stored;
	}
```

- [ ] **Step 3: Make the preview reflect Semantic mode**

Update the `previewPrefix` computation so Semantic shows an illustrative type, and stop the preview from hiding for Semantic. Replace the `previewPrefix` block:

```ts
	const previewPrefix =
		prefixType === "custom"
			? customPrefix.trim()
			: prefixType === "username"
				? githubLogin
					? `${githubLogin}/`
					: ""
				: prefixType === "semantic"
					? "feat/"
					: "";
```

In `BranchPrefixPreview`, only hide the chip for `none`:

```ts
	const hidden = prefixType === "none";
```

(unchanged — `semantic` already shows because `hidden` is only true for `none`.) Add a hint that the type is illustrative, right after the existing `username` hint block:

```tsx
				{prefixType === "semantic" ? (
					<span className="ml-1 text-muted-foreground/70">
						(type detected from your first prompt)
					</span>
				) : null}
```

- [ ] **Step 4: Render the Semantic radio option**

In the `<RadioGroup>`, after the `none` option (`<PrefixRadioOption ... value="none" label="None" />`), add a row with helper text:

```tsx
				<Field
					orientation="horizontal"
					className="items-start gap-3 rounded-lg px-1 py-0.5"
				>
					<RadioGroupItem
						value="semantic"
						id={`repo-${repo.id}-branch-prefix-semantic`}
						className="mt-0.5"
					/>
					<FieldContent>
						<FieldLabel
							htmlFor={`repo-${repo.id}-branch-prefix-semantic`}
							className="text-foreground"
						>
							Semantic (Conventional Commits)
						</FieldLabel>
						<div className="text-small leading-snug text-muted-foreground">
							feat / fix / refactor / chore … detected automatically from your
							first prompt. No prefix until then.
						</div>
					</FieldContent>
				</Field>
```

> `handleTypeChange` already persists any value in `PREFIX_TYPES` with `custom = null` for non-`custom` modes, so selecting `semantic` calls `updateRepositoryBranchPrefix(repo.id, "semantic", null)` with no extra code. The backend command + `update_repository_branch_prefix` already accept `Semantic` (Task 1).

- [ ] **Step 5: Typecheck + lint the frontend**

Run: `bun run typecheck && bun x biome check src/features/settings/panels/repository-settings/branch-prefix-section.tsx src/lib/api.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/api.ts src/features/settings/panels/repository-settings/branch-prefix-section.tsx
git commit -m "feat(branch-prefix): add Semantic option to repo settings UI"
```

---

## Task 9: Full verification + changeset

**Files:**
- Create: `.changeset/<random-name>.md`

- [ ] **Step 1: Run all three test suites + lint + typecheck**

```bash
bun run typecheck
bun run lint
bun run test
```
Expected: all PASS. Pipeline snapshot tests (`cd src-tauri && cargo test --tests`) are included via `bun run test:rust` and must remain green — no storage-shape change was made, so no snapshot should drift. If any snapshot drifts, STOP and inspect the diff before accepting; a drift here means an unintended change.

- [ ] **Step 2: Write the changeset**

Create `.changeset/semantic-branch-prefix.md` (per repo convention — a single prose sentence body, never starting with `-`):

```md
---
"helmor": minor
---

Add a Semantic branch-prefix mode that names new-workspace branches with an automatically detected Conventional Commits type (feat/fix/refactor/chore/…) from your first prompt, e.g. `fix/auth-redirect`.
```

- [ ] **Step 3: Commit**

```bash
git add .changeset/semantic-branch-prefix.md
git commit -m "chore: changeset for semantic branch prefix"
```

- [ ] **Step 4: Manual smoke check (optional, debug build)**

Open repo settings for any repo → Branch prefix → select **Semantic (Conventional Commits)** → confirm the preview shows `feat/tokyo` and the radio persists across a settings reopen. Create a workspace, send a first prompt describing a bug fix, and confirm the branch renames to `fix/<slug>`.

---

## Self-Review Notes (author check — already reconciled)

- **Spec coverage:** settings variant (Task 1) ✓; empty-prefix resolution + pre-prompt bare name (Task 2) ✓; LLM type generation both paths (Tasks 3, 6) ✓; plumbing/flag (Tasks 5, 7) ✓; UI (Task 8) ✓; tests on both LLM paths + helper + settings round-trip (Tasks 1, 2, 3, 6, 9) ✓.
- **Spec deviation:** `branch_name_for_directory` keeps its signature (no `semantic_type` param) — documented above; the type is carried inside the slug, so `Semantic` is just an empty-prefix arm. The "settings round-trip" test is satisfied by Task 1's `as_storage_str`/`FromStr` tests plus the unchanged `update_repository_branch_prefix` (which already clears custom for non-`Custom`).
- **Type consistency:** `semantic`/`is_semantic` boolean used uniformly; `CONVENTIONAL_TYPES`/`DEFAULT_CONVENTIONAL_TYPE` mirrored in TS and Rust with sync comments; `parseTitleAndBranch(raw, semantic)` and `parse_title_response(raw, semantic)` signatures match their callers updated in the same tasks.
- **No placeholders:** every code step contains the actual code.

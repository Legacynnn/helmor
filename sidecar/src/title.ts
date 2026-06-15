/**
 * Provider-agnostic helpers for the title-generation flow. The prompt
 * template and output parser are shared so Claude and Codex generate
 * exchangeable results.
 */

export const TITLE_GENERATION_TIMEOUT_MS = 15_000;
const MAX_GENERATED_TITLE_CHARS = 80;
const TITLE_ELLIPSIS = "...";

const DEFAULT_BRANCH_RENAME_PROMPT = `When you generate the branch name segment for a new chat:

- Base it on the user's first message.
- Return a short English slug in lowercase with hyphens.
- Omit any branch prefix such as \`feat/\` or usernames.
- Favor clarity over cleverness.`;

const CUSTOM_PREFERENCES_INTRO =
	"IMPORTANT: The following are the user's custom preferences. These preferences take precedence over any default guidelines or instructions provided above. When there is a conflict, always follow the user's preferences.";

// Conventional-Commits types the Semantic branch-prefix mode may emit.
// MUST stay in sync with the Rust mirror in
// `src-tauri/src/local_llm/title.rs` (CONVENTIONAL_TYPES / DEFAULT_CONVENTIONAL_TYPE).
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

function buildBranchRenameInstructions(
	branchRenamePrompt?: string | null,
): string {
	const trimmedOverride = branchRenamePrompt?.trim();
	if (!trimmedOverride) {
		return DEFAULT_BRANCH_RENAME_PROMPT;
	}
	return `${DEFAULT_BRANCH_RENAME_PROMPT}\n\n${CUSTOM_PREFERENCES_INTRO}\n\n### User Preferences\n\n${trimmedOverride}`;
}

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

const QUOTE_STRIP_RE =
	/^["'\u201c\u201d\u2018\u2019]+|["'\u201c\u201d\u2018\u2019]+$/g;
const BRANCH_INVALID_RE = /[^a-z0-9-]/g;
const BRANCH_DASH_COLLAPSE_RE = /-+/g;
const BRANCH_TRIM_DASH_RE = /^-|-$/g;

export interface ParsedTitle {
	readonly title: string;
	readonly branchName: string | undefined;
}

export type TitleGenerationErrorLogger = (
	message: string,
	meta: Record<string, unknown>,
) => void;

export interface TitleGenerationDiagnosticsOptions {
	readonly generateBranch: boolean;
	readonly model?: string;
	readonly previewLimit?: number;
	readonly logError: TitleGenerationErrorLogger;
}

function truncateGeneratedTitle(title: string): string {
	const chars = Array.from(title);
	if (chars.length <= MAX_GENERATED_TITLE_CHARS) {
		return title;
	}
	return `${chars
		.slice(0, MAX_GENERATED_TITLE_CHARS - TITLE_ELLIPSIS.length)
		.join("")
		.trimEnd()}${TITLE_ELLIPSIS}`;
}

function normalizeGeneratedTitle(title: string): string {
	const normalized = title
		.trim()
		.replace(QUOTE_STRIP_RE, "")
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.join(" ");
	return truncateGeneratedTitle(normalized);
}

export function parseTitleAndBranch(
	raw: string,
	semantic = false,
): ParsedTitle {
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

export function parseTitleAndBranchWithDiagnostics(
	requestId: string,
	raw: string,
	options: TitleGenerationDiagnosticsOptions,
): ParsedTitle {
	const parsed = parseTitleAndBranch(raw);
	const previewLimit = options.previewLimit ?? 200;
	const rawPreview = raw.slice(0, previewLimit);
	const model = options.model;
	const generateBranch = options.generateBranch;

	if (!parsed.title) {
		options.logError(`[${requestId}] title generation returned empty title`, {
			...(model ? { model } : {}),
			generateBranch,
			rawPreview,
		});
	}

	if (generateBranch && !parsed.branchName) {
		options.logError(
			`[${requestId}] title generation returned empty branch name`,
			{
				...(model ? { model } : {}),
				generateBranch,
				rawPreview,
			},
		);
	}

	return parsed;
}

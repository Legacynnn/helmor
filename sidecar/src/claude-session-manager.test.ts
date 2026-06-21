import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	extractExitPlanContent,
	planModeWriteDecision,
} from "./claude-session-manager";
import { createSidecarEmitter } from "./emitter";

describe("extractExitPlanContent", () => {
	let workspace: string;

	beforeEach(() => {
		workspace = mkdtempSync(join(tmpdir(), "helmor-plan-"));
	});

	afterEach(() => {
		rmSync(workspace, { recursive: true, force: true });
	});

	it("returns inline plan text unchanged (no filePath)", () => {
		const result = extractExitPlanContent(
			{ plan: "1. Read files\n2. Edit code" },
			workspace,
		);
		expect(result).toBe("1. Read files\n2. Edit code");
	});

	it("resolves a relative filePath against the workspace cwd", () => {
		const relPath = "plan.mdx";
		writeFileSync(join(workspace, relPath), "# Plan\n\nDo the thing.\n");

		const result = extractExitPlanContent({ filePath: relPath }, workspace);

		expect(result).toBe("# Plan\n\nDo the thing.");
	});

	it("reads an absolute filePath unchanged (resolve passes it through)", () => {
		const absPath = join(workspace, "abs-plan.mdx");
		writeFileSync(absPath, "absolute plan body");

		const result = extractExitPlanContent({ filePath: absPath }, workspace);

		expect(result).toBe("absolute plan body");
	});

	it("returns null when the file read fails (missing file)", () => {
		const result = extractExitPlanContent(
			{ filePath: ".helmor/plans/does-not-exist.mdx" },
			workspace,
		);
		expect(result).toBeNull();
	});

	it("returns null for empty / absent input", () => {
		expect(extractExitPlanContent(undefined, workspace)).toBeNull();
		expect(extractExitPlanContent({}, workspace)).toBeNull();
	});
});

/**
 * Mirrors the ExitPlanMode emit guard in claude-session-manager. The path must
 * reach the frontend even when the local file read fails, so planCaptured is
 * emitted whenever EITHER the plan text OR a file path is present, and the path
 * is forwarded verbatim (never absolutized).
 */
function emitPlanCaptured(
	emitter: ReturnType<typeof createSidecarEmitter>,
	requestId: string,
	toolUseId: string,
	plan: string | null,
	input: Record<string, unknown>,
): void {
	const planFilePath =
		typeof input.filePath === "string" && input.filePath.trim()
			? input.filePath
			: null;
	if (plan || planFilePath) {
		emitter.planCaptured(requestId, toolUseId, plan, planFilePath);
	}
}

describe("ExitPlanMode emit guard", () => {
	let workspace: string;

	beforeEach(() => {
		workspace = mkdtempSync(join(tmpdir(), "helmor-plan-"));
	});

	afterEach(() => {
		rmSync(workspace, { recursive: true, force: true });
	});

	it("emits plan text + verbatim relative path when the read succeeds", () => {
		const events: object[] = [];
		const emitter = createSidecarEmitter((e) => events.push(e));
		const input = { filePath: ".helmor/plans/foo.mdx" };
		mkdirSync(join(workspace, ".helmor", "plans"), { recursive: true });
		writeFileSync(join(workspace, ".helmor/plans/foo.mdx"), "# Plan body");

		// Read resolves against cwd; emitted path stays verbatim.
		const plan = extractExitPlanContent(input, workspace);
		emitPlanCaptured(emitter, "req-1", "tool-1", plan, input);

		expect(events).toHaveLength(1);
		expect(events[0]).toEqual({
			id: "req-1",
			type: "planCaptured",
			toolUseId: "tool-1",
			plan: "# Plan body",
			planFilePath: ".helmor/plans/foo.mdx",
		});
	});

	it("STILL emits planCaptured carrying the verbatim path when the read fails", () => {
		const events: object[] = [];
		const emitter = createSidecarEmitter((e) => events.push(e));
		const input = { filePath: ".helmor/plans/missing.mdx" };

		const plan = extractExitPlanContent(input, workspace);
		expect(plan).toBeNull();
		emitPlanCaptured(emitter, "req-2", "tool-2", plan, input);

		expect(events).toHaveLength(1);
		expect(events[0]).toEqual({
			id: "req-2",
			type: "planCaptured",
			toolUseId: "tool-2",
			plan: null,
			planFilePath: ".helmor/plans/missing.mdx",
		});
	});

	it("emits inline plan with no path (no filePath)", () => {
		const events: object[] = [];
		const emitter = createSidecarEmitter((e) => events.push(e));
		const input = { plan: "1. do this\n2. do that" };

		const plan = extractExitPlanContent(input, workspace);
		emitPlanCaptured(emitter, "req-3", "tool-3", plan, input);

		expect(events).toHaveLength(1);
		expect(events[0]).toEqual({
			id: "req-3",
			type: "planCaptured",
			toolUseId: "tool-3",
			plan: "1. do this\n2. do that",
			planFilePath: null,
		});
	});

	it("does NOT emit when neither plan text nor path is present", () => {
		const events: object[] = [];
		const emitter = createSidecarEmitter((e) => events.push(e));
		const input = {};

		const plan = extractExitPlanContent(input, workspace);
		emitPlanCaptured(emitter, "req-4", "tool-4", plan, input);

		expect(events).toHaveLength(0);
	});
});

describe("planModeWriteDecision", () => {
	const cwd = "/repo";
	it("denies Write outside .helmor/plans", () => {
		expect(planModeWriteDecision("Write", { file_path: "src/x.ts" }, cwd)).toBe(
			"deny",
		);
	});
	it("allows Write under .helmor/plans (relative)", () => {
		expect(
			planModeWriteDecision(
				"Write",
				{ file_path: ".helmor/plans/foo.mdx" },
				cwd,
			),
		).toBe("allow");
	});
	it("allows Edit under .helmor/plans (absolute)", () => {
		expect(
			planModeWriteDecision(
				"Edit",
				{ file_path: "/repo/.helmor/plans/foo.mdx" },
				cwd,
			),
		).toBe("allow");
	});
	it("uses notebook_path for NotebookEdit", () => {
		expect(
			planModeWriteDecision(
				"NotebookEdit",
				{ notebook_path: ".helmor/plans/n.ipynb" },
				cwd,
			),
		).toBe("allow");
		expect(
			planModeWriteDecision("NotebookEdit", { notebook_path: "nb.ipynb" }, cwd),
		).toBe("deny");
	});
	it("allows non-write tools (Bash) to fall through", () => {
		expect(planModeWriteDecision("Bash", { command: "rm -rf x" }, cwd)).toBe(
			"allow",
		);
	});
	it("denies a write tool with no path", () => {
		expect(planModeWriteDecision("Write", {}, cwd)).toBe("deny");
	});
	it("denies a `..` traversal escaping the plan dir (with cwd)", () => {
		expect(
			planModeWriteDecision(
				"Write",
				{ file_path: ".helmor/plans/../../src/x.ts" },
				cwd,
			),
		).toBe("deny");
	});
	it("denies a `..` traversal escaping the plan dir (no cwd)", () => {
		expect(
			planModeWriteDecision("Write", {
				file_path: ".helmor/plans/../../src/x.ts",
			}),
		).toBe("deny");
	});
});

import { describe, expect, it } from "vitest";
import { detectTailwindContext } from "./context";

describe("detectTailwindContext", () => {
	it("activates inside a JSX className double-quote string", () => {
		const result = detectTailwindContext(
			'<div className="flex it',
			"typescript",
		);
		expect(result.active).toBe(true);
		expect(result.fragment).toBe("it");
	});

	it("activates inside an HTML class attribute", () => {
		const result = detectTailwindContext('<div class="bg-bl', "html");
		expect(result.active).toBe(true);
		expect(result.fragment).toBe("bg-bl");
	});

	it("activates inside className={`...`} template", () => {
		const result = detectTailwindContext(
			"<div className={`grid gap-",
			"typescript",
		);
		expect(result.active).toBe(true);
		expect(result.fragment).toBe("gap-");
	});

	it("keeps variant/arbitrary fragment characters", () => {
		const result = detectTailwindContext(
			'<div className="hover:bg-blue-500/50',
			"typescript",
		);
		expect(result.active).toBe(true);
		expect(result.fragment).toBe("hover:bg-blue-500/50");
	});

	it("does not activate after the attribute value closes", () => {
		const result = detectTailwindContext(
			'<div className="flex">text ',
			"typescript",
		);
		expect(result.active).toBe(false);
	});

	it("does not activate in plain markup", () => {
		const result = detectTailwindContext("const x = bg-", "typescript");
		expect(result.active).toBe(false);
	});

	it("activates after @apply in CSS only", () => {
		expect(detectTailwindContext("  @apply flex it", "css").active).toBe(true);
		expect(detectTailwindContext("  @apply flex it", "typescript").active).toBe(
			false,
		);
	});

	it("activates inside a cn() helper call", () => {
		const result = detectTailwindContext(
			'<div className={cn("flex it',
			"typescript",
		);
		expect(result.active).toBe(true);
		expect(result.fragment).toBe("it");
	});

	it("activates inside a later cn() string argument", () => {
		const result = detectTailwindContext(
			'cn("flex items-center", "bg-bl',
			"typescript",
		);
		expect(result.active).toBe(true);
		expect(result.fragment).toBe("bg-bl");
	});

	it("activates inside a clsx() conditional class string", () => {
		const result = detectTailwindContext(
			'clsx("flex", isActive && "items-cen',
			"typescript",
		);
		expect(result.active).toBe(true);
		expect(result.fragment).toBe("items-cen");
	});

	it("activates inside a cva() base class string", () => {
		const result = detectTailwindContext('cva("inline-fl', "typescript");
		expect(result.active).toBe(true);
		expect(result.fragment).toBe("inline-fl");
	});

	it("activates inside a nested class helper call", () => {
		const result = detectTailwindContext('cn("base", clsx("gap-', "typescript");
		expect(result.active).toBe(true);
		expect(result.fragment).toBe("gap-");
	});

	it("does not activate after a class helper call closes", () => {
		const result = detectTailwindContext('cn("flex") ', "typescript");
		expect(result.active).toBe(false);
	});

	it("does not activate in an unrelated function string argument", () => {
		const result = detectTailwindContext('useState("init', "typescript");
		expect(result.active).toBe(false);
	});

	it("activates despite arbitrary values containing parentheses", () => {
		const result = detectTailwindContext(
			"cn('rounded-md text-[color:var(--color-landing-gray-400)] transition-co",
			"typescript",
		);
		expect(result.active).toBe(true);
		expect(result.fragment).toBe("transition-co");
	});

	it("activates inside a multi-line cn() whose string is on its own line", () => {
		const before =
			"          className={cn(\n            'inline-flex size-7 items-cen";
		const result = detectTailwindContext(before, "typescript");
		expect(result.active).toBe(true);
		expect(result.fragment).toBe("items-cen");
	});

	it("activates on a later line of a multi-line cn() with paren-heavy prior args", () => {
		const before = "className={cn(\n  'w-[calc(100%-1rem)] flex',\n  'text-cen";
		const result = detectTailwindContext(before, "typescript");
		expect(result.active).toBe(true);
		expect(result.fragment).toBe("text-cen");
	});

	it("activates when the className opener is on a prior line", () => {
		const result = detectTailwindContext(
			'<div\n  className="flex justify-cen',
			"typescript",
		);
		expect(result.active).toBe(true);
		expect(result.fragment).toBe("justify-cen");
	});

	it("does not activate in a multi-line non-class call", () => {
		const before = "doSomething(\n  'plain text val";
		expect(detectTailwindContext(before, "typescript").active).toBe(false);
	});
});

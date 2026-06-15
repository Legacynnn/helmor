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
});

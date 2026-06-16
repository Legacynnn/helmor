import { describe, expect, it } from "vitest";
import type { ShellViewMode } from "./use-selection-controller";

describe("ShellViewMode", () => {
	it("includes browser as a valid mode", () => {
		const mode: ShellViewMode = "browser";
		expect(mode).toBe("browser");
	});
});

import { describe, expect, it } from "vitest";
import { formatBytes, formatCpu } from "./format";

describe("formatBytes", () => {
	it("scales units", () => {
		expect(formatBytes(0)).toBe("0 B");
		expect(formatBytes(1024)).toBe("1.0 KB");
		expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
		expect(formatBytes(2.25 * 1024 ** 3)).toBe("2.3 GB");
	});
});

describe("formatCpu", () => {
	it("rounds to whole percent", () => {
		expect(formatCpu(3.4)).toBe("3%");
		expect(formatCpu(0.2)).toBe("0%");
	});
});

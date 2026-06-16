import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./normalize-url";

describe("normalizeUrl", () => {
	it("returns null for empty / whitespace input", () => {
		expect(normalizeUrl("")).toBeNull();
		expect(normalizeUrl("   ")).toBeNull();
	});

	it("leaves an explicit http/https scheme unchanged", () => {
		expect(normalizeUrl("http://x")).toBe("http://x");
		expect(normalizeUrl("https://example.com/path")).toBe(
			"https://example.com/path",
		);
	});

	it("leaves opaque schemes (about:, file:, data:) unchanged", () => {
		expect(normalizeUrl("about:blank")).toBe("about:blank");
		expect(normalizeUrl("file:///tmp/x.html")).toBe("file:///tmp/x.html");
		expect(normalizeUrl("data:text/html,hi")).toBe("data:text/html,hi");
	});

	it("leaves custom schemes (case-insensitive) unchanged", () => {
		expect(normalizeUrl("HTTP://X")).toBe("HTTP://X");
		expect(normalizeUrl("tauri://localhost")).toBe("tauri://localhost");
	});

	it("uses http:// for localhost (with port)", () => {
		expect(normalizeUrl("localhost:3000")).toBe("http://localhost:3000");
		expect(normalizeUrl("localhost")).toBe("http://localhost");
		expect(normalizeUrl("localhost/foo")).toBe("http://localhost/foo");
	});

	it("uses http:// for loopback / unspecified addresses", () => {
		expect(normalizeUrl("127.0.0.1:8080")).toBe("http://127.0.0.1:8080");
		expect(normalizeUrl("0.0.0.0:5000")).toBe("http://0.0.0.0:5000");
		expect(normalizeUrl("::1")).toBe("http://::1");
		expect(normalizeUrl("[::1]:3000")).toBe("http://[::1]:3000");
	});

	it("uses http:// for *.local hosts", () => {
		expect(normalizeUrl("mybox.local")).toBe("http://mybox.local");
		expect(normalizeUrl("printer.local:631")).toBe("http://printer.local:631");
	});

	it("uses http:// for private LAN ranges", () => {
		expect(normalizeUrl("192.168.1.5:8080")).toBe("http://192.168.1.5:8080");
		expect(normalizeUrl("10.0.0.2")).toBe("http://10.0.0.2");
		expect(normalizeUrl("172.16.0.1")).toBe("http://172.16.0.1");
		expect(normalizeUrl("172.31.255.255")).toBe("http://172.31.255.255");
	});

	it("uses https:// for non-private 172.x and public hosts", () => {
		expect(normalizeUrl("172.15.0.1")).toBe("https://172.15.0.1");
		expect(normalizeUrl("172.32.0.1")).toBe("https://172.32.0.1");
		expect(normalizeUrl("example.com")).toBe("https://example.com");
		expect(normalizeUrl("google.com")).toBe("https://google.com");
		expect(normalizeUrl("sub.example.com/a/b?q=1")).toBe(
			"https://sub.example.com/a/b?q=1",
		);
	});

	it("trims surrounding whitespace before normalizing", () => {
		expect(normalizeUrl("  example.com  ")).toBe("https://example.com");
	});
});

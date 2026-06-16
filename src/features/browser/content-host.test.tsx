import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentHost, rectFromElement } from "./content-host";

const browserCreate = vi.fn().mockResolvedValue(undefined);
const browserDestroy = vi.fn().mockResolvedValue(undefined);
const browserNavigate = vi.fn().mockResolvedValue(undefined);
const browserSetBounds = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/api", () => ({
	browserCreate: (...a: unknown[]) => browserCreate(...a),
	browserDestroy: (...a: unknown[]) => browserDestroy(...a),
	browserNavigate: (...a: unknown[]) => browserNavigate(...a),
	browserSetBounds: (...a: unknown[]) => browserSetBounds(...a),
}));

// content-host imports @/lib/api dynamically inside effects; flush microtasks.
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
	vi.clearAllMocks();
});

describe("ContentHost lazy mount", () => {
	it("does NOT create the webview while hidden, even with a url", async () => {
		render(
			<ContentHost
				workspaceId="ws1"
				url="http://localhost:3000"
				shown={false}
			/>,
		);
		await flush();
		expect(browserCreate).not.toHaveBeenCalled();
	});

	it("creates the webview once the surface is first shown", async () => {
		const { rerender } = render(
			<ContentHost
				workspaceId="ws1"
				url="http://localhost:3000"
				shown={false}
			/>,
		);
		await flush();
		expect(browserCreate).not.toHaveBeenCalled();

		rerender(
			<ContentHost
				workspaceId="ws1"
				url="http://localhost:3000"
				shown={true}
			/>,
		);
		await flush();
		expect(browserCreate).toHaveBeenCalledTimes(1);
	});

	it("creates the webview exactly once across re-shows (no second live webview)", async () => {
		const { rerender } = render(
			<ContentHost
				workspaceId="ws1"
				url="http://localhost:3000"
				shown={true}
			/>,
		);
		await flush();
		rerender(
			<ContentHost
				workspaceId="ws1"
				url="http://localhost:3000"
				shown={false}
			/>,
		);
		await flush();
		rerender(
			<ContentHost
				workspaceId="ws1"
				url="http://localhost:3000"
				shown={true}
			/>,
		);
		await flush();
		expect(browserCreate).toHaveBeenCalledTimes(1);
	});

	it("calls browserDestroy on unmount", async () => {
		const { unmount } = render(
			<ContentHost
				workspaceId="ws1"
				url="http://localhost:3000"
				shown={true}
			/>,
		);
		await flush();
		unmount();
		await flush();
		expect(browserDestroy).toHaveBeenCalledTimes(1);
	});
});

describe("rectFromElement", () => {
	it("maps a DOMRect to a logical-pixel rect", () => {
		const el = {
			getBoundingClientRect: () => ({
				x: 12,
				y: 34,
				width: 800,
				height: 600,
				left: 12,
				top: 34,
				right: 812,
				bottom: 634,
				toJSON: () => ({}),
			}),
		} as unknown as HTMLElement;

		expect(rectFromElement(el)).toEqual({
			x: 12,
			y: 34,
			width: 800,
			height: 600,
		});
	});

	it("rounds fractional dimensions to whole logical pixels", () => {
		const el = {
			getBoundingClientRect: () => ({
				x: 10.4,
				y: 20.6,
				width: 100.2,
				height: 200.9,
			}),
		} as unknown as HTMLElement;

		expect(rectFromElement(el)).toEqual({
			x: 10,
			y: 21,
			width: 100,
			height: 201,
		});
	});
});

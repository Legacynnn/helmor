import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render-with-providers";
import { DevToolsPanel } from "./dev-tools";

const apiMocks = vi.hoisted(() => ({
	loadDataInfo: vi.fn(),
	devResetAllData: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/api")>();
	return {
		...actual,
		loadDataInfo: apiMocks.loadDataInfo,
		devResetAllData: apiMocks.devResetAllData,
	};
});

describe("DevToolsPanel", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("renders the MDX planning toggle", () => {
		apiMocks.loadDataInfo.mockResolvedValue(null);
		renderWithProviders(<DevToolsPanel />);

		expect(screen.getByText(/MDX planning/i)).toBeInTheDocument();
	});
});

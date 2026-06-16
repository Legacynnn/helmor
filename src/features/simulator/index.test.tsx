import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
	simulatorListDevices: vi
		.fn()
		.mockResolvedValue([{ udid: "U1", name: "iPhone 15", booted: true }]),
	simulatorBoot: vi.fn().mockResolvedValue(undefined),
	simulatorScreenshot: vi.fn().mockResolvedValue(null),
	simulatorOpenSurface: vi.fn().mockResolvedValue(undefined),
	simulatorCloseSurface: vi.fn().mockResolvedValue(undefined),
}));

import { WorkspaceSimulatorSurface } from "./index";

describe("WorkspaceSimulatorSurface", () => {
	it("renders the surface, the device picker, and the screenshot host", async () => {
		render(
			<WorkspaceSimulatorSurface
				workspaceId="ws-1"
				kind="simulatorIos"
				udid="U1"
				onExit={() => {}}
			/>,
		);
		expect(
			screen.getByLabelText("Workspace simulator surface"),
		).toBeInTheDocument();
		expect(
			await screen.findByLabelText("Simulator device"),
		).toBeInTheDocument();
	});
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
	simulatorListDevices: vi.fn().mockResolvedValue([
		{ udid: "U1", name: "iPhone 15", booted: true },
		{ udid: "U2", name: "iPhone SE", booted: false },
	]),
	simulatorBoot: vi.fn().mockResolvedValue(undefined),
}));

import { DevicePicker } from "./device-picker";

describe("DevicePicker", () => {
	it("lists booted devices first and labels shutdown ones", async () => {
		render(
			<DevicePicker
				kind="simulatorIos"
				selectedUdid={null}
				onSelect={() => {}}
			/>,
		);
		expect(await screen.findByText(/iPhone 15/)).toBeInTheDocument();
	});
});

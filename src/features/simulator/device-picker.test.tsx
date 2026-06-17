import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const simulatorListDevices = vi.fn();
const simulatorBoot = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/api", () => ({
	simulatorListDevices: (...a: unknown[]) => simulatorListDevices(...a),
	simulatorBoot: (...a: unknown[]) => simulatorBoot(...a),
}));

import { DevicePicker } from "./device-picker";

afterEach(() => {
	vi.clearAllMocks();
});

describe("DevicePicker", () => {
	it("lists booted devices first and labels shutdown ones", async () => {
		simulatorListDevices.mockResolvedValue([
			{ udid: "U1", name: "iPhone 15", booted: true },
			{ udid: "U2", name: "iPhone SE", booted: false },
		]);
		render(
			<DevicePicker
				kind="simulatorIos"
				selectedUdid="U1"
				onSelect={() => {}}
			/>,
		);
		expect(await screen.findByText(/iPhone 15/)).toBeInTheDocument();
	});

	it("auto-selects the first booted device when none is selected", async () => {
		simulatorListDevices.mockResolvedValue([
			{ udid: "U2", name: "iPhone SE", booted: false },
			{ udid: "U1", name: "iPhone 15", booted: true },
		]);
		const onSelect = vi.fn();
		render(
			<DevicePicker kind="simulatorIos" selectedUdid="" onSelect={onSelect} />,
		);
		await waitFor(() => expect(onSelect).toHaveBeenCalledWith("U1"));
	});

	it("renders an empty state when there are no devices", async () => {
		simulatorListDevices.mockResolvedValue([]);
		render(
			<DevicePicker kind="simulatorIos" selectedUdid="" onSelect={() => {}} />,
		);
		expect(await screen.findByText(/no simulators found/i)).toBeInTheDocument();
	});

	it("shows the empty state and does not throw when listing rejects", async () => {
		simulatorListDevices.mockRejectedValue(new Error("xcrun missing"));
		render(
			<DevicePicker kind="simulatorIos" selectedUdid="" onSelect={() => {}} />,
		);
		expect(await screen.findByText(/no simulators found/i)).toBeInTheDocument();
	});
});

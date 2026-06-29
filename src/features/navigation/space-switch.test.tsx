import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSpaceStore } from "@/features/canvas/use-space-store";
import { SpaceSwitch } from "./space-switch";

describe("SpaceSwitch", () => {
	beforeEach(() => {
		localStorage.clear();
		useSpaceStore.setState({ activeSpace: "normal", lastSelected: {} });
	});
	afterEach(cleanup);

	it("marks the active space tab selected", () => {
		render(<SpaceSwitch />);
		expect(screen.getByRole("tab", { name: /workspaces/i })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		expect(screen.getByRole("tab", { name: /canvas/i })).toHaveAttribute(
			"aria-selected",
			"false",
		);
	});

	it("switches active space on click", () => {
		render(<SpaceSwitch />);
		fireEvent.click(screen.getByRole("tab", { name: /canvas/i }));
		expect(useSpaceStore.getState().activeSpace).toBe("canvas");
	});
});

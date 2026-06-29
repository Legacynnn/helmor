import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MissionControl } from "./mission-control";

describe("MissionControl", () => {
	afterEach(cleanup);

	it("renders a tile per canvas workspace plus a new-canvas tile", () => {
		render(
			<MissionControl
				workspaces={[
					{ id: "a", title: "Alpha" },
					{ id: "b", title: "Beta" },
				]}
				onOpen={vi.fn()}
				onCreate={vi.fn()}
			/>,
		);
		expect(screen.getByText("Alpha")).toBeInTheDocument();
		expect(screen.getByText("Beta")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /new canvas/i }),
		).toBeInTheDocument();
	});

	it("calls onOpen with the tile id and onCreate for the new tile", () => {
		const onOpen = vi.fn();
		const onCreate = vi.fn();
		render(
			<MissionControl
				workspaces={[{ id: "a", title: "Alpha" }]}
				onOpen={onOpen}
				onCreate={onCreate}
			/>,
		);
		fireEvent.click(screen.getByText("Alpha"));
		expect(onOpen).toHaveBeenCalledWith("a");
		fireEvent.click(screen.getByRole("button", { name: /new canvas/i }));
		expect(onCreate).toHaveBeenCalledTimes(1);
	});
});

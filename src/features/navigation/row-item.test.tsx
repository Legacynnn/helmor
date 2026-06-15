import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkspaceRow } from "@/lib/api";
import { WorkspaceRowItem } from "./row-item";

const baseRow: WorkspaceRow = {
	id: "ws-1",
	title: "My Workspace",
	mode: "worktree",
} as WorkspaceRow;

afterEach(() => {
	cleanup();
});

describe("WorkspaceRowItem primary pill", () => {
	it("shows the Primary pill for local-mode rows", () => {
		render(
			<WorkspaceRowItem
				row={{ ...baseRow, mode: "local" }}
				selected={false}
				disableHoverCard
			/>,
		);
		expect(screen.getByText("Primary")).toBeInTheDocument();
	});

	it("does not show the Primary pill for worktree-mode rows", () => {
		render(
			<WorkspaceRowItem
				row={{ ...baseRow, mode: "worktree" }}
				selected={false}
				disableHoverCard
			/>,
		);
		expect(screen.queryByText("Primary")).not.toBeInTheDocument();
	});

	it("shows the Primary pill on the hideRepoAvatar render branch", () => {
		render(
			<WorkspaceRowItem
				row={{ ...baseRow, mode: "local" }}
				selected={false}
				hideRepoAvatar
				disableHoverCard
			/>,
		);
		expect(screen.getByText("Primary")).toBeInTheDocument();
	});
});

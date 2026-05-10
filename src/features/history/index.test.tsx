import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { WorkspaceRow } from "@/lib/api";
import { HistoryScreen } from "./index";

function row(overrides: Partial<WorkspaceRow> & { id: string }): WorkspaceRow {
	return {
		title: overrides.title ?? overrides.id,
		updatedAt: new Date().toISOString(),
		...overrides,
	} satisfies WorkspaceRow;
}

function renderScreen(
	props: Partial<React.ComponentProps<typeof HistoryScreen>>,
) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const defaults: React.ComponentProps<typeof HistoryScreen> = {
		rows: [],
		searchQuery: "",
		onSearchQueryChange: vi.fn(),
		loading: false,
		onSelectWorkspace: vi.fn(),
		onArchiveWorkspace: vi.fn(),
		onRestoreWorkspace: vi.fn(),
		archivingWorkspaceIds: new Set<string>(),
		restoringWorkspaceId: null,
	};
	return render(
		<QueryClientProvider client={client}>
			<TooltipProvider>
				<HistoryScreen {...defaults} {...props} />
			</TooltipProvider>
		</QueryClientProvider>,
	);
}

describe("HistoryScreen", () => {
	it("renders empty state when there are no rows", () => {
		renderScreen({});
		expect(screen.getByText(/no workspace activity/i)).toBeInTheDocument();
	});

	it("renders rows grouped under the day section", () => {
		renderScreen({
			rows: [
				row({
					id: "1",
					title: "Madrid v1",
					repoName: "helmor",
					branch: "feature/madrid",
				}),
			],
		});
		expect(screen.getByText("Madrid v1")).toBeInTheDocument();
		expect(screen.getByText("helmor")).toBeInTheDocument();
		expect(screen.getByText("Today")).toBeInTheDocument();
	});

	it("invokes onSelectWorkspace when a live row is clicked", async () => {
		const user = userEvent.setup();
		const onSelectWorkspace = vi.fn();
		renderScreen({
			rows: [row({ id: "abc", title: "Polish", repoName: "helmor" })],
			onSelectWorkspace,
		});
		await user.click(screen.getByRole("button", { name: /helmor: Polish/i }));
		expect(onSelectWorkspace).toHaveBeenCalledWith("abc");
	});

	it("shows an Unarchive affordance for archived rows", () => {
		renderScreen({
			rows: [
				row({
					id: "old",
					title: "Bygone",
					repoName: "helmor",
					state: "archived",
				}),
			],
		});
		expect(
			screen.getByRole("button", { name: /unarchive workspace/i }),
		).toBeInTheDocument();
	});
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StoragePanel } from "./storage";

const deleteWorkspaceStorage = vi.fn().mockResolvedValue(123);

vi.mock("@/lib/api", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/api")>()),
	getStorageBreakdown: vi.fn().mockResolvedValue({
		totalBytes: 1024 * 1024,
		dbBytes: 1024,
		logsBytes: 2048,
		chatsBytes: 0,
		workspaces: [
			{
				id: "w1",
				name: "old-ws",
				branch: "feat/x",
				state: "archived",
				sizeBytes: 512 * 1024,
				dirPresent: true,
				reclaimable: true,
			},
		],
	}),
	deleteWorkspaceStorage: (ids: string[]) => deleteWorkspaceStorage(ids),
	clearOldLogs: vi.fn().mockResolvedValue(0),
	vacuumDatabase: vi.fn().mockResolvedValue(0),
	getResourceSnapshot: vi.fn().mockResolvedValue({
		totalCpuPercent: 0,
		totalMemoryBytes: 0,
		processes: [],
		ports: [],
		portsUnavailable: false,
	}),
	listActiveStreams: vi.fn().mockResolvedValue([]),
}));

function renderPanel() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<StoragePanel />
		</QueryClientProvider>,
	);
}

describe("StoragePanel", () => {
	it("renders breakdown and reclaimable workspace", async () => {
		renderPanel();
		expect(await screen.findByText("old-ws")).toBeInTheDocument();
		expect(screen.getByText("archived")).toBeInTheDocument();
	});

	it("deletes workspace files only after confirm", async () => {
		const user = userEvent.setup();
		renderPanel();
		await user.click(await screen.findByText("Delete files"));
		expect(deleteWorkspaceStorage).not.toHaveBeenCalled();
		await user.click(screen.getByRole("button", { name: "Delete" }));
		expect(deleteWorkspaceStorage).toHaveBeenCalledWith(["w1"]);
	});
});

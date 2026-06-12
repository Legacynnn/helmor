import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ResourceWidget } from "./index";

vi.mock("@/lib/api", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/api")>()),
	getResourceSnapshot: vi.fn().mockResolvedValue({
		totalCpuPercent: 3.4,
		totalMemoryBytes: 1.2 * 1024 ** 3,
		processes: [],
		ports: [],
		portsUnavailable: false,
	}),
}));

function renderWidget() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<TooltipProvider>
				<ResourceWidget />
			</TooltipProvider>
		</QueryClientProvider>,
	);
}

afterEach(cleanup);

describe("ResourceWidget", () => {
	it("renders cpu and memory readout once data arrives", async () => {
		renderWidget();
		expect(await screen.findByText(/3% · 1\.2 GB/)).toBeInTheDocument();
	});

	it("has an accessible label", async () => {
		renderWidget();
		expect(
			await screen.findByRole("button", { name: "Helmor resource usage" }),
		).toBeInTheDocument();
	});
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanDoc, PlanSummary } from "@/lib/api";
import { usePlan, usePlanList } from "./use-plan";

const readPlanMock = vi.fn();
const listPlansMock = vi.fn();

vi.mock("@/lib/api", () => ({
	readPlan: (...args: unknown[]) => readPlanMock(...args),
	listPlans: (...args: unknown[]) => listPlansMock(...args),
}));

function wrapperFor(queryClient: QueryClient) {
	return function Wrapper({ children }: { children: ReactNode }) {
		return createElement(
			QueryClientProvider,
			{ client: queryClient },
			children,
		);
	};
}

describe("usePlan", () => {
	beforeEach(() => {
		readPlanMock.mockReset();
	});

	it("fetches the plan document keyed by session + slug", async () => {
		const fixture: PlanDoc = {
			summary: {
				slug: "p1",
				title: "First plan",
				status: "draft",
				path: "/plans/p1.mdx",
			},
			content: "# First plan\n",
		};
		readPlanMock.mockResolvedValueOnce(fixture);

		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});

		const { result } = renderHook(() => usePlan("s1", "p1"), {
			wrapper: wrapperFor(queryClient),
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(result.current.data?.summary.slug).toBe("p1");
		expect(readPlanMock).toHaveBeenCalledWith("s1", "p1");
	});
});

describe("usePlanList", () => {
	beforeEach(() => {
		listPlansMock.mockReset();
	});

	it("fetches the plan list for a session", async () => {
		const fixture: PlanSummary[] = [
			{
				slug: "p1",
				title: "First plan",
				status: "draft",
				path: "/plans/p1.mdx",
			},
		];
		listPlansMock.mockResolvedValueOnce(fixture);

		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});

		const { result } = renderHook(() => usePlanList("s1"), {
			wrapper: wrapperFor(queryClient),
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(result.current.data?.[0].slug).toBe("p1");
		expect(listPlansMock).toHaveBeenCalledWith("s1");
	});
});

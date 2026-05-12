import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/api")>();
	return {
		...actual,
		linearGetAuthStatus: vi.fn(),
		linearSetApiKey: vi.fn(),
		linearClearApiKey: vi.fn(),
	};
});

import {
	linearClearApiKey,
	linearGetAuthStatus,
	linearSetApiKey,
} from "@/lib/api";
import { LinearPanel } from "./linear";

const mocks = {
	linearGetAuthStatus: linearGetAuthStatus as unknown as ReturnType<
		typeof vi.fn
	>,
	linearSetApiKey: linearSetApiKey as unknown as ReturnType<typeof vi.fn>,
	linearClearApiKey: linearClearApiKey as unknown as ReturnType<typeof vi.fn>,
};

describe("LinearPanel", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("shows the disconnected state when no key is stored", async () => {
		mocks.linearGetAuthStatus.mockResolvedValue({
			connected: false,
			viewer: null,
		});
		render(<LinearPanel />);
		await waitFor(() =>
			expect(screen.getByPlaceholderText(/lin_api_/i)).toBeInTheDocument(),
		);
		expect(
			screen.getByRole("button", { name: /connect/i }),
		).toBeInTheDocument();
	});

	it("shows the viewer name when connected", async () => {
		mocks.linearGetAuthStatus.mockResolvedValue({
			connected: true,
			viewer: { id: "u1", name: "Dan Melo", email: "dan@example.com" },
		});
		render(<LinearPanel />);
		await waitFor(() =>
			expect(screen.getByText(/Dan Melo/)).toBeInTheDocument(),
		);
		expect(
			screen.getByRole("button", { name: /disconnect/i }),
		).toBeInTheDocument();
	});

	it("saves a pasted key and re-probes auth", async () => {
		mocks.linearGetAuthStatus
			.mockResolvedValueOnce({ connected: false, viewer: null })
			.mockResolvedValueOnce({
				connected: true,
				viewer: { id: "u1", name: "Dan Melo", email: "dan@example.com" },
			});
		mocks.linearSetApiKey.mockResolvedValue(undefined);
		render(<LinearPanel />);
		const input = await screen.findByPlaceholderText(/lin_api_/i);
		await userEvent.type(input, "lin_api_xyz");
		await userEvent.click(screen.getByRole("button", { name: /connect/i }));
		await waitFor(() =>
			expect(mocks.linearSetApiKey).toHaveBeenCalledWith("lin_api_xyz"),
		);
		await waitFor(() =>
			expect(screen.getByText(/Dan Melo/)).toBeInTheDocument(),
		);
	});

	it("clears the key on disconnect", async () => {
		mocks.linearGetAuthStatus
			.mockResolvedValueOnce({
				connected: true,
				viewer: { id: "u1", name: "Dan Melo", email: "dan@example.com" },
			})
			.mockResolvedValueOnce({ connected: false, viewer: null });
		mocks.linearClearApiKey.mockResolvedValue(undefined);
		render(<LinearPanel />);
		await screen.findByText(/Dan Melo/);
		await userEvent.click(screen.getByRole("button", { name: /disconnect/i }));
		await waitFor(() => expect(mocks.linearClearApiKey).toHaveBeenCalled());
		await waitFor(() =>
			expect(screen.getByPlaceholderText(/lin_api_/i)).toBeInTheDocument(),
		);
	});
});

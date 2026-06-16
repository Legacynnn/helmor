import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createBrowserBridgeStore } from "../bridge/use-browser-bridge";
import { ConsoleNetworkPanel } from "./console-network-panel";

describe("ConsoleNetworkPanel", () => {
	it("renders a captured console error", () => {
		const store = createBrowserBridgeStore();
		store.getState().ingest({
			kind: "console-error",
			entry: {
				level: "error",
				message: "ReferenceError: x is not defined",
				ts: 1,
			},
		});
		render(<ConsoleNetworkPanel store={store} onClose={() => {}} />);
		expect(
			screen.getByText(/ReferenceError: x is not defined/),
		).toBeInTheDocument();
		// level badge surfaces the severity
		expect(screen.getByText("error")).toBeInTheDocument();
	});

	it("renders a failed network entry", () => {
		const store = createBrowserBridgeStore();
		store.getState().ingest({
			kind: "network-event",
			entry: {
				url: "https://api.test/users",
				method: "GET",
				status: 500,
				durationMs: 42,
				failed: true,
			},
		});
		render(<ConsoleNetworkPanel store={store} onClose={() => {}} />);
		expect(screen.getByText(/https:\/\/api\.test\/users/)).toBeInTheDocument();
		expect(screen.getByText("500")).toBeInTheDocument();
	});

	it("shows an empty state when nothing is captured", () => {
		const store = createBrowserBridgeStore();
		render(<ConsoleNetworkPanel store={store} onClose={() => {}} />);
		expect(
			screen.getByText(/no console or network activity/i),
		).toBeInTheDocument();
	});
});

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UrlBar } from "./url-bar";

describe("UrlBar", () => {
	afterEach(cleanup);

	it("calls onNavigate with the typed value on submit", () => {
		const onNavigate = vi.fn();
		render(
			<UrlBar
				url="http://localhost:3000"
				onNavigate={onNavigate}
				onBack={vi.fn()}
				onForward={vi.fn()}
				onReload={vi.fn()}
			/>,
		);
		const input = screen.getByRole("textbox", { name: /address/i });
		fireEvent.change(input, { target: { value: "http://localhost:8080" } });
		fireEvent.submit(input.closest("form")!);
		expect(onNavigate).toHaveBeenCalledWith("http://localhost:8080");
	});

	it("normalizes a bare host on submit (auto scheme)", () => {
		const onNavigate = vi.fn();
		render(
			<UrlBar
				url=""
				onNavigate={onNavigate}
				onBack={vi.fn()}
				onForward={vi.fn()}
				onReload={vi.fn()}
			/>,
		);
		const input = screen.getByRole("textbox", { name: /address/i });
		fireEvent.change(input, { target: { value: "example.com" } });
		fireEvent.submit(input.closest("form")!);
		expect(onNavigate).toHaveBeenCalledWith("https://example.com");

		fireEvent.change(input, { target: { value: "localhost:3000" } });
		fireEvent.submit(input.closest("form")!);
		expect(onNavigate).toHaveBeenCalledWith("http://localhost:3000");
	});

	it("invokes the nav button callbacks", () => {
		const onBack = vi.fn();
		const onForward = vi.fn();
		const onReload = vi.fn();
		render(
			<UrlBar
				url="http://localhost:3000"
				onNavigate={vi.fn()}
				onBack={onBack}
				onForward={onForward}
				onReload={onReload}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /back/i }));
		fireEvent.click(screen.getByRole("button", { name: /forward/i }));
		fireEvent.click(screen.getByRole("button", { name: /reload/i }));
		expect(onBack).toHaveBeenCalled();
		expect(onForward).toHaveBeenCalled();
		expect(onReload).toHaveBeenCalled();
	});
});

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewportPresets } from "./viewport-presets";

describe("ViewportPresets", () => {
	afterEach(cleanup);

	it("renders a button per built-in preset", () => {
		render(<ViewportPresets value="desktop" onChange={vi.fn()} />);
		expect(screen.getByRole("button", { name: /mobile/i })).toBeTruthy();
		expect(screen.getByRole("button", { name: /tablet/i })).toBeTruthy();
		expect(screen.getByRole("button", { name: /desktop/i })).toBeTruthy();
	});

	it("calls onChange with the clicked preset id", () => {
		const onChange = vi.fn();
		render(<ViewportPresets value="desktop" onChange={onChange} />);
		fireEvent.click(screen.getByRole("button", { name: /mobile/i }));
		expect(onChange).toHaveBeenCalledWith("mobile");
	});

	it("marks the active preset as pressed", () => {
		render(<ViewportPresets value="tablet" onChange={vi.fn()} />);
		expect(
			screen
				.getByRole("button", { name: /tablet/i })
				.getAttribute("aria-pressed"),
		).toBe("true");
	});
});

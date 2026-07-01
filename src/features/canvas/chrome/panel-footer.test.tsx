import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@excalidraw/excalidraw", () => ({ Excalidraw: () => null }));

import { CanvasWorkspaceProvider } from "../canvas-workspace-context";
import { PanelFooter } from "./panel-footer";

function wrap(ui: ReactNode) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<CanvasWorkspaceProvider
				value={{
					workspaceId: "ws-1",
					repoId: null,
					workspaceRootPath: null,
					workspaceReady: true,
				}}
			>
				{ui}
			</CanvasWorkspaceProvider>
		</QueryClientProvider>,
	);
}

describe("PanelFooter", () => {
	it("renders the editor file name for an editor panel", () => {
		wrap(
			<PanelFooter
				panelType="editor"
				config={JSON.stringify({ filePath: "src/app/main.ts" })}
				accent="oklch(0.6 0.13 275)"
				background="#111"
			/>,
		);
		expect(screen.getByText("main.ts")).toBeInTheDocument();
	});
	it("renders a notes word count for a notes panel", () => {
		wrap(
			<PanelFooter
				panelType="notes"
				config={JSON.stringify({ notes: "hello world foo" })}
				accent="oklch(0.74 0.13 85)"
				background="#111"
			/>,
		);
		expect(screen.getByText("3 words")).toBeInTheDocument();
	});
});

import { AlertTriangle } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

/** Isolates a panel body so one failing surface (a streaming bug, a bad file,
 * …) renders an inline error in its own panel instead of taking down the whole
 * canvas. */
export class PanelErrorBoundary extends Component<
	{ children: ReactNode },
	{ error: Error | null }
> {
	state = { error: null as Error | null };

	static getDerivedStateFromError(error: Error) {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("Canvas panel crashed:", error, info.componentStack);
	}

	render() {
		if (this.state.error) {
			return (
				<div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center text-app-muted-foreground">
					<AlertTriangle className="size-6 text-destructive opacity-70" />
					<div className="font-medium text-sm">Panel failed to render</div>
					<div className="max-w-full truncate text-xs opacity-70">
						{this.state.error.message}
					</div>
					<button
						type="button"
						className="mt-1 cursor-pointer rounded border border-app-border px-2 py-1 text-xs hover:bg-app-muted"
						onClick={() => this.setState({ error: null })}
					>
						Retry
					</button>
				</div>
			);
		}
		return this.props.children;
	}
}

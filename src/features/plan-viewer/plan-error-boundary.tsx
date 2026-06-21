import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = {
	children: ReactNode;
	/** Non-destructive exit from the plan surface (return to the conversation
	 *  without deleting the plan). */
	onExit?: () => void;
};

type State = { error: Error | null };

/**
 * Catches render errors thrown by the plan surface so a single malformed plan
 * (or a failed lazy chunk, e.g. the canvas) can never blank the whole panel.
 * Shows a readable fallback + a non-destructive way back to the conversation,
 * and logs the real error so it can be diagnosed.
 */
export class PlanErrorBoundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error(
			"[plan-viewer] failed to render plan",
			error,
			info.componentStack,
		);
	}

	override render() {
		const { error } = this.state;
		if (error) {
			return (
				<div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
					<p className="text-foreground text-small">
						This plan couldn't be displayed.
					</p>
					<p className="max-w-md break-words text-micro text-muted-foreground">
						{error.message}
					</p>
					{this.props.onExit ? (
						<Button
							size="sm"
							variant="outline"
							onClick={() => {
								this.setState({ error: null });
								this.props.onExit?.();
							}}
						>
							Back to conversation
						</Button>
					) : null}
				</div>
			);
		}
		return this.props.children;
	}
}

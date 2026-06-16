// CSP screenshot-fallback surface.
//
// When the inspector bridge cannot inject (strict CSP blocks the
// `initialization_script`), the Rust host emits `BrowserInjectionFailed`, which
// `use-ui-sync-bridge` folds into the workspace bridge store's
// `injectionBlocked` flag. This component renders only while that flag is set:
// it freezes the page to a screenshot and lets the user annotate the IMAGE with
// coordinate-based pins (no DOM selectors are available behind a strict CSP).
//
// The frozen screenshot source is injected (`screenshotSrc`) because host-side
// webview capture is platform-specific and validated live; the annotation +
// coordinate logic here is fully pure-unit-tested.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ImageAnnotation } from "./annotations";
import { CanvasAnnotator } from "./canvas-annotator";

type CspFallbackProps = {
	/** Data/object URL of the frozen-page screenshot, or null while capturing. */
	screenshotSrc: string | null;
	/** Dismiss the fallback (e.g. user navigated away or retried injection). */
	onDismiss: () => void;
};

export function CspFallback({ screenshotSrc, onDismiss }: CspFallbackProps) {
	const [annotations, setAnnotations] = useState<ImageAnnotation[]>([]);

	return (
		<section
			aria-label="CSP screenshot fallback"
			className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app-base"
		>
			<header className="flex h-8 shrink-0 items-center justify-between border-border/40 border-b px-3">
				<span className="text-muted-foreground text-xs">
					This page blocks the inspector. Annotating a screenshot instead.
				</span>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={onDismiss}
					className="text-muted-foreground hover:text-foreground"
				>
					Dismiss
				</Button>
			</header>
			<div className="min-h-0 flex-1 overflow-auto p-2">
				{screenshotSrc ? (
					<CanvasAnnotator
						screenshotSrc={screenshotSrc}
						annotations={annotations}
						onAddAnnotation={setAnnotations}
					/>
				) : (
					<p className="p-4 text-muted-foreground text-xs">
						Freezing the page to a screenshot…
					</p>
				)}
			</div>
		</section>
	);
}

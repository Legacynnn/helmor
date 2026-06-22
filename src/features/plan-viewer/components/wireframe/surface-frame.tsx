import type { ReactNode } from "react";

/** The device/window chrome a wireframe is shown in. */
export type WireframeSurface =
	| "browser"
	| "app"
	| "mobile"
	| "panel"
	| "popover";

const SURFACES = new Set<WireframeSurface>([
	"browser",
	"app",
	"mobile",
	"panel",
	"popover",
]);

/** Resolve a surface string to a known surface, defaulting to `browser`. */
export function normalizeSurface(value: string | undefined): WireframeSurface {
	return value && SURFACES.has(value as WireframeSurface)
		? (value as WireframeSurface)
		: "browser";
}

/** Three window dots (browser/app chrome). */
function Dots() {
	return (
		<span className="flex gap-1">
			<span className="size-2 rounded-full bg-border" />
			<span className="size-2 rounded-full bg-border" />
			<span className="size-2 rounded-full bg-border" />
		</span>
	);
}

/** The paper body the wireframe content sits on. */
function Body({ children }: { children: ReactNode }) {
	return (
		<div className="flex flex-col gap-2.5 bg-background p-4">{children}</div>
	);
}

/**
 * `WireframeFrame` wraps wireframe content in flat, bordered device/window
 * chrome themed entirely through `--*` tokens (no shadows, no hardcoded white).
 * The chrome reads as the product surface; the body is the paper. The mockup's
 * own title is shown by the surrounding shell, so the chrome uses neutral
 * placeholder labels rather than echoing it.
 */
export function WireframeFrame({
	surface,
	children,
}: {
	surface: WireframeSurface;
	children: ReactNode;
}) {
	switch (surface) {
		case "browser":
			return (
				<div className="overflow-hidden rounded-lg border border-border">
					<div className="flex items-center gap-2 border-border border-b bg-muted/50 px-3 py-1.5">
						<Dots />
						<span className="ml-1 min-w-0 flex-1 truncate rounded bg-background px-2 py-0.5 text-muted-foreground text-nano">
							example.com
						</span>
					</div>
					<Body>{children}</Body>
				</div>
			);
		case "app":
			return (
				<div className="overflow-hidden rounded-lg border border-border">
					<div className="flex items-center gap-2 border-border border-b bg-muted/50 px-3 py-1.5">
						<Dots />
					</div>
					<Body>{children}</Body>
				</div>
			);
		case "mobile":
			return (
				<div className="mx-auto w-full max-w-[320px] overflow-hidden rounded-[1.4rem] border-2 border-border">
					<div className="flex items-center justify-center border-border border-b bg-muted/50 py-1">
						<span className="h-1 w-12 rounded-full bg-border" />
					</div>
					<Body>{children}</Body>
				</div>
			);
		case "panel":
			return (
				<div className="overflow-hidden rounded-lg border border-border">
					<div className="flex items-center justify-between gap-2 border-border border-b bg-muted/50 px-3 py-1.5">
						<span className="truncate font-medium text-foreground text-nano">
							Panel
						</span>
						<span className="text-muted-foreground text-nano">✕</span>
					</div>
					<Body>{children}</Body>
				</div>
			);
		case "popover":
			return (
				<div className="w-fit min-w-[200px] max-w-[280px] overflow-hidden rounded-md border border-border">
					<div className="flex flex-col gap-2 bg-background p-3">
						{children}
					</div>
				</div>
			);
	}
}

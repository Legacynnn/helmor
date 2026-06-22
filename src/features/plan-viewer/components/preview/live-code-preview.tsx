import { AlertTriangleIcon, Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { buildPreviewDocument, isPreviewMessage } from "./build-document";

/** Hard cap on auto-grown iframe height; taller previews scroll internally.
 * Generous so a prototype reads at near real-screen size, not a thumbnail. */
const MAX_HEIGHT = 960;
const MIN_HEIGHT = 400;
/** If nothing loads in this window, assume the CDN is blocked/offline. */
const LOAD_TIMEOUT_MS = 12_000;

type Status = "loading" | "ready" | "error";

/**
 * Hosts a live React/Tailwind snippet inside an isolated, sandboxed iframe. The
 * document is served from a `blob:` URL (opaque origin → no host access, no
 * style leakage) with `sandbox="allow-scripts"`. The sandbox reports readiness,
 * content height, and errors back via `postMessage`; this component renders the
 * loading / error states and sizes the frame to fit.
 */
export function LiveCodePreview({ code }: { code: string }) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [status, setStatus] = useState<Status>("loading");
	const [error, setError] = useState<string>("");
	const [height, setHeight] = useState<number>(MIN_HEIGHT);

	// Build a fresh blob document whenever the snippet changes.
	const [src, setSrc] = useState<string>("");
	useEffect(() => {
		const blob = new Blob([buildPreviewDocument(code)], { type: "text/html" });
		const url = URL.createObjectURL(blob);
		setStatus("loading");
		setError("");
		setSrc(url);
		return () => URL.revokeObjectURL(url);
	}, [code]);

	// Listen for messages from this iframe only.
	useEffect(() => {
		function onMessage(event: MessageEvent) {
			if (event.source !== iframeRef.current?.contentWindow) {
				return;
			}
			if (!isPreviewMessage(event.data)) {
				return;
			}
			const msg = event.data;
			if (msg.type === "ready") {
				setStatus((s) => (s === "error" ? s : "ready"));
			} else if (msg.type === "height") {
				setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, msg.height)));
				setStatus((s) => (s === "error" ? s : "ready"));
			} else if (msg.type === "error") {
				setError(msg.message);
				setStatus("error");
			}
		}
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, []);

	// Surface offline/blocked CDN as an error instead of an endless spinner.
	useEffect(() => {
		const timer = setTimeout(() => {
			setStatus((s) => {
				if (s === "loading") {
					setError(
						"Preview didn't load — the runtime (React/Tailwind) couldn't be fetched. Check your connection.",
					);
					return "error";
				}
				return s;
			});
		}, LOAD_TIMEOUT_MS);
		return () => clearTimeout(timer);
	}, []);

	return (
		<div className="relative overflow-hidden rounded-md border border-border bg-background">
			{/* Faux window chrome so the mockup reads as a real surface. */}
			<div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/40 px-3 py-1.5">
				<span className="size-2 rounded-full bg-red-400/70" />
				<span className="size-2 rounded-full bg-amber-400/70" />
				<span className="size-2 rounded-full bg-emerald-400/70" />
				<span className="ml-2 text-micro text-muted-foreground">Preview</span>
			</div>

			{status === "error" ? (
				<div className="flex items-start gap-2 p-3 text-small text-red-600 dark:text-red-400">
					<AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
					<div className="min-w-0">
						<p className="font-medium">Preview failed</p>
						<p className="mt-0.5 break-words font-mono text-micro text-muted-foreground">
							{error}
						</p>
					</div>
				</div>
			) : (
				<div className="relative">
					{status === "loading" ? (
						<div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background/80 text-small text-muted-foreground">
							<Loader2Icon className="size-4 animate-spin" />
							Loading preview…
						</div>
					) : null}
					<iframe
						ref={iframeRef}
						src={src || undefined}
						title="Live UI preview"
						sandbox="allow-scripts"
						className={cn(
							"block w-full bg-transparent transition-[opacity,transform] duration-300 ease-out",
							status === "ready"
								? "scale-100 opacity-100"
								: "scale-[0.98] opacity-0",
						)}
						style={{ height }}
					/>
				</div>
			)}
		</div>
	);
}

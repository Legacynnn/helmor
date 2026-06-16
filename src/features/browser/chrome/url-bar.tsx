// Address bar for the browser surface: a <form> wrapping back/forward/reload
// nav buttons and a single URL <input>. Submitting the form navigates the
// active tab. Purely presentational — all navigation is delegated to props.
import { ArrowLeft, ArrowRight, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { normalizeUrl } from "../url/normalize-url";

type UrlBarProps = {
	url: string;
	onNavigate: (url: string) => void;
	onBack: () => void;
	onForward: () => void;
	onReload: () => void;
};

export function UrlBar({
	url,
	onNavigate,
	onBack,
	onForward,
	onReload,
}: UrlBarProps) {
	// Local draft so typing doesn't fight the controlled `url` prop; resync when
	// the active tab's URL changes underneath us (tab switch / programmatic nav).
	const [draft, setDraft] = useState(url);
	useEffect(() => {
		setDraft(url);
	}, [url]);

	return (
		<form
			className="flex h-9 min-w-0 flex-1 items-center gap-1 px-2"
			onSubmit={(event) => {
				event.preventDefault();
				const next = normalizeUrl(draft);
				if (next) onNavigate(next);
			}}
		>
			<Button
				type="button"
				variant="ghost"
				size="icon-xs"
				aria-label="Back"
				onClick={onBack}
				className="text-muted-foreground hover:text-foreground"
			>
				<ArrowLeft className="size-3.5" strokeWidth={1.8} />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="icon-xs"
				aria-label="Forward"
				onClick={onForward}
				className="text-muted-foreground hover:text-foreground"
			>
				<ArrowRight className="size-3.5" strokeWidth={1.8} />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="icon-xs"
				aria-label="Reload"
				onClick={onReload}
				className="text-muted-foreground hover:text-foreground"
			>
				<RotateCw className="size-3.5" strokeWidth={1.8} />
			</Button>
			<input
				aria-label="Address bar"
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				placeholder="Enter a URL"
				spellCheck={false}
				autoCapitalize="off"
				autoCorrect="off"
				className="h-6 min-w-0 flex-1 rounded-md bg-muted/50 px-2 text-ui text-foreground outline-none placeholder:text-muted-foreground/55 focus-visible:ring-1 focus-visible:ring-ring"
			/>
		</form>
	);
}

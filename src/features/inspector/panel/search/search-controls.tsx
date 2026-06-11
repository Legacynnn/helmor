// Query input + match-mode toggles (case / whole word / regex), the replace
// row, and the include/exclude glob inputs — VS Code's search header.
import {
	CaseSensitiveIcon,
	ChevronRightIcon,
	RegexIcon,
	ReplaceAllIcon,
	WholeWordIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SearchParams } from "./use-workspace-search";

const INPUT_CLASS =
	"h-6 w-full min-w-0 rounded-sm border border-border/60 bg-background/60 px-1.5 font-mono text-mini text-foreground outline-none placeholder:text-muted-foreground/55 focus:border-ring";

function ToggleButton({
	icon: Icon,
	label,
	active,
	onToggle,
}: {
	icon: ComponentType<{ className?: string; strokeWidth?: number }>;
	label: string;
	active: boolean;
	onToggle: () => void;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					aria-pressed={active}
					onClick={onToggle}
					className={cn(
						"flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
						active && "bg-accent text-foreground",
					)}
				>
					<Icon className="size-3.5" strokeWidth={1.8} />
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom" className="px-2 py-1 text-small">
				{label}
			</TooltipContent>
		</Tooltip>
	);
}

export function SearchControls({
	params,
	onParamsChange,
	replaceOpen,
	onToggleReplace,
	replacement,
	onReplacementChange,
	globsOpen,
	onToggleGlobs,
	onReplaceAll,
	canReplaceAll,
}: {
	params: SearchParams;
	onParamsChange: (next: SearchParams) => void;
	replaceOpen: boolean;
	onToggleReplace: () => void;
	replacement: string;
	onReplacementChange: (value: string) => void;
	globsOpen: boolean;
	onToggleGlobs: () => void;
	onReplaceAll: () => void;
	canReplaceAll: boolean;
}) {
	return (
		<div className="flex flex-col gap-1.5 border-b border-border/60 px-2 py-2">
			<div className="flex items-start gap-1">
				<button
					type="button"
					aria-label={replaceOpen ? "Hide replace" : "Show replace"}
					aria-expanded={replaceOpen}
					onClick={onToggleReplace}
					className="mt-0.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
				>
					<ChevronRightIcon
						className={cn(
							"size-3.5 transition-transform",
							replaceOpen && "rotate-90",
						)}
						strokeWidth={1.8}
					/>
				</button>
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<div className="flex items-center gap-1">
						<input
							value={params.query}
							onChange={(event) =>
								onParamsChange({ ...params, query: event.target.value })
							}
							placeholder="Search"
							aria-label="Search query"
							spellCheck={false}
							className={INPUT_CLASS}
						/>
						<ToggleButton
							icon={CaseSensitiveIcon}
							label="Match case"
							active={params.caseSensitive}
							onToggle={() =>
								onParamsChange({
									...params,
									caseSensitive: !params.caseSensitive,
								})
							}
						/>
						<ToggleButton
							icon={WholeWordIcon}
							label="Match whole word"
							active={params.wholeWord}
							onToggle={() =>
								onParamsChange({ ...params, wholeWord: !params.wholeWord })
							}
						/>
						<ToggleButton
							icon={RegexIcon}
							label="Use regular expression"
							active={params.regex}
							onToggle={() =>
								onParamsChange({ ...params, regex: !params.regex })
							}
						/>
					</div>
					{replaceOpen && (
						<div className="flex items-center gap-1">
							<input
								value={replacement}
								onChange={(event) => onReplacementChange(event.target.value)}
								placeholder="Replace"
								aria-label="Replace with"
								spellCheck={false}
								className={INPUT_CLASS}
							/>
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										aria-label="Replace all"
										onClick={onReplaceAll}
										disabled={!canReplaceAll}
										className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
									>
										<ReplaceAllIcon className="size-3.5" strokeWidth={1.8} />
									</button>
								</TooltipTrigger>
								<TooltipContent side="bottom" className="px-2 py-1 text-small">
									Replace all
								</TooltipContent>
							</Tooltip>
						</div>
					)}
				</div>
			</div>
			<button
				type="button"
				onClick={onToggleGlobs}
				aria-expanded={globsOpen}
				className="flex cursor-pointer items-center gap-1 self-start text-micro text-muted-foreground transition-colors hover:text-foreground"
			>
				<ChevronRightIcon
					className={cn(
						"size-3 transition-transform",
						globsOpen && "rotate-90",
					)}
					strokeWidth={1.8}
				/>
				files to include / exclude
			</button>
			{globsOpen && (
				<div className="flex flex-col gap-1 pl-4">
					<input
						value={params.includeGlobs}
						onChange={(event) =>
							onParamsChange({ ...params, includeGlobs: event.target.value })
						}
						placeholder="files to include (e.g. src/**, *.ts)"
						aria-label="Files to include"
						spellCheck={false}
						className={INPUT_CLASS}
					/>
					<input
						value={params.excludeGlobs}
						onChange={(event) =>
							onParamsChange({ ...params, excludeGlobs: event.target.value })
						}
						placeholder="files to exclude"
						aria-label="Files to exclude"
						spellCheck={false}
						className={INPUT_CLASS}
					/>
				</div>
			)}
		</div>
	);
}

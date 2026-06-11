// Row-level presentation bits shared by the tree and flat views: hover
// action buttons (open / stage / discard), the tree-vs-list view toggle,
// per-row line stats and the shiny "file just changed" flash.
import {
	ExternalLinkIcon,
	ListIcon,
	ListTreeIcon,
	MinusIcon,
	PlusIcon,
	Undo2Icon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type ChangeRow, STATUS_COLORS, type StageActionKind } from "./shared";

export function StageActionSlot({
	file,
	action,
	onOpenExternalEditor,
	onStageAction,
	onDiscard,
}: {
	file: ChangeRow;
	action?: StageActionKind;
	onOpenExternalEditor: (path: string) => void;
	onStageAction?: (path: string) => void;
	onDiscard?: (path: string) => void;
}) {
	const hasStage = !!action && !!onStageAction;
	const hasDiscard = !!onDiscard;
	const canOpenExternalEditor = file.status !== "D";
	const hasHoverAction = canOpenExternalEditor || hasStage || hasDiscard;

	return (
		<>
			<span
				className={cn(
					"ml-auto flex shrink-0 items-center gap-1.5",
					hasHoverAction && "group-hover/row:hidden",
				)}
			>
				<LineStats insertions={file.insertions} deletions={file.deletions} />
				<span
					className={cn(
						"inline-flex h-4 w-4 items-center justify-center text-micro font-semibold",
						STATUS_COLORS[file.status],
					)}
				>
					{file.status}
				</span>
			</span>
			{hasHoverAction && (
				<RowHoverActions
					path={file.path}
					absolutePath={file.absolutePath}
					canOpenExternalEditor={canOpenExternalEditor}
					action={hasStage ? action : undefined}
					onOpenExternalEditor={onOpenExternalEditor}
					onStageAction={hasStage ? onStageAction : undefined}
					onDiscard={hasDiscard ? onDiscard : undefined}
				/>
			)}
		</>
	);
}

export function RowHoverActions({
	path,
	absolutePath,
	canOpenExternalEditor,
	action,
	onOpenExternalEditor,
	onStageAction,
	onDiscard,
}: {
	path: string;
	absolutePath: string;
	canOpenExternalEditor: boolean;
	action?: StageActionKind;
	onOpenExternalEditor: (path: string) => void;
	onStageAction?: (path: string) => void;
	onDiscard?: (path: string) => void;
}) {
	return (
		<span className="ml-auto hidden items-center gap-0.5 group-hover/row:inline-flex">
			{canOpenExternalEditor && (
				<RowIconButton
					aria-label="Open in editor"
					title="Open in editor"
					onClick={() => onOpenExternalEditor(absolutePath)}
					className="text-muted-foreground hover:bg-accent/60 hover:text-foreground"
				>
					<ExternalLinkIcon className="size-3.5" strokeWidth={2} />
				</RowIconButton>
			)}
			{onDiscard && (
				<RowIconButton
					aria-label="Discard file changes"
					title="Discard file changes"
					onClick={() => onDiscard(path)}
					className="text-muted-foreground hover:bg-accent/60 hover:text-foreground"
				>
					<Undo2Icon className="size-3.5" strokeWidth={2} />
				</RowIconButton>
			)}
			{action && onStageAction && (
				<RowIconButton
					aria-label={action === "stage" ? "Stage file" : "Unstage file"}
					title={action === "stage" ? "Stage file" : "Unstage file"}
					onClick={() => onStageAction(path)}
					className="text-muted-foreground hover:bg-accent/60 hover:text-foreground"
				>
					{action === "stage" ? (
						<PlusIcon className="size-3.5" strokeWidth={2} />
					) : (
						<MinusIcon className="size-3.5" strokeWidth={2} />
					)}
				</RowIconButton>
			)}
		</span>
	);
}

export function RowIconButton({
	onClick,
	disabled = false,
	children,
	className,
	"aria-label": ariaLabel,
	title,
}: {
	onClick: () => void;
	disabled?: boolean;
	children: React.ReactNode;
	className?: string;
	"aria-label": string;
	title?: string;
}) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-xs"
			aria-label={ariaLabel}
			title={title}
			disabled={disabled}
			onClick={(event) => {
				event.stopPropagation();
				onClick();
			}}
			onKeyDown={(event) => event.stopPropagation()}
			className={cn(
				"size-4 rounded-sm transition-colors disabled:pointer-events-none disabled:opacity-60",
				className,
			)}
		>
			{children}
		</Button>
	);
}

export function ViewToggleButton({
	treeView,
	onToggle,
}: {
	treeView: boolean;
	onToggle: () => void;
}) {
	return (
		<RowIconButton
			aria-label={treeView ? "Switch to list view" : "Switch to tree view"}
			onClick={onToggle}
			className="text-transparent hover:bg-transparent group-hover/header:text-muted-foreground group-hover/header:hover:text-foreground"
		>
			{treeView ? (
				<ListIcon className="size-3.5" strokeWidth={1.8} />
			) : (
				<ListTreeIcon className="size-3.5" strokeWidth={1.8} />
			)}
		</RowIconButton>
	);
}

export function LineStats({
	insertions,
	deletions,
}: {
	insertions: number;
	deletions: number;
}) {
	if (insertions === 0 && deletions === 0) {
		return null;
	}

	return (
		<span className="flex shrink-0 items-center gap-1 text-micro tabular-nums">
			{insertions > 0 && <span className="text-chart-2">+{insertions}</span>}
			{deletions > 0 && <span className="text-destructive">−{deletions}</span>}
		</span>
	);
}

export function ShinyFlash({
	active,
	children,
}: {
	active: boolean;
	children: React.ReactNode;
}) {
	const [shimmer, setShimmer] = useState(false);
	const counterRef = useRef(0);

	useEffect(() => {
		if (!active) {
			return;
		}
		counterRef.current += 1;
		setShimmer(true);
		const timeoutId = window.setTimeout(() => setShimmer(false), 3000);
		return () => window.clearTimeout(timeoutId);
	}, [active]);

	if (!shimmer) {
		return <span className="truncate">{children}</span>;
	}

	return (
		<AnimatedShinyText
			key={counterRef.current}
			shimmerWidth={60}
			className="!mx-0 !max-w-none truncate !text-neutral-500/80 ![animation-duration:1s] ![animation-iteration-count:3] ![animation-name:shiny-text-continuous] ![animation-timing-function:ease-in-out] dark:!text-neutral-500/80 dark:via-white via-black"
		>
			{children}
		</AnimatedShinyText>
	);
}

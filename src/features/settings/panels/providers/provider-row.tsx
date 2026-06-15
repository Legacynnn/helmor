import { ChevronDown, ExternalLink, LogIn } from "lucide-react";
import { type ElementType, type ReactNode, useCallback, useState } from "react";
import { AgentLoginDialog } from "@/components/agent-login/agent-login-dialog";
import { Button } from "@/components/ui/button";
import type {
	AgentCliSource,
	AgentLoginProvider,
	ProviderConfigEntry,
	ProviderConfigInspection,
} from "@/lib/api";
import { openUrl } from "@/lib/platform-bridge";
import { cn } from "@/lib/utils";

export function ProviderRow({
	icon: Icon,
	name,
	description,
	binaryName,
	version,
	cliSource,
	binaryPath,
	installUrl,
	installCommands = [],
	inspection,
	detailsVariant = "nested",
	ready,
	connecting = false,
	loginProvider,
	onLoginExit,
	collapsible = false,
	defaultOpen = false,
	children,
}: {
	icon: ElementType<{ className?: string }>;
	name: string;
	description?: ReactNode;
	binaryName?: string | null;
	version?: string | null;
	cliSource?: AgentCliSource | null;
	binaryPath?: string | null;
	installUrl?: string | null;
	installCommands?: readonly string[];
	inspection?: ProviderConfigInspection | null;
	detailsVariant?: "nested" | "expanded";
	ready: boolean;
	/** Still determining readiness (status check in flight / server booting) —
	 *  show "Connecting…" instead of a premature "Log in". */
	connecting?: boolean;
	loginProvider: AgentLoginProvider | null;
	onLoginExit?: () => void;
	collapsible?: boolean;
	defaultOpen?: boolean;
	children?: ReactNode;
}) {
	const [open, setOpen] = useState(defaultOpen);
	const [loginOpen, setLoginOpen] = useState(false);
	const hasDetails = hasProviderDetails({
		binaryName,
		version,
		cliSource,
		binaryPath,
		installUrl,
		installCommands,
		inspection,
	});
	const hasChildren = Boolean(children) || hasDetails;
	const expanded = collapsible ? open : true;

	// Re-check login status when the login dialog closes.
	const handleLoginOpenChange = useCallback(
		(next: boolean) => {
			setLoginOpen(next);
			if (!next) onLoginExit?.();
		},
		[onLoginExit],
	);

	const status = (
		<>
			{ready ? <StatusBadge /> : null}
			{!ready && connecting ? <ConnectingBadge /> : null}
			{loginProvider && !ready && !connecting ? (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="shrink-0"
					onClick={(event) => {
						event.stopPropagation();
						setLoginOpen(true);
					}}
				>
					<LogIn className="size-3.5" />
					Log in
				</Button>
			) : null}
		</>
	);
	const identity = (
		<>
			<Icon className="size-5 shrink-0 text-foreground" />
			<div className="flex min-w-0 flex-1 items-baseline gap-2">
				<div className="min-w-0">
					<div className="flex min-w-0 items-baseline gap-2">
						<span className="text-ui font-medium leading-snug text-foreground">
							{name}
						</span>
					</div>
					{description ? (
						<div className="mt-1 text-small leading-snug text-muted-foreground">
							{description}
						</div>
					) : null}
				</div>
			</div>
		</>
	);

	// Chevron for collapsibles, equal-width spacer otherwise so the status control aligns across rows.
	const trailing = collapsible ? (
		<ChevronDown
			className={cn(
				"size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:text-foreground",
				!open && "-rotate-90",
			)}
			strokeWidth={1.8}
		/>
	) : (
		<span aria-hidden="true" className="size-4 shrink-0" />
	);

	return (
		<div>
			{collapsible ? (
				// A div, not <button>: the Login control nests inside, so button-in-button is invalid.
				<div
					role="button"
					tabIndex={0}
					aria-expanded={open}
					onClick={() => setOpen((value) => !value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							setOpen((value) => !value);
						}
					}}
					// Fixed min-height so the async status control (badge ↔ login button) can't reflow the row.
					className="group flex min-h-[3.75rem] cursor-pointer items-center gap-3 py-4"
				>
					{identity}
					{status}
					{trailing}
				</div>
			) : (
				<div className="flex min-h-[3.75rem] items-center gap-3 py-4">
					{identity}
					{status}
					{trailing}
				</div>
			)}

			{/* Children stay mounted when collapsed so their one-time effects still run. */}
			{hasChildren ? (
				<div className={cn(!expanded && "hidden")}>
					{children}
					{hasDetails ? (
						<ProviderDetails
							name={name}
							binaryName={binaryName}
							version={version}
							cliSource={cliSource}
							binaryPath={binaryPath}
							installUrl={installUrl}
							installCommands={installCommands}
							inspection={inspection}
							variant={detailsVariant}
						/>
					) : null}
				</div>
			) : null}

			{loginProvider ? (
				<AgentLoginDialog
					open={loginOpen}
					onOpenChange={handleLoginOpenChange}
					provider={loginProvider}
				/>
			) : null}
		</div>
	);
}

type ProviderDetailsInput = {
	binaryName?: string | null;
	version?: string | null;
	cliSource?: AgentCliSource | null;
	binaryPath?: string | null;
	installUrl?: string | null;
	installCommands?: readonly string[];
	inspection?: ProviderConfigInspection | null;
};

function hasProviderDetails({
	binaryName,
	version,
	cliSource,
	binaryPath,
	installUrl,
	installCommands = [],
	inspection,
}: ProviderDetailsInput): boolean {
	return Boolean(
		binaryName ||
			version ||
			cliSource ||
			binaryPath ||
			installUrl ||
			installCommands.length > 0 ||
			hasInspectionData(inspection),
	);
}

function hasInspectionData(
	inspection: ProviderConfigInspection | null | undefined,
): boolean {
	return Boolean(
		inspection &&
			(inspection.roots.length > 0 ||
				inspection.files.length > 0 ||
				inspection.skills.length > 0 ||
				inspection.hooks.length > 0 ||
				inspection.mcpServers.length > 0 ||
				inspection.extensions.length > 0 ||
				inspection.warnings.length > 0),
	);
}

function ProviderDetails({
	name,
	binaryName,
	version,
	cliSource,
	binaryPath,
	installUrl,
	installCommands,
	inspection,
	variant,
}: ProviderDetailsInput & {
	name: string;
	variant: "nested" | "expanded";
}) {
	const [open, setOpen] = useState(false);
	const commands = installCommands ?? [];
	const content = (
		<ProviderDetailsContent
			name={name}
			binaryName={binaryName}
			version={version}
			cliSource={cliSource}
			binaryPath={binaryPath}
			installUrl={installUrl}
			installCommands={commands}
			inspection={inspection}
		/>
	);

	if (variant === "expanded") {
		return (
			<div className="pb-5 pl-8 text-small leading-snug text-muted-foreground">
				{content}
			</div>
		);
	}

	return (
		<div className="pb-4 pl-8">
			<button
				type="button"
				aria-expanded={open}
				className="group flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left text-small text-muted-foreground hover:bg-muted/50 hover:text-foreground"
				onClick={() => setOpen((value) => !value)}
			>
				<ChevronDown
					className={cn(
						"size-3.5 shrink-0 text-muted-foreground/60 transition-transform",
						!open && "-rotate-90",
					)}
					strokeWidth={1.8}
				/>
				<span className="min-w-0 flex-1 font-medium">
					{detailsTitle({ binaryName, cliSource })}
				</span>
				<span className="shrink-0 text-mini text-muted-foreground/70">
					{detailsSummary({
						binaryName,
						version,
						cliSource,
						binaryPath,
						installUrl,
						installCommands: commands,
						inspection,
					})}
				</span>
			</button>
			{open ? (
				<div className="space-y-2 px-2 pt-2 text-small leading-snug text-muted-foreground">
					{content}
				</div>
			) : null}
		</div>
	);
}

function ProviderDetailsContent({
	name,
	binaryName,
	version,
	cliSource,
	binaryPath,
	installUrl,
	installCommands,
	inspection,
}: ProviderDetailsInput & {
	name: string;
	installCommands: readonly string[];
}) {
	return (
		<div className="space-y-2">
			<DetailLine label="Provider" value={name} />
			{binaryName ? (
				<DetailLine label="Binary" value={binaryName} mono />
			) : null}
			{cliSource ? (
				<DetailLine label="Source" value={formatCliSource(cliSource)} />
			) : null}
			{version ? <DetailLine label="Version" value={version} mono /> : null}
			{binaryPath ? <DetailLine label="Path" value={binaryPath} mono /> : null}
			{installUrl ? (
				<DetailLine label="Install URL" value={installUrl} mono />
			) : null}
			{installCommands.length > 0 ? (
				<DetailLine label="Install" value={installCommands.join(" && ")} mono />
			) : null}
			{cliSource === "missing" && installUrl ? (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="mt-1"
					onClick={() => void openUrl(installUrl)}
				>
					<ExternalLink className="size-3.5" />
					Install
				</Button>
			) : null}
			{inspection ? <InspectionDetails inspection={inspection} /> : null}
		</div>
	);
}

function detailsSummary(details: ProviderDetailsInput): string {
	if (details.cliSource === "missing") return "Not installed";
	if (details.version) return `v${details.version}`;
	if (details.binaryPath) return "Installed";
	if (hasInspectionData(details.inspection)) return "Config found";
	return "Details";
}

function detailsTitle({
	binaryName,
	cliSource,
}: Pick<ProviderDetailsInput, "binaryName" | "cliSource">): string {
	if (!binaryName && cliSource === "apiKeyOnly") return "Local config";
	if (!binaryName) return "Local config";
	return "CLI and local config";
}

function InspectionDetails({
	inspection,
}: {
	inspection: ProviderConfigInspection;
}) {
	return (
		<div className="space-y-2">
			{inspection.roots.map((root) => (
				<DetailLine
					key={`root:${root.label}:${root.path}`}
					label={root.label}
					value={`${root.path}${root.exists ? "" : " (missing)"}`}
					mono
				/>
			))}
			{inspection.files.map((file) => (
				<DetailLine
					key={`file:${file.label}:${file.path}`}
					label={file.label}
					value={`${file.path}${file.exists ? "" : " (missing)"}`}
					mono
				/>
			))}
			<EntryGroup label="Skills" entries={inspection.skills} />
			<EntryGroup label="Hooks" entries={inspection.hooks} />
			<EntryGroup label="MCP" entries={inspection.mcpServers} />
			<EntryGroup label="Extensions" entries={inspection.extensions} />
			{inspection.warnings.map((warning) => (
				<DetailLine key={warning} label="Warning" value={warning} />
			))}
		</div>
	);
}

function EntryGroup({
	label,
	entries,
}: {
	label: string;
	entries: readonly ProviderConfigEntry[];
}) {
	if (entries.length === 0) return null;
	return (
		<DetailLine
			label={label}
			value={entries
				.map((entry) =>
					entry.path ? `${entry.name} (${entry.source})` : entry.name,
				)
				.join(", ")}
		/>
	);
}

function DetailLine({
	label,
	value,
	mono = false,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
			<span className="text-muted-foreground/70">{label}</span>
			<span
				className={cn("min-w-0 break-words", mono && "font-mono text-mini")}
			>
				{value}
			</span>
		</div>
	);
}

function formatCliSource(source: AgentCliSource): string {
	if (source === "bundled") return "Bundled";
	if (source === "external") return "External";
	if (source === "missing") return "Missing";
	return "API key only";
}

export function ProviderConfigRow({
	label,
	description,
	children,
}: {
	label?: string;
	description?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex gap-6 pb-4 pl-8">
			<div className="min-w-0 flex-1 pt-0.5">
				{label ? (
					<div className="text-ui font-medium leading-snug text-foreground">
						{label}
					</div>
				) : null}
				{description ? (
					<div
						className={cn(
							"text-small leading-snug text-muted-foreground",
							label && "mt-1",
						)}
					>
						{description}
					</div>
				) : null}
			</div>
			<div className="w-[360px] shrink-0">{children}</div>
		</div>
	);
}

function StatusBadge() {
	return (
		<span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-mini font-medium text-emerald-500">
			<span className="size-1.5 rounded-full bg-emerald-500" />
			Ready
		</span>
	);
}

function ConnectingBadge() {
	return (
		<span className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-mini font-medium text-muted-foreground">
			<span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60" />
			Connecting
		</span>
	);
}

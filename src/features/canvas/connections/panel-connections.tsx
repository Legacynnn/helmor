import { Check, Link2, Link2Off, Unlink } from "lucide-react";
import { stopEventPropagation, type TLShapeId, useEditor } from "tldraw";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { CanvasConnection, CanvasPanelType } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { PanelShape } from "../shapes/panel-shape";
import {
	connectionMeta,
	useConnectionsForPanel,
	useConnectionsStore,
} from "./connections-store";

const PANEL_LABELS: Record<CanvasPanelType, string> = {
	placeholder: "Panel",
	conversation: "Conversation",
	terminal: "Terminal",
	notes: "Notes",
	drawing: "Drawing",
	"file-manager": "Files",
	editor: "Editor",
};

function usePanelLabel(id: string): string {
	const editor = useEditor();
	const shape = editor.getShape(id as TLShapeId) as PanelShape | undefined;
	if (shape?.type !== "panel") return "Panel";
	return shape.props.title || PANEL_LABELS[shape.props.panelType];
}

/** Header controls for connecting a panel and reviewing/managing its edges.
 * Click-to-connect: the link button arms this panel as the source, then
 * clicking another panel's link button completes the edge. */
export function PanelConnections({ shape }: { shape: PanelShape }) {
	const pendingSource = useConnectionsStore((s) => s.pendingSource);
	const startConnect = useConnectionsStore((s) => s.startConnect);
	const completeConnect = useConnectionsStore((s) => s.completeConnect);
	const cancelConnect = useConnectionsStore((s) => s.cancelConnect);
	const { outgoing, incoming } = useConnectionsForPanel(shape.id);

	const isSource = pendingSource?.id === shape.id;
	const isTarget = pendingSource != null && !isSource;
	const total = outgoing.length + incoming.length;

	const handleConnectClick = (e: React.MouseEvent | React.PointerEvent) => {
		stopEventPropagation(e);
		if (pendingSource == null) {
			startConnect(shape.id, shape.props.panelType);
		} else if (isSource) {
			cancelConnect();
		} else {
			completeConnect(shape.id, shape.props.panelType);
		}
	};

	return (
		<div className="flex shrink-0 items-center gap-0.5">
			{total > 0 ? (
				<Popover>
					<PopoverTrigger asChild>
						<button
							type="button"
							aria-label="Panel connections"
							className="flex h-5 items-center gap-1 rounded px-1 text-[10px] text-app-muted-foreground hover:bg-app-muted hover:text-app-foreground"
							onPointerDown={stopEventPropagation}
							onClick={stopEventPropagation}
						>
							<Link2 className="size-3" />
							{total}
						</button>
					</PopoverTrigger>
					<PopoverContent
						align="end"
						className="w-64 p-2"
						onPointerDown={stopEventPropagation}
					>
						<ConnectionsList
							shape={shape}
							outgoing={outgoing}
							incoming={incoming}
						/>
					</PopoverContent>
				</Popover>
			) : null}
			<button
				type="button"
				aria-label={
					isSource
						? "Cancel connection"
						: isTarget
							? "Connect to this panel"
							: "Connect panel"
				}
				className={cn(
					"flex size-5 cursor-pointer items-center justify-center rounded text-app-muted-foreground hover:bg-app-muted hover:text-app-foreground",
					isSource && "bg-[var(--color-selected,#3b82f6)] text-white",
					isTarget && "text-[var(--color-selected,#3b82f6)]",
				)}
				onPointerDown={stopEventPropagation}
				onClick={handleConnectClick}
			>
				{isSource ? (
					<Link2Off className="size-3.5" />
				) : (
					<Link2 className="size-3.5" />
				)}
			</button>
		</div>
	);
}

function ConnectionsList({
	shape,
	outgoing,
	incoming,
}: {
	shape: PanelShape;
	outgoing: CanvasConnection[];
	incoming: CanvasConnection[];
}) {
	const disconnect = useConnectionsStore((s) => s.disconnect);
	const setPrimaryTerminal = useConnectionsStore((s) => s.setPrimaryTerminal);
	const terminalEdges = outgoing.filter(
		(c) => c.kind === "conversation-terminal",
	);
	const hasPrimary = terminalEdges.some((c) => connectionMeta(c).primary);

	return (
		<div className="flex flex-col gap-2 text-xs">
			{shape.props.panelType === "conversation" && terminalEdges.length > 0 ? (
				<div className="flex flex-col gap-1">
					<div className="font-medium text-app-muted-foreground text-[10px] uppercase tracking-wide">
						Run with terminal
					</div>
					{terminalEdges.map((c) => (
						<TerminalRoutingRow
							key={c.id}
							connection={c}
							primary={connectionMeta(c).primary === true}
							onPick={() => setPrimaryTerminal(shape.id, c.id)}
						/>
					))}
					{!hasPrimary ? (
						<div className="text-[10px] text-app-muted-foreground opacity-70">
							No target selected — first connected terminal is used.
						</div>
					) : null}
				</div>
			) : null}

			{outgoing.length > 0 ? (
				<EdgeGroup
					label="Connected to"
					edges={outgoing}
					otherId={(c) => c.toPanelId}
					onDisconnect={disconnect}
				/>
			) : null}
			{incoming.length > 0 ? (
				<EdgeGroup
					label="Connected from"
					edges={incoming}
					otherId={(c) => c.fromPanelId}
					onDisconnect={disconnect}
				/>
			) : null}
		</div>
	);
}

function EdgeGroup({
	label,
	edges,
	otherId,
	onDisconnect,
}: {
	label: string;
	edges: CanvasConnection[];
	otherId: (c: CanvasConnection) => string;
	onDisconnect: (id: string) => void;
}) {
	return (
		<div className="flex flex-col gap-1">
			<div className="font-medium text-app-muted-foreground text-[10px] uppercase tracking-wide">
				{label}
			</div>
			{edges.map((c) => (
				<EdgeRow
					key={c.id}
					otherPanelId={otherId(c)}
					onDisconnect={() => onDisconnect(c.id)}
				/>
			))}
		</div>
	);
}

function EdgeRow({
	otherPanelId,
	onDisconnect,
}: {
	otherPanelId: string;
	onDisconnect: () => void;
}) {
	const label = usePanelLabel(otherPanelId);
	return (
		<div className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-app-muted">
			<Link2 className="size-3 shrink-0 opacity-60" />
			<span className="min-w-0 flex-1 truncate">{label}</span>
			<button
				type="button"
				aria-label="Disconnect"
				className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded text-app-muted-foreground hover:text-app-foreground"
				onClick={onDisconnect}
			>
				<Unlink className="size-3" />
			</button>
		</div>
	);
}

function TerminalRoutingRow({
	connection,
	primary,
	onPick,
}: {
	connection: CanvasConnection;
	primary: boolean;
	onPick: () => void;
}) {
	const label = usePanelLabel(connection.toPanelId);
	return (
		<button
			type="button"
			className={cn(
				"flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-app-muted",
				primary && "text-[var(--color-selected,#3b82f6)]",
			)}
			onClick={onPick}
		>
			{primary ? (
				<Check className="size-3 shrink-0" />
			) : (
				<Link2Off className="size-3 shrink-0 opacity-40" />
			)}
			<span className="min-w-0 flex-1 truncate">{label}</span>
		</button>
	);
}

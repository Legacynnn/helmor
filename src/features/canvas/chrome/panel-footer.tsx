import type { CanvasPanelType } from "@/lib/api";
import { cn } from "@/lib/utils";
import { parsePanelConfig } from "../panel-config";
import { PANEL_META } from "../panel-node";
import { ConversationFooter } from "./footers/conversation-footer";
import {
	DrawingFooter,
	EditorFooter,
	FilesFooter,
	GitFooter,
	NotesFooter,
	PlaceholderFooter,
	TerminalFooter,
} from "./footers/simple-footers";

/** Per-type footer strip rendered by `PanelNode` beneath the body. Shares one
 * shell (height, type scale, muted tone, accent top divider, translucent
 * background) and dispatches its content by panel type — mirroring `PanelBody`.
 * `nodrag` so footer controls never start a panel move. */
export function PanelFooter({
	panelType,
	config,
	accent,
	background,
}: {
	panelType: CanvasPanelType;
	config: string;
	accent: string;
	background: string;
}) {
	return (
		<div
			className={cn(
				"nodrag flex h-6 shrink-0 items-center gap-2 overflow-hidden border-t px-2.5",
				"text-[11px] text-app-muted-foreground leading-none",
			)}
			style={{ backgroundColor: background, borderTopColor: accent }}
		>
			<FooterBody panelType={panelType} config={config} />
		</div>
	);
}

function FooterBody({
	panelType,
	config: raw,
}: {
	panelType: CanvasPanelType;
	config: string;
}) {
	const config = parsePanelConfig(raw);
	switch (panelType) {
		case "conversation":
			return <ConversationFooter sessionId={config.sessionId} />;
		case "terminal":
			return <TerminalFooter config={config} />;
		case "editor":
			return <EditorFooter config={config} />;
		case "file-manager":
			return <FilesFooter config={config} />;
		case "git":
			return <GitFooter />;
		case "notes":
			return <NotesFooter config={config} />;
		case "drawing":
			return <DrawingFooter config={config} />;
		default:
			return (
				<PlaceholderFooter
					label={(PANEL_META[panelType] ?? PANEL_META.placeholder).label}
				/>
			);
	}
}

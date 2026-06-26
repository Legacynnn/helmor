import { Eye, Pencil } from "lucide-react";
import { Suspense, useState } from "react";
import { LazyStreamdown } from "@/components/streamdown-loader";
import { cn } from "@/lib/utils";
import { parsePanelConfig } from "../panel-config";
import { usePanelConfigWriter } from "../use-panel-config-writer";

/** Markdown notes panel. The body is the source of truth while focused; edits
 * debounce-persist into `config.notes`. A preview toggle renders the markdown
 * with the same renderer the conversation thread uses. */
export function NotesPanelBody({
	nodeId,
	config,
}: {
	nodeId: string;
	config: string;
}) {
	const write = usePanelConfigWriter(nodeId, config);
	const [value, setValue] = useState(
		() => parsePanelConfig(config).notes ?? "",
	);
	const [preview, setPreview] = useState(false);

	return (
		<div className="flex size-full flex-col bg-app-base">
			<div className="flex shrink-0 items-center justify-end gap-1 border-app-border border-b px-1.5 py-1">
				<button
					type="button"
					aria-label={preview ? "Edit notes" : "Preview notes"}
					className={cn(
						"flex size-5 cursor-pointer items-center justify-center rounded text-app-muted-foreground hover:bg-app-muted hover:text-app-foreground",
						preview && "bg-app-muted text-app-foreground",
					)}
					onClick={() => setPreview((p) => !p)}
				>
					{preview ? (
						<Pencil className="size-3.5" />
					) : (
						<Eye className="size-3.5" />
					)}
				</button>
			</div>
			{preview ? (
				<div className="min-h-0 flex-1 overflow-auto px-3 py-2">
					<Suspense fallback={null}>
						<LazyStreamdown className="conversation-streamdown" mode="static">
							{value || "_Empty note_"}
						</LazyStreamdown>
					</Suspense>
				</div>
			) : (
				<textarea
					className="min-h-0 flex-1 resize-none bg-transparent px-3 py-2 font-mono text-app-foreground text-xs outline-none placeholder:text-app-muted-foreground"
					placeholder="Write markdown notes…"
					value={value}
					spellCheck={false}
					onChange={(e) => {
						setValue(e.target.value);
						write({ notes: e.target.value });
					}}
				/>
			)}
		</div>
	);
}

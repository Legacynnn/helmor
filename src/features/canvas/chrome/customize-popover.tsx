import { ImageOff, Upload } from "lucide-react";
import { useRef } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { saveCanvasBackground } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CANVAS_BACKGROUND_PRESETS } from "../backgrounds";
import { useCanvasViewStore } from "../canvas-view-store";

const GRID_PATTERNS = ["blank", "dots", "lines"] as const;
const THEMES = ["system", "light", "dark"] as const;

const SELECTED_RING = "ring-2 ring-[var(--color-selected,#3b82f6)]";

/** Glass popover with canvas appearance controls: background picker (presets,
 * none, upload), translucency, grid pattern, and theme. Controlled by the
 * parent — open state is owned upstream. Appearance is shared per repository, so
 * every edit here restyles all of the repo's workspaces via the view store. */
export function CustomizePopover({
	repositoryId,
	open,
	onOpenChange,
	anchor,
}: {
	repositoryId: string | null;
	open: boolean;
	onOpenChange: (v: boolean) => void;
	anchor: React.ReactNode;
}) {
	const set = useCanvasViewStore((s) => s.setAppearance);
	const translucency = useCanvasViewStore((s) => s.translucency);
	const backgroundImage = useCanvasViewStore((s) => s.backgroundImage);
	const pattern = useCanvasViewStore((s) => s.backgroundPattern);
	const theme = useCanvasViewStore((s) => s.backgroundTheme);
	const fileRef = useRef<HTMLInputElement>(null);

	async function onUpload(file: File) {
		// Backgrounds are stored per-repo; without a linked repo there's nothing
		// to key the shared style against, so skip the upload.
		if (!repositoryId) return;
		const buf = new Uint8Array(await file.arrayBuffer());
		const ext = file.name.split(".").pop() ?? "png";
		const path = await saveCanvasBackground(repositoryId, buf, ext);
		set({ backgroundImage: path });
	}

	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>{anchor}</PopoverTrigger>
			<PopoverContent side="right" align="start" className="w-72 p-3">
				<section>
					<Label>Background</Label>
					<div className="grid grid-cols-3 gap-2">
						{CANVAS_BACKGROUND_PRESETS.map((p) => (
							<button
								key={p.key}
								type="button"
								title={p.label}
								onClick={() => set({ backgroundImage: p.key })}
								style={{ backgroundImage: `url("${p.url}")` }}
								className={cn(
									"aspect-video cursor-pointer rounded-md border border-app-border bg-cover bg-center",
									backgroundImage === p.key && SELECTED_RING,
								)}
							/>
						))}
						<button
							type="button"
							title="None"
							onClick={() => set({ backgroundImage: null })}
							className={cn(
								"flex aspect-video cursor-pointer items-center justify-center rounded-md border border-app-border text-app-muted-foreground hover:bg-app-muted",
								!backgroundImage && SELECTED_RING,
							)}
						>
							<ImageOff className="size-4" />
						</button>
						<button
							type="button"
							title="Upload"
							onClick={() => fileRef.current?.click()}
							className="flex aspect-video cursor-pointer items-center justify-center rounded-md border border-app-border border-dashed text-app-muted-foreground hover:bg-app-muted"
						>
							<Upload className="size-4" />
						</button>
					</div>
					<input
						ref={fileRef}
						type="file"
						accept="image/*"
						className="hidden"
						onChange={(e) => {
							const f = e.target.files?.[0];
							if (f) void onUpload(f);
							e.target.value = "";
						}}
					/>
				</section>

				<section className="mt-3">
					<Label>Translucency · {Math.round(translucency * 100)}%</Label>
					<Slider
						min={20}
						max={100}
						step={5}
						value={[translucency * 100]}
						onValueChange={([v]) => set({ translucency: v / 100 })}
					/>
				</section>

				<section className="mt-3">
					<Label>Grid</Label>
					<div className="flex gap-1">
						{GRID_PATTERNS.map((g) => (
							<button
								key={g}
								type="button"
								onClick={() => set({ backgroundPattern: g })}
								className={cn(
									"flex-1 cursor-pointer rounded border border-app-border py-1 text-[10px] capitalize hover:bg-app-muted",
									pattern === g && "bg-app-muted text-app-foreground",
								)}
							>
								{g === "blank" ? "none" : g}
							</button>
						))}
					</div>
				</section>

				<section className="mt-3">
					<Label>Theme</Label>
					<div className="flex gap-1">
						{THEMES.map((t) => (
							<button
								key={t}
								type="button"
								onClick={() => set({ backgroundTheme: t })}
								className={cn(
									"flex-1 cursor-pointer rounded border border-app-border py-1 text-[10px] capitalize hover:bg-app-muted",
									theme === t && "bg-app-muted text-app-foreground",
								)}
							>
								{t}
							</button>
						))}
					</div>
				</section>
			</PopoverContent>
		</Popover>
	);
}

function Label({ children }: { children: React.ReactNode }) {
	return (
		<div className="mb-1.5 font-medium text-app-muted-foreground text-[10px] uppercase tracking-wide">
			{children}
		</div>
	);
}

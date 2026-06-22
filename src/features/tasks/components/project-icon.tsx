import { FolderGit2 } from "lucide-react";
import { DynamicIcon } from "lucide-react/dynamic";
import type { TaskProject } from "@/lib/api";
import { cn } from "@/lib/utils";
// Compact shortcode -> native-emoji map (incl. aliases), generated from
// `@emoji-mart/data`. Regenerate when bumping that dep:
//   node -e 'const d=require("@emoji-mart/data");const m={};for(const[i,e]of
//   Object.entries(d.emojis)){const n=e.skins?.[0]?.native;if(n)m[i]=n;}
//   for(const[a,t]of Object.entries(d.aliases||{}))if(m[t]&&!m[a])m[a]=m[t];
//   require("fs").writeFileSync("src/features/tasks/components/emoji-shortcodes.json",
//   JSON.stringify(Object.fromEntries(Object.keys(m).sort().map(k=>[k,m[k]])))+"\n")'
import shortcodes from "./emoji-shortcodes.json";
import { lucideNameForLinearIcon } from "./linear-icon-map";

const SHORTCODES = shortcodes as Record<string, string>;
const EMOJI_RE = /\p{Extended_Pictographic}/u;

/**
 * Linear stores a project's icon as an emoji shortcode (":bomb:", ":iphone:"),
 * occasionally a raw emoji, or a named glyph id we don't ship. Resolve it to a
 * native emoji when we can; otherwise return null so the caller falls back to a
 * color-tinted folder glyph.
 */
function resolveEmoji(icon: string | null | undefined): string | null {
	if (!icon) return null;
	if (EMOJI_RE.test(icon)) return icon;
	const key = icon.replace(/^:|:$/g, "");
	return SHORTCODES[key] ?? null;
}

export function ProjectIcon({
	project,
	size = 12,
	className,
}: {
	project: Pick<TaskProject, "icon" | "color">;
	size?: number;
	className?: string;
}) {
	const { icon, color } = project;
	const tint = color ?? undefined;

	const emoji = resolveEmoji(icon);
	if (emoji) {
		return (
			<span
				aria-hidden
				className={cn(
					"inline-flex shrink-0 items-center justify-center",
					className,
				)}
				style={{ fontSize: size, lineHeight: 1 }}
			>
				{emoji}
			</span>
		);
	}

	const folder = (
		<FolderGit2
			className={cn("shrink-0", className)}
			style={{ width: size, height: size, color: tint }}
		/>
	);

	// Linear's proprietary named glyphs ("Airplane", "MacOS", ...) map to the
	// closest lucide icon, tinted with the project color to match Linear's look.
	const lucideName = icon ? lucideNameForLinearIcon(icon) : null;
	if (lucideName) {
		return (
			<DynamicIcon
				name={lucideName}
				className={cn("shrink-0", className)}
				style={{ color: tint }}
				size={size}
				aria-hidden
				fallback={() => folder}
			/>
		);
	}

	return folder;
}

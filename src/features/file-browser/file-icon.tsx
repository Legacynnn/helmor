import {
	Braces,
	Code2,
	FileArchive,
	FileAudio,
	FileBox,
	FileCode2,
	FileImage,
	FileJson,
	FileLock2,
	FileSpreadsheet,
	FileTerminal,
	FileText,
	FileType,
	FileVideo,
	Folder,
	FolderOpen,
	GitBranch,
	Hash,
	Palette,
	Settings2,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface Props {
	name: string;
	kind: "file" | "directory";
	open?: boolean;
	className?: string;
}

const EXT_ICON_MAP: Record<string, typeof FileText> = {
	ts: FileCode2,
	tsx: FileCode2,
	js: FileCode2,
	jsx: FileCode2,
	mjs: FileCode2,
	cjs: FileCode2,
	rs: FileCode2,
	go: FileCode2,
	py: FileCode2,
	rb: FileCode2,
	java: FileCode2,
	kt: FileCode2,
	swift: FileCode2,
	c: FileCode2,
	h: FileCode2,
	cpp: FileCode2,
	hpp: FileCode2,
	cs: FileCode2,
	php: FileCode2,
	sh: FileTerminal,
	zsh: FileTerminal,
	fish: FileTerminal,
	bash: FileTerminal,
	ps1: FileTerminal,
	json: FileJson,
	jsonc: FileJson,
	json5: FileJson,
	yaml: Braces,
	yml: Braces,
	toml: Braces,
	xml: Code2,
	html: Code2,
	css: Palette,
	scss: Palette,
	sass: Palette,
	less: Palette,
	md: FileText,
	mdx: FileText,
	markdown: FileText,
	txt: FileText,
	log: FileText,
	png: FileImage,
	jpg: FileImage,
	jpeg: FileImage,
	gif: FileImage,
	svg: FileImage,
	webp: FileImage,
	ico: FileImage,
	avif: FileImage,
	mp3: FileAudio,
	wav: FileAudio,
	ogg: FileAudio,
	flac: FileAudio,
	mp4: FileVideo,
	webm: FileVideo,
	mov: FileVideo,
	zip: FileArchive,
	tar: FileArchive,
	gz: FileArchive,
	rar: FileArchive,
	"7z": FileArchive,
	csv: FileSpreadsheet,
	tsv: FileSpreadsheet,
	xlsx: FileSpreadsheet,
	pdf: FileType,
	lock: FileLock2,
};

const NAME_ICON_MAP: Record<string, typeof FileText> = {
	".gitignore": GitBranch,
	".gitattributes": GitBranch,
	".gitmodules": GitBranch,
	".env": FileLock2,
	".env.local": FileLock2,
	".env.example": FileLock2,
	"package.json": FileJson,
	"package-lock.json": FileLock2,
	"bun.lockb": FileLock2,
	"yarn.lock": FileLock2,
	"pnpm-lock.yaml": FileLock2,
	"Cargo.toml": Settings2,
	"Cargo.lock": FileLock2,
	"tsconfig.json": Settings2,
	"vite.config.ts": Settings2,
	"biome.json": Settings2,
	Dockerfile: FileBox,
	"README.md": Hash,
	LICENSE: FileText,
};

export function FileIcon({ name, kind, open, className }: Props) {
	if (kind === "directory") {
		const Icon = open ? FolderOpen : Folder;
		return (
			<Icon
				className={cn("size-3.5 shrink-0 text-muted-foreground", className)}
				strokeWidth={1.8}
			/>
		);
	}
	const namedIcon = NAME_ICON_MAP[name];
	const ext = name.includes(".")
		? name.slice(name.lastIndexOf(".") + 1).toLowerCase()
		: "";
	const Icon = namedIcon ?? EXT_ICON_MAP[ext] ?? FileText;
	return (
		<Icon
			className={cn("size-3.5 shrink-0 text-muted-foreground/80", className)}
			strokeWidth={1.8}
		/>
	);
}

import {
	BookText,
	Braces,
	Code2,
	FileArchive,
	FileBadge,
	FileCode2,
	FileImage,
	FileJson,
	FileLock2,
	FileSpreadsheet,
	FileTerminal,
	FileText,
	FileVideo,
	Folder,
	FolderArchive,
	FolderCode,
	FolderCog,
	FolderGit2,
	FolderOpen,
	Music2,
	Paintbrush2,
} from "lucide-react";
import {
	siAstro,
	siBiome,
	siBun,
	siDocker,
	siEslint,
	siGit,
	siGo,
	siHtml5,
	siKotlin,
	siMarkdown,
	siNpm,
	siPhp,
	siPrettier,
	siPrisma,
	siPython,
	siReact,
	siRuby,
	siRust,
	siSass,
	siSvelte,
	siSwift,
	siTailwindcss,
	siVite,
	siVuedotjs,
} from "simple-icons";

import { cn } from "@/lib/utils";

interface Props {
	name: string;
	kind: "file" | "directory";
	open?: boolean;
	className?: string;
}

type SimpleIcon = { path: string };

function BrandGlyph({
	icon,
	className,
}: {
	icon: SimpleIcon;
	className?: string;
}) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			aria-hidden
			className={cn("size-3.5 shrink-0 text-muted-foreground/80", className)}
			fill="currentColor"
		>
			<path d={icon.path} />
		</svg>
	);
}

function FileMonogram({
	label,
	className,
}: {
	label: string;
	className?: string;
}) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			aria-hidden
			className={cn("size-3.5 shrink-0 text-muted-foreground/80", className)}
			fill="none"
		>
			<rect
				x="2.5"
				y="2.5"
				width="19"
				height="19"
				rx="3.5"
				stroke="currentColor"
				strokeWidth="1.6"
			/>
			<text
				x="12"
				y="16.25"
				textAnchor="middle"
				fontSize="9.5"
				fontWeight="700"
				fill="currentColor"
				fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
				letterSpacing="-0.5"
			>
				{label}
			</text>
		</svg>
	);
}

// File extension → simple-icons brand glyph (rendered monochrome).
const EXT_BRAND_MAP: Record<string, SimpleIcon> = {
	tsx: siReact,
	jsx: siReact,
	rs: siRust,
	go: siGo,
	py: siPython,
	rb: siRuby,
	swift: siSwift,
	kt: siKotlin,
	php: siPhp,
	html: siHtml5,
	htm: siHtml5,
	scss: siSass,
	sass: siSass,
	md: siMarkdown,
	mdx: siMarkdown,
	markdown: siMarkdown,
	vue: siVuedotjs,
	svelte: siSvelte,
	astro: siAstro,
	prisma: siPrisma,
};

// File extension → Lucide fallback (when no brand fits).
const EXT_LUCIDE_MAP: Record<string, typeof FileText> = {
	java: FileCode2,
	c: FileCode2,
	h: FileCode2,
	cpp: FileCode2,
	hpp: FileCode2,
	cs: FileCode2,
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
	css: Paintbrush2,
	less: Paintbrush2,
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
	mp3: Music2,
	wav: Music2,
	ogg: Music2,
	flac: Music2,
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
	pdf: FileBadge,
	lock: FileLock2,
};

// Exact file name → simple-icons brand glyph.
const NAME_BRAND_MAP: Record<string, SimpleIcon> = {
	Dockerfile: siDocker,
	".dockerignore": siDocker,
	"docker-compose.yml": siDocker,
	"docker-compose.yaml": siDocker,
	"package.json": siNpm,
	"package-lock.json": siNpm,
	"bun.lockb": siBun,
	"bun.lock": siBun,
	"Cargo.toml": siRust,
	"Cargo.lock": siRust,
	"vite.config.ts": siVite,
	"vite.config.js": siVite,
	"biome.json": siBiome,
	"biome.jsonc": siBiome,
	".eslintrc": siEslint,
	".eslintrc.js": siEslint,
	".eslintrc.json": siEslint,
	"eslint.config.js": siEslint,
	"eslint.config.ts": siEslint,
	".prettierrc": siPrettier,
	".prettierrc.json": siPrettier,
	"prettier.config.js": siPrettier,
	"tailwind.config.js": siTailwindcss,
	"tailwind.config.ts": siTailwindcss,
	"schema.prisma": siPrisma,
	".gitignore": siGit,
	".gitattributes": siGit,
	".gitmodules": siGit,
};

// Exact file name → custom monogram label.
const NAME_MONOGRAM_MAP: Record<string, string> = {
	"tsconfig.json": "TS",
	"tsconfig.app.json": "TS",
	"tsconfig.node.json": "TS",
};

// File extension → custom monogram label.
const EXT_MONOGRAM_MAP: Record<string, string> = {
	ts: "TS",
	js: "JS",
	mjs: "JS",
	cjs: "JS",
};

// Exact file name → Lucide fallback.
const NAME_LUCIDE_MAP: Record<string, typeof FileText> = {
	".env": FileLock2,
	".env.local": FileLock2,
	".env.development": FileLock2,
	".env.production": FileLock2,
	".env.example": FileLock2,
	"yarn.lock": FileLock2,
	"pnpm-lock.yaml": FileLock2,
	"README.md": BookText,
	"CHANGELOG.md": BookText,
	LICENSE: FileText,
};

// Folder name → Lucide variant. Lowercased lookup.
// Restricted to the Folder* family so every folder shares the same silhouette
// and only differs in a subtle decoration.
const FOLDER_LUCIDE_MAP: Record<string, typeof Folder> = {
	src: FolderCode,
	source: FolderCode,
	app: FolderCode,
	lib: FolderCode,
	libs: FolderCode,
	components: FolderCode,
	ui: FolderCode,
	hooks: FolderCode,
	utils: FolderCode,
	helpers: FolderCode,
	pages: FolderCode,
	routes: FolderCode,
	api: FolderCode,
	server: FolderCode,
	config: FolderCog,
	configs: FolderCog,
	".vscode": FolderCog,
	".idea": FolderCog,
	node_modules: FolderArchive,
	vendor: FolderArchive,
	dist: FolderArchive,
	build: FolderArchive,
	out: FolderArchive,
	".next": FolderArchive,
	".nuxt": FolderArchive,
	target: FolderArchive,
	".git": FolderGit2,
};

export function FileIcon({ name, kind, open, className }: Props) {
	if (kind === "directory") {
		const lower = name.toLowerCase();
		const Lucide = FOLDER_LUCIDE_MAP[lower] ?? FOLDER_LUCIDE_MAP[name];
		if (Lucide) {
			return (
				<Lucide
					className={cn("size-3.5 shrink-0 text-muted-foreground", className)}
					strokeWidth={1.8}
				/>
			);
		}
		const Default = open ? FolderOpen : Folder;
		return (
			<Default
				className={cn("size-3.5 shrink-0 text-muted-foreground", className)}
				strokeWidth={1.8}
			/>
		);
	}

	const namedMonogram = NAME_MONOGRAM_MAP[name];
	if (namedMonogram) {
		return <FileMonogram label={namedMonogram} className={className} />;
	}
	const namedBrand = NAME_BRAND_MAP[name];
	if (namedBrand) {
		return <BrandGlyph icon={namedBrand} className={className} />;
	}
	const namedLucide = NAME_LUCIDE_MAP[name];
	if (namedLucide) {
		const Icon = namedLucide;
		return (
			<Icon
				className={cn("size-3.5 shrink-0 text-muted-foreground/80", className)}
				strokeWidth={1.8}
			/>
		);
	}

	const ext = name.includes(".")
		? name.slice(name.lastIndexOf(".") + 1).toLowerCase()
		: "";
	const extMonogram = EXT_MONOGRAM_MAP[ext];
	if (extMonogram) {
		return <FileMonogram label={extMonogram} className={className} />;
	}
	const extBrand = EXT_BRAND_MAP[ext];
	if (extBrand) {
		return <BrandGlyph icon={extBrand} className={className} />;
	}
	const Icon = EXT_LUCIDE_MAP[ext] ?? FileText;
	return (
		<Icon
			className={cn("size-3.5 shrink-0 text-muted-foreground/80", className)}
			strokeWidth={1.8}
		/>
	);
}

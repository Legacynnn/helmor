import { type IconName, iconNames } from "lucide-react/dynamic";

/**
 * Linear's non-emoji project icons come from its own proprietary glyph set
 * (names like "Airplane", "MacOS", "Europe"). Those exact SVGs aren't publicly
 * shippable, so we map each name to the closest lucide glyph (the icon set
 * Helmor already uses) and tint it with the project's color. Linear renders
 * these as a monochrome tinted glyph too, so the result reads as native.
 *
 * Names not covered here fall back to a direct kebab-case lucide lookup (many
 * Linear names like "Rocket"/"Bug"/"Calendar" match 1:1), then to a tinted
 * folder for anything still unknown.
 */
const LINEAR_TO_LUCIDE: Record<string, string> = {
	// Travel / geography
	Airplane: "plane",
	Europe: "earth",
	Americas: "earth",
	Asia: "earth",
	Africa: "earth",
	Oceania: "earth",
	Globe: "globe",
	Map: "map",
	Compass: "compass",
	Car: "car",
	Truck: "truck",
	Rocket: "rocket",
	Anchor: "anchor",
	// Devices / tech
	MacOS: "monitor",
	Windows: "monitor",
	Linux: "terminal",
	Desktop: "monitor",
	Laptop: "laptop",
	Phone: "smartphone",
	Mobile: "smartphone",
	Tablet: "tablet",
	Watch: "watch",
	Tv: "tv",
	Camera: "camera",
	Headphones: "headphones",
	Microphone: "mic",
	Speaker: "speaker",
	Keyboard: "keyboard",
	Mouse: "mouse",
	Printer: "printer",
	Server: "server",
	Database: "database",
	Cloud: "cloud",
	Cpu: "cpu",
	Wifi: "wifi",
	Bluetooth: "bluetooth",
	Battery: "battery",
	Plug: "plug",
	Power: "power",
	Radio: "radio",
	// Work / productivity
	Briefcase: "briefcase",
	Calendar: "calendar",
	Clock: "clock",
	Stopwatch: "timer",
	Inbox: "inbox",
	Mail: "mail",
	Envelope: "mail",
	Document: "file-text",
	Documents: "files",
	File: "file",
	Folder: "folder",
	Clipboard: "clipboard",
	Bookmark: "bookmark",
	Book: "book",
	Notebook: "notebook",
	Newspaper: "newspaper",
	Pencil: "pencil",
	Pen: "pen",
	Edit: "pencil",
	Paperclip: "paperclip",
	Pin: "map-pin",
	Tag: "tag",
	Tags: "tags",
	List: "list",
	Grid: "grid-3x3",
	Layers: "layers",
	Filter: "filter",
	Search: "search",
	Link: "link",
	Hash: "hash",
	// Charts / money
	Chart: "chart-line",
	Graph: "chart-line",
	BarChart: "chart-bar",
	LineChart: "chart-line",
	PieChart: "chart-pie",
	Analytics: "chart-line",
	Dollar: "dollar-sign",
	Money: "banknote",
	CreditCard: "credit-card",
	Wallet: "wallet",
	Cart: "shopping-cart",
	ShoppingCart: "shopping-cart",
	ShoppingBag: "shopping-bag",
	Gem: "gem",
	Diamond: "gem",
	// People
	User: "user",
	Person: "user",
	Users: "users",
	People: "users",
	Team: "users",
	// Symbols / objects
	Star: "star",
	Heart: "heart",
	Flag: "flag",
	Trophy: "trophy",
	Award: "award",
	Medal: "medal",
	Crown: "crown",
	Gift: "gift",
	Bell: "bell",
	Key: "key",
	Lock: "lock",
	Unlock: "lock-open",
	Shield: "shield",
	Eye: "eye",
	Bulb: "lightbulb",
	Lightbulb: "lightbulb",
	Idea: "lightbulb",
	Brain: "brain",
	Bot: "bot",
	Robot: "bot",
	Bug: "bug",
	Code: "code",
	Terminal: "terminal",
	Puzzle: "puzzle",
	Target: "target",
	Megaphone: "megaphone",
	Speech: "message-circle",
	Chat: "message-circle",
	Message: "message-circle",
	Comment: "message-square",
	Image: "image",
	Photo: "image",
	Palette: "palette",
	Music: "music",
	Note: "music",
	Film: "film",
	Video: "video",
	Microscope: "microscope",
	Beaker: "flask-conical",
	Flask: "flask-conical",
	Lab: "flask-conical",
	Atom: "atom",
	Magnet: "magnet",
	Wrench: "wrench",
	Tool: "wrench",
	Tools: "wrench",
	Hammer: "hammer",
	Gear: "settings",
	Settings: "settings",
	Cog: "settings",
	Scissors: "scissors",
	Save: "save",
	Send: "send",
	Share: "share-2",
	Trash: "trash-2",
	Repeat: "repeat",
	Cycle: "refresh-cw",
	Sync: "refresh-cw",
	Sticker: "sticker",
	Smile: "smile",
	ThumbsUp: "thumbs-up",
	// Nature / misc
	Sun: "sun",
	Moon: "moon",
	Cloudy: "cloud",
	Rain: "cloud-rain",
	Snow: "snowflake",
	Snowflake: "snowflake",
	Wind: "wind",
	Umbrella: "umbrella",
	Flame: "flame",
	Fire: "flame",
	Zap: "zap",
	Lightning: "zap",
	Bolt: "zap",
	Leaf: "leaf",
	Tree: "trees",
	Flower: "flower",
	Mountain: "mountain",
	Coffee: "coffee",
	Pizza: "pizza",
	Apple: "apple",
	Building: "building",
	Office: "building-2",
	Home: "house",
	House: "house",
	Store: "store",
	Factory: "factory",
	Box: "package",
	Package: "package",
	Sword: "swords",
	Swords: "swords",
	Shapes: "shapes",
	Thermometer: "thermometer",
};

const VALID = new Set<string>(iconNames);

/** PascalCase / spaced Linear name -> kebab-case (lucide's naming). */
function toKebab(value: string): string {
	return value
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/\s+/g, "-")
		.toLowerCase();
}

/**
 * Resolve a Linear icon name to a valid lucide icon name, or null if there's no
 * sensible match (caller falls back to a tinted folder). Every result is
 * validated against lucide's real name list, so bad guesses degrade gracefully.
 */
export function lucideNameForLinearIcon(icon: string): IconName | null {
	const mapped = LINEAR_TO_LUCIDE[icon];
	if (mapped && VALID.has(mapped)) return mapped as IconName;
	const kebab = toKebab(icon);
	if (VALID.has(kebab)) return kebab as IconName;
	return null;
}

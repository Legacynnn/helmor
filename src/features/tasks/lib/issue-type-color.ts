const ISSUE_TYPE_SWATCH: Record<string, string> = {
	GRAY: "#6e7681",
	BLUE: "#0969da",
	GREEN: "#1f883d",
	YELLOW: "#bf8700",
	ORANGE: "#bc4c00",
	RED: "#cf222e",
	PINK: "#bf3989",
	PURPLE: "#8250df",
};

export function issueTypeSwatch(color: string | null | undefined): string {
	if (!color) return "#6e7681";
	const upper = color.toUpperCase();
	if (ISSUE_TYPE_SWATCH[upper]) return ISSUE_TYPE_SWATCH[upper];
	if (/^#?[0-9a-fA-F]{6}$/.test(color)) {
		return color.startsWith("#") ? color : `#${color}`;
	}
	return "#6e7681";
}

import { LiveCodePreview } from "./live-code-preview";

/**
 * `Preview` renders a live React + Tailwind mockup from a raw JSX/TSX snippet.
 * The snippet must define a component named `App`; it runs in an isolated,
 * sandboxed iframe (see {@link LiveCodePreview}). Usable standalone or inside a
 * `<Variant>` to give a prototype an actual interactive UI.
 */
export function Preview({ children = "" }: { children?: string }) {
	const code = children.trim();
	if (!code) {
		return null;
	}
	return <LiveCodePreview code={code} />;
}

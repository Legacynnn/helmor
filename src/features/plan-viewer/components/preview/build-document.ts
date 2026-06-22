/**
 * Pinned CDN assets for the live preview sandbox. Pinned (not `@latest`) so the
 * runtime shape stays stable; bump deliberately. Loaded inside an isolated,
 * sandboxed iframe — never in the host document.
 */
export const PREVIEW_CDN = {
	react: "https://unpkg.com/react@18.3.1/umd/react.production.min.js",
	reactDom:
		"https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js",
	babel: "https://unpkg.com/@babel/standalone@7.25.6/babel.min.js",
	// Tailwind Play CDN (v3) scans the rendered DOM and generates utility CSS at
	// runtime — including arbitrary values — which is exactly what a throwaway
	// mockup needs. Kept independent of the app's own Tailwind v4 build.
	tailwind: "https://cdn.tailwindcss.com",
} as const;

/**
 * The authoring contract for a `<Preview>` snippet: it must define a component
 * named `App`. This bootstrap (appended before transform) mounts it and wires
 * error + height reporting back to the host via `postMessage`.
 */
const BOOTSTRAP = `
;(function () {
  function post(msg) { parent.postMessage(msg, "*"); }
  window.addEventListener("error", function (e) {
    post({ source: "helmor-preview", type: "error", message: String(e.message || e.error || "Unknown error") });
  });
  try {
    var mount = document.getElementById("root");
    var root = ReactDOM.createRoot(mount);
    root.render(React.createElement(App));
    var report = function () { post({ source: "helmor-preview", type: "height", height: Math.ceil(document.documentElement.scrollHeight) }); };
    new ResizeObserver(report).observe(document.documentElement);
    report();
    post({ source: "helmor-preview", type: "ready" });
  } catch (e) {
    post({ source: "helmor-preview", type: "error", message: String((e && e.message) || e) });
  }
})();
`;

/**
 * The inline runner script. It transforms the user snippet (+ bootstrap) with
 * Babel at runtime, then evaluates it. Compile errors are caught and reported to
 * the host so the iframe never shows a blank frame. The snippet is embedded via
 * `JSON.stringify` so arbitrary source can't break out of the string.
 */
function runnerScript(code: string): string {
	const source = JSON.stringify(`${code}\n${BOOTSTRAP}`);
	return `
    try {
      var input = ${source};
      var out = Babel.transform(input, {
        presets: [["react", { runtime: "classic" }], "typescript"],
        filename: "preview.tsx",
      }).code;
      (0, eval)(out);
    } catch (e) {
      parent.postMessage({ source: "helmor-preview", type: "error", message: String((e && e.message) || e) }, "*");
    }
  `;
}

/**
 * Build the full HTML document for the preview iframe. Loads React, ReactDOM,
 * Babel, and Tailwind from {@link PREVIEW_CDN} (in order so React globals exist
 * before the runner executes), then runs the user snippet.
 */
export function buildPreviewDocument(code: string): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<script src="${PREVIEW_CDN.react}"></script>
<script src="${PREVIEW_CDN.reactDom}"></script>
<script src="${PREVIEW_CDN.babel}"></script>
<script src="${PREVIEW_CDN.tailwind}"></script>
<style>
*{box-sizing:border-box}
html{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}
html,body{margin:0;padding:0;height:100%;background:transparent;color-scheme:light dark;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;font-feature-settings:"cv02","cv03","cv04","cv11"}
#root{min-height:100%}
</style>
</head>
<body>
<div id="root"></div>
<script>${runnerScript(code)}</script>
</body>
</html>`;
}

/** Shape of the messages the sandbox posts back to the host. */
export type PreviewMessage =
	| { source: "helmor-preview"; type: "ready" }
	| { source: "helmor-preview"; type: "height"; height: number }
	| { source: "helmor-preview"; type: "error"; message: string };

/** Type guard for messages originating from the preview sandbox. */
export function isPreviewMessage(data: unknown): data is PreviewMessage {
	return (
		typeof data === "object" &&
		data !== null &&
		(data as { source?: unknown }).source === "helmor-preview"
	);
}

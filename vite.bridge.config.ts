import path from "node:path";
import { defineConfig } from "vite";

// Builds the inspector bridge into a single self-contained IIFE.
// Output: dist/bridge-bundle.js — included in the Rust binary via include_str!
// inside src-tauri/src/browser/bridge.rs and attached as the content webview's
// initialization_script.
export default defineConfig({
	build: {
		lib: {
			entry: path.resolve(__dirname, "src/features/browser/bridge/injected.ts"),
			name: "__helmorBridgeInit",
			formats: ["iife"],
			fileName: () => "bridge-bundle.js",
		},
		outDir: "dist",
		emptyOutDir: false,
		minify: true,
		rollupOptions: {
			output: {
				inlineDynamicImports: true,
			},
		},
	},
});

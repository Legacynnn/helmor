import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initDevReactScan } from "./lib/dev-react-scan";

initDevReactScan();

// Tag <html> with the host OS so CSS can opt regions into native macOS
// vibrancy (`html[data-os="macos"]`). The Rust setup hook applies native
// under-window vibrancy; this attribute flips the matching surfaces
// transparent so the blur shows through.
document.documentElement.dataset.os = /Mac|iPhone|iPad/i.test(
	navigator.platform,
)
	? "macos"
	: /Win/i.test(navigator.platform)
		? "windows"
		: "linux";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);

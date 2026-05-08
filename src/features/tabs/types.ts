export type FileTabOpener =
	| { kind: "browser" }
	| { kind: "changes"; side: "unstaged" | "staged" | "remote" };

export interface FileTab {
	kind: "file";
	workspaceId: string;
	absolutePath: string;
	relativePath: string;
	fileName: string;
	opener: FileTabOpener;
	dirty: boolean;
}

export interface SessionTab {
	kind: "session";
	sessionId: string;
}

export interface ContextTab {
	kind: "context";
}

export type WorkspaceTab = SessionTab | FileTab | ContextTab;

export type TabId =
	| { kind: "session"; sessionId: string }
	| { kind: "file"; absolutePath: string }
	| { kind: "context" };

export function tabIdToValue(id: TabId): string {
	switch (id.kind) {
		case "session":
			return `session:${id.sessionId}`;
		case "file":
			return `file:${id.absolutePath}`;
		case "context":
			return "__context_preview__";
	}
}

export function valueToTabId(value: string): TabId | null {
	if (value === "__context_preview__") return { kind: "context" };
	if (value.startsWith("session:")) {
		return { kind: "session", sessionId: value.slice("session:".length) };
	}
	if (value.startsWith("file:")) {
		return { kind: "file", absolutePath: value.slice("file:".length) };
	}
	return null;
}

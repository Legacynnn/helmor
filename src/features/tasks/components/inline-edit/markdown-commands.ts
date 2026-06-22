/**
 * Pure text transforms for the description editor's formatting toolbar. Each
 * takes the current textarea state and returns the next value plus the
 * selection range to restore. Keeping these pure makes the toolbar trivial to
 * test and keeps DOM concerns in the component.
 */

export type EditorState = {
	value: string;
	start: number;
	end: number;
};

/** Wrap/unwrap the selection with an inline marker (toggle). */
export function applyWrap(state: EditorState, marker: string): EditorState {
	const { value, start, end } = state;
	const selected = value.slice(start, end);
	const before = value.slice(0, start);
	const after = value.slice(end);
	const len = marker.length;

	// Already wrapped (markers just inside the selection) -> unwrap.
	if (
		selected.startsWith(marker) &&
		selected.endsWith(marker) &&
		selected.length >= len * 2
	) {
		const inner = selected.slice(len, selected.length - len);
		return { value: before + inner + after, start, end: start + inner.length };
	}
	// Already wrapped (markers just outside the selection) -> unwrap.
	if (before.endsWith(marker) && after.startsWith(marker)) {
		return {
			value: before.slice(0, -len) + selected + after.slice(len),
			start: start - len,
			end: end - len,
		};
	}

	if (selected.length === 0) {
		// No selection: drop markers and place the caret between them.
		const caret = start + len;
		return {
			value: `${before}${marker}${marker}${after}`,
			start: caret,
			end: caret,
		};
	}

	return {
		value: `${before}${marker}${selected}${marker}${after}`,
		start: start + len,
		end: end + len,
	};
}

/** Toggle a line-level prefix ("# ", "> ", "- ", "- [ ] ") on every selected line. */
export function applyLinePrefix(
	state: EditorState,
	prefix: string,
	options: { ordered?: boolean } = {},
): EditorState {
	const { value, start, end } = state;
	const lineStart = value.lastIndexOf("\n", start - 1) + 1;
	const lineEndIdx = value.indexOf("\n", end);
	const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;

	const block = value.slice(lineStart, lineEnd);
	const lines = block.split("\n");
	const ordered = options.ordered ?? false;

	const prefixRe = ordered
		? /^\d+\.\s/
		: new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
	const allPrefixed = lines.every(
		(line) => line.length === 0 || prefixRe.test(line),
	);

	const next = lines
		.map((line, i) => {
			if (allPrefixed) return line.replace(prefixRe, "");
			if (line.length === 0) return line;
			return ordered ? `${i + 1}. ${line}` : `${prefix}${line}`;
		})
		.join("\n");

	const value2 = value.slice(0, lineStart) + next + value.slice(lineEnd);
	return { value: value2, start: lineStart, end: lineStart + next.length };
}

/** Wrap the selection as a markdown link, caret landing in the URL slot. */
export function applyLink(state: EditorState): EditorState {
	const { value, start, end } = state;
	const selected = value.slice(start, end) || "text";
	const before = value.slice(0, start);
	const after = value.slice(end);
	const snippet = `[${selected}](url)`;
	const urlStart = before.length + selected.length + 3; // "[selected]("
	return {
		value: before + snippet + after,
		start: urlStart,
		end: urlStart + 3, // select "url"
	};
}

/** Fence the selection as a code block on its own lines. */
export function applyCodeBlock(state: EditorState): EditorState {
	const { value, start, end } = state;
	const selected = value.slice(start, end);
	const before = value.slice(0, start);
	const after = value.slice(end);
	const padBefore = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
	const padAfter = after.length > 0 && !after.startsWith("\n") ? "\n" : "";
	const snippet = `${padBefore}\`\`\`\n${selected}\n\`\`\`${padAfter}`;
	const caret = before.length + padBefore.length + 4; // after "```\n"
	return {
		value: before + snippet + after,
		start: caret,
		end: caret + selected.length,
	};
}

export type StepStatus = "todo" | "active" | "done";

export type Step = {
	status: StepStatus;
	/** Inline markdown text for the step (list/status markers stripped). */
	text: string;
};

const STATUS_PREFIX = /^(done|active|todo)\s*:\s*/i;
// Marker must be followed by whitespace or end-of-line so a bare "1." is treated
// as a marker-only (empty) line while "1.2 release" stays intact.
const LIST_MARKER = /^(?:\d+[.)]|[-*+])(?=\s|$)\s*/;

/**
 * Parse the raw `<Steps>` body (one step per line) into structured steps.
 *
 * Each non-empty line becomes a step. A leading ordered/unordered list marker
 * (`1.`, `2)`, `-`, `*`, `+`) is stripped so authors can keep writing a normal
 * markdown list. An optional `done:` / `active:` / `todo:` prefix sets status;
 * the default is `todo`. Remaining text is preserved verbatim (inline markdown
 * is rendered downstream).
 */
export function parseSteps(text: string): Step[] {
	const steps: Step[] = [];
	for (const raw of text.split(/\r?\n/)) {
		let line = raw.trim();
		if (!line) {
			continue;
		}
		line = line.replace(LIST_MARKER, "").trim();
		let status: StepStatus = "todo";
		const match = STATUS_PREFIX.exec(line);
		if (match) {
			status = match[1].toLowerCase() as StepStatus;
			line = line.slice(match[0].length).trim();
		}
		if (!line) {
			continue;
		}
		steps.push({ status, text: line });
	}
	return steps;
}

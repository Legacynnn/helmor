import type { WorkspaceRow } from "@/lib/api";

export type HistoryGroup = {
	id: string;
	label: string;
	rows: WorkspaceRow[];
};

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

/** Returns the timestamp we sort/bucket by. Most recent meaningful activity. */
export function rowTimestamp(row: WorkspaceRow): number {
	const candidate =
		row.lastUserMessageAt ?? row.updatedAt ?? row.createdAt ?? null;
	if (!candidate) {
		return 0;
	}
	const parsed = Date.parse(candidate);
	return Number.isFinite(parsed) ? parsed : 0;
}

function startOfLocalDay(ms: number): number {
	const date = new Date(ms);
	date.setHours(0, 0, 0, 0);
	return date.getTime();
}

function bucketLabel(diffDays: number, ms: number): string {
	if (diffDays <= 0) return "Today";
	if (diffDays === 1) return "Yesterday";
	if (diffDays < 7) return `${diffDays} days ago`;
	const date = new Date(ms);
	return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

export function groupByDay(
	rows: WorkspaceRow[],
	now: number = Date.now(),
): HistoryGroup[] {
	const today = startOfLocalDay(now);
	const buckets = new Map<number, HistoryGroup>();

	for (const row of rows) {
		const ts = rowTimestamp(row);
		if (ts === 0) continue;
		const bucketDay = startOfLocalDay(ts);
		const diffDays = Math.round((today - bucketDay) / 86_400_000);
		const id = String(bucketDay);
		let group = buckets.get(bucketDay);
		if (!group) {
			group = { id, label: bucketLabel(diffDays, bucketDay), rows: [] };
			buckets.set(bucketDay, group);
		}
		group.rows.push(row);
	}

	const sorted = Array.from(buckets.entries()).sort((a, b) => b[0] - a[0]);
	for (const [, group] of sorted) {
		group.rows.sort((a, b) => rowTimestamp(b) - rowTimestamp(a));
	}
	return sorted.map(([, group]) => group);
}

export function filterRows(
	rows: WorkspaceRow[],
	query: string,
): WorkspaceRow[] {
	const trimmed = query.trim().toLowerCase();
	if (!trimmed) return rows;
	return rows.filter((row) => {
		const haystack = [
			row.title,
			row.repoName ?? "",
			row.branch ?? "",
			row.directoryName ?? "",
		]
			.join(" ")
			.toLowerCase();
		return haystack.includes(trimmed);
	});
}

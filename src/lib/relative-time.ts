import { formatDistanceToNow } from "date-fns";

/** Format an ISO timestamp as a relative "2 minutes ago" string.
 * Returns null for nullish or unparseable input so callers can omit the field. */
export function relativeTime(iso?: string | null): string | null {
	if (!iso) return null;
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return null;
	return formatDistanceToNow(date, { addSuffix: true });
}

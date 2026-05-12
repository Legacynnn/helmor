const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
	if (bytes >= GIB) {
		const value = bytes / GIB;
		return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} GB`;
	}
	const mb = bytes / MIB;
	return `${mb >= 100 ? Math.round(mb) : mb.toFixed(0)} MB`;
}

export function formatBytesShort(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "—";
	if (bytes >= GIB) {
		return `${(bytes / GIB).toFixed(1)} GB`;
	}
	return `${Math.round(bytes / MIB)} MB`;
}

export function formatCpu(percent: number): string {
	if (!Number.isFinite(percent) || percent < 0) return "—";
	if (percent >= 100) return `${Math.round(percent)}%`;
	if (percent >= 10) return `${percent.toFixed(0)}%`;
	return `${percent.toFixed(1)}%`;
}

export function formatPercent(fraction: number): string {
	if (!Number.isFinite(fraction) || fraction < 0) return "—";
	const pct = fraction * 100;
	if (pct >= 10) return `${pct.toFixed(0)}%`;
	return `${pct.toFixed(1)}%`;
}

export function formatRelativeAge(timestampMs: number, now: number): string {
	const delta = Math.max(0, Math.round((now - timestampMs) / 1000));
	if (delta < 2) return "Just now";
	if (delta < 60) return `${delta}s ago`;
	const minutes = Math.round(delta / 60);
	return `${minutes}m ago`;
}

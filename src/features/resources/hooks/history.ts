export type ResourceSample = {
	cpuPercent: number;
	memoryBytes: number;
};

export const HISTORY_CAPACITY = 60;

export function pushSample(
	history: ResourceSample[],
	sample: ResourceSample,
): ResourceSample[] {
	const next = [...history, sample];
	return next.length > HISTORY_CAPACITY
		? next.slice(next.length - HISTORY_CAPACITY)
		: next;
}

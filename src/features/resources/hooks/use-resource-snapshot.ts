import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { resourceSnapshotQueryOptions } from "@/lib/query-client";
import { pushSample, type ResourceSample } from "./history";

/** Poll the Helmor resource snapshot. 2s idle, 1s while the popover is
 * open. Keeps a 60-sample client-side history for sparklines. */
export function useResourceSnapshot(popoverOpen: boolean) {
	const query = useQuery(
		resourceSnapshotQueryOptions(popoverOpen ? 1000 : 2000),
	);
	const [history, setHistory] = useState<ResourceSample[]>([]);

	useEffect(() => {
		if (!query.data) return;
		setHistory((prev) =>
			pushSample(prev, {
				cpuPercent: query.data.totalCpuPercent,
				memoryBytes: query.data.totalMemoryBytes,
			}),
		);
	}, [query.data]);

	return { ...query, history };
}

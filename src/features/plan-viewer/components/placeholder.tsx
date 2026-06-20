/**
 * `UnsupportedBlock` is the visible fallback for plan components that are not in
 * the allowlist. It never evaluates the unknown component — it just names it.
 */
export function UnsupportedBlock({ name }: { name: string }) {
	return (
		<div className="my-4 rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-3 text-small text-muted-foreground">
			Unsupported plan block: <span className="font-mono">{name}</span>
		</div>
	);
}

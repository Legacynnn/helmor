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

/**
 * `MalformedBlock` stands in for a single component the MDX parser could not
 * read (e.g. invalid attribute markup). The parser isolates the broken span and
 * swaps in this sentinel so the REST of the plan still renders — the failure is
 * contained to one block instead of degrading the whole document to raw text.
 */
export function MalformedBlock({ name }: { name?: string }) {
	return (
		<div className="my-4 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 px-4 py-3 text-small text-amber-700 dark:text-amber-300">
			Couldn't render the{" "}
			<span className="font-mono">{name || "component"}</span> block — it has
			invalid markup. The rest of the plan is unaffected.
		</div>
	);
}

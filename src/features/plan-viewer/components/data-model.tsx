import { DatabaseIcon } from "lucide-react";
import type { PlanBlock } from "../mdx/parse";
import { PlanBlockShell } from "./shell/plan-block-shell";

type Field = { name: string; type: string };
type Entity = { id: string; name: string; fields: Field[] };

function parseFields(text: string): Field[] {
	const fields: Field[] = [];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (line.length === 0) {
			continue;
		}
		const idx = line.indexOf(":");
		if (idx === -1) {
			fields.push({ name: line, type: "" });
			continue;
		}
		fields.push({
			name: line.slice(0, idx).trim(),
			type: line.slice(idx + 1).trim(),
		});
	}
	return fields;
}

function extractEntities(childBlocks: PlanBlock[]): Entity[] {
	const entities: Entity[] = [];
	for (const block of childBlocks) {
		if (block.kind !== "component" || block.name !== "Entity") {
			continue;
		}
		entities.push({
			id: block.id,
			name: block.props.name?.trim() || "Entity",
			fields: parseFields(block.rawText),
		});
	}
	return entities;
}

/**
 * `DataModel` renders typed entity/schema tables. Each `<Entity name="...">`
 * holds `fieldName: type` lines.
 */
export function DataModel({ childBlocks = [] }: { childBlocks?: PlanBlock[] }) {
	const entities = extractEntities(childBlocks);
	if (entities.length === 0) {
		return null;
	}
	return (
		<PlanBlockShell accent="neutral" icon={DatabaseIcon} title="Data model">
			<div className="grid gap-3 sm:grid-cols-2">
				{entities.map((entity) => (
					<div
						key={entity.id}
						className="overflow-hidden rounded-md border border-border/70"
					>
						<div className="border-border/50 border-b bg-muted/30 px-3 py-1.5 font-medium text-small">
							{entity.name}
						</div>
						<ul className="divide-y divide-border/40">
							{entity.fields.map((field, i) => (
								<li
									key={`${field.name}-${i}`}
									className="flex items-center justify-between gap-3 px-3 py-1.5"
								>
									<span className="font-mono text-micro">{field.name}</span>
									<span className="font-mono text-micro text-muted-foreground">
										{field.type}
									</span>
								</li>
							))}
						</ul>
					</div>
				))}
			</div>
		</PlanBlockShell>
	);
}

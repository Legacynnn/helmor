import { ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { MCP_CATALOG, SKILL_CATALOG } from "./catalog";
import { CatalogItemCard } from "./catalog-item-card";
import { InstalledOverview } from "./installed-overview";
import { ProviderInventoryCard } from "./provider-inventory-card";
import { useCustomizedData } from "./use-customized-data";

function SectionHeader({
	title,
	description,
}: {
	title: string;
	description?: string;
}) {
	return (
		<div className="mb-3">
			<div className="text-ui font-medium leading-snug text-foreground">
				{title}
			</div>
			{description ? (
				<div className="mt-1 max-w-[62ch] text-small leading-snug text-muted-foreground">
					{description}
				</div>
			) : null}
		</div>
	);
}

function GithubCard({ logins }: { logins: string[] }) {
	const [open, setOpen] = useState(false);
	const ready = logins.length > 0;
	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className="rounded-lg border border-border/60 bg-muted/15"
		>
			<CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 p-4 text-left">
				<ChevronRight
					className={cn(
						"size-4 shrink-0 text-muted-foreground transition-transform",
						open && "rotate-90",
					)}
				/>
				<span className="text-ui font-medium text-foreground">GitHub CLI</span>
				<span className="flex-1" />
				<Badge variant="secondary" className="text-mini">
					view-only
				</Badge>
				<span
					className={cn(
						"flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-mini font-medium",
						ready
							? "bg-emerald-500/10 text-emerald-500"
							: "bg-muted text-muted-foreground",
					)}
				>
					<span
						className={cn(
							"size-1.5 rounded-full",
							ready ? "bg-emerald-500" : "bg-muted-foreground/50",
						)}
					/>
					{ready ? "Logged in" : "Not logged in"}
				</span>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="flex flex-col gap-1 px-4 pb-4 pl-10">
					<div className="text-mini font-medium uppercase tracking-wide text-muted-foreground">
						Accounts
					</div>
					{ready ? (
						<ul className="flex flex-col divide-y divide-border/40 rounded-md border border-border/50 bg-app-base/40">
							{logins.map((login) => (
								<li
									key={login}
									className="px-3 py-1.5 text-small text-foreground"
								>
									{login}
								</li>
							))}
						</ul>
					) : (
						<div className="text-small italic text-muted-foreground/70">
							Not logged in
						</div>
					)}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

export function CustomizedPanel() {
	const data = useCustomizedData();
	const [query, setQuery] = useState("");

	const q = query.trim().toLowerCase();
	const matches = (text: string) => !q || text.toLowerCase().includes(q);
	const filteredMcp = useMemo(
		() =>
			MCP_CATALOG.filter(
				(item) => matches(item.name) || matches(item.description),
			),
		[q],
	);
	const filteredSkills = useMemo(
		() =>
			SKILL_CATALOG.filter(
				(item) => matches(item.name) || matches(item.description),
			),
		[q],
	);
	const browseEmpty = filteredMcp.length === 0 && filteredSkills.length === 0;

	return (
		<Tabs defaultValue="browse" className="flex flex-col gap-4 pb-10">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<TabsList>
					<TabsTrigger value="browse">Browse</TabsTrigger>
					<TabsTrigger value="installed">
						Installed
						{data.installedInventory.length > 0 ? (
							<span className="ml-1.5 rounded-full bg-muted px-1.5 text-mini text-muted-foreground">
								{data.installedInventory.length}
							</span>
						) : null}
					</TabsTrigger>
				</TabsList>
				<div className="relative w-full max-w-[260px]">
					<Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search skills & MCP…"
						className="pl-8"
					/>
				</div>
			</div>

			<TabsContent value="browse">
				{browseEmpty ? (
					<div className="rounded-lg border border-dashed border-border/60 bg-muted/10 p-8 text-center text-small text-muted-foreground">
						No catalog items match “{query}”.
					</div>
				) : (
					<div className="flex flex-col gap-6">
						{filteredMcp.length > 0 ? (
							<div>
								<SectionHeader title="MCP servers" />
								<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
									{filteredMcp.map((item) => (
										<CatalogItemCard key={item.id} item={item} data={data} />
									))}
								</div>
							</div>
						) : null}
						{filteredSkills.length > 0 ? (
							<div>
								<SectionHeader title="Skills" />
								<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
									{filteredSkills.map((item) => (
										<CatalogItemCard key={item.id} item={item} data={data} />
									))}
								</div>
							</div>
						) : null}
					</div>
				)}
			</TabsContent>

			<TabsContent value="installed">
				<div className="flex flex-col gap-8">
					<section>
						<SectionHeader
							title="Connected providers"
							description="Expand a provider to see the skills and MCP servers it currently loads. Installs are global — they apply across every repo and workspace."
						/>
						<div className="flex flex-col gap-2.5">
							{data.providers.map((provider) => (
								<ProviderInventoryCard key={provider.id} provider={provider} />
							))}
							<GithubCard logins={data.githubLogins} />
						</div>
					</section>

					<section>
						<SectionHeader
							title="Installed overall"
							description="Every skill and MCP server installed across your connected providers."
						/>
						<InstalledOverview data={data} query={query} />
					</section>
				</div>
			</TabsContent>
		</Tabs>
	);
}

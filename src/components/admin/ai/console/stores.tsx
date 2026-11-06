/**
 * Console → AI, Stores (P7 AI; ai.md AI-§K.2 Stores, AI-§O cost dashboard): this month's top consumers from the rollups
 * (credits, cost, runs, cache hit rate with its n, refusals), filtered by plan; a row opens the store's AI tab.
 */
import Link from "next/link";
import type { loadTopStores } from "@/lib/ai/platform/console-read";
import { consoleHref } from "@/lib/ai/platform/console-view";
import { cn } from "@/lib/utils";
import { c, DataRows, EmptyPreview, int, Panel, RateWithN, usd } from "./ui";

type Data = Awaited<ReturnType<typeof loadTopStores>>;

export function PlanFilter({ plans, plan }: { plans: Data["plans"]; plan: string | null }) {
  const opts = [{ id: null as string | null, name: c("ai.console.stores.all_plans") }, ...plans.map((p) => ({ id: p.id as string | null, name: p.name }))];
  return (
    <nav aria-label={c("ai.console.stores.filter")} className="flex flex-wrap gap-1.5">
      {opts.map((o) => {
        const on = o.id === plan;
        return (
          <Link
            key={o.id ?? "all"}
            href={consoleHref.stores(o.id)}
            aria-current={on ? "page" : undefined}
            className={cn("inline-flex h-8 items-center rounded-full border px-3 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", on ? "border-foreground/20 bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
          >
            {o.name}
          </Link>
        );
      })}
    </nav>
  );
}

export function TopStores({ d, plan }: { d: Data; plan: string | null }) {
  return (
    <Panel title={c("ai.console.stores.title")} meta={c("ai.console.stores.meta")}>
      <div className="mb-4">
        <PlanFilter plans={d.plans} plan={plan} />
      </div>
      <DataRows
        caption={c("ai.console.stores.title")}
        cols={[
          { key: "store", label: c("ai.console.stores.store"), primary: true, width: "minmax(0,2.2fr)" },
          { key: "plan", label: c("ai.console.stores.plan"), width: "minmax(0,0.9fr)" },
          { key: "credits", label: c("ai.console.stores.credits"), align: "end" },
          { key: "cost", label: c("ai.console.stores.cost"), align: "end" },
          { key: "runs", label: c("ai.console.stores.runs"), align: "end" },
          { key: "cache", label: c("ai.console.stores.cache"), align: "end", width: "minmax(0,1.3fr)" },
          { key: "refused", label: c("ai.console.stores.refused"), align: "end" },
        ]}
        rows={d.rows.map((r) => ({
          key: r.storeId,
          href: consoleHref.store(r.storeId),
          cells: {
            store: (
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{r.name}</span>
                <span className="truncate font-mono text-[11.5px] text-muted-foreground">{r.handle}</span>
              </span>
            ),
            plan: <span className="text-muted-foreground">{r.plan}</span>,
            credits: int(r.credits),
            cost: usd(r.costMicros),
            runs: int(r.runs),
            cache: <RateWithN value={r.runs ? r.cacheHits / r.runs : null} n={r.runs} />,
            refused: int(r.refused),
          },
        }))}
        empty={<EmptyPreview text={plan ? c("ai.console.stores.none_plan") : c("ai.console.stores.none")} cols={6} />}
      />
    </Panel>
  );
}

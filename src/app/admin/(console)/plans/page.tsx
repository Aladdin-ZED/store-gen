import type { Metadata } from "next";
import { Suspense } from "react";
import { PanelBoundary } from "@/components/admin/common/panel-boundary";
import { Ago } from "@/components/console/ago";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { PanelError, PanelSkeleton, PanelUnavailable } from "@/components/console/panel";
import { NewPlanButton } from "@/components/console/plans/new-plan-dialog";
import { PlanStatusChip } from "@/components/console/plans/status-chip";
import { PrefetchLink } from "@/components/console/prefetch-link";
import { t as message, translator } from "@/lib/i18n/admin";
import { panel } from "@/lib/platform/panel";
import { listPlans, type PlanListRow } from "@/lib/platform/plans";
import { requirePlatform } from "@/lib/platform/seam";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";

/*
 * `/admin/plans` (platform.md PLA-§9.1, PL-11): every plan in sort order with its status (active / hidden / retired),
 * the stores on it, the sort order and the last change; beta is marked "Default for new stores". "New plan"
 * (`plans.manage`) opens the creation dialog; a row opens the editor (`console.read` reads it, `plans.manage` edits).
 */
export const metadata: Metadata = { title: message("console.plans.meta") };

const tr = translator(CONSOLE_LOCALE);
const card = "rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]";
async function Plans({ ctx }: { ctx: PlatformCtx }) {
  const p = await panel("plans.list", () => listPlans(ctx));
  if (p.state !== "ok") return <section className={card}>{p.state === "error" ? <PanelError reference={p.ref} /> : <PanelUnavailable />}</section>;
  if (p.data.length === 0) return <p className={cn(card, "px-5 py-8 text-[13px] text-muted-foreground")}>{tr("console.plans.empty")}</p>;
  const name = (r: PlanListRow) => (
    <span className="grid min-w-0 gap-px">
      <span className="flex min-w-0 items-center gap-2">
        <PrefetchLink href={`/admin/plans/${r.id}`} className="truncate rounded-[4px] font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
          {r.name}
        </PrefetchLink>
        {r.isDefault && <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-[var(--brand-soft)] px-2 text-[11px] font-medium text-[var(--c-brand-ink)]">{tr("console.plans.default")}</span>}
      </span>
      <bdi dir="ltr" className="truncate text-start font-mono text-[11.5px] text-muted-foreground">
        {r.id}
      </bdi>
    </span>
  );
  return (
    <section className={cn(card, "overflow-hidden")}>
      <ul className="divide-y divide-[var(--c-hairline)] md:hidden">
        {p.data.map((r) => (
          <li key={r.id} className="grid gap-1.5 px-3.5 py-3">
            {name(r)}
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
              <PlanStatusChip status={r.status} />
              <span className="num">{tr("console.plans.stores_n", { count: r.stores })}</span>
              {r.updatedAt && <Ago iso={r.updatedAt} template="console.plans.changed_ago" className="num" />}
            </span>
          </li>
        ))}
      </ul>
      <table className="hidden w-full table-fixed border-collapse text-[13px] md:table">
        <thead className="border-b border-[var(--c-hairline)] bg-[color-mix(in_oklch,var(--muted)_50%,transparent)]">
          <tr>
            {[
              ["plan", "w-[38%] ps-4"],
              ["status", "w-[120px]"],
              ["stores", "w-[100px] text-end"],
              ["sort", "w-[80px] text-end"],
              ["changed", "pe-4"],
            ].map(([k, c]) => (
              <th key={k} scope="col" className={cn("h-9 px-[var(--cell-x)] text-start text-[11.5px] font-medium text-muted-foreground", c)}>
                {tr(`console.plans.col.${k}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.data.map((r) => (
            <tr key={r.id} className="border-b border-[var(--c-hairline)] last:border-0 hover:bg-[color-mix(in_oklch,var(--muted)_40%,transparent)]">
              <td className="py-2.5 ps-4 pe-[var(--cell-x)] align-middle">{name(r)}</td>
              <td className="px-[var(--cell-x)] align-middle">
                <PlanStatusChip status={r.status} />
              </td>
              <td className="num px-[var(--cell-x)] text-end align-middle">{r.stores}</td>
              <td className="num px-[var(--cell-x)] text-end align-middle text-muted-foreground">{r.sort}</td>
              <td className="px-[var(--cell-x)] pe-4 align-middle text-[12px] text-muted-foreground">{r.updatedAt ? <Ago iso={r.updatedAt} className="num" /> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default async function PlansPage() {
  const ctx = await requirePlatform({ permission: "console.read" });
  const manage = ctx.can("plans.manage");
  const plans = manage ? await listPlans(ctx).catch(() => []) : [];
  return (
    <div className="mx-auto grid w-full max-w-[1120px] grid-cols-[minmax(0,1fr)] gap-4 md:gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-[20px] leading-tight font-semibold tracking-[-0.014em]">{tr("console.plans.title")}</h1>
          <p className="max-w-prose text-[13px] text-muted-foreground">{tr("console.plans.lead")}</p>
        </div>
        {manage && <NewPlanButton plans={plans.map((p) => ({ id: p.id, name: p.name }))} />}
      </header>
      <PanelBoundary title={tr("console.plans.title")}>
        <Suspense fallback={<PanelSkeleton title={tr("console.plans.title")} rows={4} />}>
          <Plans ctx={ctx} />
        </Suspense>
      </PanelBoundary>
    </div>
  );
}

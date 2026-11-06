import type { Metadata } from "next";
import { ArrowLeftIcon } from "lucide-react";
import { Ago } from "@/components/console/ago";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { PanelError, PanelUnavailable } from "@/components/console/panel";
import { PlanStatusMenu } from "@/components/console/plans/new-plan-dialog";
import { PlanEditor } from "@/components/console/plans/plan-editor";
import { PlanStatusChip } from "@/components/console/plans/status-chip";
import { PrefetchLink } from "@/components/console/prefetch-link";
import { AuthRefusal } from "@/lib/auth/errors";
import { t as message, translator } from "@/lib/i18n/admin";
import { panel } from "@/lib/platform/panel";
import { getPlanEditor } from "@/lib/platform/plans";
import { requirePlatform } from "@/lib/platform/seam";
import { cn } from "@/lib/utils";

/*
 * `/admin/plans/<id>` (platform.md PLA-§9.2, PL-11, PD8, PD58): the plan's header (name, id, status, stores on it,
 * last change; the status menu for `plans.manage`, beta locked active) and the editor (src/components/console/plans).
 * `console.read` reads it; only `plans.manage` changes a value, and only through the diff sheet's Confirm.
 * An unknown id answers "No plan with this id".
 */
export const metadata: Metadata = { title: message("console.plans.editor_meta") };

type Props = { params: Promise<{ id: string }> };

const tr = translator(CONSOLE_LOCALE);
const card = "rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]";

export default async function PlanPage({ params }: Props) {
  const ctx = await requirePlatform({ permission: "console.read" });
  const { id } = await params;
  const p = await panel("plans.editor", () => getPlanEditor(ctx, id).catch((err: unknown) => (err instanceof AuthRefusal && err.code === "not_found" ? null : Promise.reject(err))));
  const manage = ctx.can("plans.manage");
  return (
    <div className="mx-auto grid w-full max-w-[1120px] grid-cols-[minmax(0,1fr)] gap-4 md:gap-5">
      <PrefetchLink href="/admin/plans" className="inline-flex items-center gap-1 justify-self-start rounded-[4px] text-[12.5px] font-medium text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:min-h-11">
        <ArrowLeftIcon aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
        {tr("console.plans.title")}
      </PrefetchLink>
      {p.state !== "ok" ? (
        <section className={card}>{p.state === "error" ? <PanelError reference={p.ref} /> : <PanelUnavailable />}</section>
      ) : !p.data ? (
        <section className={cn(card, "grid justify-items-start gap-1 px-5 py-10")}>
          <h1 className="text-[15px] font-semibold">{tr("console.plans.not_found")}</h1>
        </section>
      ) : (
        <>
          <header className={cn(card, "flex flex-wrap items-end justify-between gap-4 px-4 py-4 md:px-5")}>
            <div className="grid min-w-0 gap-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="truncate text-[20px] leading-tight font-semibold tracking-[-0.014em]">{p.data.plan.name}</h1>
                <PlanStatusChip status={p.data.plan.status} />
                {p.data.plan.isDefault && <span className="inline-flex h-5 items-center rounded-full bg-[var(--brand-soft)] px-2 text-[11px] font-medium text-[var(--c-brand-ink)]">{tr("console.plans.default")}</span>}
              </div>
              <p className="flex flex-wrap items-center gap-x-3 text-[12.5px] text-muted-foreground">
                <bdi dir="ltr" className="font-mono">
                  {p.data.plan.id}
                </bdi>
                <span className="num">{tr("console.plans.stores_n", { count: p.data.plan.stores })}</span>
                {p.data.plan.updatedAt && <Ago iso={p.data.plan.updatedAt} template="console.plans.changed_ago" className="num" />}
              </p>
              <p className="text-[12px] text-muted-foreground">{tr(`console.plans.status.${p.data.plan.status}.hint`)}</p>
            </div>
            {manage && <PlanStatusMenu planId={p.data.plan.id} status={p.data.plan.status} locked={p.data.plan.isDefault} />}
          </header>
          {!manage && <p className="text-[12.5px] text-muted-foreground">{tr("console.plans.read_only")}</p>}
          <PlanEditor editor={p.data} canManage={manage} />
        </>
      )}
    </div>
  );
}

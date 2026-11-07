"use client";
/**
 * The campaigns list (P3 LANDING, wave 2; landing.md LAN-§13.4, LP-18 = SF-01; core §I.1 `/app/<h>/campaigns`,
 * `pages.read`, edit `campaigns.write`): name and slug, page, status, the kit's link clicks and the orders of the last
 * 28 days; a row opens the kit. "New campaign" opens the create sheet (`?new=1`, `&page=<id>` from the pages list row
 * menu and the address card); a refused gauge opens the limit sheet. The `campaigns` gauge (live and paused kits)
 * against `campaigns_max` sits above the table. Stacked cards on phones.
 */
import { ArrowUpRightIcon, MegaphoneIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CampaignListRow } from "@/lib/campaigns/read.server";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { LinkPageOption } from "@/lib/links/read";
import type { ActionResult } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import { EmptyState } from "../common/empty-state";
import { PageHeader } from "../common/page-header";
import { UsageMeter } from "../common/usage-meter";
import { failText, intFmt } from "../leads/format";
import { LimitSheet } from "../shell/limit-sheet";
import { useStore } from "../shell/store-context";
import { CampaignStatusPill } from "./status-pill";
import { CreateCampaignSheet, type CampaignFieldErrors, type CreateCampaignValues } from "./create-sheet";

type Failure = { ok: false; error: string; message?: string; items?: readonly { field?: string; title: string }[] };
const NETWORK: Failure = { ok: false, error: "network", message: "landing.common.network" };

export interface CampaignsActions {
  create: (input: CreateCampaignValues) => Promise<ActionResult<{ id: string; slug: string }>>;
}

const COLUMNS = "xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_7rem_6rem_7rem_1.5rem]";

export function CampaignsView(p: { rows: CampaignListRow[]; pages: LinkPageOption[]; gauge: { used: number; limit: number | null }; linkGauge: { used: number; limit: number | null }; canWrite: boolean; openNew: boolean; pageId: string | null; actions: CampaignsActions }) {
  const t = useT();
  const locale = useAdminLocale();
  const store = useStore();
  const router = useRouter();
  const nf = intFmt(locale);
  const [creating, setCreating] = useState(p.openNew && p.canWrite ? 1 : 0);
  const [limitOpen, setLimitOpen] = useState(false);

  const create = async (v: CreateCampaignValues): Promise<CampaignFieldErrors | null> => {
    const res = await p.actions.create(v).catch(() => NETWORK);
    if (!res.ok) {
      if (res.error === "quota") {
        setCreating(0);
        setLimitOpen(true);
        return null;
      }
      const item = res.items?.[0];
      if (item?.field === "pageId" || item?.field === "name" || item?.field === "channels") return { [item.field]: t(item.title) };
      if (res.error === "not_found") return { pageId: t("landing.campaigns.error.unpublished") };
      return { form: failText(res, t) };
    }
    setCreating(0);
    toast.success(t("landing.campaigns.toast.created"));
    router.push(store.href(`/campaigns/${res.data.id}`));
    return null;
  };

  const newButton = p.canWrite && (
    <Button variant="brand" onClick={() => setCreating((n) => n + 1)} className="gap-1.5">
      <PlusIcon aria-hidden="true" className="size-4" />
      {t("landing.campaigns.new")}
    </Button>
  );

  return (
    <>
      <PageHeader title={t("landing.campaigns.title")} description={t("landing.campaigns.lead")} actions={p.rows.length ? newButton : undefined} />

      {p.rows.length === 0 ? (
        <EmptyState
          illustration="chart"
          title={t("landing.campaigns.empty.title")}
          description={t("landing.campaigns.empty.body")}
          actions={
            p.canWrite ? (
              <Button variant="brand" onClick={() => setCreating((n) => n + 1)} className="gap-1.5">
                <MegaphoneIcon aria-hidden="true" className="size-4" />
                {t("landing.campaigns.empty.action")}
              </Button>
            ) : undefined
          }
          teach={p.canWrite ? undefined : t("landing.campaigns.readOnly")}
        />
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full max-w-xs">
              <UsageMeter label={t("landing.campaigns.gauge")} used={p.gauge.used} limit={p.gauge.limit} />
            </div>
            {!p.canWrite && <p className="text-[0.8125rem] text-muted-foreground">{t("landing.campaigns.readOnly")}</p>}
          </div>
          <div role="table" aria-label={t("landing.campaigns.title")} className="adm-surface overflow-hidden">
            <div role="row" className={cn("hidden border-b border-border/70 px-5 py-2.5 text-[0.75rem] font-medium text-muted-foreground xl:grid xl:items-center xl:gap-4", COLUMNS)}>
              <span role="columnheader">{t("landing.campaigns.col.name")}</span>
              <span role="columnheader">{t("landing.campaigns.col.page")}</span>
              <span role="columnheader">{t("landing.campaigns.col.status")}</span>
              <span role="columnheader" className="text-end">
                {t("landing.campaigns.col.clicks")}
              </span>
              <span role="columnheader" className="text-end">
                {t("landing.campaigns.col.orders")}
              </span>
              <span role="columnheader" className="sr-only">
                {t("landing.campaigns.col.open")}
              </span>
            </div>
            <div role="rowgroup" className="divide-y divide-border/60">
              {p.rows.map((r) => (
                <Link
                  key={r.id}
                  role="row"
                  href={store.href(`/campaigns/${r.id}`)}
                  className={cn("group grid gap-2 px-5 py-4 transition-colors outline-none hover:bg-foreground/[0.025] focus-visible:bg-foreground/[0.04] xl:items-center xl:gap-4 xl:py-3.5", COLUMNS)}
                >
                  <span role="cell" className="grid min-w-0 gap-0.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[0.9rem] font-medium">{r.name}</span>
                      {r.stale && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[0.6875rem] font-medium text-warn-ink" title={t("landing.campaigns.stale.title")}>
                          <RefreshCwIcon aria-hidden="true" className="size-3" />
                          {t("landing.campaigns.stale.short")}
                        </span>
                      )}
                    </span>
                    <bdi dir="ltr" className="block truncate font-mono text-[0.75rem] text-muted-foreground">
                      utm_campaign={r.slug}
                    </bdi>
                  </span>
                  <span role="cell" className={cn("min-w-0 truncate text-[0.8125rem]", !r.pageLive && "text-muted-foreground")}>
                    {r.pageTitle ?? t("landing.links.target.missing")}
                    {!r.pageLive && r.pageTitle && <span className="text-muted-foreground"> · {t("landing.links.target.missing")}</span>}
                  </span>
                  <span role="cell" className="flex items-center justify-between gap-3 xl:block">
                    <CampaignStatusPill status={r.status} />
                    <span className="flex gap-4 text-[0.8125rem] text-muted-foreground tabular-nums xl:hidden">
                      <span>{t("landing.links.clicks", { n: r.clicks })}</span>
                      <span>{t("landing.campaigns.ordersN", { n: r.orders })}</span>
                    </span>
                  </span>
                  <span role="cell" className="hidden text-end text-[0.875rem] tabular-nums xl:block">
                    {nf.format(r.clicks)}
                  </span>
                  <span role="cell" className="hidden text-end text-[0.875rem] tabular-nums xl:block">
                    {nf.format(r.orders)}
                  </span>
                  <span role="cell" aria-hidden="true" className="hidden justify-end text-muted-foreground/60 transition-colors group-hover:text-foreground xl:flex">
                    <ArrowUpRightIcon className="size-4 rtl:-scale-x-100" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {p.canWrite && creating > 0 && <CreateCampaignSheet key={creating} open onClose={() => setCreating(0)} pages={p.pages} initialPageId={p.pageId} onSubmit={create} />}
      <LimitSheet open={limitOpen} onOpenChange={setLimitOpen} limit={{ kind: "quota", metric: "short_links", used: Math.max(p.linkGauge.used, p.linkGauge.limit ?? p.linkGauge.used), limit: p.linkGauge.limit ?? p.linkGauge.used }} />
    </>
  );
}

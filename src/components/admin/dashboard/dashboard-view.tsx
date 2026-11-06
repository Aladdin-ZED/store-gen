/**
 * The dashboard of one store (P2 SHELL; platform.md PLA-§22.17, §22.16, §22.7, §22.10.2; docs/STORE-SAAS.md §I.4, §I.6,
 * §I.8, D54, D60). A server component: the header paints from the layout's data, then each block streams in its own
 * `PanelBoundary` (Suspense + error boundary) as its panel of `dashboardLoaders()` settles, so a slow or failing source
 * never holds or blanks the page. Order (one column at 360 px, a 12-column grid from 1024 px with the ring's rail):
 *
 *   1. the Today brief (template lines from real counts; never a model text, PD62)
 *   2. the In-review card while the store is pending (the state banners sit above, in the chrome)
 *   3. Store Health in the 4-column rail; on a phone right after the brief
 *   4. the six COD KPI tiles (7 / 28 days in the store's time zone, test orders out of every money tile)
 *   5. the COD funnel
 *   6. the work lists (counters with "See all"; P4's and P3's list components mount at their merges)
 *   7. the address card after the first publish, until the viewer hides it
 *   8. the integration tiles (P5's rows; R1.0's Sheets tile before them)
 *
 * The phone order is the DOM order of each column's blocks interleaved with CSS `order` (the columns are `contents`
 * below 1024 px). The money tile is "Placed", the value of orders placed, not delivered (never a sales total).
 */
import type { ReactNode } from "react";
import { PanelBoundary } from "@/components/admin/common/panel-boundary";
import { ReviewCard } from "@/components/admin/common/review-card";
import { TodayBrief } from "@/components/admin/common/today-brief";
import { evidenceVars } from "@/components/admin/common/honest";
import { reviewFacts, type DashboardLoad, type DashboardRange } from "@/lib/admin-data/dashboard";
import { translator, type AdminLocale, type MessageKey } from "@/lib/i18n/admin";
import type { StoreRow, StoreScope } from "@/lib/tenancy/types";
import { appHref } from "@/lib/urls";
import { cn } from "@/lib/utils";
import { Block, DashboardAddress, DashboardHeader, Funnel, IntegrationTiles, KpiTiles, WorkLists } from "./blocks";
import { todayBrief } from "./brief";
import { composeTiles, funnelSteps, healthIssuesFor, scoreHidden, wireIssue } from "./compose";
import { HealthPanel } from "./health-panel";

export interface DashboardViewProps {
  load: DashboardLoad;
  scope: StoreScope;
  store: Pick<StoreRow, "id" | "handle" | "name" | "status">;
  locale: AdminLocale;
  greeting: MessageKey;
  firstName: string;
  /** "Tuesday 4 November" in the viewer's language and the store's time zone */
  todayLabel: string;
  viewer: { isOwner: boolean; pagesRead: boolean; pagesWrite: boolean; ordersWrite: boolean };
}

const RANGE_DAYS: Record<DashboardRange, number> = { "7d": 7, "28d": 28 };

export function DashboardView(p: DashboardViewProps) {
  const tr = translator(p.locale);
  const href = (path: `/${string}` | "") => appHref(p.store.handle, path);
  const slot = (order: string, title: string, children: ReactNode) => (
    // a block with nothing to show (an unavailable source) leaves no gap in the column
    <div className={cn("min-w-0 [&:has(>section:empty)]:hidden", order)}>
      <PanelBoundary title={title}>{children}</PanelBoundary>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[1480px] px-4 pt-8 pb-16 sm:px-8 sm:pt-10">
      <DashboardHeader greeting={p.greeting} name={p.firstName} today={p.todayLabel} range={p.load.range} />

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-12 lg:items-start">
        {/* the main column (8 of 12) */}
        <div className="contents lg:col-span-8 lg:flex lg:flex-col lg:gap-5">
          {slot("order-1", tr("brief.title"), <BriefBlock v={p} href={href} />)}
          {p.store.status === "pending" && slot("order-3", tr("shell.review.title"), <ReviewBlock v={p} href={href} />)}
          {slot("order-4", tr("shell.dash.kpis"), <KpiBlock v={p} href={href} />)}
          {slot("order-5", tr("shell.dash.funnel.title"), <FunnelBlock v={p} href={href} title={tr("shell.dash.funnel.title")} />)}
          {slot("order-7", tr("shell.address.title"), <AddressBlock v={p} href={href} />)}
        </div>
        {/* the rail (4 of 12): health first, so a phone reads it right after the brief */}
        <div className="contents lg:col-span-4 lg:flex lg:flex-col lg:gap-5">
          {slot("order-2", tr("health.title"), <HealthBlock v={p} href={href} />)}
          {slot("order-6", tr("shell.dash.work.title"), <WorkBlock v={p} href={href} title={tr("shell.dash.work.title")} />)}
          {slot("order-8", tr("shell.dash.integrations.title"), <IntegrationsBlock v={p} href={href} title={tr("shell.dash.integrations.title")} />)}
        </div>
      </div>
    </div>
  );
}

/**
 * Each block gets the view's props as they are (the scope is never spread into a new object, §E.1) and the link builder.
 * The onboarding done step (welcome/_components/done-step.tsx) mounts the review and health blocks with the same props.
 */
export type BlockView = Pick<DashboardViewProps, "load" | "scope" | "store" | "locale" | "viewer">;
export type BlockProps = { v: BlockView; href: (path: `/${string}` | "") => string; title?: string };

/** 1. Today: P4's counts (or, before them, the store's own order count for the zero-data line) and the worst issue. */
async function BriefBlock({ v: p, href }: BlockProps) {
  const tr = translator(p.locale);
  const { kpis, ops, ordersEver, health, setup } = p.load.panels;
  const [k, o, ever, h, s] = await Promise.all([kpis, ops, ordersEver, health, setup]);
  const set = healthIssuesFor({ health: h.ok ? h.data : null, setup: s.ok ? s.data : null, status: p.store.status });
  const worst = set ? set.issues.filter((i) => !set.snoozed[i.id]).sort((a, b) => b.points - a.points || b.severity - a.severity)[0] : undefined;
  const lines = todayBrief({
    kpisToday: k.ok ? k.data.today : null,
    queue: o.ok ? o.data : null,
    worstIssue: worst ? { text: tr(worst.text, evidenceVars(worst.evidence)), href: worst.fix.kind === "link" ? worst.fix.href(p.store.handle) : `${href("")}#health` } : null,
    href,
    ordersEver: ever.ok ? ever.data : null,
  });
  if (!lines.length) return null;
  return (
    <Block>
      <TodayBrief lines={lines} />
    </Block>
  );
}

/** 2. The In-review card (PLA-§22.7), with the preview links and the pending media cap. */
export async function ReviewBlock({ v: p, href }: BlockProps) {
  const { review, previews, setup } = p.load.panels;
  const [r, links, s] = await Promise.all([review, previews, setup]);
  if (!r.ok) {
    if (r.reason === "error") throw new Error("dashboard: the review card could not be read");
    return null;
  }
  const facts = await reviewFacts(p.scope, { submitted: r.data.submittedAt !== null, pages: p.viewer.pagesRead });
  return (
    <ReviewCard
      card={r.data}
      store={{ name: p.store.name }}
      isOwner={p.viewer.isOwner}
      mediaMb={facts.mediaMb}
      previewLinks={links.ok ? links.data : undefined}
      pages={p.viewer.pagesRead ? facts.pages : undefined}
      whatsapp={s.ok ? (s.data.contact?.whatsapp ?? null) : null}
      publishHref={href("/pages")}
    />
  );
}

/** 3. Store Health: the snapshot, or before the first run the local setup pass; the score policy. */
export async function HealthBlock({ v: p }: BlockProps) {
  const { health, setup, healthPolicy } = p.load.panels;
  const [h, s, policy] = await Promise.all([health, setup, healthPolicy]);
  const snapshot = h.ok ? h.data : null;
  const set = healthIssuesFor({ health: snapshot, setup: s.ok ? s.data : null, status: p.store.status });
  const pol = policy.ok ? policy.data : null;
  const hideBelow = snapshot !== null && pol !== null && scoreHidden(pol) ? pol.hideScoreBelow : null;
  return (
    <HealthPanel
      state={!h.ok && h.reason === "error" ? "error" : "ok"}
      snapshot={snapshot ? { score: snapshot.score, attention: snapshot.attention, computedAt: snapshot.computedAt, dirty: snapshot.dirty, staleAfterMin: snapshot.staleAfterMin, components: snapshot.components } : null}
      issues={(set?.issues ?? []).map((i) => wireIssue(i, p.store.handle))}
      snoozed={set?.snoozed ?? {}}
      hideScoreBelow={hideBelow}
      status={p.store.status}
    />
  );
}

/** 4. The COD KPI tiles: placed and its value from the store's stats, P4's counts for the rest. */
async function KpiBlock({ v: p }: BlockProps) {
  const [kpis, placed] = await Promise.all([p.load.panels.kpis, p.load.panels.placed]);
  // both sources failed (not merely unavailable): the panel's error state with Retry, not two empty R2 tiles
  if (!kpis.ok && !placed.ok && (kpis.reason === "error" || placed.reason === "error")) throw new Error("dashboard: the KPI sources could not be read");
  return <KpiTiles tiles={composeTiles({ kpis, placed, range: p.load.range })} currency={p.load.currency} />;
}

/** 5. The funnel of the range; left out while P4's counts are unavailable (no made-up step). */
async function FunnelBlock({ v: p, title }: BlockProps) {
  const funnel = await p.load.panels.funnel;
  if (!funnel.ok) {
    if (funnel.reason === "error") throw new Error("dashboard: the funnel could not be read");
    return null;
  }
  return (
    <Block title={title}>
      <Funnel steps={funnelSteps(funnel.data)} days={RANGE_DAYS[p.load.range]} />
    </Block>
  );
}

/** 6. The work lists' counters: the pulse's live counts first (client), then P4's queue and the Sheets queue. */
async function WorkBlock({ v: p, title }: BlockProps) {
  const [queue, sheet] = await Promise.all([p.load.panels.queue, p.load.panels.sheet]);
  return <WorkLists queue={queue} sheet={sheet} title={title ?? ""} />;
}

/** 7. The address card once a page is live (PD61). */
async function AddressBlock({ v: p }: BlockProps) {
  const address = await p.load.panels.address;
  if (!address.ok || address.data.livePages === 0) return null;
  return <DashboardAddress store={p.store} live={address.data.livePages > 0 && p.store.status !== "pending"} pageId={address.data.page?.id ?? null} />;
}

/** 8. The integration tiles. */
async function IntegrationsBlock({ v: p, title }: BlockProps) {
  const [integrations, sheet] = await Promise.all([p.load.panels.integrations, p.load.panels.sheet]);
  return <IntegrationTiles integrations={integrations} sheet={sheet} canSync={p.viewer.ordersWrite} title={title ?? ""} />;
}

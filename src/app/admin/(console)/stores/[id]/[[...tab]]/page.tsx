import { ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PanelBoundary } from "@/components/admin/common/panel-boundary";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { PanelError, PanelSkeleton, PanelUnavailable } from "@/components/console/panel";
import { PrefetchLink } from "@/components/console/prefetch-link";
import { ActivityTab } from "@/components/console/profile/activity-tab";
import { ProfileKpis, ProfileKpisSkeleton } from "@/components/console/profile/kpi-row";
import { NotesTab } from "@/components/console/profile/notes-tab";
import { OrdersTab } from "@/components/console/profile/orders-tab";
import { StripSkeleton } from "@/components/console/profile/strips/frame";
import { AiStrip } from "@/components/console/profile/strips/ai";
import { HealthStrip } from "@/components/console/profile/strips/health";
import { IdentityStrip } from "@/components/console/profile/strips/identity";
import { IntegrationsStrip } from "@/components/console/profile/strips/integrations";
import { OrdersStrip } from "@/components/console/profile/strips/orders";
import { PagesStrip } from "@/components/console/profile/strips/pages";
import { RiskStrip } from "@/components/console/profile/strips/risk";
import { TeamStrip } from "@/components/console/profile/strips/team";
import { TimelineStrip } from "@/components/console/profile/strips/timeline";
import { UsageStrip } from "@/components/console/profile/strips/usage";
import { profileHref, resolveProfileTab, stripAnchor, type ProfileTab } from "@/components/console/profile/tabs";
import { TeamTab } from "@/components/console/profile/team-tab";
import { UsageTab } from "@/components/console/profile/usage-tab";
import { listPagesForConsole } from "@/lib/admin-data/pages";
import { t as message, translator } from "@/lib/i18n/admin";
import { listMentionableStaff, listNotes } from "@/lib/platform/notes";
import { optional, panel } from "@/lib/platform/panel";
import { listPlans } from "@/lib/platform/plans";
import { ACTOR_FILTERS, AREA_FILTERS, listStaffFilter, listStoreActivity, type ActivityFilter } from "@/lib/platform/profile/activity";
import { getStoreOrder, listStoreOrders, storeOrdersSummary, StoreOrdersFilter } from "@/lib/platform/profile/orders";
import { getStoreOverview, profileStoreFacts, type OverviewRange } from "@/lib/platform/profile/overview-strips";
import { getStoreTeam } from "@/lib/platform/profile/team";
import { listStoreTimeline } from "@/lib/platform/profile/timeline";
import { getStoreUsage } from "@/lib/platform/profile/usage";
import { platformScope, requirePlatform } from "@/lib/platform/seam";
import type { PlatformCtx } from "@/lib/tenancy/types";

/*
 * The store profile's tabs (platform.md PLA-§7.1-§7.15, PL-07; PD32, PD55; core §I.8): `[[...tab]]`, the overview by
 * default. R1: overview (the KPI row and the ten strips, each its own Suspense + PanelBoundary over one read, so one
 * strip failing leaves the nine others), orders (masked; the drawer at `?order=`), team, activity (`?view=timeline`),
 * usage, notes (never for analysts). The R2 / R3 paths (pages, integrations, domains, risk, media, ops, support)
 * answer the "Arrives with R2" page with a link to the strip that carries their R1 data; anything else is the 404.
 * Every read goes through src/lib/platform (the platform scope inside); masking happens there, before this payload.
 */
type Props = { params: Promise<{ id: string; tab?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tab } = await params;
  const r = resolveProfileTab(tab);
  return { title: message("console.profile.meta", { tab: message(r.kind === "tab" ? `console.profile.tab.${r.tab}` : "console.profile.arrives_title") }) };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
/** a filter or page change shows the tab's skeleton; opening an order's drawer (`order`) keeps the table on screen */
const suspenseKey = (sp: Record<string, string | string[] | undefined>) => JSON.stringify(Object.entries(sp).filter(([k]) => k !== "order"));
const tr = translator(CONSOLE_LOCALE);

export default async function StoreProfileTab({ params, searchParams }: Props) {
  const ctx = await requirePlatform({ permission: "console.read" });
  const [{ id, tab }, sp] = await Promise.all([params, searchParams]);
  const r = resolveProfileTab(tab);
  if (r.kind === "unknown") notFound();
  // an unknown id: the layout already says "No store with this id"; read nothing more
  if (!(await profileStoreFacts(ctx, id))) return null;
  if (r.kind === "deferred") {
    return (
      <div className="grid justify-items-start gap-2 rounded-[var(--r-card)] bg-card px-5 py-8 shadow-[inset_0_0_0_1px_var(--c-hairline)]">
        <h2 className="text-[15px] font-semibold">{tr(`console.profile.deferred.${r.tab}`)}</h2>
        <p className="max-w-prose text-[13px] text-muted-foreground">{tr(r.release === "R3" ? "console.profile.arrives_r3_lead" : "console.profile.arrives_r2_lead")}</p>
        <PrefetchLink href={`${profileHref(id, "overview")}#${stripAnchor(r.strip)}`} className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:min-h-11">
          {tr("console.profile.arrives_link", { strip: tr(`console.strip.${r.strip}`) })}
          <ArrowRightIcon aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
        </PrefetchLink>
      </div>
    );
  }
  const title = tr(`console.profile.tab.${r.tab}`);
  return (
    <PanelBoundary title={title}>
      <Suspense key={`${r.tab}:${suspenseKey(sp)}`} fallback={r.tab === "overview" ? null : <PanelSkeleton title={title} rows={8} />}>
        <TabBody ctx={ctx} storeId={id} tab={r.tab} sp={sp} />
      </Suspense>
    </PanelBoundary>
  );
}

async function TabBody({ ctx, storeId, tab, sp }: { ctx: PlatformCtx; storeId: string; tab: ProfileTab; sp: Record<string, string | string[] | undefined> }) {
  switch (tab) {
    case "overview":
      return <Overview ctx={ctx} storeId={storeId} range={Number(one(sp.range))} />;
    case "orders":
      return <Orders ctx={ctx} storeId={storeId} sp={sp} />;
    case "team":
      return <Team ctx={ctx} storeId={storeId} />;
    case "activity":
      return <Activity ctx={ctx} storeId={storeId} sp={sp} />;
    case "usage":
      return <Usage ctx={ctx} storeId={storeId} />;
    case "notes":
      return <Notes ctx={ctx} storeId={storeId} />;
  }
}

/* ------------------------------------------------------------------ */
/* Overview (PLA-§7.3)                                                 */
/* ------------------------------------------------------------------ */

const STRIPS = [
  { id: "identity", C: IdentityStrip },
  { id: "health", C: HealthStrip },
  { id: "pages", C: PagesStrip },
  { id: "orders", C: OrdersStrip },
  { id: "team", C: TeamStrip },
  { id: "integrations", C: IntegrationsStrip },
  { id: "ai", C: AiStrip },
  { id: "usage", C: UsageStrip },
  { id: "risk", C: RiskStrip },
  { id: "timeline", C: TimelineStrip },
] as const;

async function Kpis({ ctx, storeId, range }: { ctx: PlatformCtx; storeId: string; range: OverviewRange }) {
  const k = await panel("profile.kpis", () => getStoreOverview(ctx, storeId, range), { storeId });
  if (k.state === "ok") return <ProfileKpis storeId={storeId} kpis={k.data} />;
  return <div className="rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]">{k.state === "error" ? <PanelError compact reference={k.ref} /> : <PanelUnavailable />}</div>;
}

function Overview({ ctx, storeId, range }: { ctx: PlatformCtx; storeId: string; range: number }) {
  const r: OverviewRange = range === 7 || range === 90 ? range : 30;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:gap-5">
      <PanelBoundary title={tr("console.profile.kpi.title")}>
        <Suspense fallback={<ProfileKpisSkeleton />}>
          <Kpis ctx={ctx} storeId={storeId} range={r} />
        </Suspense>
      </PanelBoundary>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3 [&>section]:min-w-0 [&>section>*]:h-full">
        {STRIPS.map(({ id, C }) => (
          <PanelBoundary key={id} title={tr(`console.strip.${id}`)}>
            <Suspense fallback={<StripSkeleton title={tr(`console.strip.${id}`)} />}>
              <C ctx={ctx} storeId={storeId} />
            </Suspense>
          </PanelBoundary>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Orders (PLA-§7.4)                                                   */
/* ------------------------------------------------------------------ */

async function Orders({ ctx, storeId, sp }: { ctx: PlatformCtx; storeId: string; sp: Record<string, string | string[] | undefined> }) {
  const raw = { state: one(sp.state) || undefined, risky: one(sp.risky) === "1" || undefined, from: one(sp.from) || undefined, to: one(sp.to) || undefined, pageId: one(sp.page) || undefined };
  const parsed = StoreOrdersFilter.safeParse(raw);
  const filter: StoreOrdersFilter = parsed.success ? (Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)) as StoreOrdersFilter) : {};
  const cursor = one(sp.cursor) || null;
  const orderId = one(sp.order) || null;
  const [summary, page, pages, detail, facts] = await Promise.all([
    storeOrdersSummary(ctx, storeId),
    panel("profile.orders", () => listStoreOrders(ctx, storeId, filter, cursor), { storeId }),
    optional("profile.orders.pages", () => listPagesForConsole(platformScope(ctx, storeId)), { storeId }),
    orderId ? panel("profile.order", () => getStoreOrder(ctx, storeId, orderId), { storeId }) : Promise.resolve(null),
    optional("profile.orders.facts", () => profileStoreFacts(ctx, storeId), { storeId }),
  ]);
  return (
    <OrdersTab
      storeId={storeId}
      timeZone={facts?.timezone ?? "Africa/Casablanca"}
      summary={summary}
      page={page}
      filter={filter}
      pages={(pages ?? []).map((p) => ({ id: p.id, name: p.name }))}
      detail={detail === null ? null : detail.state === "ok" ? (detail.data ?? "missing") : "missing"}
      canReveal={ctx.can("pii.reveal")}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Team, Activity, Usage, Notes (PLA-§7.6, §7.7-§7.8, §7.9, §7.12)      */
/* ------------------------------------------------------------------ */

async function Team({ ctx, storeId }: { ctx: PlatformCtx; storeId: string }) {
  const p = await panel("profile.team", () => getStoreTeam(ctx, storeId), { storeId });
  if (p.state !== "ok" || !p.data) return <Quiet p={p} title={tr("console.profile.tab.team")} />;
  return <TeamTab team={p.data} />;
}

async function Activity({ ctx, storeId, sp }: { ctx: PlatformCtx; storeId: string; sp: Record<string, string | string[] | undefined> }) {
  const view = one(sp.view) === "timeline" ? "timeline" : "audit";
  if (view === "audit" && !ctx.can("audit.platform")) {
    return <ActivityTab storeId={storeId} view="timeline" audit={null} timeline={await panel("profile.timeline", () => listStoreTimeline(ctx, storeId, { cursor: one(sp.cursor) || null }), { storeId })} filter={{}} staff={[]} />;
  }
  const actor = one(sp.actor);
  const area = one(sp.area);
  const filter: ActivityFilter = {
    ...((ACTOR_FILTERS as readonly string[]).includes(actor) ? { actorKind: actor as ActivityFilter["actorKind"] } : {}),
    ...((AREA_FILTERS as readonly string[]).includes(area) ? { area: area as ActivityFilter["area"] } : {}),
    ...(/^[0-9A-Z]{26}$/.test(one(sp.staff)) ? { staffId: one(sp.staff) } : {}),
    ...(/^\d{4}-\d{2}-\d{2}$/.test(one(sp.from)) ? { from: one(sp.from) } : {}),
    ...(/^\d{4}-\d{2}-\d{2}$/.test(one(sp.to)) ? { to: one(sp.to) } : {}),
  };
  const before = Number(one(sp.before));
  const [audit, timeline, staff] = await Promise.all([
    view === "audit" ? panel("profile.activity", () => listStoreActivity(ctx, storeId, filter, Number.isSafeInteger(before) && before > 0 ? before : null), { storeId }) : Promise.resolve(null),
    view === "timeline" ? panel("profile.timeline", () => listStoreTimeline(ctx, storeId, { cursor: one(sp.cursor) || null }), { storeId }) : Promise.resolve(null),
    view === "audit" ? optional("profile.activity.staff", () => listStaffFilter(ctx), { storeId }) : Promise.resolve(null),
  ]);
  return <ActivityTab storeId={storeId} view={view} audit={audit} timeline={timeline} filter={filter} staff={staff ?? []} />;
}

async function Usage({ ctx, storeId }: { ctx: PlatformCtx; storeId: string }) {
  const [p, plans] = await Promise.all([panel("profile.usage", () => getStoreUsage(ctx, storeId), { storeId }), optional("profile.usage.plans", () => listPlans(ctx), { storeId })]);
  if (p.state !== "ok" || !p.data) return <Quiet p={p} title={tr("console.profile.tab.usage")} />;
  return <UsageTab storeId={storeId} usage={p.data} plans={(plans ?? []).map((pl) => ({ id: pl.id, name: pl.name, status: pl.status }))} canOverride={ctx.can("entitlements.override")} />;
}

async function Notes({ ctx, storeId }: { ctx: PlatformCtx; storeId: string }) {
  if (!ctx.can("stores.notes") || ctx.role === "analyst") {
    return <p className="rounded-[var(--r-card)] bg-card px-5 py-8 text-[13px] text-muted-foreground shadow-[inset_0_0_0_1px_var(--c-hairline)]">{tr("console.notes_tab.not_for_role")}</p>;
  }
  const [notes, staff] = await Promise.all([panel("profile.notes", () => listNotes(ctx, { storeId }), { storeId }), optional("profile.notes.staff", () => listMentionableStaff(ctx), { storeId })]);
  if (notes.state !== "ok") return <Quiet p={notes} title={tr("console.profile.tab.notes")} />;
  return <NotesTab storeId={storeId} notes={notes.data} staff={staff ?? []} />;
}

function Quiet({ p, title }: { p: { state: string; ref?: string }; title: string }) {
  return (
    <section aria-label={title} className="rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]">
      {p.state === "error" && p.ref ? <PanelError reference={p.ref} /> : p.state === "unavailable" ? <PanelUnavailable /> : <p className="px-4 py-8 text-[13px] text-muted-foreground">{tr("console.profile.not_found")}</p>}
    </section>
  );
}

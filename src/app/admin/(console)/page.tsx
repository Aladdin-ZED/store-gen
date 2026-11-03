import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { PanelBoundary } from "@/components/admin/common/panel-boundary";
import { ActivityFeedPanel } from "@/components/console/overview/activity-feed";
import { KpiRow } from "@/components/console/overview/kpi-row";
import { NeedsAttentionPanel } from "@/components/console/overview/needs-attention";
import { QueueSnapshotPanel } from "@/components/console/overview/queue-snapshot";
import { SystemPanel } from "@/components/console/overview/system-panel";
import { ConsolePanel, KpiSkeleton, PanelError, PanelSkeleton, PanelUnavailable } from "@/components/console/panel";
import { PLATFORM_TIMEZONE } from "@/lib/auth/config";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { t as message, translator } from "@/lib/i18n/admin";
import { activityFeed, needsAttention, overviewKpis, queueSnapshotBlock, systemSummary } from "@/lib/platform/overview";
import { panel, type Panel } from "@/lib/platform/panel";
import { requirePlatform } from "@/lib/platform/seam";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";

/*
 * `/admin`: the platform pulse (platform.md PLA-§5, PL-05). Five blocks, each its own async server component in its own
 * <PanelBoundary> + <Suspense>, so a slow block streams in later and a failing one shows its own error state (Retry,
 * the 8-character reference) while the others render. Layout: six tiles; Needs attention 8 / Activity 4 columns from
 * 1280 px; Queue snapshot and System 6 / 6. Real data only (the read models in src/lib/platform/overview.ts).
 */
export const metadata: Metadata = { title: message("console.overview.meta") };

type Tr = (key: string, vars?: Record<string, string | number>) => string;

/** A block whose loader failed as a whole: the frame with the error state, the rest of the page unaffected. */
function Failed({ title, p }: { title: string; p: Exclude<Panel<unknown>, { state: "ok" }> }) {
  return <ConsolePanel title={title}>{p.state === "error" ? <PanelError reference={p.ref} /> : <PanelUnavailable />}</ConsolePanel>;
}

async function Kpis({ ctx, tr }: { ctx: PlatformCtx; tr: Tr }) {
  const p = await panel("overview.kpis", () => overviewKpis(ctx));
  return p.state === "ok" ? <KpiRow tiles={p.data} /> : <Failed title={tr("console.kpi.title")} p={p} />;
}

async function Attention({ ctx, tr }: { ctx: PlatformCtx; tr: Tr }) {
  const p = await panel("overview.attention", () => needsAttention(ctx));
  return p.state === "ok" ? <NeedsAttentionPanel data={p.data} at={p.at} /> : <Failed title={tr("console.attention.title")} p={p} />;
}

async function Feed({ ctx, tr }: { ctx: PlatformCtx; tr: Tr }) {
  const p = await panel("overview.feed", () => activityFeed(ctx));
  return p.state === "ok" ? <ActivityFeedPanel feed={p.data} at={p.at} /> : <Failed title={tr("console.feed.title")} p={p} />;
}

async function Queue({ ctx, tr }: { ctx: PlatformCtx; tr: Tr }) {
  const p = await panel("overview.queue", () => queueSnapshotBlock(ctx));
  return p.state === "ok" ? <QueueSnapshotPanel data={p.data} at={p.at} /> : <Failed title={tr("console.snapshot.title")} p={p} />;
}

async function System({ ctx, tr }: { ctx: PlatformCtx; tr: Tr }) {
  const p = await panel("overview.system", () => systemSummary(ctx));
  return p.state === "ok" ? <SystemPanel data={p.data} at={p.at} canOpen={ctx.can("health.read")} /> : <Failed title={tr("console.system.title")} p={p} />;
}

function Block({ title, fallback, children, className }: { title: string; fallback: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col [&>section]:flex [&>section]:flex-1 [&>section]:flex-col", className)}>
      <PanelBoundary title={title}>
        <Suspense fallback={fallback}>{children}</Suspense>
      </PanelBoundary>
    </div>
  );
}

export default async function OverviewPage() {
  const ctx = await requirePlatform({ permission: "console.read" });
  const tr = translator(CONSOLE_LOCALE) as Tr;
  return (
    <div className="mx-auto grid w-full max-w-[1440px] gap-4 md:gap-5">
      <header className="grid gap-1">
        <h1 className="text-[20px] leading-tight font-semibold tracking-[-0.014em]">{tr("console.overview.title")}</h1>
        <p className="text-[13px] text-muted-foreground">{tr("console.overview.lead", { tz: PLATFORM_TIMEZONE })}</p>
      </header>

      <Block title={tr("console.kpi.title")} fallback={<KpiSkeleton />}>
        <Kpis ctx={ctx} tr={tr} />
      </Block>

      <div className="grid gap-4 md:gap-5 xl:grid-cols-12">
        <Block title={tr("console.attention.title")} fallback={<PanelSkeleton title={tr("console.attention.title")} rows={6} />} className="min-w-0 xl:col-span-8">
          <Attention ctx={ctx} tr={tr} />
        </Block>
        <Block title={tr("console.feed.title")} fallback={<PanelSkeleton title={tr("console.feed.title")} rows={8} />} className="min-w-0 xl:col-span-4">
          <Feed ctx={ctx} tr={tr} />
        </Block>
      </div>

      <div className="grid gap-4 md:gap-5 xl:grid-cols-2">
        <Block title={tr("console.snapshot.title")} fallback={<PanelSkeleton title={tr("console.snapshot.title")} rows={5} />} className="min-w-0">
          <Queue ctx={ctx} tr={tr} />
        </Block>
        <Block title={tr("console.system.title")} fallback={<PanelSkeleton title={tr("console.system.title")} rows={7} />} className="min-w-0">
          <System ctx={ctx} tr={tr} />
        </Block>
      </div>
    </div>
  );
}

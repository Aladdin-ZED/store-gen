/**
 * Console → AI, Overview (P7 AI; ai.md AI-§K.2 Overview, AI-§O, AI-§F.9; AI-01 console scope): `ai.platform` through
 * `requirePlatform`. The status tile, spend against the cap with its straight-line forecast and the pending share,
 * refusals and fallbacks over 7 days, jobs and batches, alerts, the ten KPIs and the Director default; every panel
 * loads and fails on its own (src/components/admin/ai/console/ui.tsx `Section`).
 */
import type { Metadata } from "next";
import { AiConsoleFrame } from "@/components/admin/ai/console/frame";
import { AlertsPanel, DirectorDefaultPanel, JobsPanel, KpiPanel, ReliabilityPanel, SpendPanel, StatusPanel } from "@/components/admin/ai/console/overview";
import { c, Section } from "@/components/admin/ai/console/ui";
import { loadDirectorDefault, loadKpis, loadReliability, loadSpend, loadStatus } from "@/lib/ai/platform/console-read";
import { requirePlatform } from "@/lib/platform/seam";

export const metadata: Metadata = { title: "AI" };

export default async function AiConsolePage() {
  await requirePlatform({ permission: "ai.platform" });
  // the status read feeds three panels and the spend read two; each panel still fails alone
  const status = loadStatus();
  const spend = loadSpend();
  status.catch(() => undefined);
  spend.catch(() => undefined);
  return (
    <AiConsoleFrame tab="overview">
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Section title={c("ai.console.status.title")} rows={12} load={() => status} render={(d) => <StatusPanel d={d} />} />
        <div className="grid min-w-0 items-start gap-4 sm:grid-cols-2 lg:col-span-2">
          <Section title={c("ai.console.spend.title")} rows={4} load={() => spend} render={(d) => <SpendPanel d={d} />} />
          <Section title={c("ai.console.rel.title")} rows={5} load={() => loadReliability()} render={(d) => <ReliabilityPanel d={d} />} />
          <Section title={c("ai.console.jobs.title")} rows={5} load={() => status} render={(d) => <JobsPanel d={d} />} />
          <Section title={c("ai.console.alerts.title")} rows={3} load={() => Promise.all([status, spend])} render={([s, m]) => <AlertsPanel status={s} spend={m} />} />
        </div>
        <Section title={c("ai.console.kpi.title")} rows={10} className="lg:col-span-2" load={() => loadKpis()} render={(d) => <KpiPanel d={d} />} />
        <Section title={c("ai.console.director.title")} rows={3} load={() => loadDirectorDefault()} render={(d) => <DirectorDefaultPanel auto={d.auto} test={d.test} />} />
      </div>
    </AiConsoleFrame>
  );
}

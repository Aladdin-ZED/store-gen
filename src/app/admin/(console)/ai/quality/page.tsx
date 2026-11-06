/** Console → AI, Quality (P7 AI; ai.md AI-§K.2 Quality, AI-§O): `ai.platform`; each panel loads and fails alone. */
import type { Metadata } from "next";
import { AiConsoleFrame } from "@/components/admin/ai/console/frame";
import { DirectorPanel, HeatmapPanel, InjectionPanel, LatencyPanel, OutcomesPanel } from "@/components/admin/ai/console/quality";
import { c, Section } from "@/components/admin/ai/console/ui";
import { loadDirector, loadHeatmap, loadInjectionFlags, loadLatency, loadOutcomes } from "@/lib/ai/platform/console-read";
import { requirePlatform } from "@/lib/platform/seam";

export const metadata: Metadata = { title: "AI quality" };

export default async function AiQualityPage() {
  await requirePlatform({ permission: "ai.platform" });
  return (
    <AiConsoleFrame tab="quality">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Section title={c("ai.console.quality.heatmap")} rows={8} load={() => loadHeatmap()} render={(d) => <HeatmapPanel d={d} />} />
        <Section title={c("ai.console.quality.latency")} rows={8} load={() => loadLatency()} render={(d) => <LatencyPanel d={d} />} />
        <Section title={c("ai.console.quality.outcomes")} rows={8} className="lg:col-span-2" load={() => loadOutcomes()} render={(d) => <OutcomesPanel d={d} />} />
        <Section title={c("ai.console.quality.director")} rows={6} className="lg:col-span-2" load={() => loadDirector()} render={(d) => <DirectorPanel d={d} />} />
        <Section title={c("ai.console.quality.flags")} rows={4} className="lg:col-span-2" load={() => loadInjectionFlags()} render={(d) => <InjectionPanel d={d} />} />
      </div>
    </AiConsoleFrame>
  );
}

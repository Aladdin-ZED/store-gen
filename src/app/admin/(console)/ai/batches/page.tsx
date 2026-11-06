/** Console → AI, Batches (P7 AI; ai.md AI-§K.2 Batches): `ai.platform`. */
import type { Metadata } from "next";
import { BatchesTab } from "@/components/admin/ai/console/batches";
import { AiConsoleFrame } from "@/components/admin/ai/console/frame";
import { c, Section } from "@/components/admin/ai/console/ui";
import { loadBatches } from "@/lib/ai/platform/console-read";
import { requirePlatform } from "@/lib/platform/seam";

export const metadata: Metadata = { title: "AI batches" };

export default async function AiBatchesPage() {
  await requirePlatform({ permission: "ai.platform" });
  return (
    <AiConsoleFrame tab="batches">
      <Section title={c("ai.console.tab.batches")} rows={6} load={() => loadBatches()} render={(d) => <BatchesTab d={d} />} />
    </AiConsoleFrame>
  );
}

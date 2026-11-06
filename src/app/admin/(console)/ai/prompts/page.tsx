/** Console → AI, Prompts & evals (P7 AI; ai.md AI-§K.2, AI-§F.5-F.8; AI-07, AI-19 (9)(10)): `ai.platform`. */
import type { Metadata } from "next";
import { AiConsoleFrame } from "@/components/admin/ai/console/frame";
import { PromptsTab } from "@/components/admin/ai/console/prompts";
import { c, Section } from "@/components/admin/ai/console/ui";
import { loadPrompts, naturalnessCases } from "@/lib/ai/platform/console-read";
import { requirePlatform } from "@/lib/platform/seam";

export const metadata: Metadata = { title: "AI prompts and evals" };

export default async function AiPromptsPage() {
  await requirePlatform({ permission: "ai.platform" });
  return (
    <AiConsoleFrame tab="prompts">
      <Section title={c("ai.console.tab.prompts")} rows={12} load={() => loadPrompts()} render={(d) => <PromptsTab d={d} cases={naturalnessCases()} />} />
    </AiConsoleFrame>
  );
}

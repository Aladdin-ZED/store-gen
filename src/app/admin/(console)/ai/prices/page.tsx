/** Console → AI, Prices (P7 AI; ai.md AI-§K.2, AI-§B.2): `ai.platform`. */
import type { Metadata } from "next";
import { AiConsoleFrame } from "@/components/admin/ai/console/frame";
import { PricesTab } from "@/components/admin/ai/console/prices";
import { c, Section } from "@/components/admin/ai/console/ui";
import { loadPrices } from "@/lib/ai/platform/console-read";
import { requirePlatform } from "@/lib/platform/seam";

export const metadata: Metadata = { title: "AI prices" };

export default async function AiPricesPage() {
  await requirePlatform({ permission: "ai.platform" });
  return (
    <AiConsoleFrame tab="prices">
      <Section title={c("ai.console.prices.title")} rows={8} load={() => loadPrices()} render={(d) => <PricesTab d={d} />} />
    </AiConsoleFrame>
  );
}

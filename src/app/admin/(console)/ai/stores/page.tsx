/** Console → AI, Stores (P7 AI; ai.md AI-§K.2 Stores, AI-§O): `ai.platform`; `?plan=<id>` filters by plan. */
import type { Metadata } from "next";
import { AiConsoleFrame } from "@/components/admin/ai/console/frame";
import { TopStores } from "@/components/admin/ai/console/stores";
import { c, Section } from "@/components/admin/ai/console/ui";
import { loadTopStores } from "@/lib/ai/platform/console-read";
import { requirePlatform } from "@/lib/platform/seam";

export const metadata: Metadata = { title: "AI stores" };

export default async function AiStoresPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatform({ permission: "ai.platform" });
  const raw = (await searchParams).plan;
  const plan = typeof raw === "string" && /^[a-z0-9_-]{1,32}$/i.test(raw) ? raw : null;
  return (
    <AiConsoleFrame tab="stores">
      <Section title={c("ai.console.stores.title")} rows={8} load={() => loadTopStores({ plan })} render={(d) => <TopStores d={d} plan={plan} />} />
    </AiConsoleFrame>
  );
}

/**
 * Console → AI → one store (P7 AI; ai.md AI-§K.4): the store AI tab outside the store profile (the Stores tab's rows
 * open it; P1 mounts the same component in the profile). `ai.platform` for the page, `console.read` for the scope.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AiConsoleFrame } from "@/components/admin/ai/console/frame";
import { StoreAiTab } from "@/components/admin/ai/console/store-ai-tab";
import { c } from "@/components/admin/ai/console/ui";
import { storeHead } from "@/lib/ai/platform/console-read";
import { requirePlatform } from "@/lib/platform/seam";

export const metadata: Metadata = { title: "Store AI" };

export default async function AiStorePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePlatform({ permission: "ai.platform" });
  const { id } = await params;
  // a store id (the Stores rows) or a handle (a pasted link)
  if (!/^[0-9A-Za-z-]{2,64}$/.test(id)) notFound();
  const store = await storeHead(id);
  if (!store) notFound();
  return (
    <AiConsoleFrame
      tab="stores"
      title={store.name}
      lead={c("ai.console.store.lead", { handle: store.handle ?? "-", plan: store.plan ?? "-", status: store.status })}
      actions={
        <Link href={`/admin/stores/${store.id}`} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {c("ai.console.store.profile")}
        </Link>
      }
    >
      <StoreAiTab ctx={ctx} storeId={store.id} />
    </AiConsoleFrame>
  );
}

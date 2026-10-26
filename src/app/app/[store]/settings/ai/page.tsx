import type { Metadata } from "next";
import { AiSettingsForm } from "@/components/admin/settings/ai-settings";
import { getStoreSetting } from "@/lib/settings";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { saveAiAction } from "../actions";

export const metadata: Metadata = { title: "Local AI" };

type Params = Promise<{ store: string }>;

/** Settings → Local AI: the on-device fields of the store's `store_ai` key. */
export default async function AiSettingsPage({ params }: { params: Params }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "settings.read" });
  const ai = await getStoreSetting(ctx.scope, "store_ai", { fresh: true });
  return (
    <AiSettingsForm
      initial={{ enabled: ai.localEnabled, tier: ai.localTierCeiling, bgRemoval: ai.bgRemoval }}
      canWrite={ctx.can("settings.write")}
      save={saveAiAction}
    />
  );
}

import type { Metadata } from "next";
import { AntiSpamForm } from "@/components/admin/settings/antispam-form";
import { getStoreSetting } from "@/lib/settings";
import { redactStoreSetting } from "@/lib/settings/store-registry";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { saveTurnstileAction } from "../actions";

export const metadata: Metadata = { title: "Anti-spam" };

type Params = Promise<{ store: string }>;

/**
 * Settings → Anti-spam: the store's own Turnstile keys. Without them the platform's widget protects its forms
 * (`platform_turnstile`, §D.10); the server environment is never shown to a store.
 */
export default async function AntiSpamSettingsPage({ params }: { params: Params }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "settings.read" });
  const turnstile = await getStoreSetting(ctx.scope, "turnstile", { fresh: true });
  const shown = redactStoreSetting("turnstile", turnstile);
  return (
    <AntiSpamForm
      initial={{ siteKey: shown.siteKey ?? "", secretKey: shown.secretKey ?? "" }}
      source={turnstile.siteKey ? "saved" : "none"}
      canWrite={ctx.can("settings.write")}
      save={saveTurnstileAction}
    />
  );
}

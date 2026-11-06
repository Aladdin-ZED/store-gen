import type { Metadata } from "next";
import { PoliciesEditor, type PolicyPrefill } from "@/components/admin/policies/policies-editor";
import { viewerLocale } from "@/lib/auth/locale";
import { callingWindowFor } from "@/lib/callcenter/window.server";
import { noShopperHours, weekHoursText } from "@/lib/landing/hours";
import { moneySpec } from "@/lib/markets/money";
import { getStoreSettings } from "@/lib/settings";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { appHref } from "@/lib/urls";
import { savePoliciesAction } from "./actions";

export const metadata: Metadata = { title: "Policies" };

type Params = Promise<{ store: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const CLAIMS = ["delivery_time", "free_delivery", "return_window", "exchange", "inspection", "warranty", "refund"] as const;

/** `?card=<claim>&value=<n>` (a gate or AI fix): the card to open and the number to prefill, never saved by itself. */
function prefillOf(sp: Record<string, string | string[] | undefined>): PolicyPrefill | null {
  const card = typeof sp.card === "string" ? sp.card : null;
  if (!card || !(CLAIMS as readonly string[]).includes(card)) return null;
  const raw = typeof sp.value === "string" ? Number(sp.value) : NaN;
  const value = Number.isFinite(raw) && raw >= 0 && raw <= 1_000_000 ? raw : null;
  return { claim: card as PolicyPrefill["claim"], value };
}

/**
 * Settings → Policies (landing.md LAN-§3.3; `settings.read`, edits `settings.write`): one column of plain questions,
 * "Not set" a real answer. The contact card's hours line is read-only (operations' window, edited in "After the
 * order"), and reads as starting hours while the shopper is shown none (`noShopperHours`).
 */
export default async function PoliciesSettingsPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ store: handle }, sp] = await Promise.all([params, searchParams]);
  const ctx = await requireStoreMember({ handle, permission: "settings.read" });
  const { scope, store } = ctx;
  const [settings, window, locale] = await Promise.all([getStoreSettings(scope, ["policies", "checkout"]), callingWindowFor(scope), viewerLocale(ctx.user)]);
  const now = new Date();
  const hours = weekHoursText(window, locale, moneySpec(store.currency || "MAD", locale).locale, now);
  return (
    <PoliciesEditor
      initial={settings.policies}
      canWrite={ctx.can("settings.write")}
      market={store.market}
      currency={store.currency}
      zonesEnabled={settings.checkout.zonesEnabled}
      hours={{ text: hours, shown: !noShopperHours(window, now) }}
      links={{ afterOrder: appHref(store.handle, "/settings/checkout"), delivery: appHref(store.handle, "/settings/delivery") }}
      prefill={prefillOf(sp)}
      save={savePoliciesAction}
    />
  );
}

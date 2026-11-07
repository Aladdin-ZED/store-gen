import "server-only";
/**
 * The inbox's contact links (P3 LANDING; landing.md LAN-§10.3 "Actions"): WhatsApp opens `wa.me` with the store's
 * `lead_recovery` template in the lead's page locale, filled with `{name}` (first word), `{store}`, `{offer}` (the
 * selection text), `{total}` (the server total at capture) and `{eta_text}` when the lead's city maps to a zone with
 * delivery days (`zoneLineFor`); Call opens `tel:`. Nothing is sent by the platform (LD10): the agent's device opens
 * the link. The phone comes from `logAttempt`, which audits the reveal; this file never reads a phone itself.
 */
import { zoneLineFor } from "@/lib/delivery/zones.server";
import { shopperLocaleOf } from "@/lib/landing/copy";
import { cutAtWord, fillTemplate, firstWord } from "@/lib/landing/template-text";
import { WA_ORDER_REPLY } from "@/lib/landing/templates";
import { ownTemplate, templateFor } from "@/lib/landing/templates.server";
import { formatMoney } from "@/lib/markets/money";
import { cityKey } from "@/lib/orders/address";
import { errorSummary } from "@/lib/orders/log";
import type { StoreScope } from "@/lib/tenancy/types";
import type { LeadRow } from "./types";

/** wa.me text ceiling (the link stays well under the URL limits of every phone browser) */
const WA_TEXT_MAX = 700;

/** The digits of an E.164 phone ("+212612345678" → "212612345678"); null when it holds too few. */
export function phoneDigits(e164: string | null): string | null {
  const d = (e164 ?? "").replace(/\D/g, "");
  return d.length >= 8 && d.length <= 15 ? d : null;
}

/** The filled `lead_recovery` text of a lead (no customer data beyond the first name the shopper typed). */
export async function recoveryText(scope: StoreScope, storeName: string, lead: Pick<LeadRow, "name" | "city" | "locale" | "selection" | "totalCents" | "currency">): Promise<string> {
  const loc = shopperLocaleOf(lead.locale);
  const key = lead.city ? cityKey(lead.city) : null;
  const [tpl, line] = await Promise.all([
    templateFor(scope, "lead_recovery", loc),
    key
      ? zoneLineFor(scope, key).catch((err: unknown) => {
          console.error("[leads] zone line unavailable:", errorSummary(err));
          return null;
        })
      : Promise.resolve(null),
  ]);
  const eta = line && !line.notServed && line.eta && line.etaText ? line.etaText[loc].replace(/[.\s]+$/, "") : "";
  const text = fillTemplate(tpl, {
    name: lead.name ? firstWord(lead.name) : "",
    store: storeName,
    offer: cutAtWord((lead.selection ?? "").replace(/\s+/g, " ").trim(), 140),
    total: lead.totalCents === null ? "" : formatMoney(lead.totalCents / 100, lead.currency, loc),
    eta_text: eta,
  });
  return cutAtWord(text.replace(/[ \t]+/g, " ").trim(), WA_TEXT_MAX);
}

/** The link the agent's device opens: `https://wa.me/<digits>?text=…` or `tel:+<digits>`; null without a phone. */
export async function contactHref(scope: StoreScope, storeName: string, lead: Pick<LeadRow, "name" | "city" | "locale" | "selection" | "totalCents" | "currency">, phone: string | null, channel: "whatsapp" | "call"): Promise<string | null> {
  const digits = phoneDigits(phone);
  if (!digits) return null;
  if (channel === "call") return `tel:+${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(await recoveryText(scope, storeName, lead))}`;
}

/**
 * The quick reply of a WhatsApp intent (operations' `wa_order_reply`, LAN-§11.5): what the agent answers in the chat
 * the shopper opened, with the intent's `{ref}`, `{offer}` (the selection text) and `{total}`. The owner's own active
 * row of that kind wins; else the default of the lead's page language. No customer data.
 */
export async function waReplyText(scope: StoreScope, lead: Pick<LeadRow, "ref" | "locale" | "selection" | "totalCents" | "currency">): Promise<string> {
  const loc = shopperLocaleOf(lead.locale);
  const tpl = (await ownTemplate(scope, "wa_order_reply", loc)) ?? WA_ORDER_REPLY[loc];
  const text = fillTemplate(tpl, {
    ref: lead.ref ?? "",
    offer: cutAtWord((lead.selection ?? "").replace(/\s+/g, " ").trim(), 140),
    total: lead.totalCents === null ? "" : formatMoney(lead.totalCents / 100, lead.currency, loc),
  });
  return cutAtWord(text.replace(/[ \t]+/g, " ").trim(), WA_TEXT_MAX);
}

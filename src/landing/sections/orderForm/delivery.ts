/**
 * The server fallback of the delivery line (landing.md LAN-§7.4): what the `[data-lp-dz="offer"]` slot holds before
 * the `assist` add-on runs (no JS, exports, the builder's preview). It is the same composer's general state over the
 * same `lp-assist` data block, so the page never says two things: "Livraison en 1 à 3 jours ouvrés selon la ville"
 * with the default offer's real fee, or nothing when no served zone has days (the slot stays empty and hidden).
 */
import { composeLineWith, lineText } from "@/lib/delivery/line";
import { DZ, shopperLocaleOf } from "@/lib/landing/copy";
import { addonBlock } from "../../addons/facts";
import type { AssistData } from "../../addons/plan";
import type { RenderContext } from "../../types";

/** The general line for the default offer (`free`: its shipping is 0), or null (the line is off, or promises nothing). */
export function deliveryFallback(ctx: RenderContext, free: boolean): string | null {
  const a = addonBlock<AssistData>(ctx, "lp-assist");
  if (!a?.dz) return null;
  const l = a.l ?? shopperLocaleOf(ctx.locale);
  const line = composeLineWith(
    {
      table: a.dz,
      city: null,
      locale: l,
      dateLocale: l === "ar" ? "ar-MA" : l === "fr" ? "fr-MA" : "en-GB",
      now: new Date(ctx.now),
      confirmationCall: a.c === 1,
      fee: free ? { free: true } : a.f ? { free: false, text: a.f } : null,
      whatsapp: null,
    },
    { ...DZ[l], ...a.s },
  );
  return lineText(line);
}

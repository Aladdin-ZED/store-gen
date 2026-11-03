/**
 * What the order form and the thank-you body read of the store beyond the page (P3 LANDING; landing.md LAN-§3.5 OF2,
 * §6.3, §7.4, §8.1; docs/STORE-SAAS.md §H.13, LD29): the document's add-ons (`ctx.addons`: the `lp-assist` and
 * `lp-assist-ty` blocks, so the server prints the same fallback the chunk would compose) and the store's shopper facts
 * (`ctx.shopper`: the confirmation call, the inspection policy, the address mode).
 *
 * Both reach the render context through CCR docs/saas/ccr/r1-p3-10.md (the maintainer's `contextFor` and the store
 * render context). Until it lands they are absent, and every reader keeps today's markup or the honest default: no
 * slot is filled, no inspection is promised, the address follows the doc's `form.address`. Pure and isomorphic.
 */
import type { PageDoc } from "@/lib/page/schema";
import type { CheckoutSetting } from "@/lib/settings/keys/checkout";
import type { StorePolicyFacts } from "@/lib/settings/keys/policies";
import type { RenderContext } from "../types";
import type { AddonDataId, RenderAddons } from "./types";

/** The store's answers a shopper surface follows (LAN-§6.3: every promise comes from `policies` or `checkout`). */
export interface ShopperFacts {
  /** `checkout.confirmationCall`: the thank-you timeline has the call step */
  confirmationCall: boolean;
  /** `policies.inspection`: "Check, then pay" only when `allowed` */
  inspection: StorePolicyFacts["inspection"];
  /** `checkout.addressMode` resolved: `required` is the R1 default for MA, EU and INTL (UX-31) */
  addressMode: "required" | "optional";
}

/** The render context with the two optional fields of CCR r1-p3-10 (a section reads them only through this module). */
export type ShopperRenderContext = RenderContext & { addons?: RenderAddons; shopper?: ShopperFacts };

/** The facts of a store from its settings (the store render context calls it once per render, CCR r1-p3-10). */
export function shopperFactsFor(checkout: Pick<CheckoutSetting, "confirmationCall" | "addressMode">, policies: Pick<StorePolicyFacts, "inspection">): ShopperFacts {
  return { confirmationCall: checkout.confirmationCall, inspection: policies.inspection, addressMode: checkout.addressMode ?? "required" };
}

/**
 * The page as the store renders it (LAN-§3.5 OF2): `form.address` follows the store's address mode (`hidden` is not
 * honoured while the store requires it), so the form's fields and the runtime config's `fields.address` agree. The
 * store render path applies it next to `ctx.shopper` (CCR r1-p3-10); a doc already in that state is returned as is.
 */
export function applyShopperFacts(doc: PageDoc, facts: ShopperFacts | null): PageDoc {
  if (!facts || doc.form.address === facts.addressMode) return doc;
  return { ...doc, form: { ...doc.form, address: facts.addressMode } };
}

/** The store's facts, or null when the render path does not pass them (QA renders, exports before the CCR). */
export const shopperOf = (ctx: RenderContext): ShopperFacts | null => (ctx as ShopperRenderContext).shopper ?? null;

/** One add-on data block of the document, or null (the add-on is off, or the context carries no add-ons). */
export function addonBlock<T>(ctx: RenderContext, id: AddonDataId): T | null {
  const d = (ctx as ShopperRenderContext).addons?.data[id];
  return d && typeof d === "object" ? (d as T) : null;
}

/**
 * The COD invariants (P3 LANDING; landing.md LAN-§3.7, ra §1.3 R9, DES-§5.2 I1-I6; docs/STORE-SAAS.md §K.2 P0 rev 2.1):
 * the one implementation the design digest (`RenderDigest.cod`, P6), the builder checklist and the honesty gate import,
 * so an instant draft and a Director-refined page meet one standard. Pure and isomorphic. Typed stub frozen at P0.
 */
import type { PageDoc } from "@/lib/page/schema";

/**
 * What the invariants read besides the document. `heights` is the part of P6's `HeightReport`
 * (src/lib/design/types.frozen.ts) they need, so a `HeightReport` is accepted as it is.
 */
export interface CodInvariantInputs {
  heights: { formTop: number | null; fold: { ok: boolean } };
  /** `checkout.zonesEnabled && checkout.lineOnLanding` */
  zonesLine: boolean;
  /** ≥ 1 zone with an ETA or `notServed` (the line has something to say) */
  zonesWithLine: boolean;
  /** the store's WhatsApp number (store setting `store.whatsapp`), null when none */
  whatsapp: string | null;
}

export interface CodInvariants {
  /** the order form's top in 844 px screens (I2: ≤ 3.0) */
  formScreen: number;
  /** every hero CTA targets `#order` (I1) */
  ctaTargetsForm: boolean;
  /** `offer` precedes the final `cta` (I3) */
  offerBeforeCta: boolean;
  deliveryLine: "present" | "absent" | "n/a";
  /** WhatsApp appears only when a number exists */
  whatsappConfigured: boolean;
  /** no urgency without a merchant end date or stock; one countdown at most */
  urgencyReal: boolean;
  /** image, price, primary CTA and the COD line in the first 844 px (C2) */
  foldOk: boolean;
}

export function codInvariants(doc: PageDoc, inputs: CodInvariantInputs): CodInvariants {
  void doc;
  void inputs;
  throw new Error("not implemented: P3 codInvariants");
}

/**
 * The COD invariants (P3 LANDING; landing.md LAN-§3.7, LD37, ra §1.3 R9, DES-§5.2 I1-I6; docs/STORE-SAAS.md §K.2 P0
 * rev 2.1): the one implementation the design digest (`RenderDigest.cod`, P6), the builder checklist and the honesty
 * gate import, so an instant draft and a Director-refined page meet one standard. Pure and isomorphic. The result
 * shape is frozen at P0 (src/lib/contracts/r1-p0.ts); the inputs are P0's proposal, widened additively here.
 *
 *   codInvariants(doc, { heights: estimateHeights(doc, …), zonesLine, zonesWithLine, whatsapp })
 *
 * | invariant          | true when                                                                                  |
 * |--------------------|--------------------------------------------------------------------------------------------|
 * | formScreen         | the form's top / 844 (I2 holds at ≤ 3.0); 99 when the page has no visible form               |
 * | ctaTargetsForm     | a visible order form carries `#order`, the anchor every hero CTA links to (I1; the `Cta`    |
 * |                    | primitive is always `<a href="#order">`, so a page without the form is the only failure)    |
 * | offerBeforeCta     | at most one visible `offer` section, and it precedes the final `cta` (I3, R2)                |
 * | deliveryLine       | "n/a" unless zones are on with a line to say; then "present" when the form (which holds the  |
 * |                    | `[data-lp-dz]` slots) is visible, else "absent" (LAN-§7.4)                                 |
 * | whatsappConfigured | no WhatsApp surface (the form's alternative, the floating button) without a number          |
 * | urgencyReal        | the countdown renders in one place at most (LD36): urgency and announcement never both     |
 * | foldOk             | the report's fold contract (C2: image, price, primary CTA and the COD line in 844 px)       |
 *
 * The heights are P6's `HeightReport` (src/lib/design/types.frozen.ts), read as it is: `formScreen` from `formTop`,
 * `foldOk` from `fold.ok`. While the height model is P0's stub (`formTop: null`), the form's section top stands in.
 */
import type { PageDoc } from "@/lib/page/schema";

/** One mobile screen at 390 × 844. */
export const COD_SCREEN_PX = 844;
/** I2: the form starts within this many screens. */
export const COD_FORM_SCREENS = 3;
/** `formScreen` of a page with no visible order form (JSON-safe, unlike Infinity: `null <= 3` would read as true). */
export const COD_NO_FORM_SCREENS = 99;

/**
 * What the invariants read besides the document. `heights` is the part of P6's `HeightReport`
 * (src/lib/design/types.frozen.ts) they need, so a `HeightReport` is accepted as it is.
 */
export interface CodInvariantInputs {
  /** `sections` (P3, additive): the report's section tops, read for the form when `formTop` is unknown (the P0 stub) */
  heights: { formTop: number | null; fold: { ok: boolean }; sections?: readonly { type: string; top: number }[] };
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

/** Where a page shows its countdown (LD36): the urgency block in countdown mode, and the announcement bar's capsule. */
export function countdownPlaces(doc: Pick<PageDoc, "sections" | "offers">): string[] {
  const end = doc.offers.urgency.countdownEnd;
  if (!end) return [];
  const stock = (doc.offers.urgency.stockLeft ?? 0) > 0;
  const out: string[] = [];
  for (const s of doc.sections) {
    if (s.hidden) continue;
    const data = s.data as { countdown?: unknown };
    // the "stock" variant leads with the real stock and shows the timer only without it (urgency/index.tsx modeOf)
    if (s.type === "urgency" && !(s.variant === "stock" && stock)) out.push(s.id);
    else if (s.type === "announcement" && data.countdown !== false) out.push(s.id);
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function codInvariants(doc: PageDoc, inputs: CodInvariantInputs): CodInvariants {
  const visible = doc.sections.filter((s) => !s.hidden);
  const form = visible.find((s) => s.type === "orderForm");
  const top = form ? (inputs.heights.formTop ?? inputs.heights.sections?.find((s) => s.type === "orderForm")?.top ?? null) : null;
  const formScreen = top === null ? COD_NO_FORM_SCREENS : round2(top / COD_SCREEN_PX);

  const offers = visible.filter((s) => s.type === "offer");
  const lastCta = visible.map((s) => s.type).lastIndexOf("cta");
  const firstOffer = visible.findIndex((s) => s.type === "offer");
  const offerBeforeCta = offers.length <= 1 && (firstOffer < 0 || lastCta < 0 || firstOffer < lastCta);

  const deliveryLine = !inputs.zonesLine || !inputs.zonesWithLine ? "n/a" : form ? "present" : "absent";

  const wantsWhatsapp = !!doc.form.whatsapp?.enabled || visible.some((s) => s.type === "whatsappFloat");
  const hasNumber = !!inputs.whatsapp?.trim() || !!doc.form.whatsapp?.number;

  return {
    formScreen,
    ctaTargetsForm: !!form,
    offerBeforeCta,
    deliveryLine,
    whatsappConfigured: !wantsWhatsapp || hasNumber,
    urgencyReal: countdownPlaces(doc).length <= 1,
    foldOk: inputs.heights.fold.ok,
  };
}

/**
 * The `script` eval set (P7 AI; ai.md AI-§F.3 scripts row, AI-15; gates script@s1). The six script cases (address
 * modes optional / required / unset, a configured discount, a configured gift, an upsell) and the Darija-heavy stores
 * with one pack each. No input carries a customer's data; the PII sweep of test:ai checks the assembled requests.
 */
import { BrandVoice } from "@/lib/settings/keys/store_ai";
import { fixtureOf } from "../../fixture-of";
import type { FamilySet } from "../../types";
import { DARIJA_CASES, SCRIPT_CASES } from "../shared/cases";

const darijaOf = (voice: Record<string, unknown>) => BrandVoice.parse(voice).darija;

export const SET: FamilySet<"callcenter.script"> = {
  family: "script",
  task: "callcenter.script",
  fixtures: [
    ...SCRIPT_CASES.map((c) => fixtureOf(c, "script", "callcenter.script", { locale: c.locale, product: c.product, packs: c.script.packs, upsell: c.script.upsell, darija: darijaOf(c.store.voice), addressMode: c.script.addressMode })),
    ...DARIJA_CASES.map((c) =>
      fixtureOf(c, "script", "callcenter.script", { locale: c.locale, product: c.product, packs: [{ label: c.product.name, qty: 1, priceMinor: c.product.priceMinor }], upsell: null, darija: darijaOf(c.store.voice), addressMode: "optional" }, { tags: ["script"] }),
    ),
  ],
};

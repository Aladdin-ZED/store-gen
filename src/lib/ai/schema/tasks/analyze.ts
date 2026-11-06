/**
 * `analyze` (AI-04, AI-21; ai.md AI-§A.3, AI-§D.2 rule 7, AI-§D.3): photo analysis and suggested facts. The server sends
 * ≤ 3 images ≤ 1,024 px and ≤ 400 KB each (`platform_ai.vision`). `Analysis` keeps appearance only: every claim a
 * vision model reads (material, origin, certification, quantity) becomes an unticked suggested fact, never copy input
 * (rev 3, QUAL-18), so a PU bag read as "cuir véritable" reaches no page unless the owner ticks it.
 *
 * `analyzeFinalize(input)` (AI-§D.3 row): category and vibe from the closed enums; ≤ 4 colours, each a colour phrase of
 * the closed lists; `summary` and `audience` through the guard, with every claim noun and quantity of the summary (and
 * every `materials` entry) moved into `suggestedFacts`; `materials` is always empty in the merge (kept in the loose
 * schema for the local worker); `suggestedFacts` ≤ 5 × 80 chars, numbers allowed (they are unticked); `photoQuality`
 * from its enums, null when the rung did not assess it (the local worker).
 */
import { AnalysisLoose, type Analysis } from "../../copy-schema";
import { allowedNumbersFor, guardText } from "../../guard";
import { claimsIn, isColourPhrase, stripClaims, type ClaimHit, type ClaimKind } from "../../guard-claims";
import { numbersIn } from "../../guard-numbers";
import type { CopyLocale } from "./common";
import { isRecord, type Finalize } from "./types";
import type { Locale, ProductCategory } from "@/lib/page/schema";

export interface AnalyzeImage {
  mediaType: "image/webp" | "image/jpeg";
  /** base64, no data: prefix; downsized in the browser (≤ 1,024 px long side, quality 0.82) */
  data: string;
  w: number;
  h: number;
}

export interface AnalyzeInput {
  /** ≤ 3 */
  images: AnalyzeImage[];
  /** the locale of `photoQuality.advice` (the admin locale) */
  adminLocale: CopyLocale;
  /** what the owner already typed; the model never overrides the owner's category */
  product: { name: string | null; category: ProductCategory | null };
}

/** AI-21 vision QA; feeds design's slot choice and the Director's read */
export interface PhotoQuality {
  sharp: boolean;
  clutter: "none" | "some" | "heavy";
  fullBleedOk: boolean;
  cutoutViable: boolean;
  /** one plain line in the admin locale, or null */
  advice: string | null;
}

/** `Analysis & { suggestedFacts; photoQuality }` (AI-§A.3); suggestedFacts ≤ 5 × 80 chars, shown unticked; photoQuality null = not assessed */
export type AnalysisOut = Analysis & { suggestedFacts: string[]; photoQuality: PhotoQuality | null };

/** "Matière : cuir": the chip a moved claim becomes, in the chip locale. */
const CHIP_LABEL: Record<"fr" | "en" | "ar", Record<ClaimKind | "quantity", string>> = {
  fr: { material: "Matière : ", origin: "Origine : ", label: "Label : ", quantity: "Contenance : " },
  en: { material: "Material: ", origin: "Origin: ", label: "Label: ", quantity: "Size: " },
  ar: { material: "المادة: ", origin: "المصدر: ", label: "شهادة: ", quantity: "الحجم: " },
};
const chipLang = (l: Locale) => (l === "ar" ? "ar" : l === "fr" ? "fr" : "en");
/** a figure with a unit names how much there is: moved like a claim */
const QUANTITY_UNITS = new Set(["volume", "mass", "length", "count"]);

const MAX_SUGGESTED = 5;

/** The guard of `analyze`: see the file header. `input.adminLocale` is the language of the photo advice. */
export function analyzeFinalize(input: Pick<AnalyzeInput, "adminLocale">): Finalize<AnalysisOut> {
  return (raw, ctx) => {
    if (!isRecord(raw)) return null;
    const parsed = AnalysisLoose.partial({ materials: true, suggested_facts: true, photo_quality: true }).safeParse(raw);
    if (!parsed.success) return null;
    const a = parsed.data;
    const allowed = allowedNumbersFor(ctx);
    const rejected: string[] = [];
    const chips: string[] = [];
    const label = CHIP_LABEL[chipLang(ctx.locale)];
    const chip = (kind: ClaimKind | "quantity", text: string) => {
      const t = guardText(text, ctx, allowed, 80 - label[kind].length, { numbers: false, claims: false });
      if (t.ok) chips.push(label[kind] + t.text);
    };

    // the summary keeps appearance only: claims and quantities move into the chips
    const hits: ClaimHit[] = claimsIn(a.summary);
    for (const h of hits) chip(h.kind, h.text.toLowerCase().replace(/^(?:en|de|in|of|من|ب)\s+/u, ""));
    let summary = stripClaims(a.summary, hits);
    for (const t of numbersIn(summary, ctx.locale)) {
      if (!t.unit || !QUANTITY_UNITS.has(t.unit)) continue;
      chip("quantity", t.raw);
      summary = summary.replace(new RegExp(`(?:\\s(?:de|d'|of|من))?\\s*${t.raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), "");
    }
    const s = guardText(summary.replace(/\s{2,}/g, " ").trim(), ctx, allowed, 170);
    if (!s.ok && a.summary.trim()) rejected.push("summary");
    // every material a model names is a claim: a chip, never a field copy reads (dropped from the merge in R1)
    for (const m of a.materials ?? []) chip("material", m);

    const colorsDescribed: string[] = [];
    a.colors.forEach((c, i) => {
      const t = isColourPhrase(c) ? guardText(c, ctx, allowed, 24, { claims: false }) : null;
      if (t?.ok && colorsDescribed.length < 4) colorsDescribed.push(t.text);
      else rejected.push(`colors.${i}`);
    });
    const audience = guardText(a.audience, ctx, allowed, 90);
    if (!audience.ok && a.audience.trim()) rejected.push("audience");

    const suggested: string[] = [];
    const seen = new Set<string>();
    for (const f of [...chips, ...(a.suggested_facts ?? [])]) {
      const t = guardText(f, ctx, allowed, 80, { numbers: false, claims: false });
      const key = t.ok ? t.text.toLowerCase() : "";
      if (t.ok && !seen.has(key) && suggested.length < MAX_SUGGESTED) {
        seen.add(key);
        suggested.push(t.text);
      } else if (!t.ok) rejected.push("suggestedFacts");
    }

    let photoQuality: PhotoQuality | null = null;
    if (a.photo_quality) {
      const pq = a.photo_quality;
      const advice = pq.advice.trim() ? guardText(pq.advice, { ...ctx, locale: input.adminLocale }, allowed, 120) : null;
      if (advice && !advice.ok) rejected.push("photoQuality.advice");
      photoQuality = { sharp: pq.sharp, clutter: pq.clutter, fullBleedOk: pq.full_bleed_ok, cutoutViable: pq.cutout_viable, advice: advice?.ok ? advice.text : null };
    }

    return {
      value: {
        category: a.category,
        vibe: a.vibe,
        secondaryVibe: a.secondary_vibe === "none" || a.secondary_vibe === a.vibe ? null : a.secondary_vibe,
        materials: [],
        colorsDescribed,
        audience: audience.ok ? audience.text : "",
        summary: s.ok ? s.text : "",
        suggestedFacts: suggested,
        photoQuality,
      },
      rejected: [...new Set(rejected)],
    };
  };
}

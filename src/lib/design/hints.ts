/**
 * Director hints (P6 DESIGN; design.md DES-§4.6, GH-1, flag `ai_director_brief`; docs/STORE-SAAS.md §K.2 P0 design
 * stubs, CRIT2-6). A `design.plan` brief multiplies the prior of a hinted value by ≤ 3 and may pin one bold gene per
 * direction (`SampleOpts.pins`, DES N9); the solver, the gates and the novelty check still decide. P7 (merging before
 * P6) validates its briefs through `validateHints`. P0 stub: it accepts nothing and drops every entry with `why:
 * "vocab"` (no vocabulary to check against yet), so a brief changes no sample. P6 replaces the body (the GENE_VOCAB
 * check, the second-pin rule) and adds `applyHints`; the signature is frozen (src/lib/contracts/r1-p0.ts).
 */
import type { BoldGene, GeneKey, HintDropReason, SampleOpts } from "./genome";

export type GeneHints = Partial<Record<BoldGene | "G10" | "G16" | "G20", { value: string; weight: 1 | 2 | 3 }[]>>;

/** = DesignGenome.hints without `from` */
export interface HintIntake {
  accepted: GeneKey[];
  pinned: GeneKey[];
  dropped: { gene: string; value: string; why: HintDropReason }[];
}

/** One printable value of an untrusted entry (≤ 60 chars), never an object dump. */
function valueText(v: unknown): string {
  const inner = v && typeof v === "object" && "value" in v ? (v as { value: unknown }).value : v;
  return typeof inner === "string" || typeof inner === "number" || typeof inner === "boolean" ? String(inner).slice(0, 60) : "";
}

/** GENE_VOCAB check of a brief's raw hints and pin; a second pin is dropped ("second_pin"). */
export function validateHints(raw: unknown): { hints: GeneHints; pins: SampleOpts["pins"]; intake: HintIntake } {
  const dropped: HintIntake["dropped"] = [];
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [gene, entry] of Object.entries(raw as Record<string, unknown>).slice(0, 40)) {
      const values = Array.isArray(entry) ? entry : [entry];
      for (const v of values.slice(0, 12)) dropped.push({ gene: gene.slice(0, 24), value: valueText(v), why: "vocab" });
    }
  }
  return { hints: {}, pins: {}, intake: { accepted: [], pinned: [], dropped } };
}

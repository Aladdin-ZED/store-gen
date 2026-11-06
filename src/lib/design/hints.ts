/**
 * Director hints (P6 DESIGN; design.md DES-§4.6, GH-1, DS23, DS59, flag `ai_director_brief`; docs/STORE-SAAS.md §K.2 P0
 * design stubs, CRIT2-6). A `design.plan` brief multiplies the prior of a hinted value by ≤ 3 and may pin one bold gene
 * per direction (`SampleOpts.pins`, DES N9); the solver, the gates and the novelty check still decide. P7 validates its
 * briefs through `validateHints` (the signature is frozen, src/lib/contracts/r1-p0.ts).
 *
 * `validateHints` is the GENE_VOCAB check of an untrusted brief: unknown genes and values are dropped with `why:
 * "vocab"`, weights are clamped to 1-3, a value hinted twice keeps its highest weight, and only the first valid pin is
 * kept (every later one is dropped with `why: "second_pin"`). The sampler records what the hard rules, the locks and
 * the photo facts dropped (`genome.hints.dropped`, solve.ts).
 */
import type { BoldGene, GeneKey, HintDropReason, SampleOpts } from "./genome";
import type { GenePrior } from "./priors";
import { parseGeneValue } from "./vocab";

export type GeneHints = Partial<Record<BoldGene | "G10" | "G16" | "G20", { value: string; weight: 1 | 2 | 3 }[]>>;

/** = DesignGenome.hints without `from` */
export interface HintIntake {
  accepted: GeneKey[];
  pinned: GeneKey[];
  dropped: { gene: string; value: string; why: HintDropReason }[];
}

/** The genes a hint may name: the seven bold genes and the three page genes the Director may steer (DES-§4.6). */
export const HINTABLE = ["G1", "G2", "G4", "G9", "G18", "G23", "G28", "G10", "G16", "G20"] as const satisfies readonly (keyof GeneHints)[];
const BOLD = ["G1", "G2", "G4", "G9", "G18", "G23", "G28"] as const satisfies readonly BoldGene[];
/** Most hint entries read from one brief (a brief is ≤ 3 directions × a few genes). */
const MAX_GENES = 40;
const MAX_VALUES = 12;

const isHintable = (g: string): g is keyof GeneHints => (HINTABLE as readonly string[]).includes(g);
const isBold = (g: string): g is BoldGene => (BOLD as readonly string[]).includes(g);

/** One printable value of an untrusted entry (≤ 60 chars), never an object dump. */
function valueText(v: unknown): string {
  const inner = v && typeof v === "object" && "value" in v ? (v as { value: unknown }).value : v;
  return typeof inner === "string" || typeof inner === "number" || typeof inner === "boolean" ? String(inner).slice(0, 60) : "";
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** A weight 1-3 from an untrusted entry (absent = 1; out of range = clamped; not a number = null). */
function weightOf(entry: unknown): 1 | 2 | 3 | null {
  if (!isRecord(entry) || entry.weight === undefined) return 1;
  const n = Number(entry.weight);
  if (!Number.isFinite(n)) return null;
  return Math.min(3, Math.max(1, Math.round(n))) as 1 | 2 | 3;
}

/**
 * GENE_VOCAB check of a brief's raw hints and pin (DES-§4.6). Accepts the hint map itself or `{ hints, pin, pins }`:
 * `hints` maps a gene to `{ value, weight }` entries (one entry or a list; a bare string is weight 1); `pin` is ai.md's
 * `DirectionBrief.pin = { gene, value }`, `pins` a `{ [gene]: value }` record. A second pin is dropped ("second_pin").
 */
export function validateHints(raw: unknown): { hints: GeneHints; pins: SampleOpts["pins"]; intake: HintIntake } {
  const hints: GeneHints = {};
  const dropped: HintIntake["dropped"] = [];
  const pins: Partial<Record<BoldGene, string>> = {};
  if (!isRecord(raw)) return { hints, pins, intake: { accepted: [], pinned: [], dropped } };

  const map = isRecord(raw.hints) ? raw.hints : raw;
  for (const [gene, entry] of Object.entries(map).slice(0, MAX_GENES)) {
    if (map === raw && (gene === "pin" || gene === "pins")) continue;
    const list = Array.isArray(entry) ? entry : [entry];
    for (const e of list.slice(0, MAX_VALUES)) {
      const raw1 = isRecord(e) ? e.value : e;
      const value = isHintable(gene) ? parseGeneValue(gene, raw1) : null;
      const weight = weightOf(e);
      if (!isHintable(gene) || value === null || weight === null) {
        dropped.push({ gene: gene.slice(0, 24), value: valueText(e), why: "vocab" });
        continue;
      }
      const cur = (hints[gene] ??= []);
      const same = cur.find((h) => h.value === value);
      if (same) same.weight = Math.max(same.weight, weight) as 1 | 2 | 3;
      else cur.push({ value, weight });
    }
  }

  // pins: `pin: { gene, value }`, then `pins: { gene: value }`; the first valid one is kept
  const offered: { gene: string; value: unknown }[] = [];
  if (isRecord(raw.pin)) offered.push({ gene: String(raw.pin.gene ?? "").slice(0, 24), value: raw.pin.value });
  if (isRecord(raw.pins)) for (const [gene, value] of Object.entries(raw.pins).slice(0, MAX_GENES)) offered.push({ gene: gene.slice(0, 24), value });
  for (const o of offered) {
    const value = isBold(o.gene) ? parseGeneValue(o.gene, o.value) : null;
    if (!isBold(o.gene) || value === null) {
      dropped.push({ gene: o.gene, value: valueText(o.value), why: "vocab" });
      continue;
    }
    if (Object.keys(pins).length >= 1) {
      dropped.push({ gene: o.gene, value, why: "second_pin" });
      continue;
    }
    pins[o.gene] = value;
  }

  const accepted = HINTABLE.filter((g) => hints[g]?.length) as GeneKey[];
  return { hints, pins, intake: { accepted, pinned: Object.keys(pins) as GeneKey[], dropped } };
}

/**
 * Multiplies the prior of every hinted value of `gene` by its weight (≤ 3×, or ≤ `maxWeight` for the exploration
 * slot); never adds a value the prior does not carry (DES-§4.6).
 */
export function applyHints(prior: GenePrior, gene: GeneKey, hints: GeneHints | undefined, maxWeight: 1 | 2 | 3 = 3): GenePrior {
  const list = isHintable(gene) ? hints?.[gene] : undefined;
  if (!list?.length) return prior;
  const out: GenePrior = { ...prior };
  for (const h of list) if (h.value in out) out[h.value] = out[h.value]! * Math.min(h.weight, maxWeight, 3);
  return out;
}

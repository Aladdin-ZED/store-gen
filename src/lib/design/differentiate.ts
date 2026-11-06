/**
 * The `differentiate` resamples of a page (P6 DESIGN; design.md DES-§7.9 step 4, DES-§8.6, DES-§15.3, UX-24). Pure and
 * deterministic per seed: the server's exhaustion test (src/lib/design/novelty.server.ts `exhaustionTest`, seeded by
 * the page id and the pool watermark) and the Design check panel's preview call the same function.
 *
 * Up to 6 re-solved genomes spread over the bold page genes the brand and the page do not lock, in the order of
 * DES-§7.9 (G2, G18, G2, G18, then G4 and G9): each try locks every other bold gene to the page's value, moves the
 * tried gene to one of its valid next values (the prior's order, rotated by the seed) and re-solves the rest. The page's
 * rhythm genes and sections stay, and so do the costly view components (`seq`, `tags`, `openers`, `crops`): no
 * document is built, only the theme and the distance view.
 */
import { boldLocks, moodOfDoc, photosOfDoc, remixInput } from "@/lib/generator/remix";
import { deriveSeed, rngFor } from "@/lib/generator/rng";
import type { PageDoc, ThemeSpec } from "@/lib/page/schema";
import { compileGenome } from "./compile";
import { genomeOf, hasAlpha } from "./derive";
import { distanceView, type DistanceView } from "./distance";
import type { BoldGene, DesignGenome, GeneKey } from "./genome";
import { priorFor } from "./priors";
import { boldRule, factsOf, sampleGenome, type Bold } from "./solve";

export type DifferentiateGene = "G2" | "G18" | "G4" | "G9";

/** DES-§7.9 step 4: the page genes first (G2, G18), then the brand-level ones (G4, G9); ≤ 6 resamples. */
export const DIFFERENTIATE_ORDER: readonly DifferentiateGene[] = ["G2", "G18", "G2", "G18", "G4", "G9"];
export const DIFFERENTIATE_MAX = 6;

export interface DifferentiateVariant {
  gene: DifferentiateGene;
  /** the gene's new value */
  to: string;
  genome: DesignGenome;
  theme: ThemeSpec;
  /** the variant's view: its own theme and bold genes, the page's sequence, copy structure, openers and crops */
  view: DistanceView;
}

const valueOf = (g: DesignGenome, gene: DifferentiateGene) => (gene === "G4" ? g.brand.G4 : gene === "G9" ? g.brand.G9 : g.page[gene]);

/**
 * The page's differentiate variants, deterministic per (doc, seed, locks). `locked` = the brand's gene locks
 * (`brand.genes`, `brand.fonts.locked` → G4) and the page's own "Lock for this page" (`look.locks`, read here too).
 * A try the solver refuses (a hard rule under the locks, a locked colour) is spent and skipped.
 */
export function differentiateVariants(doc: PageDoc, seed: number, opts: { locked?: Iterable<string>; max?: number; base?: DistanceView } = {}): DifferentiateVariant[] {
  const g = genomeOf(doc);
  const base = opts.base ?? distanceView(g, { theme: doc.theme }, doc.locale, "page");
  const locked = new Set<string>([...(opts.locked ?? []), ...(doc.theme.look?.locks ?? [])]);
  const order = DIFFERENTIATE_ORDER.filter((gene) => !locked.has(gene)).slice(0, Math.min(DIFFERENTIATE_MAX, opts.max ?? DIFFERENTIATE_MAX));
  const { reading } = moodOfDoc(doc);
  const photos = photosOfDoc(doc);
  const tried = new Map<DifferentiateGene, number>();
  const out: DifferentiateVariant[] = [];
  const seen = new Set<string>();
  for (const gene of order) {
    const k = tried.get(gene) ?? 0;
    tried.set(gene, k + 1);
    const input = remixInput(doc, deriveSeed(seed, `differentiate:${gene}:${k}`), g);
    const facts = factsOf(input);
    const B: Bold = { G1: g.brand.G1, G2: g.page.G2, G9: g.brand.G9 };
    const current = valueOf(g, gene);
    const prior = priorFor(gene as BoldGene, { archetype: g.brand.G1, grammar: g.page.G2, alpha: hasAlpha(photos), ranked: input.ranked });
    const values = Object.keys(prior)
      .filter((v) => v !== current && !boldRule(gene as BoldGene, v, gene === "G2" ? { G1: B.G1 } : B, facts))
      .sort((x, y) => prior[y]! - prior[x]! || (x < y ? -1 : 1));
    if (!values.length) continue;
    // the seed rotates the start, the k-th try of a gene takes the next value
    const start = Math.floor(rngFor(seed, `differentiate:${gene}`)() * values.length);
    const to = values[(start + k) % values.length]!;
    // the tried gene moves; a grammar change also frees the genes that follow it (treatment, motion) unless locked
    const free: BoldGene[] = gene === "G2" ? ["G2", "G18", "G23"] : [gene];
    const locks: Partial<Record<GeneKey, string>> = boldLocks(g, free.filter((x) => !locked.has(x)));
    locks[gene] = to;
    try {
      let next = sampleGenome(input, { locks });
      if (valueOf(next, gene) !== to) continue;
      next = { ...next, page: { ...next.page, G24: g.page.G24, G32: g.page.G32, G33: g.page.G33, G34: g.page.G34, G35: g.page.G35 }, sections: g.sections };
      const compiled = compileGenome(next, { theme: doc.theme, locale: doc.locale, mood: reading.mood, photos });
      const own = distanceView(next, compiled, doc.locale, "page");
      const view: DistanceView = { ...own, seq: base.seq, tags: base.tags, openers: base.openers, crops: base.crops };
      const key = `${gene}:${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ gene, to, genome: next, theme: compiled.theme, view });
    } catch {
      // a hard rule under the locks or a locked colour the no-orange repair would move: the try is spent
    }
  }
  return out;
}

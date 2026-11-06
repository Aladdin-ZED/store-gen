/**
 * The niche-novelty corpus (P7 AI; ai.md AI-§F.3 "Niche novelty", AI-§Q.1 `test:ai:slow`, AI-02 (9); core §M.4 N8;
 * QUAL-1). Isomorphic and pure.
 *
 *   NICHE_STORES                  30 simulated stores in one niche (argan face oil), each with the hero headline and
 *                                 lead a cloud model wrote for it, and the line its one re-ask returns. Hand-authored
 *                                 for R1 (synthetic: no API key): the model converges on a few phrasings, as models do.
 *   await runNicheCorpus(stores)  publishes the stores in order: rule 13 (../router/novelty.ts) runs on each store's
 *                                 AI lines with a stub `checkHeadlineNovelty` fed the EARLIER stores' published
 *                                 shingles; returns, per published line, its origin and its share in the niche then.
 *
 * The stub follows design's DES-§9.8 contract: word 3-gram shingles (folded); `close` when the line's containment in
 * the niche's shingles is > 0.35; the band over ≥ 10 owners (null below), `high` when one of the line's shingles is
 * on > 25 % of the earlier stores' pages, `mid` above 10 %. Shingles made only of the merchant's own words (the product
 * name and facts, owner text) are not counted: N8 is about the generated wording. The engine stub writes one line per
 * store from the facts with its own tail, the lead opening on the tail (design's generator keeps each skeleton
 * ≤ 10 % of a niche).
 * The full 30-store run is `test:ai:slow`; the first six stores (the six niche fixtures) run in `test:ai-eval`.
 */
import { foldWithMap } from "../guard-claims";
import type { CopyOrigin } from "../provider/types";
import { collides, noveltyPass, type NoveltyBand, type NoveltyLine, type NoveltyVerdict } from "../router/novelty";
import type { CopyLocale } from "../prompts";

export interface NicheStore {
  index: number;
  locale: CopyLocale;
  name: string;
  facts: string[];
  headline: string;
  lead: string;
  /** what the one re-ask of each line returns (copy.field `differentiate`) */
  reask: { headline: string; lead: string };
  why: string;
}

const NAME: Readonly<Record<CopyLocale, string>> = { fr: "Huile d'Argan Visage", ar: "زيت الأركان للوجه", en: "Argan Face Oil" };
const FACT: Readonly<Record<CopyLocale, string>> = { fr: "Flacon de 50 ml", ar: "قنينة 50 مل", en: "50 ml bottle" };

/** The phrasings the model converges on, most frequent first (headline, lead). */
const POOL: Readonly<Record<CopyLocale, readonly (readonly [string, string])[]>> = {
  fr: [
    ["Une huile légère pour un visage lumineux", "Quelques gouttes le soir, sur un visage propre, puis un léger massage."],
    ["Le geste du soir pour une peau souple", "Une huile qui pénètre vite et ne laisse pas de film gras sur la peau."],
    ["Quelques gouttes pour un visage reposé", "À appliquer le soir, du bout des doigts, sur une peau propre et sèche."],
    ["Votre routine du soir, en plus simple", "Un seul flacon, un geste court, et la peau reste douce au réveil."],
  ],
  ar: [
    ["زيت خفيف لوجه مشرق", "شوية قطرات فالليل على وجه نقي، ومن بعد دلكة خفيفة."],
    ["قطرات قليلة لبشرة ناعمة", "زيت كيدخل بسرعة وما كيخليش البشرة دهنية."],
    ["روتين الليل ديالك بلا تعقيد", "قنينة وحدة وحركة قصيرة، والبشرة كتبقى ناعمة فالصباح."],
  ],
  en: [
    ["A light oil for a glowing face", "A few drops at night on a clean face, then a gentle massage."],
    ["A few drops for softer skin", "An oil that sinks in fast and leaves no greasy film behind."],
    ["Your evening routine, made simple", "One bottle, one short step, and skin still feels soft in the morning."],
  ],
};

/** What the re-ask writes: other angles, one of them as crowded as the first pick (it collides again). */
const REASK: Readonly<Record<CopyLocale, readonly (readonly [string, string])[]>> = {
  fr: [
    ["Un flacon que l'on garde près du miroir", "Une texture fluide qui se fait oublier une fois appliquée."],
    ["Une huile légère pour un visage lumineux", "Quelques gouttes le soir, sur un visage propre, puis un léger massage."],
    ["Un soin court pour finir la journée", "On l'applique en deux gestes avant de dormir, rien de plus."],
    ["Une goutte, un massage, et au lit", "Une huile fine qui laisse la peau confortable toute la nuit."],
  ],
  ar: [
    ["قنينة كتبقى حدا المراية", "تركيبة خفيفة كتنسى بلي حاطاها."],
    ["زيت خفيف لوجه مشرق", "شوية قطرات فالليل على وجه نقي، ومن بعد دلكة خفيفة."],
    ["آخر حركة فالنهار قبل النعاس", "جوج حركات قبل ما تنعس، وصافي."],
  ],
  en: [
    ["The bottle that lives by your mirror", "A fluid texture you forget once it is on."],
    ["A light oil for a glowing face", "A few drops at night on a clean face, then a gentle massage."],
    ["The last step before bed", "Two quick moves before you sleep, nothing more."],
  ],
};

const LOCALES: readonly CopyLocale[] = ["fr", "fr", "ar", "fr", "en", "ar"];
/** a skewed pick: a model converging on its favourite phrasing */
const SKEW = [0, 0, 1, 0, 2, 0, 1, 3, 0, 1, 0, 2, 0, 0, 1, 3, 0, 2, 1, 0, 0, 3, 1, 0, 2, 0, 1, 0, 3, 2] as const;
const REASK_PICK = [0, 1, 2, 3, 1, 0, 2, 1, 3, 0, 1, 2, 1, 3, 0, 1, 2, 0, 1, 3, 2, 1, 0, 1, 3, 2, 1, 0, 2, 1] as const;

export const NICHE_STORES: readonly NicheStore[] = Array.from({ length: 30 }, (_, i) => {
  const locale = i < 6 ? LOCALES[i]! : (["fr", "ar", "fr", "en"] as const)[i % 4]!;
  const pool = POOL[locale];
  const re = REASK[locale];
  const p = pool[SKEW[i]! % pool.length]!;
  const r = re[REASK_PICK[i]! % re.length]!;
  return {
    index: i + 1,
    locale,
    name: NAME[locale],
    facts: [FACT[locale]],
    headline: p[0],
    lead: p[1],
    reask: { headline: r[0], lead: r[1] },
    why: SKEW[i] === 0 ? "the model's favourite phrasing (crowds the niche)" : "a less frequent phrasing",
  };
});

/* ------------------------------------------------------------------ */
/* The stub checkHeadlineNovelty                                       */
/* ------------------------------------------------------------------ */

const words = (s: string) =>
  foldWithMap(s)
    .f.split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
/** word 3-gram shingles (a line under three words is one shingle) */
export function shinglesOf(s: string): Set<string> {
  const w = words(s);
  const out = new Set<string>();
  if (w.length > 0 && w.length < 3) out.add(w.join(" "));
  for (let i = 0; i + 2 < w.length; i++) out.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
  return out;
}

/** The niche as published so far: one shingle set per store (its published headlines and leads). */
export class NicheIndex {
  readonly stores: Set<string>[] = [];
  add(lines: readonly string[]): void {
    const s = new Set<string>();
    for (const l of lines) for (const g of shinglesOf(l)) s.add(g);
    this.stores.push(s);
  }
  /** the generated shingles of a line: the merchant's own words (name, facts) are owner text, not counted */
  private own(text: string, owner: ReadonlySet<string>): string[] {
    return [...shinglesOf(text)].filter((g) => !owner.has(g));
  }
  /** the line's highest share: the share of earlier stores carrying one of its shingles */
  share(text: string, owner: ReadonlySet<string>): number {
    const n = this.stores.length;
    if (!n) return 0;
    let max = 0;
    for (const g of this.own(text, owner)) max = Math.max(max, this.stores.filter((s) => s.has(g)).length / n);
    return max;
  }
  verdict(text: string, owner: ReadonlySet<string>): NoveltyVerdict {
    const own = this.own(text, owner);
    const union = new Set(this.stores.flatMap((s) => [...s]));
    const containment = own.length ? own.filter((g) => union.has(g)).length / own.length : 0;
    const n = this.stores.length;
    const share = this.share(text, owner);
    const band: NoveltyBand | null = n < 10 ? null : share > 0.25 ? "high" : share > 0.1 ? "mid" : "low";
    return { verdict: containment > 0.35 ? "close" : "ok", band };
  }
}

/** The engine stub: one fact-led line per store with its own tail (design's generator, origin `engine`). */
const TAIL: Readonly<Record<CopyLocale, readonly string[]>> = {
  fr: ["près du miroir", "pour le soir", "dans la trousse", "au fond du sac", "sur l'étagère", "avant le coucher", "au calme", "pour vous", "en voyage", "à portée de main", "sans détour", "pour la saison"],
  ar: ["حدا المراية", "ديال الليل", "فالصاك", "فوق الرف", "قبل النعاس", "فالسفر", "ليك نتي", "فالدار", "على راحتك", "لكل فصل"],
  en: ["by the mirror", "for the evening", "in your bag", "on the shelf", "before bed", "for travel", "within reach", "for the season", "at your pace", "for you"],
};

export interface PublishedLine {
  store: number;
  path: string;
  text: string;
  origin: CopyOrigin;
  /** its share in the niche at publish (against the earlier stores), and the band design would answer */
  share: number;
  band: NoveltyBand | null;
  close: boolean;
}

export interface CorpusRun {
  lines: PublishedLine[];
  reasked: number;
  replaced: number;
  /** cloud / local lines whose band is `high` or whose verdict is `close` at publish (must be 0) */
  hardN8: PublishedLine[];
}

/** Publishes the stores in order, rule 13 on each store's AI lines against the earlier stores. */
export async function runNicheCorpus(stores: readonly NicheStore[] = NICHE_STORES): Promise<CorpusRun> {
  const index = new NicheIndex();
  const out: CorpusRun = { lines: [], reasked: 0, replaced: 0, hardN8: [] };
  for (const s of stores) {
    const owner = new Set([s.name, ...s.facts].flatMap((t) => [...shinglesOf(t)]));
    const lines: NoveltyLine[] = [
      { path: "hero.headline", text: s.headline, origin: "cloud" },
      { path: "hero.sub", text: s.lead, origin: "cloud" },
    ];
    const tails = TAIL[s.locale];
    const r = await noveltyPass(lines, {
      check: async (texts) => texts.map((t) => index.verdict(t, owner)),
      reask: async (l) => (l.path === "hero.headline" ? s.reask.headline : s.reask.lead),
      engineLine: (l) => {
        const tail = tails[(s.index * 7 + (l.path === "hero.headline" ? 0 : 3)) % tails.length]!;
        const sep = s.locale === "ar" ? "، " : ", ";
        const fact = s.facts[0]!;
        // the lead opens on its tail, never on the name: "name, fact" would be one skeleton on every page of the niche
        return l.path === "hero.headline" ? `${fact}${sep}${tail}` : s.locale === "ar" ? `${tail}${sep}${fact}.` : `${tail.charAt(0).toUpperCase()}${tail.slice(1)}${sep}${fact.charAt(0).toLowerCase()}${fact.slice(1)}.`;
      },
      libraryLine: () => null,
    });
    out.reasked += r.reasked.length;
    out.replaced += r.replaced.length;
    const published = Object.entries(r.lines).map(([path, l]): PublishedLine => {
      const v = index.verdict(l.text, owner);
      return { store: s.index, path, text: l.text, origin: l.origin, share: index.share(l.text, owner), band: v.band, close: v.verdict === "close" };
    });
    for (const p of published) if ((p.origin === "cloud" || p.origin === "local") && collides({ verdict: p.close ? "close" : "ok", band: p.band })) out.hardN8.push(p);
    out.lines.push(...published);
    index.add(published.map((p) => p.text));
  }
  return out;
}

/**
 * Vibe engine — picks the archetype for a product (category table + photo palette + AI vibe +
 * product keywords) and produces a complete, deterministic ThemeSpec from a seed.
 *
 * Two owner rules shape every choice here (2026-10-10):
 *  - **No orange.** Accent and pop never land in the forbidden band (OKLCH hue 25–75° with chroma
 *    > 0.06): an orange product color leaves it toward crimson/berry or golden yellow (seeded for
 *    mid-band oranges), a muted tan/caramel becomes taupe/cocoa. palette.ts re-applies the gate to
 *    any spec, so hand-edited themes obey it too.
 *  - **Calm products stay calm.** A low-color photo (beige, sand, cream, gray, white, black) or a
 *    modest/devotional/baby product ranks the calm archetypes first (maison, bloom, editorial,
 *    apothecary, field, hearth — never playground; only a strong category intent such as sport or
 *    tech keeps its own language) and gets a quiet palette: a light/tinted neutral base from the
 *    product's own hue, a deep or muted accent (the product hue deepened — cocoa, ink, sage — or a
 *    dusty rose / deep plum partner), a soft pastel pop, calm motion, soft transitions, a light
 *    decorative hand. Never a vivid signature, never a dark page.
 */
import { ARCHETYPES, ProductCategory, ThemeSpec, type Archetype } from "@/lib/page/schema";
import { ARCHETYPE_DEFS, type BaseMood, type Harmony, type SurfacesKind } from "./archetypes";
import { clamp, deltaE, hueDistance, isHex, nearOrange, normHue, toOklch, uiColor, type Oklch, type OrangeSide } from "./color";
import { parseExtractedPalette } from "./extract";
import { accentPopClean, cleanAccentPop, HARMONY_RECIPES, leaveOrange, pageBackground, shapeAccent } from "./palette";
import { pick, pickWeighted, range, rngFor, shuffle } from "./rng";
import type { ArchetypeScore, ExtractedPalette, ThemeFromProductInput } from "./types";
// the Arabic proclitics stripped before stem matching: the one list of the copy normaliser (design.md DES-§9.1)
import { AR_PREFIXES } from "@/lib/design/text/normalize";

type Table = Partial<Record<Archetype, number>>;

/** How well each archetype suits a category (0..1). Unlisted archetypes get BASELINE. */
const CATEGORY_TABLE: Readonly<Record<ProductCategory, Table>> = {
  beauty: { bloom: 1, apothecary: 0.7, maison: 0.5, editorial: 0.4, playground: 0.2 },
  skincare: { apothecary: 1, bloom: 0.7, field: 0.5, maison: 0.4, editorial: 0.3 },
  haircare: { apothecary: 0.9, bloom: 0.8, field: 0.5, souk: 0.4 },
  fragrance: { maison: 1, bloom: 0.6, editorial: 0.5, souk: 0.45 },
  jewelry: { maison: 1, bloom: 0.7, editorial: 0.5, souk: 0.4 },
  watches: { maison: 1, editorial: 0.6, circuit: 0.6, garage: 0.3, kinetic: 0.3 },
  fashion: { editorial: 1, bloom: 0.7, maison: 0.6, kinetic: 0.4 },
  bags: { editorial: 0.9, maison: 0.8, bloom: 0.7, souk: 0.4 },
  health: { apothecary: 1, field: 0.6, circuit: 0.4, hearth: 0.3 },
  supplements: { apothecary: 0.9, field: 0.8, kinetic: 0.5 },
  fitness: { kinetic: 1, circuit: 0.5, garage: 0.4, apothecary: 0.3 },
  sport: { kinetic: 1, garage: 0.5, circuit: 0.4, playground: 0.3 },
  kitchen: { hearth: 1, field: 0.5, playground: 0.4, circuit: 0.4 },
  home: { hearth: 1, editorial: 0.5, field: 0.4, circuit: 0.4 },
  cleaning: { hearth: 0.9, circuit: 0.6, playground: 0.5, apothecary: 0.4 },
  decor: { souk: 0.8, hearth: 0.7, editorial: 0.7, maison: 0.5 },
  kids: { playground: 1, hearth: 0.5, bloom: 0.3 },
  toys: { playground: 1, kinetic: 0.3, circuit: 0.3 },
  pets: { playground: 0.9, hearth: 0.7, field: 0.5 },
  tech: { circuit: 1, kinetic: 0.5, editorial: 0.4, garage: 0.3 },
  gadgets: { circuit: 0.9, playground: 0.6, kinetic: 0.5, garage: 0.4 },
  car: { garage: 1, circuit: 0.8, kinetic: 0.6 },
  tools: { garage: 1, circuit: 0.5, kinetic: 0.4 },
  grooming: { garage: 0.8, maison: 0.6, apothecary: 0.6, editorial: 0.5 },
  "organic-food": { field: 1, souk: 0.7, hearth: 0.6, apothecary: 0.3 },
  traditional: { souk: 1, maison: 0.5, field: 0.5, hearth: 0.4 },
  garden: { field: 1, hearth: 0.6, garage: 0.4 },
  // "other" says little about the product: keep it flat so the photo and the AI vibe decide
  other: { editorial: 0.5, hearth: 0.4, playground: 0.35, circuit: 0.35, bloom: 0.3, field: 0.25, maison: 0.25 },
};
const BASELINE = 0.1;

/** The calm design languages: what a quiet product ranks first. */
export const CALM_ARCHETYPES: readonly Archetype[] = ["maison", "bloom", "editorial", "apothecary", "field", "hearth"];

/**
 * AI vibe keywords (English + a little French) → archetype. Words describe the PRODUCT; the archetype
 * always renders it in its modern language (a "vintage"/"handmade" product gets modern Moroccan, never
 * a scrapbook).
 */
const VIBE_WORDS: readonly [RegExp, Archetype][] = [
  [/^(luxury|luxe|luxurious|premium|elegant|elegance|chic|refined|opulent|prestige|prestigious|haute|exclusive|sophisticated)$/, "maison"],
  [/^(playful|fun|funny|cute|kid|kids|kawaii|cheerful|whimsical|toy|toys|ludique|colorful|colourful|joyful|vibrant)$/, "playground"],
  [/^(natural|nature|organic|eco|ecological|green|botanical|herbal|bio|naturel|naturelle|earthy|plant|vegan|fresh)$/, "field"],
  [/^(tech|technology|technological|modern|smart|futuristic|digital|electronic|electronics|gadget|innovative|high-tech|techy|wireless|precision|engineered)$/, "circuit"],
  [/^(sport|sports|sporty|athletic|energetic|energy|active|fitness|dynamic|performance|bold|outdoor|power|powerful|speed|fast)$/, "kinetic"],
  [/^(beauty|feminine|glam|glamorous|romantic|soft|girly|delicate|pretty|makeup|beaute|beauté|glow|glowy|radiant|dewy|glossy|modest|modesty|graceful|serene|gentle|pious|devotional|spiritual)$/, "bloom"],
  [/^(home|cozy|cosy|warm|kitchen|family|homey|homely|comfort|comfortable|domestic|maison-home|friendly)$/, "hearth"],
  [/^(heritage|traditional|tradition|artisan|artisanal|handmade|moroccan|marocain|craft|crafted|authentic|oriental|beldi|vintage)$/, "souk"],
  [/^(minimal|minimalist|clean|editorial|fashion|simple|sleek|understated|monochrome|timeless|graphic|neutral|muted|calm|quiet)$/, "editorial"],
  [/^(rugged|industrial|tough|masculine|robust|heavy-duty|utility|workshop|mechanical|durable|automotive|metal|steel)$/, "garage"],
  [/^(clinical|medical|scientific|science|pharma|pharmaceutical|dermatological|derma|dermo|lab|hygienic|wellness|care|serum|spa)$/, "apothecary"],
];

const isArchetype = (v: string): v is Archetype => (ARCHETYPES as readonly string[]).includes(v);

function vibeScores(aiVibe: string | null | undefined): Map<Archetype, string[]> {
  const out = new Map<Archetype, string[]>();
  if (!aiVibe || typeof aiVibe !== "string") return out;
  const words = aiVibe
    .slice(0, 200)
    .toLowerCase()
    .split(/[^a-zÀ-ɏ-]+/)
    .filter((w) => w.length >= 2 && w.length <= 24)
    .slice(0, 12);
  for (const w of words) {
    let hit: Archetype | null = isArchetype(w) ? w : null;
    if (!hit) for (const [re, arch] of VIBE_WORDS) if (re.test(w)) hit = arch;
    if (hit) out.set(hit, [...(out.get(hit) ?? []), w]);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Product keywords (name + tagline + description, ar / fr / en)        */
/* ------------------------------------------------------------------ */

interface KeywordGroup {
  id: string;
  /** Latin terms after accent folding ("prière" → "priere"); multi-word terms match as phrases */
  latin: readonly string[];
  /** Arabic stems after normalization (alef/ya/ta-marbuta folded, no harakat); "x$" = exact word */
  arabic: readonly string[];
  deltas: Table;
  /** the product wants a quiet, soft palette whatever its photo */
  quiet?: boolean;
}

const KEYWORD_GROUPS: readonly KeywordGroup[] = [
  {
    id: "modest",
    latin: [
      "abaya", "abaya de priere", "priere", "tenue de priere", "robe de priere", "tapis de priere", "prayer", "prayer dress", "hijab",
      "khimar", "djellaba", "jellaba", "jelaba", "djelaba", "jillaba", "kaftan", "caftan", "takchita", "jalabiya", "jalabiyya", "jilbab",
      "isdal", "niqab", "burkini", "modest", "modeste", "modesty", "pudique", "salat", "sajada", "tasbih", "chapelet", "islamique",
      "islamic", "musulmane", "muslim", "ramadan", "eid",
    ],
    arabic: ["عباي", "حجاب", "خمار", "جلاب", "جلباب", "قفطان", "اسدال", "صلاه", "نقاب", "محتشم", "طرحه", "سبحه$", "مسبحه", "مصحف", "قران$", "رمضان"],
    deltas: { bloom: 0.5, maison: 0.42, editorial: 0.34, playground: -0.6, kinetic: -0.5, garage: -0.5, circuit: -0.3 },
    quiet: true,
  },
  {
    id: "luxury",
    latin: [
      "parfum", "perfume", "fragrance", "eau de parfum", "eau de toilette", "oud", "musc", "musk", "bakhour", "bakhoor", "bukhoor",
      "encens", "luxe", "luxury", "luxueux", "luxueuse", "prestige", "bijou", "jewelry", "jewellery", "joaillerie", "montre", "watch",
      "plaque or", "diamant",
    ],
    arabic: ["عطر", "عود$", "مسك$", "بخور", "مجوهرات", "فاخر", "فخم"],
    deltas: { maison: 0.5, bloom: 0.12, editorial: 0.08, playground: -0.25, garage: -0.1 },
  },
  {
    id: "tech",
    latin: [
      "bluetooth", "wireless", "sans fil", "usb", "usb-c", "chargeur", "charger", "ecouteur", "earbuds", "airpods", "smartwatch",
      "montre connectee", "connecte", "connectee", "gadget", "led", "camera", "power bank", "powerbank", "batterie", "haut-parleur",
      "speaker", "projecteur", "drone", "gps", "wifi", "wi-fi", "hdmi", "smart",
    ],
    arabic: ["بلوتوث", "لاسلكي", "شاحن", "سماعه", "سماعات", "الكترون", "كاميرا", "ذكي$", "ذكيه$"],
    deltas: { circuit: 0.5, kinetic: 0.08 },
  },
  {
    id: "sport",
    latin: [
      "sport", "sportif", "sportive", "fitness", "gym", "musculation", "yoga", "pilates", "running", "jogging", "course a pied", "massage",
      "massager", "masseur", "pistolet de massage", "abdominaux", "cardio", "halteres", "dumbbell", "entrainement", "workout",
    ],
    arabic: ["رياضه", "رياضي", "لياقه", "تدليك", "مساج", "جيم$", "تمارين", "عضلات", "رشاقه"],
    deltas: { kinetic: 0.5, garage: 0.06 },
  },
  {
    id: "kitchen",
    latin: [
      "cuisine", "kitchen", "mixeur", "blender", "robot de cuisine", "robot culinaire", "robot patissier", "poele", "casserole", "cocotte",
      "couteau", "cafetiere", "bouilloire", "friteuse", "air fryer", "airfryer", "menage", "nettoyage", "cleaning", "aspirateur", "vacuum",
      "rangement", "organisateur", "ustensile",
    ],
    arabic: ["مطبخ", "خلاط", "طبخ", "طهي", "مقلاه", "قدر$", "طناجر", "تنظيف", "منظف"],
    deltas: { hearth: 0.5, field: 0.06 },
  },
  {
    id: "baby",
    latin: ["bebe", "baby", "babies", "nourrisson", "naissance", "biberon", "poussette", "couche", "tetine", "landau", "maternite", "newborn", "nouveau-ne", "nouveau ne"],
    arabic: ["رضيع", "رضع$", "بيبي", "حفاض", "رضاعه", "مولود", "مواليد"],
    deltas: { bloom: 0.32, hearth: 0.3, apothecary: 0.26, field: 0.1, playground: -0.4, kinetic: -0.4, garage: -0.45, circuit: -0.15 },
    quiet: true,
  },
  {
    id: "skincare",
    latin: ["serum", "skincare", "soin", "peau", "visage", "hydratant", "hydratante", "anti-age", "acne", "spf", "ecran solaire", "niacinamide", "retinol", "hyaluronique", "hyaluronic"],
    arabic: ["بشره", "كريم$", "سيروم", "ترطيب", "مرطب", "تجاعيد"],
    deltas: { apothecary: 0.45, bloom: 0.18 },
  },
  {
    id: "terroir",
    latin: ["argan", "amlou", "ghassoul", "beldi", "miel", "honey", "bio", "organique", "organic", "naturel", "naturelle", "natural", "huile"],
    arabic: ["اركان", "عسل", "طبيعي", "زيت", "املو", "غاسول", "بلدي"],
    deltas: { field: 0.35, souk: 0.28, hearth: 0.08 },
  },
];

/**
 * Lowercase, fold Latin accents (NFKD + combining marks), and normalize Arabic: harakat, hamza marks
 * and tatweel removed, alef variants → ا, ى → ي, ة → ه.
 */
function normalizeText(s: string): string {
  return s
    .slice(0, 4000)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ًͯ-ٰٟـ]/g, "")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

interface KeywordSignals {
  /** group id → matched words */
  groups: Map<string, string[]>;
  deltas: Table;
  notes: Partial<Record<Archetype, string[]>>;
  quiet: boolean;
}

function keywordSignals(text: string | null | undefined): KeywordSignals {
  const out: KeywordSignals = { groups: new Map(), deltas: {}, notes: {}, quiet: false };
  if (!text || typeof text !== "string") return out;
  const norm = normalizeText(text);
  const tokens = norm.split(/[^\p{L}\p{N}-]+/u).filter((t) => t.length >= 2 && t.length <= 40);
  const padded = ` ${tokens.join(" ")} `;
  const latinHit = (term: string) =>
    term.includes(" ") ? padded.includes(` ${term} `) : tokens.some((t) => t === term || t === `${term}s` || t === `${term}es` || t === `${term}x`);
  const arabic = tokens
    .filter((t) => /[؀-ۿ]/.test(t))
    .map((t) => [t, ...AR_PREFIXES.filter((p) => t.startsWith(p) && t.length - p.length >= 3).map((p) => t.slice(p.length))]);
  const arabicHit = (term: string) => {
    const exact = term.endsWith("$");
    const stem = exact ? term.slice(0, -1) : term;
    return arabic.some((vs) => vs.some((v) => (exact ? v === stem : v.startsWith(stem))));
  };
  for (const g of KEYWORD_GROUPS) {
    const words = [...g.latin.filter(latinHit), ...g.arabic.filter(arabicHit).map((w) => w.replace(/\$$/, ""))];
    if (words.length === 0) continue;
    out.groups.set(g.id, words.slice(0, 4));
    if (g.quiet) out.quiet = true;
    for (const [k, v] of Object.entries(g.deltas) as [Archetype, number][]) {
      out.deltas[k] = (out.deltas[k] ?? 0) + v;
      (out.notes[k] ??= []).push(`keywords ${g.id} "${words.slice(0, 3).join(", ")}" ${v > 0 ? "+" : ""}${v.toFixed(2)}`);
    }
  }
  // several groups may agree; a keyword lift never exceeds what a strong AI vibe can give
  for (const k of Object.keys(out.deltas) as Archetype[]) out.deltas[k] = Math.min(0.6, out.deltas[k]!);
  return out;
}

/* ------------------------------------------------------------------ */
/* Photo reading                                                       */
/* ------------------------------------------------------------------ */

/**
 * A calm photo: low colorfulness (mean OKLCH chroma ≤ 0.06 over the product) and no sizeable vivid
 * cluster — beige, sand, cream, ivory, gray, white, black (a beige lace abaya, a white sneaker, a
 * black bottle). The background (studio sweep) is already excluded by the extractor; skin tones
 * (chroma ≈ 0.06–0.08) do not make a photo loud.
 */
export function isCalmPalette(p: ExtractedPalette | null | undefined): boolean {
  const pal = parseExtractedPalette(p);
  if (!pal || pal.colors.length === 0) return false;
  if (pal.colorfulness > 0.3) return false;
  // a lifestyle shot is mostly scene: a vivid product (a raspberry-filled blender at 11 % of the frame)
  // is not calm even when the average is
  return !pal.colors.some((c) => (c.weight >= 0.06 && c.chroma >= 0.14) || (c.weight >= 0.1 && c.chroma >= 0.1));
}

/**
 * Whether a product should get the quiet treatment: a calm photo, or modest / devotional / baby
 * keywords (whatever the photo). Generators can use it to keep copy and decoration calm as well.
 */
export function isQuietProduct(input: { palette?: ExtractedPalette | null; keywords?: string | null }): boolean {
  return isCalmPalette(input.palette ?? null) || keywordSignals(input.keywords).quiet;
}

/** The dominant clearly-colored cluster of the photo, if any. */
function dominantColored(p: ExtractedPalette) {
  return p.colors.find((c) => c.weight >= 0.08 && c.chroma >= 0.04) ?? null;
}

function paletteAdjustments(p: ExtractedPalette, calm: boolean): { adj: Table; notes: Partial<Record<Archetype, string[]>> } {
  const adj: Table = {};
  const notes: Partial<Record<Archetype, string[]>> = {};
  const add = (why: string, deltas: Table) => {
    for (const [k, v] of Object.entries(deltas) as [Archetype, number][]) {
      adj[k] = (adj[k] ?? 0) + v;
      (notes[k] ??= []).push(`${why} ${v > 0 ? "+" : ""}${v.toFixed(2)}`);
    }
  };
  if (calm) {
    add("calm low-color photo", { maison: 0.22, bloom: 0.2, editorial: 0.2, apothecary: 0.16, hearth: 0.12, field: 0.1, circuit: -0.05, souk: -0.3, garage: -0.3, kinetic: -0.35, playground: -0.8 });
  } else if (p.colorfulness < 0.15) {
    add("near-neutral palette", { maison: 0.12, editorial: 0.12, circuit: 0.08, apothecary: 0.04, playground: -0.12 });
  }
  if (p.colorfulness > 0.55) add("vivid palette", { playground: 0.18, kinetic: 0.08, bloom: 0.05, maison: -0.1, editorial: -0.05, apothecary: -0.05 });
  if (p.brightness < 0.3) add("dark product", { maison: 0.1, garage: 0.1, circuit: 0.08, kinetic: 0.05, bloom: -0.06, hearth: -0.04 });
  if (p.brightness > 0.78) add("light product", { apothecary: 0.06, bloom: 0.04 });
  if (!calm && p.warmth > 0.35) add("warm palette", { souk: 0.1, hearth: 0.08, field: 0.04, circuit: -0.06 });
  if (p.warmth < -0.35) add("cool palette", { circuit: 0.1, apothecary: 0.05, kinetic: 0.03, souk: -0.06 });
  const dom = dominantColored(p);
  if (dom) {
    if ((dom.hue >= 340 || dom.hue <= 25) && dom.lightness > 0.55 && dom.chroma <= 0.2) add("pink tones", { bloom: 0.1 });
    if (dom.hue >= 110 && dom.hue <= 165) add("green tones", { field: 0.1, apothecary: 0.04 });
    if (!calm && dom.hue >= 60 && dom.hue <= 95 && dom.chroma <= 0.13 && dom.lightness >= 0.45 && dom.lightness <= 0.8) add("gold/amber tones", { maison: 0.05, souk: 0.06 });
  }
  return { adj, notes };
}

/** Rank archetypes for a product (category + photo palette + optional AI vibe + optional keywords). */
export function rankArchetypes(input: Omit<ThemeFromProductInput, "seed" | "archetype">): ArchetypeScore[] {
  // runtime input may come from storage or a worker: an unknown category ranks like "other"
  const category: ProductCategory = ProductCategory.safeParse(input.category).data ?? "other";
  const table = CATEGORY_TABLE[category];
  const palette = parseExtractedPalette(input.palette);
  const calm = isCalmPalette(palette);
  const pal = palette ? paletteAdjustments(palette, calm) : { adj: {} as Table, notes: {} as Partial<Record<Archetype, string[]>> };
  const vibes = vibeScores(input.aiVibe);
  const kw = keywordSignals(input.keywords);
  const quiet = calm || kw.quiet;
  return ARCHETYPES.map((a) => {
    const base = table[a] ?? BASELINE;
    // a quiet product's AI vibe only lifts the calm languages ("cute" kids abaya ≠ toy, "modern" ≠ tech)
    const words = quiet && !CALM_ARCHETYPES.includes(a) ? [] : (vibes.get(a) ?? []);
    const vibe = Math.min(0.6, words.length * 0.4);
    const score = Math.round((base + (pal.adj[a] ?? 0) + vibe + (kw.deltas[a] ?? 0)) * 1000) / 1000;
    const parts = [`${category} ${base.toFixed(2)}`, ...(pal.notes[a] ?? []), ...(kw.notes[a] ?? [])];
    if (words.length) parts.push(`AI vibe "${words.join(", ")}" +${vibe.toFixed(2)}`);
    return { archetype: a, score, reason: parts.join("; ") };
  }).sort((x, y) => y.score - x.score || ARCHETYPES.indexOf(x.archetype) - ARCHETYPES.indexOf(y.archetype));
}

/* ------------------------------------------------------------------ */
/* themeFromProduct                                                    */
/* ------------------------------------------------------------------ */

/** Most characterful significant color of the product, or null when the product is near-neutral. */
function characterful(p: ExtractedPalette | null, exclude?: Oklch): Oklch | null {
  if (!p) return null;
  const bg = p.background && isHex(p.background) ? p.background : null;
  let best: { o: Oklch; score: number } | null = null;
  for (const c of p.colors) {
    if (!isHex(c.hex) || c.weight < 0.04 || c.chroma < 0.045) continue;
    if (bg && deltaE(c.hex, bg) < 0.06) continue;
    const o = toOklch(c.hex);
    if (exclude && hueDistance(o.h, exclude.h) < 50) continue;
    const lPenalty = o.l < 0.15 || o.l > 0.95 ? 0.3 : 1;
    const score = o.c * Math.sqrt(c.weight) * lPenalty;
    if (!best || score > best.score) best = { o, score };
  }
  return best ? best.o : null;
}

/** The product's own hue on a quiet photo (beige → sand hue, gray-blue → slate), or null for true grays. */
function quietSource(p: ExtractedPalette | null): Oklch | null {
  if (!p) return null;
  const bg = p.background && isHex(p.background) ? p.background : null;
  let best: { o: Oklch; score: number } | null = null;
  for (const c of p.colors) {
    if (!isHex(c.hex) || c.weight < 0.05) continue;
    if (bg && deltaE(c.hex, bg) < 0.05) continue;
    const o = toOklch(c.hex);
    if (o.c < 0.012) continue;
    const score = Math.sqrt(c.weight) * Math.min(o.c, 0.08) * (o.l < 0.12 || o.l > 0.97 ? 0.4 : 1);
    if (!best || score > best.score) best = { o, score };
  }
  return best ? best.o : null;
}

/** Light shaping for a product's secondary color used as pop. */
function shapePop(o: Oklch): Oklch {
  return { l: clamp(o.l, 0.35, 0.9), c: clamp(o.c, 0.05, 0.24), h: o.h };
}

const hexOf = (o: Oklch) => uiColor(o);

/** ΔEOK a pop must keep from the page background (a `pop` color block) and from the accent. */
const POP_FROM_PAGE = 0.07;
const POP_FROM_ACCENT = 0.12;

/**
 * A pale pop (ice, petal, butter) on a tinted page of the same lightness turns the pop color moment
 * into "more page". When that happens, re-draw from the harmony and keep the most distinct option.
 */
function keepPopVisible(pop: Oklch, accent: Oklch, page: string, draw: (rng: () => number) => Oklch, rng: () => number): Oklch {
  const accentHex = hexOf(accent);
  const score = (o: Oklch) => {
    const h = hexOf(o);
    return Math.min(deltaE(h, page) / POP_FROM_PAGE, deltaE(h, accentHex) / POP_FROM_ACCENT);
  };
  let best = pop;
  let bestScore = score(pop);
  // harmonies pick among their two best partners, so a dozen draws all but guarantee seeing both
  for (let i = 0; i < 12 && bestScore < 1; i++) {
    const c = draw(rng);
    const s = score(c);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return best;
}

/**
 * The page blends accent and pop (the UGC ring, a fade between their blocks): a pair that rings
 * through brick or amber (crimson beside butter, gold beside rose) re-draws its pop from the harmony
 * first — a designed partner that blends cleanly and still reads apart — and otherwise takes the
 * nearest clean pair the palette engine finds (a pop leaning cool, or the accent a few degrees
 * further from the band). The spec then carries the colors the page renders.
 */
function blendCleanPair(accent: Oklch, pop: Oklch, page: string, draw: (rng: () => number) => Oklch, rng: () => number): { accent: Oklch; pop: Oklch } {
  const accentHex = hexOf(accent);
  if (accentPopClean(accentHex, hexOf(pop))) return { accent, pop };
  const visible = (o: Oklch) => {
    const h = hexOf(o);
    return deltaE(h, page) >= POP_FROM_PAGE && deltaE(h, accentHex) >= POP_FROM_ACCENT;
  };
  for (let i = 0; i < 12; i++) {
    const c = draw(rng);
    if (accentPopClean(accentHex, hexOf(c)) && visible(c)) return { accent, pop: c };
  }
  const clean = cleanAccentPop(accentHex, hexOf(pop), (a, p) => deltaE(p, page) >= POP_FROM_PAGE && deltaE(p, a) >= POP_FROM_ACCENT);
  return { accent: toOklch(clean.accent), pop: toOklch(clean.pop) };
}

/* ---- quiet palettes ------------------------------------------------ */

const Q = (h: number, l: number, c: number): Oklch => ({ h, l, c });

type QuietAccent = "own" | "plum" | "rose" | "sage" | "ink";

/** Deep / muted accent partners for quiet products — elegant, never loud. */
const QUIET_PARTNERS: Readonly<Record<Exclude<QuietAccent, "own">, Oklch>> = {
  plum: Q(350, 0.37, 0.075),
  rose: Q(12, 0.55, 0.08),
  sage: Q(152, 0.45, 0.05),
  ink: Q(255, 0.28, 0.04),
};

/** Which quiet accent each harmony favors (weights). */
const QUIET_WEIGHTS: Readonly<Record<Harmony, Readonly<Record<QuietAccent, number>>>> = {
  "mono-luxe": { own: 0.4, plum: 0.25, ink: 0.2, sage: 0.15, rose: 0 },
  "blush-berry": { own: 0.28, rose: 0.34, plum: 0.28, sage: 0.1, ink: 0 },
  "ink-accent": { own: 0.36, ink: 0.34, plum: 0.15, sage: 0.15, rose: 0 },
  "clay-sage": { own: 0.25, sage: 0.4, rose: 0.25, ink: 0.1, plum: 0 },
  "warm-butter": { own: 0.36, sage: 0.3, rose: 0.2, plum: 0.14, ink: 0 },
  "earth-triad": { own: 0.36, ink: 0.24, sage: 0.2, plum: 0.1, rose: 0.1 },
  "pop-complement": { own: 0.36, ink: 0.24, sage: 0.2, plum: 0.1, rose: 0.1 },
  "contrast-neon": { own: 0.36, ink: 0.24, sage: 0.2, plum: 0.1, rose: 0.1 },
  "cool-precise": { own: 0.36, ink: 0.24, sage: 0.2, plum: 0.1, rose: 0.1 },
};

/**
 * The product's own hue, deepened: beige/sand/khaki → mocha/cocoa (a deep yellow-beige reads olive
 * drab), gray-blue → slate ink, sage → forest; true grays → espresso. Muted by design.
 */
function ownDeep(src: Oklch | null, rng: () => number): Oklch {
  const l = range(rng, 0.34, 0.43);
  if (!src) return Q(range(rng, 52, 64), l, 0.032);
  const warmBeige = src.h >= 58 && src.h <= 112;
  const h = warmBeige ? range(rng, 54, 64) : src.h;
  const c = clamp(src.c * 1.3, 0.032, nearOrange({ l, c: 0.07, h }) || warmBeige ? 0.05 : 0.085);
  return { l, c, h };
}

/**
 * Soft pastel pops for quiet products: blush, sage mist, sand, powder — or the product's own pale
 * tint. `l` sits a clear step under the page (a pop block must read as its own band, not as more page).
 */
function quietPops(src: Oklch | null, l: number): Oklch[] {
  const own = src ? [Q(src.h, l, clamp(src.c, 0.025, 0.045))] : [];
  return [Q(14, l, 0.045), Q(152, l, 0.035), Q(84, l + 0.01, 0.042), Q(240, l + 0.01, 0.03), ...own];
}

/** Pastel lightness for a page ground: a clear step below light grounds, pale on dark pages. */
const quietPopL = (pageL: number) => (pageL < 0.5 ? 0.86 : Math.min(0.86, pageL - 0.08));

/** A soft pop that reads apart from the accent (hue) — seeded. */
function quietPop(accent: Oklch, src: Oklch | null, pageL: number, rng: () => number): Oklch {
  const all = quietPops(src, quietPopL(pageL));
  const far = all.filter((p) => accent.c < 0.03 || hueDistance(p.h, accent.h) >= 45);
  return pick(rng, far.length ? far : all);
}

function quietColors(harmony: Harmony, src: Oklch | null, pageL: number, rng: () => number): { accent: Oklch; pop: Oklch } {
  const w = QUIET_WEIGHTS[harmony];
  const choice = pickWeighted(
    rng,
    (Object.keys(w) as QuietAccent[]).map((k) => ({ value: k, weight: w[k] })),
  );
  const accent = choice === "own" ? ownDeep(src, rng) : QUIET_PARTNERS[choice];
  return { accent, pop: quietPop(accent, src, pageL, rng) };
}

/** Rotation side for an orange product color: the nearer side, seeded in the middle of the band. */
function orangeSide(o: Oklch, rng: () => number): OrangeSide | undefined {
  if (!nearOrange(o)) return undefined;
  if (o.h >= 42 && o.h <= 58) return rng() < 0.5 ? "low" : "high";
  return undefined;
}

/** Produce a complete ThemeSpec for a product — deterministic per seed. */
export function themeFromProduct(input: ThemeFromProductInput): ThemeSpec {
  const seed = Math.abs(Math.trunc(Number.isFinite(input.seed) ? input.seed : 0)) % 2_147_483_647;
  const pal = parseExtractedPalette(input.palette);
  const calm = isCalmPalette(pal);
  const modestOrBaby = keywordSignals(input.keywords).quiet;
  const ranked = rankArchetypes({ category: input.category, palette: pal, aiVibe: input.aiVibe, keywords: input.keywords });
  let archetype: Archetype = input.archetype && isArchetype(input.archetype) ? input.archetype : ranked[0]!.archetype;
  const runnerUp = ranked[1];
  if (
    !input.archetype &&
    runnerUp &&
    runnerUp.score >= ranked[0]!.score - 0.08 &&
    (!(calm || modestOrBaby) || CALM_ARCHETYPES.includes(runnerUp.archetype)) &&
    rngFor(seed, "runner-up")() < 0.35
  ) {
    archetype = runnerUp.archetype;
  }
  const d = ARCHETYPE_DEFS[archetype];
  const harmony = d.harmony;
  const recipe = HARMONY_RECIPES[harmony];
  // quiet palette: modest / devotional / baby words always; a calm photo in a calm language (a black
  // massage gun that still ranks kinetic, or black earbuds in circuit, keep their own energy — never orange)
  const quiet = modestOrBaby || (calm && CALM_ARCHETYPES.includes(archetype));

  /* base mood */
  const weights: Record<BaseMood, number> = { ...d.baseMood };
  if (quiet) {
    // calm products sit on ivory / sand / blush grounds — never a dark page
    weights.light += 0.1;
    weights.tinted += 0.25;
    weights.dark = 0;
  }
  if (pal && pal.brightness < 0.25 && archetype !== "maison") weights.dark *= 0.5; // black product on black page disappears
  if (pal && pal.brightness > 0.8 && pal.colorfulness < 0.2) {
    weights.light *= 0.55; // white product on white page
    weights.tinted *= 1.3;
  }
  const base = pickWeighted(
    rngFor(seed, "base"),
    (Object.keys(weights) as BaseMood[]).map((k) => ({ value: k, weight: weights[k] })),
  );

  /* accent + pop */
  let accent: Oklch;
  let pop: Oklch;
  let popDraw: (rng: () => number) => Oklch = (rng) => recipe.pop(accent, rng);
  let neutralSource: number | null = null;
  if (quiet) {
    const src = quietSource(pal);
    const pageL = recipe.bgL[base];
    const q = quietColors(harmony, src, pageL, rngFor(seed, "quiet"));
    accent = leaveOrange(q.accent);
    pop = leaveOrange(q.pop);
    popDraw = (rng) => quietPop(accent, src, pageL, rng);
    // the page is tinted by the product itself (ivory, sand, stone, blush) when it has a hue — a
    // peach/tan-leaning hue tints as sand (≥ 50°) or blush (< 50°), never apricot
    if (src) neutralSource = src.h >= 30 && src.h < 50 ? 18 : src.h >= 50 && src.h < 80 ? 82 : src.h;
  } else {
    const productColor = characterful(pal);
    if (productColor) {
      const sideRng = rngFor(seed, "orange-side");
      accent = shapeAccent(harmony, productColor, rngFor(seed, "accent"), orangeSide(productColor, sideRng));
      const secondary = characterful(pal, productColor);
      const popRng = rngFor(seed, "pop");
      pop = secondary && popRng() < 0.45 ? leaveOrange(shapePop(secondary), orangeSide(secondary, sideRng)) : recipe.pop(accent, popRng);
      if (deltaE(hexOf(accent), hexOf(pop)) < POP_FROM_ACCENT) pop = recipe.pop(accent, popRng);
    } else {
      const sig = pick(rngFor(seed, "signature"), d.signature);
      accent = toOklch(sig.accent);
      pop = toOklch(sig.pop);
    }
  }

  const neutralHue = Math.round(normHue((neutralSource ?? recipe.neutralHue(accent, base)) + range(rngFor(seed, "neutral"), -6, 6)));
  const page = pageBackground(harmony, base, neutralHue);
  pop = keepPopVisible(pop, accent, page, popDraw, rngFor(seed, "pop-guard"));
  ({ accent, pop } = blendCleanPair(accent, pop, page, popDraw, rngFor(seed, "pop-clean")));
  const pairing = pick(rngFor(seed, "fonts"), d.fonts);

  // modern transitions from the archetype family, its signature transition first most of the time;
  // quiet pages keep only the soft ones (no angular diagonal / steps)
  const divRng = rngFor(seed, "dividers");
  const soft = d.dividers.filter((x) => x !== "diagonal" && x !== "steps");
  const family = quiet ? (soft.length ? soft : (["fade"] as const)) : d.dividers;
  const ordered = divRng() < 0.6 ? [family[0]!, ...shuffle(divRng, family.slice(1))] : shuffle(divRng, family);
  const dividers = ordered.slice(0, Math.min(ordered.length, divRng() < 0.5 ? 2 : 3));

  // floating panels vs edge-to-edge: the archetype default, occasionally the other mode for variety
  const other: SurfacesKind = d.surfaces.kind === "panels" ? "flush" : "panels";
  const surfaces = rngFor(seed, "surfaces")() < d.surfaces.alt ? other : "archetype";

  // quiet products: calmer motion and a lighter decorative hand (≤ 0.7)
  const ornamentBase = quiet ? Math.min(d.ornament, 0.7) - 0.15 : d.ornament;
  const ornament = Math.round(clamp(ornamentBase + range(rngFor(seed, "ornament"), -0.2, 0.2), 0, quiet ? 0.7 : 2) * 10) / 10;

  return ThemeSpec.parse({
    archetype,
    seed,
    palette: { accent: hexOf(accent), pop: hexOf(pop), neutralHue, base, harmony },
    fonts: {
      display: pairing.display,
      body: pairing.body,
      ...(pairing.accent ? { accent: pairing.accent } : {}),
      displayAr: pairing.displayAr,
      bodyAr: pairing.bodyAr,
    },
    radius: "archetype",
    shadow: "archetype",
    texture: "archetype",
    surfaces,
    motion: quiet ? "calm" : d.defaultMotion,
    dividers,
    ornament,
  });
}

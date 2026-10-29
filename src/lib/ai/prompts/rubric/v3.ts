/**
 * Rubric v3, the Director's one critique standard (P7 AI; ai.md AI-§A.8.3, AI-D25, AI-§A.8.7 `system[1]`, AI-§F.1;
 * design.md DES-§8.9 "Rubric v3 precedence", DES-§10.2 pairing rules; rev 3 QUAL-11, QUAL-21). A versioned artifact of
 * its own: the Director families (`director.plan@s1`, `director.critique@s1`) embed `RUBRIC_V3.text` by import and
 * `prompt_versions.rubric_version` / `ai_runs.rubric_version` record `RUBRIC_V3.version`. An edit is a new rubric
 * version (`v4.ts`) and a new version of every Director family, gated like any prompt change (AI-§F.6): `test:ai` pins
 * the text's hash, so an edit made in place fails it.
 *
 * What the text holds, in precedence order (highest first, AI-D25):
 *   1. the owner rules (no orange: hard and deterministic, V03 on the compiled theme; modern; natural ar / fr / en;
 *      never an invented figure: hard, the guard and the INVENTED_FIGURE reservation);
 *   2. the DESIGN v3 budgets (glass, radius ladder, signature and details, bento, centred runs, bounce, kickers);
 *   3. design's gates, slop score, cliché detector and distance thresholds (the digest's numbers, the card's bands);
 *   4. the compatible items of qa/ref/anti-slop-frontend-rubric.md.
 * Then the void list (every orange-family palette row, "dark mode mandatory", the stack and stock-image sections,
 * every serif ban or default), the typography paragraph (design's DES-§10 pairing rules, which design owns: core §Q.9
 * R35; it carries no "no serif" line, QUAL-21), the eleven dimensions with their source (D / J) and their tile-only
 * parts (`R2.tiles`, `R6.tiles`, `R11.tiles`: scored only when `tilesPresent`, AI-§A.8.3 "R1 scoring without tiles"),
 * and the scoring rules finalize enforces anyway (./../../director/validate.ts): a prompt rule is never the only
 * defence.
 *
 * Written as goals and constraints, not steps (AI-§A.8.7). Plain ASCII punctuation: no em or en dash and no middle
 * dot, because the model copies what it reads. Pure and isomorphic.
 */
import { hash16 } from "@/lib/render/origin";
import { RUBRIC_DIMS, type RubricDim, type TilePart } from "../../director/types";

export const RUBRIC_VERSION = "v3" as const;

/** D = the digest and the card answer it (never contradict them); J = judgment from the cards (and tiles in R2). */
export type RubricSource = "D" | "J" | "D+J";

export interface RubricDimDef {
  name: string;
  /** what a 5 looks like */
  five: string;
  source: RubricSource;
  /** the part only a tile can show: absent from a tile-less round (`no_tiles`) */
  tilePart?: { key: TilePart; text: string };
  /** the part the card and digest answer, scored in every round (dimensions with a tile part) */
  dPart?: string;
}

/** The eleven dimensions (AI-§A.8.3 table). Keyed by `RubricDim`, so a dimension added in ./../../director/types.ts breaks `tsc` here. */
export const RUBRIC_V3_DIMS = {
  R1: {
    name: "Design read fit",
    five: "the direction fits the product, the audience, the price tier, the mood and the market; a calm or modest product gets a quiet language",
    source: "J",
  },
  R2: {
    name: "Composition",
    five: "one idea pushed hard, a focal point in every section, asymmetry when variance is above 4, nothing reads as a template block",
    source: "D+J",
    dPart: "the centred run, the layout family repetition and the alignment runs of the digest",
    tilePart: { key: "R2.tiles", text: "whether one idea is pushed hard and nothing reads as a template block, as rendered" },
  },
  R3: {
    name: "Typography",
    five: "hierarchy by scale and weight, at most 3 weights a section, balanced wraps, Arabic without tracking or uppercase, its display 6 to 10 percent larger, at least 2 words on every display line",
    source: "D+J",
  },
  R4: {
    name: "Colour",
    five: "one strategy, one accent used the same way everywhere, tinted neutrals, no pure black or white, the pop colour derived from the accent; no orange is a hard rule",
    source: "D",
  },
  R5: {
    name: "Rhythm and density",
    five: "no 3 sections of the same density in a row, no two neighbours on the same background, the kicker budget, the glass and bento budgets",
    source: "D",
  },
  R6: {
    name: "Imagery",
    five: "image-led, intentional crops, the focal point inside the inner 80 percent, a cutout where the stage asks for one, no photo used more than 3 times",
    source: "D+J",
    dPart: "the photo-plan counts and the focal boxes",
    tilePart: { key: "R6.tiles", text: "whether the image treatment works with these photos, as rendered" },
  },
  R7: {
    name: "Motion",
    five: "one easing family, motivated reveals (at most 60 on a page), reduced motion respected, no bounce outside playground",
    source: "D",
  },
  R8: {
    name: "Copy",
    five: "specific lines (at least half name something real), no cliche, at least 4 headline structures on the page, one register, natural Darija or French, no hype, no em dash, one CTA label per intent",
    source: "D+J",
  },
  R9: {
    name: "COD invariants",
    five: "the form within 3 screens of the hero CTA, the offers before the final CTA, the delivery line only when zones or a page fee exist, WhatsApp only when configured, no fake urgency",
    source: "D",
  },
  R10: {
    name: "Distinctness",
    five: "the three picks differ pairwise by at least 0.30 and from the store's recent pages; the niche's crowding respected",
    source: "D",
  },
  R11: {
    name: "Craft",
    five: "nested radii, crisp hairlines, tabular prices, optical alignment, every state designed",
    source: "D+J",
    dPart: "the token-level radii, hairlines and tabular prices",
    tilePart: { key: "R11.tiles", text: "optical alignment and craft as rendered" },
  },
} as const satisfies Record<RubricDim, RubricDimDef>;

/** One precedence level (AI-D25, DES-§8.9): the higher level wins when two sources disagree. */
export interface RubricLevel {
  id: "owner" | "budgets" | "gates" | "anti-slop";
  title: string;
  items: readonly string[];
}

export const RUBRIC_PRECEDENCE = [
  {
    id: "owner",
    title: "1. Owner rules (hard)",
    items: [
      "No orange anywhere: no colour of OKLCH hue 25 to 75 degrees with chroma above 0.06, in any role. The engine checks the compiled theme token by token (gate V03); a candidate with V03 in gates.hard is never picked. An orange product in a photo is a legitimate photo colour and never a UI accent.",
      "Maximally modern, smooth and precise. Never vintage, never a heritage or craft motif, never the generic AI look.",
      "Natural Arabic, French and English. Darija is welcome in short calls to action; French uses vous.",
      "Never an invented price, rating, stock level, review, figure or promise: the only numbers are the merchant's. The engine and the guard remove them before you see a candidate.",
    ],
  },
  {
    id: "budgets",
    title: "2. DESIGN v3 budgets",
    items: [
      "Glass on at most 2 surfaces of a page (the sticky bar and the header excluded).",
      "One radius ladder of 4 tiers (chip, control, card, media), nested radii shrinking inward.",
      "One hero signature and at most 3 secondary details on the page.",
      "Bento in at most 1 section; at most 2 centred sections in a row.",
      "Kickers on at most one in-flow section in three, never on two neighbours; every section opens with one of the openers.",
      "No bounce or overshoot easing outside the playground archetype.",
    ],
  },
  {
    id: "gates",
    title: "3. Design gates, slop score, cliche detector, distance",
    items: [
      "The engine's hard items exclude a candidate. The slop score fails at 6 or more and asks for a repair from 3 to 5.",
      "The copy cliche and specificity detector scores the generated lines; the hand-written library lines keep their typography.",
      "Distance: at least 0.25 from the platform, at least 0.40 from the niche at 20 stores or fewer (falling to 0.30 at 100 or more), at least 0.30 from the same product's last 5 pages. The card shows these as bands: ok, close, too_close.",
      "These arrive as numbers in the digest and bands on the card. They are the ground truth.",
    ],
  },
  {
    id: "anti-slop",
    title: "4. Compatible anti-slop items",
    items: [
      "One design read before anything else: Reading this as a page kind for an audience, with a vibe language.",
      "The three dials (variance, motion, density, each 1 to 10) set from that read.",
      "Anti-centre bias; one shape language and one colour logic held across the page.",
      "Button, CTA-wrap and form contrast; one CTA label per intent.",
      "The hero fits 390 by 844 with at most 2 headline lines and at most 4 text elements.",
      "Kicker restraint; no split headers; at most 2 image and text splits in a row; no layout family repeated past its cap.",
      "The copy self-audit: specific over generic, no hype, no adjective triads, no discover-the-world-of headline, no not-just-X-but-Y line.",
      "The production tells of the named-pattern list: name the one you see in the digest.",
      "No em dash or en dash in generated copy.",
    ],
  },
] as const satisfies readonly RubricLevel[];

/** The items of the anti-slop rubric that never apply here (AI-§A.8.3, DES-§8.9), with the reason the critic is given. */
export const RUBRIC_VOID = [
  "Any palette suggestion that names a colour of the orange family: owner rule 1 removes it.",
  "Dark mode as a requirement: a landing page keeps one theme.",
  "Renderer and stack advice (component libraries, CSS frameworks, animation libraries): the engine renders the page.",
  "Stock, generated or sourced imagery: only the merchant's real photos appear.",
  "Every typography rule written as a ban or a default on a type class: the paragraph below is the standard.",
  "Latin type rules applied to Arabic: Arabic keeps its own rules (no tracking, no uppercase, a display 6 to 10 percent larger than the Latin, at least 2 words on a display line, balanced wraps).",
] as const;

/**
 * The typography paragraph (QUAL-21; design's DES-§10.2 pairing rules F1-F15, H03 and the DS49 caps; design owns the
 * wording, core §Q.9 R35). A serif display is allowed when the vibe prior allows it; no type class is a default or a
 * tell, so the critic cannot push `changeGene G4` toward one class pass after pass (scorer `pickTypeClassDrift`).
 */
export const TYPOGRAPHY_PARAGRAPH = [
  "A serif, Didone or slab display is right when the vibe prior allows it and the pairing rules hold; a grotesk is not safer, and no type class is a default or a tell.",
  "The pairing rules: a serif display takes a sans body; a Latin display shares the body family only with a weight gap of 200 or more; mono faces only as an accent; an Arabic display shares the Arabic body only with a weight gap of 200 or more; playful Arabic displays only in the playground, hearth and bloom archetypes; italic emphasis only when the face ships italics; Reem Kufi, Noto Naskh Arabic and IBM Plex Sans Arabic are never an Arabic display; El Messiri pairs only with a contrast serif display; a Didone or hairline serif display needs a large display (56 px or more) and tight tracking; the Latin and the Arabic display words carry a similar ink density.",
  "Fraunces and Instrument Serif are capped by the engine, not banned: never mark a candidate down for using one.",
  "Judge hierarchy by scale and weight, at most 3 weights a section, balanced wraps, and the Arabic rules.",
].join(" ");

/** The rules finalize enforces anyway; stated so the critic does not waste output on what will be dropped. */
export const RUBRIC_SCORING = [
  "Score 0 to 5, integers. Scores and repair ops exist for the three picks only; any other candidate gets at most one issue, the reason it lost, and no op.",
  "Hard fails exclude a candidate from the pick: a design hard gate (gates.hard) or a budget marked over. A budget marked estimated sits inside the height model's error band: it is not a hard fail and never alone a reason for a repair op.",
  "Every issue carries one piece of evidence: a card id, a section index or a tile label that exists in the input, with a short quote of what the card or digest states.",
  "The digest is the ground truth. An issue that contradicts a digest number, or cites a section, card or tile that does not exist, is discarded.",
  "Without tiles (tilesPresent false) score R2, R6 and R11 from their digest parts only, leave R2.tiles, R6.tiles and R11.tiles null, and say nothing visual you have not seen.",
  "Repair ops come only from the repair vocabulary, at most three a pick, each naming a section of that candidate. An op is kept when it adds no hard item, does not raise the slop score and leaves every novelty band ok; Q may stay equal.",
  "Distinctness: the three picks differ pairwise by at least 0.30. The engine recomputes the distances from the cards; your numbers are ignored.",
] as const;

const SOURCE_TEXT: Record<RubricSource, string> = { D: "D", J: "J", "D+J": "D+J" };

/** The rubric as the Director's `system[1]` block (pure, byte-stable per version). */
export function renderRubric(): string {
  const out: string[] = [
    `# Rubric ${RUBRIC_VERSION}: the only critique standard`,
    "Judge every candidate against these goals. When two sources disagree, the higher level wins.",
  ];
  for (const level of RUBRIC_PRECEDENCE) out.push("", `## ${level.title}`, ...level.items.map((i) => `- ${i}`));
  out.push("", "## Void (never apply, never cite)", ...RUBRIC_VOID.map((i) => `- ${i}`));
  out.push("", "## Typography", TYPOGRAPHY_PARAGRAPH);
  out.push("", "## Dimensions (D: the digest and the card answer it, never contradict them. J: your judgment from the cards)");
  for (const dim of RUBRIC_DIMS) {
    const d: RubricDimDef = RUBRIC_V3_DIMS[dim];
    out.push(`${dim} ${d.name} [${SOURCE_TEXT[d.source]}]: 5 means ${d.five}.`);
    if (d.dPart) out.push(`  ${dim} in every round: ${d.dPart}.`);
    if (d.tilePart) out.push(`  ${d.tilePart.key} (tiles only): ${d.tilePart.text}.`);
  }
  out.push("", "## Scoring", ...RUBRIC_SCORING.map((i) => `- ${i}`));
  return out.join("\n");
}

const TEXT = renderRubric();

/** The tile-only parts the rubric flags, in `TILE_PARTS` order. */
const tileParts = RUBRIC_DIMS.flatMap((d) => {
  const def: RubricDimDef = RUBRIC_V3_DIMS[d];
  return def.tilePart ? [def.tilePart.key] : [];
});

export const RUBRIC_V3 = {
  version: RUBRIC_VERSION,
  text: TEXT,
  /** `hash16` of the text; `test:ai` pins it (an edit is a new rubric version) */
  hash: hash16(TEXT),
  dims: RUBRIC_V3_DIMS,
  precedence: RUBRIC_PRECEDENCE,
  void: RUBRIC_VOID,
  typography: TYPOGRAPHY_PARAGRAPH,
  scoring: RUBRIC_SCORING,
  tileParts: tileParts as readonly TilePart[],
} as const;

/** Compile-time: the tile parts the dims flag are exactly `TILE_PARTS`. */
type FlaggedTiles = (typeof RUBRIC_V3_DIMS)[keyof typeof RUBRIC_V3_DIMS] extends infer D ? (D extends { tilePart: { key: infer K } } ? K : never) : never;
const TILE_PARTS_FLAGGED: [Exclude<TilePart, FlaggedTiles>, Exclude<FlaggedTiles, TilePart>] extends [never, never] ? true : never = true;
void TILE_PARTS_FLAGGED;

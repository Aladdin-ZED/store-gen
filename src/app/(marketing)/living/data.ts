import "server-only";
/**
 * The homepage models' data (src/app/(marketing)/living/*), assembled on the server from the product's own constants
 * so the illustrations stay true by construction: the hero and the Director show three real designer seeds, the gene
 * ledger encodes each seed's real values, the console's pad is ATTEMPT_OUTCOMES in order, the roles cell is four of
 * ACTIVE_STORE_ROLES, the route's trigger rail is PURCHASE_TRIGGERS. Only plain serialisable values leave this file.
 * The only importer of src/lib/callcenter/outcomes.ts on the homepage (a server-only module).
 */
import { DIRECTOR_SLOTS, RUBRIC_DIMS, type DirectorSlot } from "@/lib/ai/director/types";
import { ACTIVE_STORE_ROLES } from "@/lib/auth/permissions";
import { ATTEMPT_OUTCOMES, type AttemptOutcome } from "@/lib/callcenter/outcomes";
import { BOLD_GENES, GENE_KEYS } from "@/lib/design/genome";
import { DESIGNER_SEEDS } from "@/lib/design/seeds";
import { GENE_VOCAB } from "@/lib/design/vocab";
import { ORDER_STATUSES } from "@/lib/orders/contract";
import { PIXEL_EVENTS } from "@/lib/pixels/ids";
import { PURCHASE_TRIGGERS } from "@/lib/pixels/server-events-shared";
import { EASE } from "@/lib/theme/archetypes";
import { SPRING_EASINGS } from "@/lib/theme/tokens";
import type { HomeRole, HomeStatus } from "../copy";
import { bezierGlyph, linearGlyph } from "./geom";

export type BoldGeneId = (typeof BOLD_GENES)[number];
export type Slot = DirectorSlot;
export type StateKind = "ok" | "wait" | "stop";

/** The seed each Director slot shows (looked up by id in DESIGNER_SEEDS). */
export const SLOT_SEEDS: Readonly<Record<Slot, string>> = {
  best_fit: "apothecary-stage",
  contrast: "editorial-editorial-column",
  explore: "apothecary-split-tension",
};

/** The hero rail, top to bottom in the order of the page parts each gene shapes (a permutation of BOLD_GENES). */
export const RAIL_ORDER: readonly BoldGeneId[] = ["G1", "G2", "G18", "G4", "G9", "G23", "G28"];

export const HOME_STATUSES: readonly HomeStatus[] = ["new", "confirmed", "in_transit", "delivered"];
export const HOME_ROLES: readonly HomeRole[] = ["owner", "manager", "editor", "agent"];

const OUTCOME_KIND: Readonly<Record<AttemptOutcome, StateKind>> = {
  confirmed: "ok",
  no_answer: "wait",
  busy: "wait",
  switched_off: "wait",
  callback: "wait",
  wrong_number: "stop",
  cancelled: "stop",
  fake: "stop",
  duplicate: "stop",
};

export interface LedgerBar {
  gene: string;
  bold: boolean;
  /** bar height for the first and second seed (user units); `known` false = a gene the seed doesn't lock */
  a: { h: number; known: boolean };
  b: { h: number; known: boolean };
}

export interface HomeData {
  slots: readonly Slot[];
  /** gene → value per slot, for the seven bold genes */
  genes: Readonly<Record<BoldGeneId, Readonly<Record<Slot, string>>>>;
  rail: readonly BoldGeneId[];
  /** the G23 family's real curve per slot, as a path in an 18×14 box */
  curves: Readonly<Record<Slot, string>>;
  /** G3 columns of the two engine seeds */
  columns: { a: number; b: number };
  ledger: readonly LedgerBar[];
  rubricDims: number;
  outcomes: readonly { id: AttemptOutcome; kind: StateKind }[];
  roles: readonly HomeRole[];
  statusesFr: Readonly<Record<HomeStatus, string>>;
  events: { lead: string; purchase: string };
  triggers: readonly string[];
}

const seedById = (id: string) => {
  const s = DESIGNER_SEEDS.find((x) => x.id === id);
  if (!s) throw new Error(`homepage: designer seed ${id} is missing`);
  return s;
};

/** A seed's value for a gene (G1 is the seed's archetype). */
export function seedValue(id: string, gene: string): string | undefined {
  const s = seedById(id);
  return gene === "G1" ? s.archetype : s.genes[gene as keyof typeof s.genes];
}

const bezierOf = (css: string) => css.match(/-?[\d.]+/g)!.slice(0, 4).map(Number) as [number, number, number, number];
const linearOf = (css: string) => css.slice(css.indexOf("(") + 1, css.lastIndexOf(")")).split(",").map(Number);

function curveFor(family: string): string {
  if (family === "expo") return bezierGlyph(bezierOf(EASE.expoOut), 18, 14);
  if (family === "quart") return bezierGlyph(bezierOf(EASE.quartOut), 18, 14);
  if (family === "critical") return linearGlyph(linearOf(SPRING_EASINGS.gentle), 12, 18, 14);
  return bezierGlyph(bezierOf(EASE.inOut), 18, 14);
}

function ledgerHeight(id: string, gene: string): { h: number; known: boolean } {
  const vocab = GENE_VOCAB[gene as keyof typeof GENE_VOCAB];
  const v = seedValue(id, gene);
  const idx = vocab.kind === "enum" && v !== undefined ? (vocab.values ?? []).indexOf(v) : -1;
  if (idx < 0) return { h: 36, known: false };
  return { h: Math.round((28 + (80 * (idx + 1)) / (vocab.values ?? []).length) * 10) / 10, known: true };
}

let cached: HomeData | null = null;

export function homeData(): HomeData {
  if (cached) return cached;
  const slots = DIRECTOR_SLOTS;
  const genes = Object.fromEntries(
    BOLD_GENES.map((g) => [g, Object.fromEntries(slots.map((s) => [s, seedValue(SLOT_SEEDS[s], g) ?? ""]))]),
  ) as unknown as HomeData["genes"];
  const fr = Object.fromEntries(ORDER_STATUSES.map((s) => [s.id, s.fr])) as Record<string, string>;
  const cols = (id: string) => Number(String(seedValue(id, "G3") ?? "12").split("/")[0]) || 12;
  cached = {
    slots,
    genes,
    rail: RAIL_ORDER,
    curves: Object.fromEntries(slots.map((s) => [s, curveFor(genes.G23[s])])) as unknown as HomeData["curves"],
    columns: { a: cols(SLOT_SEEDS.best_fit), b: cols(SLOT_SEEDS.contrast) },
    ledger: GENE_KEYS.map((g) => ({
      gene: g,
      bold: (BOLD_GENES as readonly string[]).includes(g),
      a: ledgerHeight(SLOT_SEEDS.best_fit, g),
      b: ledgerHeight(SLOT_SEEDS.contrast, g),
    })),
    rubricDims: RUBRIC_DIMS.length,
    outcomes: ATTEMPT_OUTCOMES.map((id) => ({ id, kind: OUTCOME_KIND[id] })),
    roles: HOME_ROLES.filter((r) => ACTIVE_STORE_ROLES.includes(r)),
    statusesFr: Object.fromEntries(HOME_STATUSES.map((s) => [s, fr[s] ?? s])) as Record<HomeStatus, string>,
    events: { lead: PIXEL_EVENTS.meta.lead, purchase: PIXEL_EVENTS.meta.purchase },
    triggers: PURCHASE_TRIGGERS,
  };
  return cached;
}

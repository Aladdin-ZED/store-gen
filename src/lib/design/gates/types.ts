/**
 * Design gate shapes (P6 DESIGN; design.md DES-§8.1, DES-§8.5; docs/STORE-SAAS.md §K.2 P0 design stubs, §M.1, §M.4).
 * Pure types: the gate report the render digest (`renderDigest`) and the Director cards read, typed at P0 so P7 builds
 * its Director pass against them before P6 merges; step 8 adds `GateInput` (DES-§8.1), `AssetMeta`, the store page
 * placeholders the adapter of ../gate-input.ts types against (DES-§8.13), the baseline target ids (DES-§8.10) and the
 * repair log, without re-typing the frozen exports.
 */
import type { GateId, GateSummary, OriginClass } from "@/lib/db/schema";
import type { MessageKey } from "@/lib/tenancy/types";
import type { Locale, Market, PageDoc, SectionInstance } from "@/lib/page/schema";
import type { BuiltTheme } from "@/lib/theme/types";
import type { HeightReport, VariantFeaturesResolved } from "../types.frozen";
import type { CopyReport, FactsArg } from "../cliche";
import type { DesignGenome } from "../genome";
import type { NoveltyVerdict } from "../novelty.server";
import type { RepairOp } from "./repair";

/**
 * Internal ids (V visual/structural, S slop, C copy, N novelty, T type, K colour, I imagery, R rhythm, RTL, D copy
 * honesty mirrors) and the origin classes of the core's one origin map (`originFrom(prev, doc)`, core §M.1 rule 2):
 * declared with the `design_genomes.report` shape in src/lib/db/schema.ts (0005), re-exported here.
 */
export type { GateId, GateSummary, OriginClass } from "@/lib/db/schema";

export type Register = "marketing" | "commerce" | "transactional";

/** the slop-score items (DES-§8.3) */
export type SlopId = `S${string}`;

/** The design-baseline §5 targets this part refuses or reports (DES-§8.10; `toGateItem` names them `design:<target>`). */
export const BASELINE_TARGETS = [
  "N1", "N2", "N8",
  "C2", "C4", "C5", "C6", "C7", "C8", "C9",
  "T2", "T3", "T6", "T8",
  "K3", "K4", "K5", "K6", "K7", "K8",
  "I2", "I3", "I6", "I7",
  "R2", "R3", "R6", "R7", "R8", "R9",
  "D3", "D4", "D5",
  "RTL7",
] as const;
/** the design-baseline §5 target an item enforces (DES-§8.10), e.g. "C5" */
export type BaselineTargetId = (typeof BASELINE_TARGETS)[number];

export interface DesignGateItem {
  id: GateId;
  target?: BaselineTargetId;
  level: "hard" | "soft" | "info";
  section?: string;
  field?: string;
  /** soft: points off Q; hard: 15 */
  penalty: number;
  msg: MessageKey;
  vars?: Record<string, string | number>;
  /** the one-click fix the panel offers (DES-§15.2) */
  fix?: RepairOp[];
}

export type CompositionKey = "fullBleedMoment" | "boundaryCross" | "quietScreen" | "heroTypeRatio" | "asymmetricGrid" | "distinctCrops" | "heroSignature";

export interface GateReport {
  v: 3;
  q: number;
  hard: DesignGateItem[];
  soft: DesignGateItem[];
  info: DesignGateItem[];
  slop: { score: number; items: DesignGateItem[] };
  copy: CopyReport;
  heights: HeightReport;
  ms: number;
  /** rev 3 (UX-16): 0-15, DES-§8.5 */
  composition: { score: number; items: { key: CompositionKey; points: number }[] };
}

/* ------------------------------------------------------------------ */
/* the gate input (DES-§8.1)                                           */
/* ------------------------------------------------------------------ */

/** What a gate needs to know about an asset the document references (no bytes): V11-V14, V36. */
export interface AssetMeta {
  id: string;
  width: number;
  height: number;
  alpha: boolean;
  /** the focal point 0..1 (the asset's own, else the section's AssetRef fx / fy) */
  focus?: { x: number; y: number } | null;
}

/** The store page kinds (STO-§6.2, `pages.kind`); `landing` is the R1 kind. */
export type StorePageKind = "home" | "page" | "product" | "collection" | "search" | "cart" | "checkout" | "not_found" | "policy";

/**
 * The store template document (STO-§6.2) as this part reads it: sections and locale, no theme, product, items, offers
 * or form. Storefront owns the type from R2; until its contract step this is the placeholder the adapter and the gates
 * are typed against (the structural subset storefront's type must keep), so the R2 swap is an import change.
 */
export interface StorePageDoc {
  v: 1;
  kind: StorePageKind;
  locale: Locale;
  market: Market;
  sections: SectionInstance[];
}

/** One cross-store headline verdict (DES-§9.8; the publish path passes the headline service's answer per field). */
export interface HeadlineVerdict {
  path: string;
  verdict: "ok" | "close";
  band: "low" | "mid" | "high" | null;
}

export interface GateInput {
  /** rev 3 (DS52): the union; a StorePageDoc arrives through gateInputFor (DES-§8.13) */
  doc: PageDoc | StorePageDoc;
  /** rev 3: which gate set runs (the KIND_GATES table of ../gate-input.ts) */
  kind: "landing" | StorePageKind;
  theme: BuiltTheme;
  genome: DesignGenome;
  assets: ReadonlyMap<string, AssetMeta>;
  locale: Locale;
  register: Register;
  context: "wizard" | "builder" | "save" | "remix" | "publish";
  /** per text field path: who wrote it (DES-§9.8); the core's five classes */
  origin: ReadonlyMap<string, OriginClass>;
  /** the store has real reviews / proof data (LP-02) */
  ownerProof: boolean;
  /** merchant facts, allowedNumbers, policies, delivery text (DES-§9.6) */
  facts: FactsArg;
  /** rev 2: estimateHeights() when the caller already has it (else computed) */
  heights?: HeightReport;
  /** rev 2: the bands when known (publish passes the server verdict) */
  novelty?: NoveltyVerdict | null;
  /** the headline service's verdicts per field (publish, the wizard's pre-check); absent = not checked */
  headlines?: readonly HeadlineVerdict[];
  /** the section features (a StorePageDoc: the store registry's, STO-§6.1); absent = the landing registry's */
  features?: (type: string, variant: string, data: unknown) => VariantFeaturesResolved;
}

/** One applied repair (DES-§8.6): the op, the item it answered, the item counts before and after its round. */
export interface RepairLog {
  op: RepairOp;
  item: GateId;
  before: { hard: number; slop: number; q: number };
  after: { hard: number; slop: number; q: number };
}


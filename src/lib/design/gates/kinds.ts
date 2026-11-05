/**
 * Which design gates run per page kind (P6 DESIGN; design.md DES-§8.13 point 3, DS52; the table `KIND_GATES` that
 * ../gate-input.ts exports and the core, storefront and landing cite instead of paraphrasing it). Design gates only:
 * every kind also runs the core's budget profile for its kind, landing's `landingGateItems` on the eligible sections
 * and, in R2, storefront's items, each under its owner's rules.
 */
import type { Register, StorePageKind } from "./types";

export interface KindGates {
  register: Register;
  /** the V gates that run ("all" = DES-§8.2 complete, C4 included) */
  visual: "all" | readonly string[];
  /** the slop items that count ("all" = DES-§8.3 complete) */
  slop: "all" | readonly string[];
  /** the copy gates (generated text) */
  copy: boolean;
  /** N01-N05 */
  novelty: boolean;
  /** the genome enters the novelty pool (`design_genomes` page rows) */
  pooled: boolean;
  /** glass is refused outright (the commerce clamps, DES-§11.1) */
  noGlass: boolean;
}

const COMMERCE_V = ["V01", "V02", "V03", "V04", "V05", "V06", "V07", "V11", "V12", "V16", "V17", "V18", "V21", "V23", "V23.layout", "V29", "V36", "V37", "V40"] as const;
const UTILITY_V = ["V01", "V02", "V03", "V04", "V05", "V07", "V18", "V23", "V23.layout", "V29", "V36", "V37", "V40"] as const;

export const KIND_GATES: Readonly<Record<"landing" | StorePageKind, KindGates>> = {
  landing: { register: "marketing", visual: "all", slop: "all", copy: true, novelty: true, pooled: true, noGlass: false },
  home: { register: "marketing", visual: "all", slop: "all", copy: true, novelty: true, pooled: true, noGlass: false },
  page: { register: "marketing", visual: "all", slop: "all", copy: true, novelty: true, pooled: true, noGlass: false },
  product: { register: "commerce", visual: COMMERCE_V, slop: ["S01", "S03", "S09", "S16", "S17"], copy: false, novelty: false, pooled: false, noGlass: true },
  collection: { register: "commerce", visual: COMMERCE_V, slop: ["S01", "S03", "S09", "S16", "S17"], copy: false, novelty: false, pooled: false, noGlass: true },
  search: { register: "commerce", visual: UTILITY_V, slop: ["S01", "S09"], copy: false, novelty: false, pooled: false, noGlass: false },
  cart: { register: "commerce", visual: UTILITY_V, slop: ["S01", "S09"], copy: false, novelty: false, pooled: false, noGlass: false },
  checkout: { register: "commerce", visual: UTILITY_V, slop: ["S01", "S09"], copy: false, novelty: false, pooled: false, noGlass: false },
  not_found: { register: "commerce", visual: UTILITY_V, slop: ["S01", "S09"], copy: false, novelty: false, pooled: false, noGlass: false },
  policy: { register: "transactional", visual: UTILITY_V, slop: ["S01", "S09"], copy: false, novelty: false, pooled: false, noGlass: false },
};

export const registerOfKind = (kind: "landing" | StorePageKind): Register => KIND_GATES[kind].register;

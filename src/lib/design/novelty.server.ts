import "server-only";
/**
 * The novelty service (P6 DESIGN; design.md DES-§7.4, DES-§7.9, H33, DS7; docs/STORE-SAAS.md §K.2 P0 design stubs,
 * D64). Server-only: the pooled `design_genomes` views of every store are read here and answered as bands and coarse
 * shares only (no store id, no raw count, no distance number ever leaves). Typed at P0 (src/lib/contracts/r1-p0.ts);
 * P6 replaces the bodies and adds `thresholds()`.
 *
 * P0 stubs: `checkNovelty` answers what DES-§7.4 documents for the switched-off check (`platform_design.novelty =
 * "off"`): every band `ok`, `clone = false`; `nicheShares` answers "k < 10" (n 0, empty maps), so the sampler's
 * anti-concentration rules stay neutral. Nothing is read and nothing is invented.
 */
import type { StoreScope } from "@/lib/tenancy/types";
import type { DistanceView } from "./distance";
import type { Band } from "./types";

export type NoveltyContext = "wizard" | "remix" | "studio" | "publish" | "theme";

/** ≤ 16 candidates per call (the Director budget is 12 per pass, QUAL-25) */
export interface NoveltyRequest {
  candidates: { key: string; view: DistanceView }[];
  niche: string;
  pageId?: string | null;
}

export interface NoveltyVerdict {
  key: string;
  platform: Band;
  niche: Band;
  own: Band | "first";
  clone: boolean;
}

/** value → share maps over the niche's pool rows, k ≥ 10 stores or empty, shares rounded to 10 % (DES-§7.4) */
export interface NicheShares {
  /** live stores, rounded to 10 */
  n: number;
  grammar: Record<string, number>;
  strategy: Record<string, number>;
  heroFamily: Record<string, number>;
  heroArrangement: Record<string, number>;
  displayFamily: Record<string, number>;
  arDisplay: Record<string, number>;
  arDisplayClass: Record<string, number>;
  motion: Record<string, number>;
  ghost: Record<string, number>;
  /** top 20 4-grams */
  seq4: { gram: number[]; share: number }[];
  /** device pairs */
  tells: { pair: [string, string]; share: number }[];
}

export async function checkNovelty(scope: StoreScope, req: NoveltyRequest, ctx: NoveltyContext): Promise<NoveltyVerdict[]> {
  void scope;
  void ctx;
  return req.candidates.slice(0, 16).map((c) => ({ key: c.key, platform: "ok", niche: "ok", own: "ok", clone: false }));
}

export function nicheShares(niche: string): NicheShares {
  void niche;
  return { n: 0, grammar: {}, strategy: {}, heroFamily: {}, heroArrangement: {}, displayFamily: {}, arDisplay: {}, arDisplayClass: {}, motion: {}, ghost: {}, seq4: [], tells: [] };
}

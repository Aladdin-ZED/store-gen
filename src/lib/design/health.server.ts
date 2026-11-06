import "server-only";
/**
 * The design read of Store Health (P6 DESIGN; design.md DES-§2.10, DES-§8.11, DS46; docs/STORE-SAAS.md §I.7, §K.2 P0
 * design stubs, AI R14). The `platform.health` job (P1) and the design rules (`src/lib/health/rules/design.ts`, P6)
 * call it: the store's own live `design_genomes` rows in one scoped query (≤ 40 ms), ids, `q`, `slop`, `hasLook` and
 * close pair ids only, never page text and never another store. Typed at P0 (src/lib/contracts/r1-p0.ts).
 *
 *  - one live page row per page (the newest), kind `page`;
 *  - `hasLook`: the row was read from a page with a `look` (rows of look-less pages carry `priors_v = "derived"`, the
 *    marker the listener, the save hook and the backfill write);
 *  - `closePairs`: live page pairs closer than d_page τ_own (0.30, the own-page threshold), `[older, newer]` by the
 *    row's age so the fix lands on the newer page; at most 20.
 */
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { designGenomes } from "@/lib/db/schema";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { genomeDistance, unpackView, type DistanceView } from "./distance";
import { thresholds } from "./novelty.server";

export interface DesignHealth {
  pages: { pageId: string; q: number | null; slop: number | null; hasLook: boolean; genomeId: string | null }[];
  /** live landing pairs closer than d_page 0.30 (`design:pages_close`) */
  closePairs: [string, string][];
}

/** `priors_v` of a row read from a page without `look` (DES-§23.2 `derived` rows and look-less publishes). */
export const NO_LOOK_PRIORS = "derived";
/** live rows read per store (the 600-row cap bounds a store's rows; live ones are one per published page) */
const LIVE_MAX = 300;
const PAIRS_MAX = 20;

export async function designHealth(scope: StoreScope): Promise<DesignHealth> {
  const rows = await db
    .select({ id: designGenomes.id, pageId: designGenomes.pageId, q: designGenomes.q, slop: designGenomes.slop, priorsV: designGenomes.priorsV, vec: designGenomes.vec })
    .from(designGenomes)
    .where(whereStore(designGenomes, scope, eq(designGenomes.kind, "page"), eq(designGenomes.live, true)))
    .orderBy(desc(designGenomes.createdAt), desc(designGenomes.id))
    .limit(LIVE_MAX);
  const seen = new Set<string>();
  const pages: DesignHealth["pages"] = [];
  const views: { pageId: string; view: DistanceView | null }[] = [];
  for (const r of rows) {
    if (!r.pageId || seen.has(r.pageId)) continue;
    seen.add(r.pageId);
    pages.push({ pageId: r.pageId, q: r.q ?? null, slop: r.slop ?? null, hasLook: r.priorsV !== NO_LOOK_PRIORS, genomeId: r.id });
    let view: DistanceView | null = null;
    try {
      view = unpackView(r.vec);
    } catch {
      view = null;
    }
    views.push({ pageId: r.pageId, view });
  }
  const tau = thresholds().ownPage;
  const closePairs: [string, string][] = [];
  // newest first: for i < j, page j is the older one
  for (let i = 0; i < views.length && closePairs.length < PAIRS_MAX; i++) {
    const a = views[i]!;
    if (!a.view) continue;
    for (let j = i + 1; j < views.length && closePairs.length < PAIRS_MAX; j++) {
      const b = views[j]!;
      if (b.view && a.view.kind === b.view.kind && genomeDistance(a.view, b.view, "page") < tau) closePairs.push([b.pageId, a.pageId]);
    }
  }
  return { pages, closePairs };
}

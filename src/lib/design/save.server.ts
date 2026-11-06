import "server-only";
/**
 * The draft design hook (P6 DESIGN; design.md DES-§8.7 save row, DES-§8.11, DES-§22; P0b, CCR P6-8): the builder's
 * `saveDraft` (src/lib/editor/pages.server.ts) awaits it after the draft is validated and written, in warn mode: a
 * failure is swallowed there and never fails a save. The signature is frozen (src/lib/contracts/r1-p0b-render.ts).
 *
 *  - The server recomputes the draft's gates (`runGates`, context `save`, no novelty) whatever the client sends: a
 *    client-sent `q` / `slop` is never read (DES-§22, a modified client cannot forge them).
 *  - The result goes on the page's newest `chosen` row (q, slop and the GateSummary, the generation record kept), or,
 *    for a legacy page without one, on the page's draft `derived` row (created once, never live, never pooled).
 *  - Store Health is marked dirty when Q crosses 70 or slop crosses 3 (DES-§8.11), either way.
 *  - ≤ 10 ms: three reads in parallel (the row, the facts, the asset sizes), one write. Test renders and previews
 *    never call it (D54, SF-05).
 */
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { designGenomes, type GateSummary } from "@/lib/db/schema";
import { factsFor } from "@/lib/landing/honesty/facts.server";
import { collectAssetIds } from "@/landing/context";
import type { PageDoc } from "@/lib/page/schema";
import { markHealthDirty } from "@/lib/platform/health-snapshot";
import { originFrom, type GenerationRecord } from "@/lib/render/origin";
import { storeAssetRows } from "@/lib/render/store-context.server";
import { byId, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { WriteScope } from "@/lib/tenancy/types";
import { buildTheme } from "@/lib/theme";
import { distanceView, packView } from "./distance";
import { gateInputFor } from "./gate-input";
import { runGates, summarize } from "./gates";
import { packGenome } from "./genome";
import { NO_LOOK_PRIORS } from "./health.server";
import { docNiche } from "./headlines.server";
import { bucketKey } from "./pool";

/** The Store Health lines (DES-§8.11): Q under 70 and slop at or above 3. */
export const Q_LINE = 70;
export const SLOP_LINE = 3;

/** True when a value moved across a line (either way); an unknown previous value counts as "was fine". */
export function crossed(prev: { q: number | null; slop: number | null } | null, next: { q: number; slop: number }): boolean {
  const lowBefore = prev?.q !== null && prev?.q !== undefined && prev.q < Q_LINE;
  const slopBefore = prev?.slop !== null && prev?.slop !== undefined && prev.slop >= SLOP_LINE;
  return lowBefore !== next.q < Q_LINE || slopBefore !== next.slop >= SLOP_LINE;
}

const clamp = (v: number) => Math.max(0, Math.min(127, Math.round(v)));

/** The generation record of a row's report (the shape the core's `generationRecordFor` accepts; else none). */
function genOf(report: GateSummary | null | undefined): GenerationRecord | null {
  const gen = report?.gen;
  return gen && typeof gen === "object" && !Array.isArray(gen) ? gen : null;
}

export async function recordDraftDesign(scope: WriteScope, pageId: string, doc: PageDoc): Promise<void> {
  const [rows, attested, assets] = await Promise.all([
    db
      .select({ id: designGenomes.id, source: designGenomes.source, q: designGenomes.q, slop: designGenomes.slop, report: designGenomes.report })
      .from(designGenomes)
      .where(
        whereStore(
          designGenomes,
          scope,
          eq(designGenomes.pageId, pageId),
          eq(designGenomes.kind, "page"),
          or(eq(designGenomes.source, "chosen"), and(eq(designGenomes.source, "derived"), eq(designGenomes.live, false), isNull(designGenomes.versionId))),
        ),
      )
      .orderBy(desc(designGenomes.createdAt), desc(designGenomes.id))
      .limit(4),
    factsFor(scope, pageId).catch(() => []),
    storeAssetRows(scope, collectAssetIds(doc, [])).catch(() => []),
  ]);
  const row = rows.find((r) => r.source === "chosen") ?? rows[0] ?? null;
  const gen = row?.source === "chosen" ? genOf(row.report) : null;
  const theme = buildTheme(doc.theme, doc.locale);
  const input = gateInputFor(doc, {
    kind: "landing",
    theme,
    look: doc.theme.look ?? null,
    assets: new Map(assets.map((a) => [a.id, { id: a.id, width: a.width, height: a.height, alpha: !!a.alpha }])),
    locale: doc.locale,
    context: "save",
    origin: originFrom(null, doc, gen),
    facts: { facts: attested.map((f) => f.text).filter(Boolean), productName: doc.product.name ?? null, price: doc.items[0]?.price ?? null },
    ownerProof: false,
  });
  const report = runGates(input);
  const next = { q: clamp(report.q), slop: clamp(report.slop.score) };
  const summary: GateSummary = { ...summarize(report), ...(gen ? { gen } : {}) };
  const now = new Date();
  if (row) {
    await db.update(designGenomes).set({ q: next.q, slop: next.slop, report: summary, updatedAt: now }).where(byId(designGenomes, scope, row.id));
  } else {
    // a legacy page (no wizard row): its draft `derived` row, never live and never in the pool
    const view = distanceView(input.genome, { theme: doc.theme }, doc.locale);
    const niche = docNiche(doc, { market: doc.market ?? "MA", category: null });
    await db.insert(designGenomes).values(
      storeValues(scope, {
        id: newId(),
        pageId,
        versionId: null,
        kind: "page" as const,
        source: "derived" as const,
        niche,
        bucket: bucketKey(niche, view),
        genomeV: input.genome.v,
        vec: packView(view),
        genome: packGenome(input.genome),
        seed: input.genome.seed | 0,
        priorsV: doc.theme.look ? (input.genome.priorsV ?? "p1").slice(0, 24) : NO_LOOK_PRIORS,
        firstPublishedAt: null,
        q: next.q,
        slop: next.slop,
        report: summary,
        novelty: null,
        live: false,
        pool: false,
        reservedUntil: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }
  if (crossed(row, next)) await markHealthDirty(scope.storeId);
}

/** The ids the save hook may touch: exported for `test:design-db` (a page's chosen and draft rows). */
export async function draftRows(scope: WriteScope, pageId: string) {
  return db
    .select({ id: designGenomes.id, source: designGenomes.source, q: designGenomes.q, slop: designGenomes.slop, live: designGenomes.live, pool: designGenomes.pool })
    .from(designGenomes)
    .where(whereStore(designGenomes, scope, eq(designGenomes.pageId, pageId), inArray(designGenomes.source, ["chosen", "derived"])));
}

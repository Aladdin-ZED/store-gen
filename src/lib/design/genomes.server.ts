import "server-only";
/**
 * The `design_genomes` repository (P6 DESIGN; design.md DES-§2.1, DES-§7.4, DES-§7.5, DES-§9.8, DES-§22; docs/STORE-SAAS.md
 * §E.3, D64). Server-only. Every write goes through `storeValues(scope, …)` and every read through `whereStore` /
 * `byId`: the one cross-store read of the table is the novelty pool's refresh (novelty.server.ts, annotated).
 *
 *  - Rows by source: `generated` (the directions of a wizard run the owner did not pick, never live), `chosen` (the
 *    direction that became the draft, with the generation record `report.gen`), `published` (each publish of a page
 *    version: live and in the pool), `derived` (`genomeOf` of a page published before the genome, live while it is).
 *    `bucket` = "niche|grammar|colorStrategy" (the clone partition), `vec` = the packed view plus the page's tell
 *    devices (the niche shares read them), `updated_at` set on every write (the pool's watermark).
 *  - Live flips (DES-§7.5): a publish makes its row live and moves the page's previous live row to the 30-day
 *    reservation (`live = 0`, `reserved_until = now + 30 d`, still in the pool); an unpublish does the same to the live
 *    row. `first_published_at` is copied from `pages.first_published_at`, the core column that wins on any
 *    disagreement (the novelty check reads the page's own column, never this copy, for its own page).
 *  - Own views (`ownRecent`): the store's last page rows of the sources asked for, newest first, one per page, each
 *    tagged with its product (`pages.product_id`, else the name of the product its version shows).
 *  - The 600-row cap: above it the oldest rows that are not live and not reserved go first.
 *  - Test renders and previews never call this module (D54, SF-05): only the wizard, publish and the backfill do.
 */
import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { designGenomes, pages, pageVersions, type GateSummary, type NoveltyBands, type OriginClass } from "@/lib/db/schema";
import type { PageDoc } from "@/lib/page/schema";
import { hash16, textFieldsOf } from "@/lib/render/origin";
import { byId, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import { packView, unpackView, type DistanceView } from "./distance";
import { packGenome, type DesignGenome } from "./genome";
import { bucketKey, tellsMask } from "./pool";

/** Hard cap per store (DES-§2.1, DES-§24.2). */
export const GENOME_ROWS_MAX = 600;
/** A page's previous live row stays in the pool this long (DES-§7.5). */
export const RESERVE_DAYS = 30;
/** The generation record of a `chosen` row (rev 4, read by the core's `originFrom`). */
export const GEN_RECORD_MAX_BYTES = 600;
/** Own pages read per check (DES-§7.4): the last 10 rows, one per page. */
export const OWN_RECENT = 10;

export type GenomeSource = "generated" | "chosen" | "published" | "derived";

export interface GenomeRowInput {
  pageId?: string | null;
  versionId?: string | null;
  kind?: "page" | "brand";
  niche: string;
  genome: DesignGenome;
  view: DistanceView;
  /** the S26 tell devices of the page (gates `tellDevices`), stored after the view for the niche shares */
  tells?: readonly string[];
  q?: number | null;
  slop?: number | null;
  report?: GateSummary | null;
  novelty?: NoveltyBands | null;
}

const clampByte = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(127, Math.round(v))) : null);

/** A row's values without its store (every insert wraps them in `storeValues(scope, …)`). */
function rowOf(source: GenomeSource, r: GenomeRowInput, now: Date, extra: { live?: boolean; pool?: boolean; firstPublishedAt?: Date | null } = {}) {
  return {
    id: newId(),
    pageId: r.pageId ?? null,
    versionId: r.versionId ?? null,
    kind: r.kind ?? r.view.kind,
    source,
    niche: r.niche.slice(0, 64),
    bucket: bucketKey(r.niche, r.view),
    genomeV: r.genome.v,
    vec: packView(r.view, tellsMask(r.tells ?? [])),
    genome: packGenome(r.genome),
    seed: r.genome.seed | 0,
    priorsV: (r.genome.priorsV ?? "p1").slice(0, 24),
    firstPublishedAt: extra.firstPublishedAt ?? null,
    q: clampByte(r.q),
    slop: clampByte(r.slop),
    report: r.report ?? null,
    novelty: r.novelty ?? null,
    live: extra.live ?? false,
    pool: extra.pool ?? false,
    reservedUntil: null,
    createdAt: now,
    updatedAt: now,
  };
}

/* ------------------------------------------------------------------ */
/* the generation record (DES-§9.8, rev 4)                             */
/* ------------------------------------------------------------------ */

const TITLE_FIRST = /\.(title|headline|heading|lead|subtitle|sub|intro)$/;

/**
 * `report.gen` of a chosen row: field path → `{ h: hash16(text), o }` for every field the engine or a model wrote
 * (owner-typed fields are left out: `originFrom` reads a missing path as "owner"), titles and leads first, cut to
 * ≤ 600 B as JSON.
 */
export function generationRecord(doc: PageDoc, origins: ReadonlyMap<string, OriginClass>): NonNullable<GateSummary["gen"]> {
  const fields = [...textFieldsOf(doc)].filter(([path, text]) => text.trim() && (origins.get(path) ?? "owner") !== "owner");
  fields.sort(([a], [b]) => Number(!TITLE_FIRST.test(a)) - Number(!TITLE_FIRST.test(b)));
  const out: NonNullable<GateSummary["gen"]> = {};
  let bytes = 2;
  for (const [path, text] of fields) {
    const entry = { h: hash16(text), o: origins.get(path)! };
    const add = JSON.stringify(path).length + 1 + JSON.stringify(entry).length + 1;
    if (bytes + add > GEN_RECORD_MAX_BYTES) continue;
    out[path] = entry;
    bytes += add;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* writes                                                              */
/* ------------------------------------------------------------------ */

/** The directions of a wizard run the owner did not pick (never live, never in the pool). Returns their ids. */
export async function recordGenerated(scope: WriteScope, rows: readonly GenomeRowInput[]): Promise<string[]> {
  if (!rows.length) return [];
  const now = new Date();
  const values = rows.slice(0, 16).map((r) => rowOf("generated", r, now));
  await db.insert(designGenomes).values(values.map((v) => storeValues(scope, v)));
  await enforceCap(scope);
  return values.map((v) => v.id);
}

/** The direction that became the page draft, with its generation record (`report.gen`, ≤ 600 B). */
export async function recordChosen(scope: WriteScope, row: GenomeRowInput & { pageId: string; gen?: NonNullable<GateSummary["gen"]> | null }): Promise<string> {
  const report: GateSummary = { ...(row.report ?? { v: 1, hard: [], soft: [], slop: [], copy: { cliche: 0, spec: 0 } }), ...(row.gen ? { gen: row.gen } : {}) };
  const v = rowOf("chosen", { ...row, report }, new Date());
  await db.insert(designGenomes).values(storeValues(scope, v));
  await enforceCap(scope);
  return v.id;
}

/**
 * A publish of a page version (the pre-publish listener, DES-§8.8): the page's live rows move to the 30-day
 * reservation, the new row is live and in the pool, `first_published_at` copied from the page. One transaction.
 */
export async function recordPublished(scope: WriteScope, row: GenomeRowInput & { pageId: string; versionId: string }, source: "published" | "derived" = "published"): Promise<string> {
  const now = new Date();
  const [page] = await db.select({ fpa: pages.firstPublishedAt }).from(pages).where(byId(pages, scope, row.pageId)).limit(1);
  const v = rowOf(source, row, now, { live: true, pool: true, firstPublishedAt: page?.fpa ?? null });
  await db.transaction(async (tx) => {
    await tx
      .update(designGenomes)
      .set({ live: false, pool: true, reservedUntil: reserveUntil(now), updatedAt: now })
      .where(whereStore(designGenomes, scope, eq(designGenomes.pageId, row.pageId), eq(designGenomes.live, true)));
    await tx.insert(designGenomes).values(storeValues(scope, v));
  });
  await enforceCap(scope);
  return v.id;
}

/** A page unpublished, archived or deleted: its live row leaves live for the 30-day reservation (DES-§7.5). */
export async function releasePage(scope: WriteScope, pageId: string): Promise<number> {
  const now = new Date();
  const res = await db
    .update(designGenomes)
    .set({ live: false, pool: true, reservedUntil: reserveUntil(now), updatedAt: now })
    .where(whereStore(designGenomes, scope, eq(designGenomes.pageId, pageId), eq(designGenomes.live, true)));
  return affected(res);
}

/** The novelty bands shown to the owner, stored on the row they judged (DS27). */
export async function setNoveltyBands(scope: WriteScope, id: string, bands: NoveltyBands): Promise<void> {
  await db.update(designGenomes).set({ novelty: bands, updatedAt: new Date() }).where(byId(designGenomes, scope, id));
}

const reserveUntil = (now: Date) => new Date(now.getTime() + RESERVE_DAYS * 86_400_000);
const affected = (res: unknown) => Number((Array.isArray(res) ? (res[0] as { affectedRows?: number }) : (res as { affectedRows?: number }))?.affectedRows ?? 0);

/**
 * The 600-row cap (DES-§2.1): above it the store's oldest rows that are neither live nor reserved are deleted
 * (`generated` first by age, then the rest). Returns the rows deleted.
 */
export async function enforceCap(scope: WriteScope, max = GENOME_ROWS_MAX): Promise<number> {
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(designGenomes).where(whereStore(designGenomes, scope));
  const excess = Number(n) - max;
  if (excess <= 0) return 0;
  const victims = await db
    .select({ id: designGenomes.id })
    .from(designGenomes)
    .where(whereStore(designGenomes, scope, eq(designGenomes.live, false), sql`(${designGenomes.reservedUntil} IS NULL OR ${designGenomes.reservedUntil} < UTC_TIMESTAMP(3))`))
    .orderBy(sql`(${designGenomes.source} = 'generated') DESC`, asc(designGenomes.createdAt), asc(designGenomes.id))
    .limit(excess);
  if (!victims.length) return 0;
  await db.delete(designGenomes).where(whereStore(designGenomes, scope, inArray(designGenomes.id, victims.map((v) => v.id))));
  return victims.length;
}

/* ------------------------------------------------------------------ */
/* reads                                                               */
/* ------------------------------------------------------------------ */

export interface OwnRow {
  id: string;
  pageId: string;
  source: GenomeSource;
  live: boolean;
  /** `p:<products id>` or `n:<normalised product name>`; null when neither is known */
  product: string | null;
  view: DistanceView;
  createdAt: Date;
}

/** A product's comparison key: its products row when the page names one (R2), else its normalised name. */
export function productKey(productId: string | null | undefined, name: string | null | undefined): string | null {
  if (productId) return `p:${productId}`;
  const n = (name ?? "").normalize("NFKC").toLowerCase().replace(/[\s\p{P}]+/gu, " ").trim();
  return n ? `n:${n.slice(0, 120)}` : null;
}

/**
 * The store's recent page rows (DES-§7.4, `dg_store_kind_idx`), newest first, the newest row per page only, at most
 * `limit` pages; `excludePageId` leaves a page out (a page is never compared with its own versions).
 */
export async function ownRecent(scope: StoreScope, opts: { excludePageId?: string | null; sources?: readonly GenomeSource[]; limit?: number } = {}): Promise<OwnRow[]> {
  const limit = Math.max(1, Math.min(50, opts.limit ?? OWN_RECENT));
  const sources = opts.sources?.length ? [...opts.sources] : (["published", "chosen"] as GenomeSource[]);
  const rows = await db
    .select({
      id: designGenomes.id,
      pageId: designGenomes.pageId,
      source: designGenomes.source,
      live: designGenomes.live,
      vec: designGenomes.vec,
      createdAt: designGenomes.createdAt,
      productId: pages.productId,
      productName: sql<string | null>`JSON_UNQUOTE(JSON_EXTRACT(${pageVersions.doc}, '$.product.name'))`,
    })
    .from(designGenomes)
    .leftJoin(pages, and(eq(pages.id, designGenomes.pageId), eq(pages.storeId, designGenomes.storeId)))
    .leftJoin(pageVersions, and(eq(pageVersions.id, designGenomes.versionId), eq(pageVersions.storeId, designGenomes.storeId)))
    .where(
      whereStore(
        designGenomes,
        scope,
        eq(designGenomes.kind, "page"),
        inArray(designGenomes.source, sources),
        sql`${designGenomes.pageId} IS NOT NULL`,
        opts.excludePageId ? ne(designGenomes.pageId, opts.excludePageId) : undefined,
      ),
    )
    .orderBy(desc(designGenomes.createdAt), desc(designGenomes.id))
    .limit(limit * 4);
  const out: OwnRow[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.pageId || seen.has(r.pageId)) continue;
    let view: DistanceView;
    try {
      view = unpackView(r.vec);
    } catch {
      continue;
    }
    seen.add(r.pageId);
    out.push({ id: r.id, pageId: r.pageId, source: r.source as GenomeSource, live: !!r.live, product: productKey(r.productId, r.productName), view, createdAt: r.createdAt });
    if (out.length >= limit) break;
  }
  return out;
}

/** A page's product key and first publish (`pages.first_published_at`, the core column), through the scope. */
export async function pageFacts(scope: StoreScope, pageId: string): Promise<{ product: string | null; firstPublishedAt: Date | null } | null> {
  const [row] = await db
    .select({ productId: pages.productId, fpa: pages.firstPublishedAt, name: sql<string | null>`JSON_UNQUOTE(JSON_EXTRACT(${pages.draft}, '$.product.name'))` })
    .from(pages)
    .where(byId(pages, scope, pageId))
    .limit(1);
  return row ? { product: productKey(row.productId, row.name), firstPublishedAt: row.fpa ?? null } : null;
}

/** The store's rows of one page (newest first), for the Design check panel and the tests. */
export async function pageGenomes(scope: StoreScope, pageId: string, limit = 20) {
  return db
    .select({ id: designGenomes.id, source: designGenomes.source, live: designGenomes.live, pool: designGenomes.pool, novelty: designGenomes.novelty, q: designGenomes.q, slop: designGenomes.slop, createdAt: designGenomes.createdAt })
    .from(designGenomes)
    .where(whereStore(designGenomes, scope, eq(designGenomes.pageId, pageId)))
    .orderBy(desc(designGenomes.createdAt), desc(designGenomes.id))
    .limit(Math.max(1, Math.min(100, limit)));
}

/** The purge (core §F.9): every row of the store. */
export async function purgeGenomes(scope: WriteScope): Promise<number> {
  return affected(await db.delete(designGenomes).where(whereStore(designGenomes, scope)));
}

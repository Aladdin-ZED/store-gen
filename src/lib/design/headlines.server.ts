import "server-only";
/**
 * The cross-store headline check (P6 DESIGN; design.md DES-§2.2, DES-§9.8, N8, DS7, DES-§22; docs/STORE-SAAS.md §K.2
 * P0 design stubs, §M.4, D35, §F.9). Server-only.
 *
 * `headline_shingles` holds, per (niche_key, owner_tag), the bottom 256 keyed hashes of the shingles of a store's live
 * page titles and leads (generated and owner-typed alike: the check must see owner copy another store could lift).
 * There is no store id: `owner_tag` = hmac(storeId, "shingle-owner")[:16] (D35), never returned by any API.
 *
 *  - `checkHeadlineNovelty(scope, niche, texts)` (frozen signature): per line, `close` when another owner's sketch
 *    contains > 35 % of the line's shingles (bottom-k containment, τ_B = B's largest hash when B holds 256 rows), and
 *    the share band of the niche's owners whose sketch holds any of the line's shingles, over ≥ 10 owners (else
 *    null): `low` ≤ 10 %, `mid` 10-25 %, `high` > 25 %. Never an owner tag, a count or a number in the answer.
 *  - `syncShingles(scope, niche)`: rewrites the store's rows of one niche from its live pages (publish, unpublish):
 *    one DELETE by (niche_key, owner_tag) plus one insert of ≤ 256 rows.
 *  - `purgeHeadlineShingles(scope)`: the purge job's delete by owner tag (core §F.9).
 *
 * The product name is masked (`§p`) on both sides: callers pass lines with the name replaced by `{product}`, as the
 * engine composes them; the sync masks each page's own name.
 */
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { copyFamily } from "@/lib/ai/copy-library";
import { db } from "@/lib/db/client";
import { headlineShingles, pages, pageVersions, stores } from "@/lib/db/schema";
import type { PageDoc } from "@/lib/page/schema";
import { textFieldsOf } from "@/lib/render/origin";
import { hmac } from "@/lib/security/crypto";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import { nicheKey } from "./distance";
import { bottomK, SKETCH_K } from "./text/minhash";
import { guessLocale } from "./text/normalize";
import { shingles } from "./text/shingles";

export type HeadlineVerdict = { verdict: "ok" | "close"; band: "low" | "mid" | "high" | null };

/** The action's limits (src/lib/design/actions.ts): ≤ 60 lines per call, 60 calls / 10 min per store (DES-§9.8). */
export const HEADLINE_LINES_MAX = 60;
export const HEADLINE_RATE = { name: "design:headlines", limit: 60, windowSec: 600, per: "store" } as const;
/** containment above this is `close` (DES-§9.8) */
export const CLOSE_CONTAINMENT = 0.35;
/** the share band needs this many other owners in the niche (rev 4, DS7: k ≥ 10) */
export const BAND_MIN_OWNERS = 10;

const NICHE = /^[A-Z]{2,8}:[a-z][a-z0-9-]{0,39}$/;

/** D35: the store's pseudonymous tag in the platform table. */
export function ownerTagFor(storeId: string): string {
  return hmac(storeId, "shingle-owner").slice(0, 16);
}

/** The keyed hash of one shingle: HMAC-SHA256 with HKDF(APP_SECRET, "cod-studio", "headline-shingle:v1"), 16 hex. */
export function shingleHash(niche: string, shingle: string): string {
  return hmac(`${niche}\u0000${shingle}`, "headline-shingle:v1").slice(0, 16);
}

/** A line's keyed shingle hashes (the product name masked when the caller wrote `{product}` or gave the name). */
function lineHashes(niche: string, text: string, product?: string | null): string[] {
  const l = guessLocale(text);
  return [...new Set(shingles(text, l, { product: product ?? null }).map((s) => shingleHash(niche, s)))];
}

/** The share band of DES-§9.8 (rev 4): a band only, over ≥ 10 owners. */
export function shareBand(matching: number, owners: number): HeadlineVerdict["band"] {
  if (owners < BAND_MIN_OWNERS) return null;
  const share = matching / owners;
  return share <= 0.1 ? "low" : share <= 0.25 ? "mid" : "high";
}

/** ≤ 60 lines per call (the action enforces it), one verdict per line in order. */
export async function checkHeadlineNovelty(scope: StoreScope, niche: string, texts: readonly string[]): Promise<HeadlineVerdict[]> {
  const lines = texts.slice(0, HEADLINE_LINES_MAX);
  const empty = (): HeadlineVerdict[] => texts.map(() => ({ verdict: "ok", band: null }));
  if (!NICHE.test(niche) || !lines.length) return empty();
  const own = ownerTagFor(scope.storeId);
  const perLine = lines.map((t) => lineHashes(niche, t));
  const all = [...new Set(perLine.flat())];
  if (!all.length) return empty();
  // the other owners' rows holding any candidate hash (one query), then their sketch size and threshold
  const hits = await db
    .select({ owner: headlineShingles.ownerTag, hash: headlineShingles.hash })
    .from(headlineShingles)
    .where(and(eq(headlineShingles.nicheKey, niche), inArray(headlineShingles.hash, all), ne(headlineShingles.ownerTag, own)));
  const [{ owners } = { owners: 0 }] = await db
    .select({ owners: sql<number>`COUNT(DISTINCT ${headlineShingles.ownerTag})` })
    .from(headlineShingles)
    .where(and(eq(headlineShingles.nicheKey, niche), ne(headlineShingles.ownerTag, own)));
  const byOwner = new Map<string, Set<string>>();
  for (const h of hits) byOwner.set(h.owner, (byOwner.get(h.owner) ?? new Set()).add(h.hash));
  const stats = new Map<string, { n: number; tau: string | null }>();
  if (byOwner.size) {
    const rows = await db
      .select({ owner: headlineShingles.ownerTag, n: sql<number>`COUNT(*)`, max: sql<string>`MAX(${headlineShingles.hash})` })
      .from(headlineShingles)
      .where(and(eq(headlineShingles.nicheKey, niche), inArray(headlineShingles.ownerTag, [...byOwner.keys()])))
      .groupBy(headlineShingles.ownerTag);
    for (const r of rows) stats.set(r.owner, { n: Number(r.n), tau: Number(r.n) >= SKETCH_K ? r.max : null });
  }
  const verdicts = perLine.map((hashes): HeadlineVerdict => {
    if (!hashes.length) return { verdict: "ok", band: shareBand(0, Number(owners)) };
    let close = false;
    let matching = 0;
    for (const [owner, held] of byOwner) {
      const matched = hashes.filter((h) => held.has(h)).length;
      if (!matched) continue;
      matching++;
      // an owner needs ≥ 3 matched shingles (or every shingle of a short line) before containment counts
      if (matched < Math.min(3, hashes.length)) continue;
      const tau = stats.get(owner)?.tau ?? null;
      const under = hashes.filter((h) => tau === null || h <= tau).length;
      if (under > 0 && matched / under > CLOSE_CONTAINMENT) close = true;
    }
    return { verdict: close ? "close" : "ok", band: shareBand(matching, Number(owners)) };
  });
  return [...verdicts, ...texts.slice(HEADLINE_LINES_MAX).map((): HeadlineVerdict => ({ verdict: "ok", band: null }))];
}

const TITLE_KEY = /^[^.]+\.(title|headline|heading)$/;
const LEAD_KEY = /^[^.]+\.(lead|subtitle|sub|intro|description)$/;

/** The titles and leads of one document (top-level section fields), with their kind. */
export function headlineFieldsOf(doc: PageDoc): { text: string; kind: "title" | "lead" }[] {
  const out: { text: string; kind: "title" | "lead" }[] = [];
  for (const [path, text] of textFieldsOf(doc)) {
    if (!text.trim()) continue;
    if (TITLE_KEY.test(path)) out.push({ text, kind: "title" });
    else if (LEAD_KEY.test(path)) out.push({ text, kind: "lead" });
  }
  return out;
}

/** The niche of a live document (DES-§7.3): the store's category when set, else the product's copy family. */
export function docNiche(doc: PageDoc, store: { market: string; category: string | null }): string {
  const family = copyFamily({ category: doc.product.category, productName: doc.product.name, keywords: doc.product.tagline ?? null }).family;
  return nicheKey(doc.market ?? store.market, store.category, family);
}

/** The bottom-256 rows of a set of documents (titles win the kind when a hash is in both). */
export function sketchRows(niche: string, docs: readonly PageDoc[]): { hash: string; kind: "title" | "lead" }[] {
  const kind = new Map<string, "title" | "lead">();
  for (const doc of docs)
    for (const f of headlineFieldsOf(doc))
      for (const s of shingles(f.text, guessLocale(f.text), { product: doc.product.name })) {
        const h = shingleHash(niche, s);
        if (kind.get(h) !== "title") kind.set(h, f.kind);
      }
  return bottomK(kind.keys(), SKETCH_K).map((hash) => ({ hash, kind: kind.get(hash)! }));
}

/**
 * Rewrite the store's rows of one niche from its live pages (DES-§2.2; publish and unpublish call it): one DELETE by
 * (niche_key, owner_tag), one multi-row insert of ≤ 256 rows. Returns the row count written.
 */
export async function syncShingles(scope: WriteScope, niche: string): Promise<number> {
  if (!NICHE.test(niche)) return 0;
  const [store] = await db.select({ market: stores.market, category: stores.category }).from(stores).where(eq(stores.id, scope.storeId)).limit(1);
  if (!store) return 0;
  const live = await db
    .select({ doc: pageVersions.doc })
    .from(pages)
    .innerJoin(pageVersions, and(eq(pageVersions.id, pages.publishedVersionId), eq(pageVersions.storeId, pages.storeId)))
    .where(whereStore(pages, scope, eq(pages.status, "published")));
  const docs = live.map((r) => r.doc).filter((d) => docNiche(d, store) === niche);
  const rows = sketchRows(niche, docs);
  const owner = ownerTagFor(scope.storeId);
  await db.transaction(async (tx) => {
    await tx.delete(headlineShingles).where(and(eq(headlineShingles.nicheKey, niche), eq(headlineShingles.ownerTag, owner)));
    if (rows.length) await tx.insert(headlineShingles).values(rows.map((r) => ({ nicheKey: niche, hash: r.hash, ownerTag: owner, kind: r.kind })));
  });
  return rows.length;
}

/** The purge job's delete (core §F.9): every row of the store's owner tag, every niche. */
export async function purgeHeadlineShingles(scope: WriteScope): Promise<void> {
  await db.delete(headlineShingles).where(eq(headlineShingles.ownerTag, ownerTagFor(scope.storeId)));
}

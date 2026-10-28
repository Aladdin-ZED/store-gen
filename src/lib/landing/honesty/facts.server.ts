import "server-only";
/**
 * A page's merchant facts (P3 LANDING; landing.md LAN-§6.4 rule 7, LAN-§23.6, ENGP-8; docs/STORE-SAAS.md §M.1 rule 2,
 * §K.2 P0): the numerals the seller vouched for, so the builder checklist and the honesty gate judge the facts the
 * seller actually gave. They are audit rows `page.fact_attested` of the page's store, meta `{ pageId, path, value,
 * text, source }`: the wizard's facts (`recordFacts`, `source: "wizard"`, called by the create-from-directions path)
 * and the owner's one-tap attestations (`attestFact`, `source: "owner"`, behind P3's `FactAttestSheet`). PageDoc v2 is
 * not changed.
 *
 * One set of rows, one implementation: the bodies stay in the R1.0 home (src/lib/editor/facts.server.ts, T4, read
 * only for this track), which both paths call, so the checklist's preload and this module can never read two shapes.
 * This module adds what the gate needs on top: `factsFor` cached 60 s per store (`scopedCache("page-facts")`, keyed
 * by page), dropped by every write here, and the owner's attestation writer. The frozen signatures of P0 hold.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pages } from "@/lib/db/schema";
import { factsFor as readFacts, recordFacts as recordWizardFacts, type AttestedFact, type CopyFacts } from "@/lib/editor/facts.server";
import { auditIn } from "@/lib/admin-data/store-audit";
import { whereStore } from "@/lib/tenancy/sql";
import { scopedCache } from "@/lib/tenancy/cache";
import type { Actor, StoreScope, WriteScope } from "@/lib/tenancy/types";
import { factNumerals } from "./numbers";

export type { AttestedFact, CopyFacts } from "@/lib/editor/facts.server";

/** The gate reads a page's facts at most once a minute per store (LAN-§3.2.1); a write here drops the page's entry. */
export const FACTS_TTL_MS = 60_000;
const factsCache = scopedCache<AttestedFact[]>({ name: "page-facts", maxEntries: 4_000, ttlMs: FACTS_TTL_MS });

/**
 * Records the wizard's facts of a new page: one row per numeral of each fact (a fact without a number gets one row
 * with `value: null`). `actor` defaults to the scope's own kind (a system job); the action passes the seam's actor.
 * Answers the number of rows written.
 */
export async function recordFacts(scope: WriteScope, pageId: string, facts: CopyFacts, actor?: Actor): Promise<number> {
  try {
    return await recordWizardFacts(scope, pageId, facts, actor);
  } finally {
    factsCache.delete(scope.storeId, pageId);
  }
}

/** The page's attested facts, newest first (the wizard's and the owner's); another store's page has none. Cached 60 s. */
export function factsFor(scope: StoreScope, pageId: string): Promise<AttestedFact[]> {
  return factsCache.getOrLoad(scope.storeId, pageId, () => readFacts(scope, pageId));
}

/** What the owner confirms in the attestation sheet: the field, the numeral and its words ("3 couleurs"). */
export interface FactAttestation {
  path: string;
  value: string;
  text: string;
}

const clean = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 200);
const PATH_RE = /^[A-Za-z0-9_.-]{1,160}$/;

/**
 * Records the owner's "this is a fact about my product" for one numeral of one field (LAN-§6.4 rule 7): an audit row
 * `page.fact_attested` with `source: "owner"`, so the next `allowedNumbersFor` finds the numeral allowed. The value is
 * re-read from the text, so a sheet can never attest a number its words do not hold. Answers false (nothing written)
 * when the text holds no such numeral, the path is not a document path or the page is not the scope's store's.
 */
export async function attestFact(scope: WriteScope, actor: Actor, pageId: string, fact: FactAttestation): Promise<boolean> {
  const text = clean(fact.text);
  const value = factNumerals(fact.value)[0];
  if (!text || !value || !PATH_RE.test(fact.path) || !factNumerals(text).includes(value)) return false;
  // only a page of the scope's own store: another store's page id writes nothing
  const [page] = await db.select({ id: pages.id }).from(pages).where(whereStore(pages, scope, eq(pages.id, pageId))).limit(1);
  if (!page) return false;
  try {
    await auditIn(scope, actor, "page.fact_attested", { target: pageId, meta: { pageId, path: fact.path, value, text, source: "owner" } });
  } finally {
    factsCache.delete(scope.storeId, pageId);
  }
  return true;
}

/** The numerals a page's facts make allowed (`NumberStoreFacts.facts` of ./numbers.ts): the attested texts, as typed. */
export function factTexts(facts: readonly AttestedFact[]): string[] {
  return facts.map((f) => (f.value !== null && !factNumerals(f.text).includes(f.value) ? `${f.text} ${f.value}` : f.text));
}

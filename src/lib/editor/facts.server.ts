import "server-only";
/**
 * A page's merchant facts (docs/STORE-SAAS.md §M.1 rule 2, §K.1 T4; landing.md LAN-§6.4, ENGP-8): the numerals the
 * seller vouched for, so the builder checklist and the honesty gate judge the facts the seller actually gave. They
 * are audit rows `page.fact_attested` of the page's store (meta `{ pageId, path, value, text, source }`, LAN-§23.6):
 * the create-from-directions path records the wizard's facts (`source: "wizard"`), the builder's one-tap attestation
 * (P3's `FactAttestSheet`) the owner's (`source: "owner"`). PageDoc v2 is not changed.
 *
 * R1.0 home of P3's `recordFacts` / `factsFor` (`src/lib/landing/honesty/facts.server.ts` in R1, which re-exports or
 * replaces these with the same signatures and the same rows).
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { auditIn } from "@/lib/admin-data/store-audit";
import { whereStore } from "@/lib/tenancy/sql";
import type { Actor, StoreScope, WriteScope } from "@/lib/tenancy/types";
import { numeralsIn } from "./check-facts";

/** The wizard's merchant facts as the owner typed them ("3 couleurs", "100 % coton", "50 ml"). */
export type CopyFacts = readonly string[];

export interface AttestedFact {
  /** the field the attestation was made on; null for the wizard's facts (they hold for the whole page) */
  path: string | null;
  /** the normalised numeral ("3", "2.5"); null for a fact without a number */
  value: string | null;
  text: string;
  source: "wizard" | "owner";
}

const ACTION = "page.fact_attested";
/** At most this many rows per recording (5 wizard facts with a few numerals each). */
const MAX_ROWS = 24;
/** Newest rows read per page. */
const READ_LIMIT = 200;

const clean = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 200);

/**
 * Records the wizard's facts of a new page: one row per numeral of each fact (a fact without a number gets one row
 * with `value: null`). `actor` defaults to the scope's own kind (a system job); the action passes the seam's actor.
 */
export async function recordFacts(scope: WriteScope, pageId: string, facts: CopyFacts, actor?: Actor): Promise<number> {
  const by: Actor = actor ?? { kind: scope.kind === "system" ? "system" : "user", userId: null, impersonatorId: null, ip: null };
  const rows: AttestedFact[] = [];
  for (const raw of facts) {
    const text = clean(raw);
    if (!text) continue;
    const values = [...new Set(numeralsIn(text))];
    for (const value of values.length ? values : [null]) rows.push({ path: null, value, text, source: "wizard" });
  }
  const kept = rows.slice(0, MAX_ROWS);
  // sequential: the rows keep the facts' order (audit_log ids ascend)
  for (const r of kept) await auditIn(scope, by, ACTION, { target: pageId, meta: { pageId, ...r } });
  return kept.length;
}

/** The page's attested facts, newest first (the wizard's and the owner's); another store's page has none. */
export async function factsFor(scope: StoreScope, pageId: string): Promise<AttestedFact[]> {
  const rows = await db
    .select({ meta: auditLog.meta })
    .from(auditLog)
    .where(and(whereStore(auditLog, scope, eq(auditLog.action, ACTION)), eq(auditLog.target, pageId)))
    .orderBy(desc(auditLog.id))
    .limit(READ_LIMIT);
  const out: AttestedFact[] = [];
  for (const { meta } of rows) {
    if (!meta || meta.pageId !== pageId || typeof meta.text !== "string") continue;
    out.push({
      path: typeof meta.path === "string" ? meta.path : null,
      value: typeof meta.value === "string" ? meta.value : null,
      text: meta.text,
      source: meta.source === "owner" ? "owner" : "wizard",
    });
  }
  return out;
}

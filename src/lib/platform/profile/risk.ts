import "server-only";
/**
 * The store profile's Risk strip (platform.md PLA-§7.3 strip 9, §7.13 Risk; PL-07, PD52, PD70, PL-20 counts): the
 * latest signup review (score, band, the top 3 flags with `explainFlag`, the counterfactual line of `explainBand`,
 * `partial`), the owners' linked accounts with a banned badge, the blocklist size, the restriction history, the live
 * brand state (`brand_term_live` / `brand_near_live` with the matched term and field) and the abuse reports count by
 * reason with the newest report's reason and page path. Never a report's details or the reporter's contact (R3
 * triage), never a raw identity value.
 *
 *   const risk = await loadRiskStrip(ctx, storeId);
 *
 * Store rows are read through `platformScope(ctx, storeId)`; the identity links are user-level rows (no store),
 * annotated as the risk strip's read.
 */
import { and, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { abuseReports, auditLog, blocklist, identityLinks, signupReviews, storeMembers, users } from "@/lib/db/schema";
import { parseBrandDetail } from "@/lib/health/platform-flags";
import type { MessageKey } from "@/lib/tenancy/types";
import { getPlatformSetting } from "@/lib/settings";
import { whereStore } from "@/lib/tenancy/sql";
import type { PlatformCtx, StoreScope } from "@/lib/tenancy/types";
import { getStoreHealth } from "../health-snapshot";
import { optional } from "../panel";
import { platformScope } from "../seam";
import { explainBand, explainFlag, type BandExplanation } from "../signup-band";
import type { SignupBand, SignupFlag } from "../types";

const DAY = 86_400_000;
/** identity links read per owner, linked users counted at most */
const LINKS_MAX = 80;
const LINKED_MAX = 200;
/** the actions of the restriction history */
const RESTRICTIONS = ["platform.store.restricted", "platform.store.suspended"] as const;
/** abuse reports read for the counts (the newest; R1 volumes are far below) */
const REPORTS_MAX = 500;

export interface RiskStrip {
  review: {
    score: number;
    band: SignupBand;
    status: string;
    /** the top 3 flags, highest points first, each with its `console.risk.<code>` sentence key and evidence */
    flags: { code: SignupFlag["code"]; points: number; text: MessageKey; evidence?: Record<string, string | number> }[];
    moreFlags: number;
    /** PD52: "Without {flag} this would be {band}" */
    explain: BandExplanation;
    partial: boolean;
    createdAt: string;
  } | null;
  linked: { accounts: number; banned: number };
  blocklist: number;
  restrictions: number;
  /** null: no protected term on live pages; otherwise the flag with its term and field */
  brand: { code: "brand_term_live" | "brand_near_live"; term: string; field: string; pageId?: string } | null;
  /** null until the first health run */
  brandChecked: boolean;
  abuse: { total: number; last24h: number; byReason: { reason: string; count: number }[]; newest: { reason: string; pagePath: string | null; at: string } | null };
}

async function latestReview(scope: StoreScope) {
  const [row] = await db
    .select({ score: signupReviews.score, band: signupReviews.band, status: signupReviews.status, signals: signupReviews.signals, createdAt: signupReviews.createdAt })
    .from(signupReviews)
    .where(whereStore(signupReviews, scope, eq(signupReviews.kind, "signup")))
    .orderBy(desc(signupReviews.createdAt), desc(signupReviews.id))
    .limit(1);
  return row ?? null;
}

async function ownerIds(scope: StoreScope): Promise<string[]> {
  const rows = await db
    .select({ userId: storeMembers.userId })
    .from(storeMembers)
    .where(whereStore(storeMembers, scope, eq(storeMembers.role, "owner")))
    .limit(20);
  return rows.map((r) => r.userId);
}

/** Users sharing an identity link with the owners (hashes only), and how many of them are banned. */
async function linkedOf(owners: readonly string[]): Promise<{ accounts: number; banned: number }> {
  if (!owners.length) return { accounts: 0, banned: 0 };
  // tenancy: platform risk strip: the owners' identity links (user-level hashes, no store column)
  const mine = await db.select({ kind: identityLinks.kind, valueHash: identityLinks.valueHash }).from(identityLinks).where(inArray(identityLinks.userId, [...owners])).limit(LINKS_MAX);
  if (!mine.length) return { accounts: 0, banned: 0 };
  // tenancy: platform risk strip: the other users sharing one of those hashes (user-level, no store column)
  const others = await db
    .selectDistinct({ userId: identityLinks.userId, disabled: users.disabled })
    .from(identityLinks)
    .innerJoin(users, eq(users.id, identityLinks.userId))
    .where(and(or(...mine.map((l) => and(eq(identityLinks.kind, l.kind), eq(identityLinks.valueHash, l.valueHash)))), sql`${identityLinks.userId} NOT IN (${sql.join(owners.map((o) => sql`${o}`), sql`, `)})`))
    .limit(LINKED_MAX);
  const ids = new Map<string, boolean>();
  for (const o of others) ids.set(o.userId, (ids.get(o.userId) ?? false) || o.disabled);
  return { accounts: ids.size, banned: [...ids.values()].filter(Boolean).length };
}

async function blocklistSize(scope: StoreScope): Promise<number> {
  const [row] = await db.select({ n: count() }).from(blocklist).where(whereStore(blocklist, scope));
  return Number(row?.n ?? 0);
}

async function restrictionCount(scope: StoreScope): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(auditLog)
    .where(whereStore(auditLog, scope, inArray(auditLog.action, [...RESTRICTIONS])));
  return Number(row?.n ?? 0);
}

async function abuseCounts(scope: StoreScope, now: Date): Promise<RiskStrip["abuse"]> {
  const rows = await db
    .select({ reason: abuseReports.reason, pageUrl: abuseReports.pageUrl, createdAt: abuseReports.createdAt })
    .from(abuseReports)
    .where(whereStore(abuseReports, scope))
    .orderBy(desc(abuseReports.createdAt), desc(abuseReports.id))
    .limit(REPORTS_MAX);
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.reason, (by.get(r.reason) ?? 0) + 1);
  const since = now.getTime() - DAY;
  const newest = rows[0];
  return {
    total: rows.length,
    last24h: rows.filter((r) => r.createdAt.getTime() >= since).length,
    byReason: [...by.entries()].map(([reason, n]) => ({ reason, count: n })).sort((a, b) => b.count - a.count || (a.reason < b.reason ? -1 : 1)),
    newest: newest ? { reason: newest.reason, pagePath: newest.pageUrl, at: newest.createdAt.toISOString() } : null,
  };
}

/** PLA-§7.3 strip 9 (`console.read`). */
export async function loadRiskStrip(ctx: PlatformCtx, storeId: string, now: Date = new Date()): Promise<RiskStrip> {
  const scope = platformScope(ctx, storeId);
  const [review, owners, blocked, restrictions, abuse, health, setting] = await Promise.all([
    latestReview(scope),
    ownerIds(scope),
    blocklistSize(scope),
    restrictionCount(scope),
    abuseCounts(scope, now),
    optional("risk.health", () => getStoreHealth(scope), { storeId }),
    getPlatformSetting("platform"),
  ]);
  const linked = await linkedOf(owners);
  const flags = [...(review?.signals?.flags ?? [])].sort((a, b) => b.points - a.points);
  const brandFlag = (health?.flags ?? []).find((f) => f.code === "brand_term_live") ?? (health?.flags ?? []).find((f) => f.code === "brand_near_live");
  const detail = brandFlag ? parseBrandDetail(brandFlag.detail) : null;
  return {
    review: review
      ? {
          score: review.score,
          band: review.band,
          status: review.status,
          flags: flags.slice(0, 3).map((f) => ({ code: f.code, points: f.points, text: explainFlag(f), ...(f.evidence ? { evidence: f.evidence } : {}) })),
          moreFlags: Math.max(0, flags.length - 3),
          explain: explainBand({ score: review.score, flags }, setting.signup.thresholds),
          partial: review.signals?.partial === true,
          createdAt: review.createdAt.toISOString(),
        }
      : null,
    linked,
    blocklist: blocked,
    restrictions,
    brand: brandFlag && detail ? { code: brandFlag.code as "brand_term_live" | "brand_near_live", term: detail.term, field: detail.field, ...(detail.pageId ? { pageId: detail.pageId } : {}) } : null,
    brandChecked: health !== null,
    abuse,
  };
}

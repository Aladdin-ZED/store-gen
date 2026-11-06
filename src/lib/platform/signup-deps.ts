import "server-only";
/**
 * The default lookups of `scoreSignup` (platform.md PLA-§3.4.3, PD31; core §E.6, §E.8), loaded by signup-risk.ts only
 * when a dependency is not injected (the selftest injects every one and never loads this file):
 *
 * - `resolveMx`: `new dns.promises.Resolver({ timeout: 2000, tries: 1 })`, answers cached 24 h in `scopedCache("mx")`
 *   (platform key "p", 2,000 domains, negatives included; a lookup that times out or fails is not cached);
 * - `identityMatches`: one grouped read of `identity_links` ⋈ `users` over the applicant's hashes only (never a raw
 *   value), without the creator's own links on `/app/new`;
 * - `velocity`: the `p:signup:net:<hash>` bucket that T2 charges after each completed signup, read without counting:
 *   true once 3 signups came from the network today;
 * - `protectedTerms`: the active `protected_brands` rows (brand-check.ts, cached 5 min);
 * - `trustedCreator`: PD31, the user owns an `active` store older than 30 days and none of the stores they own was
 *   restricted or suspended in the last 90 days (each store's own audit rows, read through a system scope);
 * - `signupSetting`: `platform.signup` through the settings registry.
 */
import { promises as dns } from "node:dns";
import { and, eq, gte, inArray, ne, or, sql } from "drizzle-orm";
import { listMemberships } from "@/lib/auth/landing";
import { db } from "@/lib/db/client";
import { auditLog, identityLinks, stores, users } from "@/lib/db/schema";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import { platformBucket, rateLimitReached } from "@/lib/security/rate-limit";
import { getPlatformSetting } from "@/lib/settings";
import { scopedCache } from "@/lib/tenancy/cache";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { activeProtectedTerms } from "./brand-check";
import type { IdentityMatch, SignupRiskDeps, SignupRiskInput } from "./signup-risk";
import type { IdentityKind } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
/** PLA-§3.4.1 `velocity_network`: completed signups from one network and day before the signal fires */
const VELOCITY_LIMIT = 3;
/** PD31 */
const TRUSTED_STORE_AGE_DAYS = 30;
const TRUSTED_CLEAN_DAYS = 90;
const RESTRICTION_ACTIONS = ["platform.store.restricted", "platform.store.suspended"];
/** the stores a trusted-creator check reads at most (one owner rarely has more) */
const OWNED_MAX = 10;
const HOSTNAME_RE = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;

type MxAnswer = "ok" | "none" | "null";
const mxCache = scopedCache<MxAnswer>({ name: "mx", maxEntries: 2_000, ttlMs: DAY_MS });

/** The MX answer of a domain: "null" = RFC 7505 null MX, "none" = NXDOMAIN or no MX, "timeout" = no answer in 2 s. */
export async function resolveMxCached(domain: string): Promise<MxAnswer | "timeout"> {
  const name = domain.toLowerCase().replace(/\.$/, "");
  if (!HOSTNAME_RE.test(name)) return "none";
  const hit = mxCache.get("p", name);
  if (hit) return hit;
  const resolver = new dns.Resolver({ timeout: 2_000, tries: 1 });
  try {
    const records = await resolver.resolveMx(name);
    const answer: MxAnswer =
      records.length === 0 ? "none" : records.length === 1 && (records[0]!.exchange === "" || records[0]!.exchange === ".") ? "null" : "ok";
    mxCache.set("p", name, answer);
    return answer;
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code;
    if (code === "ENOTFOUND" || code === "ENODATA") {
      mxCache.set("p", name, "none");
      return "none";
    }
    return "timeout";
  } finally {
    resolver.cancel();
  }
}

/** Other users sharing each hashed link: how many, how many banned, how many linked in the last 24 h. */
export async function identityMatchesFor(links: readonly { kind: IdentityKind; valueHash: string }[], excludeUserId: string | null, now = Date.now()): Promise<IdentityMatch[]> {
  if (links.length === 0) return [];
  const since = new Date(now - DAY_MS);
  const rows = await db
    .select({
      kind: identityLinks.kind,
      users: sql<number>`COUNT(DISTINCT ${identityLinks.userId})`,
      banned: sql<number>`COUNT(DISTINCT CASE WHEN ${users.disabled} = 1 THEN ${users.id} END)`,
      recent: sql<number>`COUNT(DISTINCT CASE WHEN ${identityLinks.createdAt} >= ${since} THEN ${identityLinks.userId} END)`,
    })
    .from(identityLinks)
    .innerJoin(users, eq(users.id, identityLinks.userId))
    .where(
      and(
        or(...links.map((l) => and(eq(identityLinks.kind, l.kind), eq(identityLinks.valueHash, l.valueHash)))),
        excludeUserId ? ne(identityLinks.userId, excludeUserId) : undefined,
      ),
    )
    .groupBy(identityLinks.kind);
  return rows.map((r) => ({ kind: r.kind, users: Number(r.users), banned: Number(r.banned), recentUsers24h: Number(r.recent) }));
}

/** Was the store restricted or suspended since `since`? (its own audit rows, PLA-§8.1 actions) */
async function restrictedSince(scope: StoreScope, since: Date): Promise<boolean> {
  const rows = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(whereStore(auditLog, scope, inArray(auditLog.action, RESTRICTION_ACTIONS), gte(auditLog.createdAt, since)))
    .limit(1);
  return rows.length > 0;
}

/** PD31: an owner with an active store older than 30 days and no restriction on any of their stores in 90 days. */
export async function isTrustedCreator(userId: string, now = Date.now()): Promise<boolean> {
  const owned = (await listMemberships(userId)).filter((m) => m.role === "owner" && m.status === "active").slice(0, OWNED_MAX);
  if (owned.some((m) => m.storeStatus === "restricted" || m.storeStatus === "suspended")) return false;
  const active = owned.filter((m) => m.storeStatus === "active").map((m) => m.storeId);
  if (active.length === 0) return false;
  const rows = await db.select({ id: stores.id, createdAt: stores.createdAt }).from(stores).where(inArray(stores.id, active));
  if (!rows.some((r) => r.createdAt.getTime() <= now - TRUSTED_STORE_AGE_DAYS * DAY_MS)) return false;
  const ctx = systemCtx("platform.signup-risk");
  const since = new Date(now - TRUSTED_CLEAN_DAYS * DAY_MS);
  for (const m of owned) if (await restrictedSince(systemScope(ctx, m.storeId), since)) return false;
  return true;
}

/** The production lookups for one applicant (the `/app/new` creator's own links never count against them). */
export function signupRiskDefaults(input: Pick<SignupRiskInput, "existingUserId">): SignupRiskDeps {
  return {
    now: () => Date.now(),
    resolveMx: resolveMxCached,
    identityMatches: (links) => identityMatchesFor(links, input.existingUserId ?? null),
    velocity: (netHash) => rateLimitReached(platformBucket("signup:net", netHash), VELOCITY_LIMIT),
    protectedTerms: () => activeProtectedTerms(),
    trustedCreator: (userId) => isTrustedCreator(userId),
    signupSetting: async () => (await getPlatformSetting("platform")).signup,
  };
}

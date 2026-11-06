import "server-only";
/**
 * Settings → Anti-spam's figures (operations.md OPE-§24, IN-06; core §D.10): which widget protects the store's forms
 * and the share of the last 24 hours' orders Turnstile verified, with its n.
 *
 * - `turnstileStats(scope)`: real orders of the last 24 h (`is_test = 0`, bots caught by the honeypot left out, as the
 *   `int:turnstile` rule counts them); verified = no `captcha_missing` / `captcha_unverified` flag
 *   (src/lib/orders/risk.ts). Below 20 orders the share is withheld ("needs 20 orders"), the rule's own minimum.
 * - `protectionSource(scope)`: "store" (its own pair), "platform" (the apex widget) or "off". Never a key.
 */
import { and, count, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import { TURNSTILE_MIN_N, TURNSTILE_SHARE } from "@/lib/health/rules/integrations";
import { turnstileKeysFor } from "@/lib/orders/turnstile";
import { getStoreSetting } from "@/lib/settings";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { CAPTCHA_FLAGGED, NOT_HONEYPOT } from "./health";

export { TURNSTILE_MIN_N, TURNSTILE_SHARE };

export interface TurnstileShare {
  /** real orders of the window */
  n: number;
  /** of which Turnstile verified */
  verified: number;
  /** verified / n in 0..1; null below the minimum n */
  share: number | null;
  /** the minimum n the share needs (20) */
  minN: number;
  /** the failure share is above the health rule's 20 % (and n is enough) */
  failing: boolean;
}

/** The share of `n` orders of which `flagged` failed or skipped the check (pure; the rule's boundary). */
export function turnstileShareOf(n: number, flagged: number): TurnstileShare {
  const verified = Math.max(0, n - flagged);
  const enough = n >= TURNSTILE_MIN_N;
  return { n, verified, share: enough ? verified / n : null, minN: TURNSTILE_MIN_N, failing: enough && flagged / n > TURNSTILE_SHARE };
}

export async function turnstileStats(scope: StoreScope, now: Date = new Date()): Promise<TurnstileShare> {
  const since = new Date(now.getTime() - 86_400_000);
  const [row] = await db
    .select({ n: count(), flagged: sql<number>`COALESCE(SUM(${CAPTCHA_FLAGGED}), 0)` })
    .from(orders)
    .where(whereStore(orders, scope, and(gte(orders.createdAt, since), lt(orders.createdAt, now)), eq(orders.isTest, false), NOT_HONEYPOT));
  return turnstileShareOf(Number(row?.n ?? 0), Number(row?.flagged ?? 0));
}

export type ProtectionSource = "store" | "platform" | "off";

/** Which widget the store's documents embed (src/lib/orders/turnstile.ts `turnstileKeysFor`'s rule). */
export async function protectionSource(scope: StoreScope): Promise<ProtectionSource> {
  const [keys, own] = await Promise.all([turnstileKeysFor(scope), getStoreSetting(scope, "turnstile", { fresh: true })]);
  if (!keys) return "off";
  return own.siteKey && own.secretKey && keys.siteKey === own.siteKey ? "store" : "platform";
}

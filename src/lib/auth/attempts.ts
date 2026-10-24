/**
 * Attempt budgets for auth flows, on top of the shared DB rate limiter (docs/STORE-SAAS.md §B.3, §E.8).
 * Pattern: every attempt consumes budget (atomic upsert in rateLimit()), a fully successful sign-in clears the
 * account budgets. This makes lockouts race-free under concurrent guesses.
 *
 * Every bucket is platform-level (`p:`); C0b's `platformBucket(name, key)` builds the same strings (CCR r1.0-t2-2),
 * so the switch to the branded type changes no live bucket.
 */
import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { rateLimits } from "@/lib/db/schema";
import { hashIp, hmac } from "@/lib/security/crypto";
import { rateLimit, type RateResult } from "@/lib/security/rate-limit";
import {
  LOGIN_ACCT_LIMIT,
  LOGIN_ACCTNET_LIMIT,
  LOGIN_IP_LIMIT,
  LOGIN_WINDOW_SEC,
  MFA_IP_LIMIT,
  MFA_STEPUP_LIMIT,
  MFA_USER_LIMIT,
  MFA_WINDOW_SEC,
  PASSWORD_CHECK_LIMIT,
  SETUP_IP_LIMIT,
  SETUP_WINDOW_SEC,
} from "./config";

const HOUR = 3600;
const DAY = 24 * HOUR;

/** Bucket names never contain raw identifiers (e-mails and IPs are keyed hashes, user ids are ULIDs). */
export const buckets = {
  loginIp: (ip: string) => `p:login:ip:${hashIp(ip)}`,
  /** one account from one network: hmac(email | network hash) */
  loginAcctNet: (email: string, ip: string) => `p:login:acctnet:${hmac(`${email}|${hashIp(ip)}`, "login-acctnet")}`,
  /** one account from every network (challenge only) */
  loginAcct: (email: string) => `p:login:acct:${hmac(email, "login-account")}`,
  mfaIp: (ip: string) => `p:mfa:ip:${hashIp(ip)}`,
  mfaUser: (userId: string) => `p:mfa:user:${userId}`,
  mfaManage: (userId: string) => `p:mfa:manage:${userId}`,
  mfaStepUp: (userId: string) => `p:mfa:stepup:${userId}`,
  /** password change and the tenant password step-up (§B.7, §E.8 rev 3) */
  passwordChange: (userId: string) => `p:password:${userId}`,
  setupIp: (ip: string) => `p:setup:ip:${hashIp(ip)}`,
  signupIp: (ip: string) => `p:signup:ip:${hashIp(ip)}`,
  /** the velocity signal of scoreSignup (PLA-§3.4.1): completed signups per network and day */
  signupNet: (ip: string) => `p:signup:net:${hashIp(ip)}`,
  inviteAcceptIp: (ip: string) => `p:invite:accept:ip:${hashIp(ip)}`,
  resetIp: (ip: string) => `p:reset:ip:${hashIp(ip)}`,
  handleIp: (ip: string) => `p:handle:ip:${hashIp(ip)}`,
  storeCreate: (userId: string) => `p:store:create:${userId}`,
};

export const limits = {
  loginIp: (ip: string) => rateLimit(buckets.loginIp(ip), LOGIN_IP_LIMIT, LOGIN_WINDOW_SEC),
  mfaIp: (ip: string) => rateLimit(buckets.mfaIp(ip), MFA_IP_LIMIT, MFA_WINDOW_SEC),
  mfaUser: (userId: string) => rateLimit(buckets.mfaUser(userId), MFA_USER_LIMIT, MFA_WINDOW_SEC),
  /** 2FA enrollment / disable / regenerate — generous but bounded */
  mfaManage: (userId: string) => rateLimit(buckets.mfaManage(userId), 10, MFA_WINDOW_SEC),
  mfaStepUp: (userId: string) => rateLimit(buckets.mfaStepUp(userId), MFA_STEPUP_LIMIT, MFA_WINDOW_SEC),
  passwordChange: (userId: string) => rateLimit(buckets.passwordChange(userId), PASSWORD_CHECK_LIMIT, LOGIN_WINDOW_SEC),
  setupIp: (ip: string) => rateLimit(buckets.setupIp(ip), SETUP_IP_LIMIT, SETUP_WINDOW_SEC),
  signupNet: (ip: string) => rateLimit(buckets.signupNet(ip), 3, DAY),
  handleIp: (ip: string) => rateLimit(buckets.handleIp(ip), 60, 10 * 60),
  storeCreate: (userId: string) => rateLimit(buckets.storeCreate(userId), 3, DAY),
} satisfies Record<string, (key: string) => Promise<RateResult>>;

/**
 * The two account buckets of a sign-in attempt (§B.3): charged together, before the challenge decision, which reads
 * the charged counts (review r1.0-t2 F3: a decision on peeked counts let parallel guesses skip the challenge).
 */
export const loginAccountLimits = {
  acctNet: (email: string, ip: string) => rateLimit(buckets.loginAcctNet(email, ip), LOGIN_ACCTNET_LIMIT, LOGIN_WINDOW_SEC),
  acct: (email: string) => rateLimit(buckets.loginAcct(email), LOGIN_ACCT_LIMIT, LOGIN_WINDOW_SEC),
};

/**
 * The per-IP bucket of a public form (`publicAction(name, …)`, §E.8): `p:<name>:ip:<ipHash>`. Names without an entry
 * charge no form bucket (sign-in charges its own three in loginAccount()).
 */
export const PUBLIC_FORM_LIMITS: Readonly<Record<string, { limit: number; windowSec: number }>> = {
  signup: { limit: 5, windowSec: HOUR },
  "invite:accept": { limit: 10, windowSec: 15 * 60 },
  reset: { limit: 10, windowSec: 15 * 60 },
  report: { limit: 5, windowSec: HOUR },
};

export function publicFormBucket(name: string, ip: string): string {
  return `p:${name}:ip:${hashIp(ip)}`;
}

/** The current count of a bucket's live window, without counting anything (0 when absent or expired). */
export async function peekBucket(bucket: string): Promise<number> {
  const key = bucket.slice(0, 191);
  const [rows] = (await db.execute(sql`SELECT count FROM rate_limits WHERE bucket = ${key} AND reset_at > UTC_TIMESTAMP(3)`)) as unknown as [
    { count: number | string }[],
  ];
  return Number(rows[0]?.count ?? 0);
}

/** Gives one attempt back to each live bucket (never below 0): a sign-in answered `challenge` costs no account budget. */
export async function refundBuckets(bucketNames: readonly string[]): Promise<void> {
  const keys = bucketNames.map((b) => b.slice(0, 191));
  if (keys.length === 0) return;
  await db.execute(
    sql`UPDATE rate_limits SET count = GREATEST(0, count - 1) WHERE bucket IN (${sql.join(keys.map((k) => sql`${k}`), sql`, `)}) AND reset_at > UTC_TIMESTAMP(3)`,
  );
}

export async function clearBucket(bucket: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.bucket, bucket.slice(0, 191)));
}

import "server-only";
/**
 * Identity links (platform.md PLA-§3.4.3, PLA Q.3; docs/STORE-SAAS.md §B.1, §B.2 step 7): the hashed duplicate and
 * ban signals `scoreSignup` reads. Never a raw value: `value_hash = hmac(value, "identity:<kind>")`, where the value
 * of `net` is the network hash (`hashIp`: the IPv4 address or the IPv6 /64) and `device` the `__Host-sgd` marker.
 *
 * Signup writes `email_norm`, `phone`, `net` and `device` (`source = 'signup'`, inside its transaction); every sign-in
 * adds `net` and `device` (`source = 'login'`, INSERT IGNORE, at most 20 rows per user and kind). The marker itself is
 * set by T3's proxy (SEC-12); this file only reads it. `identity_links` has no store dimension (a platform table).
 */
import { and, count, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { identityLinks } from "@/lib/db/schema";
import { errorSummary } from "@/lib/orders/log";
import { hashIp, hmac } from "@/lib/security/crypto";
import { DEVICE_COOKIE, DEVICE_MARKER_RE } from "./config";

export type IdentityKind = "email_norm" | "phone" | "net" | "device";
export type IdentitySource = "signup" | "login" | "invite" | "staff";

/** Login links kept per user and kind; beyond it nothing is added (PLA-§3.4.3). */
export const LOGIN_LINKS_MAX = 20;

/**
 * The e-mail as a duplicate signal (PLA-§3.4.2): lower-case, `googlemail.com` → `gmail.com`, Gmail dots removed,
 * every `+tag` dropped. Used only for the `email_norm` link: sign-in and uniqueness keep the exact e-mail.
 */
export function normalizeEmailForIdentity(email: string): string {
  const value = email.normalize("NFKC").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0) return value;
  let local = value.slice(0, at);
  let domain = value.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

export function identityValueHash(kind: IdentityKind, value: string): string {
  return hmac(value, `identity:${kind}`);
}

export function isDeviceMarker(value: unknown): value is string {
  return typeof value === "string" && DEVICE_MARKER_RE.test(value);
}

/** The device marker of a Cookie header (the first well-formed `__Host-sgd`), or null. */
export function deviceMarkerFromCookieHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eqAt = part.indexOf("=");
    if (eqAt === -1 || part.slice(0, eqAt).trim() !== DEVICE_COOKIE) continue;
    const value = part.slice(eqAt + 1).trim();
    if (isDeviceMarker(value)) return value;
  }
  return null;
}

export interface IdentityLinkRow {
  kind: IdentityKind;
  valueHash: string;
}

/** The links of a new account (§B.2 step 7): e-mail, phone when given, network, device when the marker is present. */
export function signupIdentityLinks(input: { email: string; phoneE164: string | null; ip: string | null; deviceId: string | null }): IdentityLinkRow[] {
  const rows: IdentityLinkRow[] = [{ kind: "email_norm", valueHash: identityValueHash("email_norm", normalizeEmailForIdentity(input.email)) }];
  if (input.phoneE164) rows.push({ kind: "phone", valueHash: identityValueHash("phone", input.phoneE164) });
  const net = netValue(input.ip);
  if (net) rows.push({ kind: "net", valueHash: identityValueHash("net", net) });
  if (isDeviceMarker(input.deviceId)) rows.push({ kind: "device", valueHash: identityValueHash("device", input.deviceId) });
  return rows;
}

/** The network hash of an address, or null for none (or an APP_SECRET the key derivation refuses). */
function netValue(ip: string | null | undefined): string | null {
  if (!ip || ip === "0.0.0.0") return null;
  try {
    return hashIp(ip);
  } catch {
    return null;
  }
}

/**
 * The sign-in links (`net`, `device`) of `userId`, INSERT IGNORE, while the user has fewer than 20 of that kind. Never
 * throws: a signal must not fail a sign-in.
 */
export async function recordLoginLinks(userId: string, input: { ip: string | null; deviceId: string | null }): Promise<void> {
  const wanted: IdentityLinkRow[] = [];
  const net = netValue(input.ip);
  if (net) wanted.push({ kind: "net", valueHash: identityValueHash("net", net) });
  if (isDeviceMarker(input.deviceId)) wanted.push({ kind: "device", valueHash: identityValueHash("device", input.deviceId) });
  for (const link of wanted) {
    try {
      const [row] = await db
        .select({ n: count() })
        .from(identityLinks)
        .where(and(eq(identityLinks.userId, userId), eq(identityLinks.kind, link.kind)));
      if (Number(row?.n ?? 0) >= LOGIN_LINKS_MAX) continue;
      await db.insert(identityLinks).ignore().values({ userId, kind: link.kind, valueHash: link.valueHash, source: "login" });
    } catch (err) {
      console.error("[identity] login link not recorded:", errorSummary(err));
    }
  }
}

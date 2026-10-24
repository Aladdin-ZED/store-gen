import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { isPlaceholderSecret } from "@/lib/auth/config";
import { rateKeyIp } from "./ip";

function secret(): Buffer {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) throw new Error("APP_SECRET must be set (32+ chars)");
  // a template value is public: nothing may be encrypted or signed with it (same rule as auth/config)
  if (isPlaceholderSecret(s)) throw new Error("APP_SECRET is still a template value — generate a random one");
  return Buffer.from(s, "utf8");
}

/**
 * Derived keys, bounded LRU (SET-12): per-store v2 keys and per-user v1 purposes ("totp:<userId>") would otherwise
 * grow without limit. Keys are pure functions of APP_SECRET and the info string, so an eviction only costs a re-derive.
 */
const MAX_KEYS = 512;
const keyCache = new Map<string, Buffer>();

function cachedKey(id: string, derive: () => Buffer): Buffer {
  const hit = keyCache.get(id);
  if (hit) {
    keyCache.delete(id);
    keyCache.set(id, hit);
    return hit;
  }
  const k = derive();
  keyCache.set(id, k);
  if (keyCache.size > MAX_KEYS) keyCache.delete(keyCache.keys().next().value as string);
  return k;
}

/** HKDF-SHA256 with the frozen salt "cod-studio" (TENANCY-MAP §11.1: renaming it would orphan every envelope). */
function hkdf(ikm: Buffer, info: string): Buffer {
  return Buffer.from(hkdfSync("sha256", ikm, Buffer.from("cod-studio"), Buffer.from(info, "utf8"), 32));
}

/** Derive a purpose-bound 32-byte key from APP_SECRET (HKDF-SHA256). */
export function deriveKey(purpose: string): Buffer {
  return cachedKey(`v1|${purpose}`, () => hkdf(secret(), purpose));
}

/** AES-256-GCM envelope: "v1.<iv>.<tag>.<ciphertext>" (base64url parts). */
export function encrypt(plain: string, purpose = "settings"): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", deriveKey(purpose), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(envelope: string, purpose = "settings"): string {
  const [v, iv, tag, ct] = envelope.split(".");
  if (v !== "v1" || !iv || !tag || ct === undefined) throw new Error("bad envelope");
  const tagBuf = Buffer.from(tag, "base64url");
  if (tagBuf.length !== 16) throw new Error("bad envelope");
  const d = createDecipheriv("aes-256-gcm", deriveKey(purpose), Buffer.from(iv, "base64url"), { authTagLength: 16 });
  d.setAuthTag(tagBuf);
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

/** HMAC-SHA256 hex with a purpose-bound key. */
export function hmac(data: string, purpose: string): string {
  return createHmac("sha256", deriveKey(purpose)).update(data).digest("hex");
}

/** Short url-safe signature (for cookies / tokens). */
export function sign(data: string, purpose: string): string {
  return createHmac("sha256", deriveKey(purpose)).update(data).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Stable pseudonymous hash of a client's network (never store raw IPs): the IPv4 address, or the /64
 * of an IPv6 address (see rateKeyIp) — so rate limits, the IP blocklist and velocity signals cannot
 * be dodged by rotating addresses inside one IPv6 allocation.
 */
export function hashIp(ip: string): string {
  return hmac(rateKeyIp(ip), "ip");
}

/* ------------------------------------------------------------------ */
/* Envelopes v2 (docs/STORE-SAAS.md §F.3, D30, SET-02, SET-12)         */
/* ------------------------------------------------------------------ */
/*
 * "v2.<kid>.<iv>.<tag>.<ct>" (base64url parts): AES-256-GCM, key = HKDF-SHA256(secret of <kid>, salt "cod-studio",
 * info "<scope>:<purpose>:<kid>"), AAD = the identical info string. The scope is "store:<storeId>" or "platform", so
 * a ciphertext copied from store A's row to store B's fails to open (another key and another AAD), and binding the
 * kid stops a future k2 ciphertext from opening under k1 parameters. The salt and every existing purpose string are
 * frozen (selftest-envelope.ts decrypts golden vectors). encrypt()/decrypt() above stay for the v1 purposes that
 * never change ("totp:<userId>", gate and session signing); a v1 settings envelope opens only through openLegacy.
 */

export type CryptoScope = { store: string } | "platform";

/**
 * Key ids → their secret. k1 = APP_SECRET generation 1. A rotation (not built in R1) adds k2 = APP_SECRET_NEXT, seals
 * with it and lets a boot task re-seal; `open` already picks the key by the envelope's kid.
 */
const KEY_IDS = { k1: secret } as const satisfies Record<string, () => Buffer>;
type KeyId = keyof typeof KEY_IDS;
const SEAL_KID: KeyId = "k1";

const isKeyId = (kid: string): kid is KeyId => Object.hasOwn(KEY_IDS, kid);
/** store ids are ULIDs; anything with ":" would make the info string ambiguous */
const STORE_ID_RE = /^[0-9A-Za-z_-]{1,64}$/;

function scopeString(scope: CryptoScope): string {
  if (scope === "platform") return "platform";
  const id = (scope as { store?: unknown } | null | undefined)?.store;
  if (typeof id !== "string" || !STORE_ID_RE.test(id)) throw new Error("crypto: bad envelope scope");
  return `store:${id}`;
}

function infoFor(scope: CryptoScope, purpose: string, kid: KeyId): string {
  if (typeof purpose !== "string" || purpose.length === 0 || purpose.length > 200) throw new Error("crypto: bad envelope purpose");
  return `${scopeString(scope)}:${purpose}:${kid}`;
}

function v2Key(info: string, kid: KeyId): Buffer {
  return cachedKey(`v2|${info}`, () => hkdf(KEY_IDS[kid](), info));
}

/** Seal a string for one store (or the platform) and one purpose: "v2.k1.<iv>.<tag>.<ct>". */
export function seal(plain: string, scope: CryptoScope, purpose: string): string {
  const info = infoFor(scope, purpose, SEAL_KID);
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", v2Key(info, SEAL_KID), iv, { authTagLength: 16 });
  c.setAAD(Buffer.from(info, "utf8"));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v2", SEAL_KID, iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

/**
 * Open a v2 envelope sealed for this scope and purpose. Throws on anything else: a v1 envelope (openLegacy), an
 * unknown kid, another store, another purpose, a tampered part. The message never carries the value.
 */
export function open(envelope: string, scope: CryptoScope, purpose: string): string {
  const parts = typeof envelope === "string" ? envelope.split(".") : [];
  const [v, kid, iv, tag, ct] = parts;
  if (parts.length !== 5 || v !== "v2" || kid === undefined || iv === undefined || tag === undefined || ct === undefined) throw new Error("bad envelope");
  if (!isKeyId(kid)) throw new Error("bad envelope (unknown key id)");
  const ivBuf = Buffer.from(iv, "base64url");
  const tagBuf = Buffer.from(tag, "base64url");
  if (ivBuf.length !== 12 || tagBuf.length !== 16) throw new Error("bad envelope");
  const info = infoFor(scope, purpose, kid);
  const d = createDecipheriv("aes-256-gcm", v2Key(info, kid), ivBuf, { authTagLength: 16 });
  d.setAAD(Buffer.from(info, "utf8"));
  d.setAuthTag(tagBuf);
  try {
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    throw new Error("envelope does not open (another store, purpose or key)");
  }
}

/** Today's decrypt() (v1), for the store #1 conversion, legacy settings rows (`purpose_v = 0`) and TOTP. */
export function openLegacy(envelope: string, purpose: string): string {
  return decrypt(envelope, purpose);
}

/** 1 or 2 for a well-formed envelope prefix, else null (the conversion and the dry run count rows by version). */
export function envelopeVersion(value: unknown): 1 | 2 | null {
  if (typeof value !== "string") return null;
  if (/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(value)) return 1;
  if (/^v2\.k[0-9]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(value)) return 2;
  return null;
}

/** HMAC-SHA256 hex of bytes with a purpose-bound key (per-store media ids: purpose "media-id:<storeId>", D21). */
export function hmacBytes(data: Uint8Array, purpose: string): string {
  return createHmac("sha256", deriveKey(purpose)).update(data).digest("hex");
}

/** Live size of the derived-key LRU (tests). */
export function keyCacheSize(): number {
  return keyCache.size;
}

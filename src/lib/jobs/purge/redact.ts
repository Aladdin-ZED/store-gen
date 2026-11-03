/**
 * What a purge leaves in the rows it keeps (docs/STORE-SAAS.md §F.9 "Kept", rev 3 SEC-20; R1 P8 step 10). Pure.
 *
 *   redactMetaForPurge(meta)   an audit row's meta with every PII and secret key's value replaced by "[purged]"
 *   isPurgeKey(key)            the key rule itself
 *
 * The PII key list is explicit (SEC-20): `email`, `phone`, `name`, `address`, `landmark`, `note`, `city`, `ua` (any
 * case), every `*_norm` key (and its camelCase `…Norm` spelling, the drizzle field names), plus the secret rule the audit
 * writer applies on write (`AUDIT_SECRET_KEY_RE` of src/lib/audit.ts, exported at P0b through CCR P8-9): that very
 * expression, never a copy. Keys are judged at every depth, inside arrays too; a value under a kept key is never scanned
 * (the audit writer only stores codes, ids and counts there). The row's other columns stay (§A.5.1: "every other column
 * kept for the audit trail").
 */
import { AUDIT_SECRET_KEY_RE } from "@/lib/audit";

/** §F.9 SEC-20: the keys whose values a purge removes from the kept audit rows. */
export const PURGE_PII_KEYS = Object.freeze(["email", "phone", "name", "address", "landmark", "note", "city", "ua"] as const);
/** The value a purged key holds. */
export const PURGED = "[purged]";
/** soft-deleted platform notes keep this body (§F.9: staff type names and phone details into notes) */
export const PURGED_NOTE_BODY = "[purged]";
/**
 * `signup_reviews.signals` is NOT NULL in schema.ts while §F.9 says "nulled": the purge writes this empty signal object
 * instead (no flags, no inputs, no evidence), so a reader still parses a v1 object and finds nothing in it.
 */
export const PURGED_SIGNALS = Object.freeze({ v: 1, flags: [] as never[], purged: true });

const PII = new Set<string>(PURGE_PII_KEYS);
/** `email_norm`, `PHONE_NORM`, and the drizzle field names `emailNorm`, `phoneNorm` */
const NORM_RE = /_norm$/i;
const CAMEL_NORM_RE = /[a-z0-9]Norm$/;
/** deeper than the audit writer ever stores (it cuts at depth 4): the rest is dropped as one purged value */
const MAX_DEPTH = 8;

export function isPurgeKey(key: string): boolean {
  return PII.has(key.toLowerCase()) || NORM_RE.test(key) || CAMEL_NORM_RE.test(key) || AUDIT_SECRET_KEY_RE.test(key);
}

function redact(value: unknown, depth: number): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth > MAX_DEPTH) return PURGED;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = isPurgeKey(k) && v !== null ? PURGED : redact(v, depth + 1);
  return out;
}

/**
 * The purged form of an audit row's meta (a parsed object, a JSON string, or null). Returns the same kind it was given:
 * an object for an object, a JSON string for a string (an unreadable string becomes `{ "purged": true }`), null for null.
 */
export function redactMetaForPurge(meta: unknown): unknown {
  if (meta === null || meta === undefined) return null;
  if (typeof meta === "string") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(meta);
    } catch {
      return JSON.stringify({ purged: true });
    }
    return JSON.stringify(redact(parsed, 0));
  }
  return redact(meta, 0);
}

/**
 * The ownership proof of a Google Sheet (docs/STORE-SAAS.md TENANCY-MAP §7.7, OPE-§19.3; SHT-09), the pure part.
 * Every store's sheet is shared with the one platform service account, so a pasted link alone proves nothing:
 * store A could paste store B's link. Connecting a sheet the store does not already use therefore asks the owner to
 * type a one-time code into the first rows of the sheet; only someone who can edit the sheet can do that.
 *
 *   const code = newProofCode();                       // "SG-7K2QX9M4TB", shown once
 *   const pending = { codeHash: proofHash(code), … }   // stored: the hash, never the code
 *   proofFound(cells, pending.codeHash)                // the cells read back (A1:AZ3)
 *
 * Framework-free (the conversions check runs it offline).
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Crockford base32: no I, L, O, U (nothing to misread when typing it). */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_RE = /SG-[0-9A-HJKMNP-TV-Z]{10}/gi;

/** How long a code stays valid. */
export const PROOF_TTL_MS = 24 * 60 * 60_000;
/** The cells searched for the code: the first three rows, columns A to AZ (one read). */
export const PROOF_RANGE = "A1:AZ3";

/** "SG-" + 10 Crockford base32 characters (50 random bits). */
export function newProofCode(bytes: Uint8Array = randomBytes(10)): string {
  let out = "";
  for (let i = 0; i < 10; i++) out += CROCKFORD[(bytes[i] ?? 0) & 31];
  return `SG-${out}`;
}

/** sha256 (hex) of the code as typed back: trimmed, case-insensitive. */
export function proofHash(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase(), "utf8").digest("hex");
}

const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));

/** True when one of the cells holds the code whose hash is `codeHash` (alone or inside other text). */
export function proofFound(cells: readonly (readonly unknown[])[] | undefined, codeHash: string): boolean {
  for (const row of cells ?? []) {
    for (const cell of row) {
      if (typeof cell !== "string" && typeof cell !== "number") continue;
      for (const m of String(cell).matchAll(CODE_RE)) if (sameHash(proofHash(m[0]), codeHash)) return true;
    }
  }
  return false;
}

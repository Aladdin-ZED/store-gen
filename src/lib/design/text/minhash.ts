/**
 * Bottom-k MinHash (P6 DESIGN; design.md DES-§2.2, DES-§9.8). Pure and isomorphic. A sketch is the k smallest hashes
 * of a set, each a 16-character lowercase hex string, so the numeric order of the unsigned 64-bit value is the string
 * order. The order must be uniformly mixed for the estimate to hold: the server keys its hashes with HMAC-SHA256
 * (headlines.server.ts); the tests use SHA-256. `fnv64` (the core's FNV-1a `hash16`) clusters on near-equal inputs
 * and is for ids, never for a sketch.
 *
 * Containment of a candidate set C in a set B known only by its sketch S_B: with τ_B the largest hash of S_B when B
 * holds k rows (else every hash of B is in S_B and τ_B = ∞), `|C ∩ S_B| / |{c ∈ C : h(c) ≤ τ_B}|`.
 */
import { hash16 } from "@/lib/render/origin";

export const SKETCH_K = 256;

/** FNV-1a 64-bit of the UTF-8 bytes (NFC, trimmed), 16 lowercase hex characters: the core's `hash16`. */
export const fnv64 = (s: string): string => hash16(s);

/** The k smallest distinct hashes, ascending. */
export function bottomK(hashes: Iterable<string>, k = SKETCH_K): string[] {
  return [...new Set(hashes)].sort().slice(0, k);
}

/** The sketch's threshold τ: its largest hash when full, else null (∞: the sketch holds the whole set). */
export function sketchThreshold(sketch: readonly string[], k = SKETCH_K): string | null {
  return sketch.length >= k ? (sketch[sketch.length - 1] ?? null) : null;
}

/**
 * The containment estimate of `candidate` (hashes) in the set behind `sketch` (`matches` = the candidate hashes found
 * in it, when the caller already knows them; `tau` = its threshold, null for ∞). null when no candidate hash falls
 * under τ (nothing to estimate from).
 */
export function containment(candidate: readonly string[], sketch: ReadonlySet<string>, tau: string | null): number | null {
  const under = [...new Set(candidate)].filter((h) => tau === null || h <= tau);
  if (!under.length) return null;
  let hit = 0;
  for (const h of under) if (sketch.has(h)) hit++;
  return hit / under.length;
}

/** The exact containment |A ∩ B| / |A| (the tests' reference). */
export function exactContainment(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (!a.size) return 0;
  let hit = 0;
  for (const x of a) if (b.has(x)) hit++;
  return hit / a.size;
}

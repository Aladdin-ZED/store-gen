/**
 * The R2 contract stubs' typed refusal (maintainer; docs/STORE-SAAS.md §K.4 "Contract step (maintainer)", step C2-C).
 *
 * Every cross-track function an R2 track (S1 … S7) calls in another track's file is frozen as a stub before the tracks
 * start: the final signature with its doc comment, and a body that either returns a typed empty value (where the caller
 * must render something: a list, a null "not available" line) or throws `NotBuiltYet` naming the owning track. The
 * owning track replaces the body and keeps the signature (src/lib/contracts/r2-stubs.ts checks it at `tsc`). A caller
 * that can degrade (S3's import registry answering `kind_unavailable`, S2's theme preview showing a placeholder for a
 * store kind, S5 keeping its R1 Sheets columns) catches it with `isNotBuiltYet`; any other caller lets it surface. No R1
 * path reaches a stub: every R2 surface is behind `releaseOn("R2")` (src/lib/auth/permissions.ts).
 *
 * Isomorphic, no import: client stubs (hooks, components) and server stubs share it. The message starts with
 * "not implemented: <track>" (the wording the R2 plans test for).
 */

/** The R2 tracks (§K.4): S1 STOREFRONT, S2 BRAND & LOGO, S3 MONEY, S4 LOGISTICS, S5 INTEGRATIONS 2, S6 PLATFORM UX, S7 AI DATA. */
export type R2Track = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7";

/** A frozen R2 function whose body the owning track has not written yet. */
export class NotBuiltYet extends Error {
  readonly code = "not_built_yet" as const;
  readonly track: R2Track;
  /** the frozen function, e.g. "createManualOrderV3" */
  readonly fn: string;
  constructor(track: R2Track, fn: string) {
    super(`not implemented: ${track} (${fn})`);
    this.name = "NotBuiltYet";
    this.track = track;
    this.fn = fn;
  }
}

/** True for a `NotBuiltYet` (also across module copies: the `code` is checked, not only the class). */
export function isNotBuiltYet(err: unknown): err is NotBuiltYet {
  return err instanceof NotBuiltYet || (typeof err === "object" && err !== null && (err as { code?: unknown }).code === "not_built_yet");
}

/** The stub body: `return notBuiltYet("S1", "createManualOrderV3")`. */
export function notBuiltYet(track: R2Track, fn: string): never {
  throw new NotBuiltYet(track, fn);
}

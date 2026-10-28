import "server-only";
/**
 * Legal documents and re-acceptance (P1 CONSOLE; platform.md PLA-§13.4, §22.15, PD17; P0b: CCR P2-6). P1 owns the
 * file: the console's legal publisher (save, review, publish, retire) lands here with the track. P2 (merging before
 * P1) reads the tenant side: `StorePulse.reaccept` (core §I.4) and the blocking re-acceptance sheet with
 * `acceptLegalAction` (PLA-§22.15), both for the caller's own rows only (PLA-§3.7 rev 6).
 *
 * P0b stub: the track replaces the body, never the signature (src/lib/contracts/r1-p0b-platform.ts).
 *   - `pendingReacceptance`: `null` = nothing to accept. That is the truth until P1 merges: only a **published**
 *     document with `requiresReacceptance` can ask for a new acceptance, and the publisher that publishes one is P1's,
 *     so before it no document can require re-acceptance (the sheet never shows, the pulse says `reaccept: false`);
 *   - `recordReacceptance`: throws, since nothing can be pending to accept before P1.
 */
import type { UserCtx } from "@/lib/tenancy/types";

/** One document the viewer must accept again: its title and "What changed" summary, in the viewer's locale. */
export interface LegalDocSummary {
  id: string;
  kind: string;
  title: string;
  summary: string;
  version: number;
}

/** The effective published documents with `requiresReacceptance` the user has not accepted (cached 5 min per session); null = none. */
export async function pendingReacceptance(userId: string): Promise<{ docs: LegalDocSummary[] } | null> {
  void userId;
  return null;
}

/** `acceptLegalAction` (userAction): one `legal_acceptances` row per document, `context = 'reaccept'`, with the IP hash and UA label. */
export async function recordReacceptance(ctx: UserCtx, documentIds: readonly string[], meta: { ipHash: string | null; uaLabel: string }): Promise<void> {
  void ctx;
  void documentIds;
  void meta;
  throw new Error("not implemented: P1 recordReacceptance");
}

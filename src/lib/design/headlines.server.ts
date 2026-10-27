import "server-only";
/**
 * The cross-store headline check (P6 DESIGN; design.md DES-§9.8, N8, DS7; docs/STORE-SAAS.md §K.2 P0 design stubs,
 * §M.4). Server-only: HMAC shingles of each line against the niche's `headline_shingles` rows of other owners,
 * answered per line as `{ verdict, band }` (the band over ≥ 10 owners, never a share number, no owner, no count).
 * The wizard calls it through `checkHeadlinesAction` (./actions.ts) and P7's `useNoveltyGuard`. Typed at P0
 * (src/lib/contracts/r1-p0.ts). P0 stub: nothing is read and every line is `ok` with no band (fewer than ten owners
 * known), the documented "no collision found" answer; P6 replaces the body.
 */
import type { StoreScope } from "@/lib/tenancy/types";

export type HeadlineVerdict = { verdict: "ok" | "close"; band: "low" | "mid" | "high" | null };

/** ≤ 60 lines per call (the action enforces it), one verdict per line in order. */
export async function checkHeadlineNovelty(scope: StoreScope, niche: string, texts: readonly string[]): Promise<HeadlineVerdict[]> {
  void scope;
  void niche;
  return texts.map(() => ({ verdict: "ok", band: null }));
}

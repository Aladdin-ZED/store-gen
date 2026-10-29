/**
 * The one acceptance rule of stage 5 (P7 AI; ai.md AI-§A.8.2 stage 5, AI-§A.8.9, AI-19 acceptance 2; rev 3, QUAL-9;
 * shared with design DES-§8.9 and the builder's "Director review", AI-§A.8.8). Pure and isomorphic: the wizard calls
 * it after design's `applyOps` + `runGates` on a sandbox copy, once per op.
 *
 * An op is KEPT when, against the state before it:
 *   1. no new hard item appears (a design hard gate or a budget row "over"; counted per id, so a second V03 is new);
 *   2. the slop score does not rise;
 *   3. no novelty band gets worse (own / niche / platform; ok → close → too_close, `first` counts as `ok`), so every
 *      band that was `ok` stays `ok`.
 * The quality score Q may stay equal or move either way: it is reported with the verdict, never the key. A judgment
 * op that changes no gate item (a `swapHeroFamily` for composition, a `setOpener` for rhythm) is therefore kept: such
 * ops are the point of the stage. A rejection names the first rule it broke (`hard`, then `slop`, then `band`), logged
 * as `repair_rejected` with that reason.
 */
import type { Band, GenomeCard } from "@/lib/design";
import { hardFailsOf } from "./budgets";
import type { DirectorDigest } from "./types";

/** What the rule compares: the gate state of one candidate document. */
export interface GateSnapshot {
  /** design hard gate ids and budget rows "over" ("budget:C2") */
  hard: readonly string[];
  slop: number;
  q: number;
  bands: { own: Band | "first"; niche: Band; platform: Band };
}

export type AcceptVerdict = { kept: true; q: { before: number; after: number } } | { kept: false; reason: "hard" | "slop" | "band"; q: { before: number; after: number } };

/** The snapshot of a candidate from its card (the novelty bands) and its digest (gates, slop, Q, budgets). */
export function gateSnapshot(card: Pick<GenomeCard, "distance">, digest: Pick<DirectorDigest, "gates" | "budgets">): GateSnapshot {
  return { hard: hardFailsOf(digest), slop: digest.gates.slop, q: digest.gates.q, bands: { ...card.distance } };
}

const BAND_RANK: Record<Band | "first", number> = { first: 0, ok: 0, close: 1, too_close: 2 };

function newHard(before: readonly string[], after: readonly string[]): boolean {
  const seen = new Map<string, number>();
  for (const id of before) seen.set(id, (seen.get(id) ?? 0) + 1);
  for (const id of after) {
    const left = seen.get(id) ?? 0;
    if (left === 0) return true;
    seen.set(id, left - 1);
  }
  return false;
}

/** The one rule (see the header). */
export function acceptOp(before: GateSnapshot, after: GateSnapshot): AcceptVerdict {
  const q = { before: before.q, after: after.q };
  if (newHard(before.hard, after.hard)) return { kept: false, reason: "hard", q };
  if (after.slop > before.slop) return { kept: false, reason: "slop", q };
  for (const k of ["own", "niche", "platform"] as const) {
    if (BAND_RANK[after.bands[k]] > BAND_RANK[before.bands[k]]) return { kept: false, reason: "band", q };
  }
  return { kept: true, q };
}

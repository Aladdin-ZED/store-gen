"use client";
/**
 * HealthRing (P2 SHELL; platform.md PLA-§22.12, §22.16, §6.3, PD61, PD67; docs/STORE-SAAS.md §I.7): the Store Health
 * score in tabular numerals with a stroke tinted by band (≥ 80 jade, 50-79 neutral, 30-49 yellow, < 30 crimson), a
 * neutral "computing" state while `score` is null, and "Recompute now" through `onRecompute`.
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts); P1 builds against them before P2 merges.
 * P0b stub: the track replaces the body, never the signature. The stub renders the score as text, and no number at
 * all while it is null; the ring, its band tint, its one 240 ms draw and the recompute control are P2's.
 */
import type { ReactElement } from "react";

export interface HealthRingProps {
  score: number | null;
  attention: 0 | 1 | 2 | 3;
  size: 40 | 56 | 96;
  computedAt: string | null;
  dirty?: boolean;
  surface: "tenant" | "console";
  onRecompute?(): Promise<void>;
}

export function HealthRing(p: HealthRingProps): ReactElement | null {
  return (
    <div data-attention={p.attention} data-size={p.size} data-surface={p.surface} data-dirty={p.dirty ? "" : undefined} data-computed-at={p.computedAt ?? undefined}>
      {p.score !== null && <data value={p.score}>{p.score}</data>}
    </div>
  );
}

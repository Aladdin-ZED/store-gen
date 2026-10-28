/**
 * FreshnessDot (P2 SHELL; platform.md PLA-§22.12, §4.7 rule 8, §22.16, PD78): "Updated 2 min ago" as text plus a dot
 * that carries real state only: neutral once `at` is older than `staleAfterMs`, and no time at all while `at` is null.
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts); P1 builds against them before P2 merges.
 * P0b stub: the track replaces the body, never the signature. The stub renders the label and, when `at` is set, the
 * time element for it (`staleAfterMs` as `data-stale-after-ms`); the relative time and the dot's state are P2's.
 */
import type { ReactElement } from "react";

export interface FreshnessDotProps {
  at: string | null;
  staleAfterMs: number;
  label: string;
}

export function FreshnessDot(p: FreshnessDotProps): ReactElement | null {
  return (
    <span data-stale-after-ms={p.staleAfterMs}>
      {p.label}
      {p.at !== null && (
        <>
          {" "}
          <time dateTime={p.at}>{p.at}</time>
        </>
      )}
    </span>
  );
}

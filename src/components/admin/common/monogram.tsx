/**
 * Monogram (P2 SHELL; platform.md PLA-§22.12, PD1): a store's or a person's initial in a seeded tile (the store
 * switcher, the console lists, notes), tinted from `accentHue` when the store has one (admin tokens only).
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts); P1 builds against them before P2 merges.
 * P0b stub: the track replaces the body, never the signature. The stub renders the name's first character, named by
 * the full name; the seeded tile and its tint are P2's.
 */
import type { ReactElement } from "react";

export interface MonogramProps {
  name: string;
  seed: string;
  accentHue?: number | null;
  size: 24 | 32 | 48;
}

export function Monogram(p: MonogramProps): ReactElement | null {
  // by code point, so a name that starts with an emoji or an astral character keeps it whole
  const initial = Array.from(p.name.trim())[0] ?? "";
  return (
    <span role="img" aria-label={p.name} data-seed={p.seed} data-size={p.size}>
      {initial}
    </span>
  );
}

/**
 * Class fragments every shared primitive repeats (P2 SHELL; platform.md PLA-§22.12 "every primitive"; design.md
 * DES-§16.7, §16.8, §16.17 items 7 and 11). Tokens only.
 *
 * - `FOCUS_RING`: the 2 px accent ring (`--ring`, ≥ 3:1 on every ground, test:admin-tokens) with a 2 px offset;
 * - `TOUCH`: ≥ 44 px targets below 768 px whatever the density;
 * - `NUM`: tabular numerals for every count, money and timer.
 */
export const FOCUS_RING = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
export const TOUCH = "max-md:min-h-11 max-md:min-w-11";
export const NUM = "tabular-nums";

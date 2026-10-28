/**
 * `injection.screen` (AI-08; ai.md AI-§E.3 control 4, AI-§D.3): the Fast-class screen of imported bulk text before it
 * can be a prompt input. The shapes are frozen at P0 (src/lib/contracts/r1-p0.ts). `reason` ≤ 120 chars and never
 * echoes more than 40 chars of the screened text.
 */
export type InjectionScreenInput = { text: string; source: "import" | "sheet" | "note" };
export type InjectionScreenOut = { suspicious: boolean; reason: string };

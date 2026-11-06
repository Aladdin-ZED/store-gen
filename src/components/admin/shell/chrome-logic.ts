/**
 * The shell chrome's small pure rules (P2 SHELL; design.md DES-§16.7; platform.md PLA-§20.1, §23.1), kept out of the
 * client components so `test:shell` checks them without a browser: the density default, the install hint's offer,
 * the visit counter, and the Help sheet's tip sections.
 */

/* ------------------------------------------------------------------ density (DES-§16.7) */

export type Density = "comfortable" | "compact";
export const DENSITIES: readonly Density[] = ["comfortable", "compact"];

/** The role's default: compact for call agents and managers, comfortable for everyone else. */
export function defaultDensity(role: string): Density {
  return role === "agent" || role === "manager" ? "compact" : "comfortable";
}

/* ------------------------------------------------------------------ install hint (PLA-§23.1, UX-07) */

/** The menu offers the install from this visit on (never on the first). */
export const INSTALL_HINT_VISITS = 3;
export const VISITS_KEY = "sg:app-visits";
export const VISIT_SESSION_KEY = "sg:app-visit-counted";

/** The visit count after this page load (counted once per browser session); 0 when storage is blocked. */
export function countVisit(local: () => Storage, session: () => Storage): number {
  try {
    const seen = Math.max(0, Math.floor(Number(local().getItem(VISITS_KEY)) || 0));
    if (session().getItem(VISIT_SESSION_KEY)) return seen;
    session().setItem(VISIT_SESSION_KEY, "1");
    local().setItem(VISITS_KEY, String(seen + 1));
    return seen + 1;
  } catch {
    return 0;
  }
}

/** What the account menu offers: the browser's own prompt, the iPhone sheet, or nothing. */
export function installOffer(p: { visits: number; standalone: boolean; native: boolean; ios: boolean }): "native" | "ios" | null {
  if (p.visits < INSTALL_HINT_VISITS || p.standalone) return null;
  if (p.native) return "native";
  return p.ios ? "ios" : null;
}

/* ------------------------------------------------------------------ Help sheet tips (PLA-§20.1) */

/** The screens with tips of their own; every other screen gets the general ones. */
export const HELP_SECTIONS = ["overview", "orders", "pages", "generate", "media", "team", "settings"] as const;
export const HELP_TIPS_PER_SECTION = 2;

/** The tips' section for a nav item id ("general" for a screen without tips of its own). */
export function helpSection(navId: string | null | undefined): string {
  return navId && (HELP_SECTIONS as readonly string[]).includes(navId) ? navId : "general";
}

/** The catalog keys of one section's tips. */
export function helpTipKeys(section: string): string[] {
  return Array.from({ length: HELP_TIPS_PER_SECTION }, (_, i) => `shell.help.tip.${section}.${i + 1}`);
}

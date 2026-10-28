/**
 * The mode explainer's words (P2 SHELL; platform.md PLA-§22.1.5, PD72, OPS-31; docs/STORE-SAAS.md §A.2). Pure and
 * isomorphic: `ModeCards` (signup step 2, /app/new, the onboarding details step, the mode-switch sheet of Settings →
 * General) renders what `modeSummary(mode)` answers.
 *
 * Derived from `modeAllows()` so it never drifts from §A.2: each "you get" bullet names the mode features it promises,
 * and `modeSummary` keeps a bullet only while `modeAllows(mode, feature)` holds for every one of them (a bullet with no
 * feature is the part every mode has: orders, call center, Sheets). A mode whose three bullets do not all hold is a
 * drift `test:shell` catches; it never shows a promise the mode cannot keep. No bullet claims a number, a price or a
 * result (owner rule 4); the texts are `auth.signup.mode.<mode>.*` in the auth catalogs.
 */
import type { MessageKey } from "@/lib/i18n/admin";
import { modeAllows, selectableStoreModes, STORE_MODES, type ModeFeature, type StoreMode } from "@/lib/tenancy/mode";

export interface ModeSummary {
  title: MessageKey;
  line: MessageKey;
  get: [MessageKey, MessageKey, MessageKey];
  later: MessageKey;
  /** the release the mode is selectable from (R1: landing only) */
  release: "R1" | "R2";
}

export interface ModeBullet {
  key: MessageKey;
  /** the §A.2 features the bullet promises (empty: every mode has it) */
  needs: readonly ModeFeature[];
}

/** The bullets of each mode, in display order (PLA-§22.1.5 reference table). */
export const MODE_BULLETS: Readonly<Record<StoreMode, readonly [ModeBullet, ModeBullet, ModeBullet]>> = {
  landing: [
    { key: "auth.signup.mode.landing.get.1", needs: ["landing"] },
    { key: "auth.signup.mode.landing.get.2", needs: ["landing"] },
    { key: "auth.signup.mode.landing.get.3", needs: [] },
  ],
  store: [
    { key: "auth.signup.mode.store.get.1", needs: ["catalog"] },
    { key: "auth.signup.mode.store.get.2", needs: ["storefront", "cart"] },
    { key: "auth.signup.mode.store.get.3", needs: [] },
  ],
  both: [
    { key: "auth.signup.mode.both.get.1", needs: ["catalog", "storefront", "cart"] },
    { key: "auth.signup.mode.both.get.2", needs: ["landing", "catalog"] },
    { key: "auth.signup.mode.both.get.3", needs: [] },
  ],
};

/** Does `mode` keep every feature `bullet` promises? */
export function bulletHolds(mode: StoreMode, bullet: ModeBullet): boolean {
  return bullet.needs.every((f) => modeAllows(mode, f));
}

/** The release a mode is first selectable in (§A.2): landing in R1, the storefront modes with the storefront (R2). */
const RELEASE: Record<StoreMode, "R1" | "R2"> = { landing: "R1", store: "R2", both: "R2" };

/** Can the owner pick `mode` today? (`selectableStoreModes()`; the cards show "Coming soon" otherwise, PD30) */
export function modeSelectable(mode: StoreMode): boolean {
  return selectableStoreModes().includes(mode);
}

export function modeSummary(mode: StoreMode): ModeSummary {
  const bullets = MODE_BULLETS[mode];
  const held = bullets.filter((b) => bulletHolds(mode, b));
  if (held.length !== bullets.length) {
    // a bullet table out of step with §A.2: refuse to promise, test:shell fails on the same check
    throw new Error(`modeSummary(${mode}): a bullet promises a feature the mode does not allow`);
  }
  return {
    title: `auth.signup.mode.${mode}.title`,
    line: `auth.signup.mode.${mode}.line`,
    get: [bullets[0].key, bullets[1].key, bullets[2].key],
    later: "auth.signup.mode.change_later",
    release: RELEASE[mode],
  };
}

/** Every mode's summary, in §A.2 order. */
export function modeSummaries(): Record<StoreMode, ModeSummary> {
  return Object.fromEntries(STORE_MODES.map((m) => [m, modeSummary(m)])) as Record<StoreMode, ModeSummary>;
}

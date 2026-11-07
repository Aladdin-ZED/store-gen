#!/usr/bin/env node
/**
 * build-logo-fonts — the logo engine's fonts (S2 BRAND & LOGO, design.md DES-R7, DES-§26; core §K.4): the TTF
 * subsets, their manifest and hb.wasm under public/logo-fonts/ for HarfBuzz shaping (`harfbuzzjs`, pinned at the R2
 * contract step), reading WOFF2 through scripts/fonts/woff2-sfnt.mjs. Runs in `prebuild` / `predev` after
 * scripts/build-landing-assets.mjs and before `test:logo` (`--if-stale`: rebuilds only when an input changed).
 * Written minimal at the R2 contract step (C2-D) so the hooks exist; S2 fills it. Fast: writes nothing yet.
 *
 *   node scripts/build-logo-fonts.mjs [--if-stale]
 */
console.log("build-logo-fonts: not built yet (S2)");

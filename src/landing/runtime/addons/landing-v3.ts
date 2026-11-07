/**
 * The `landing-v3` chunk (core D75, §H.13; LAN-§5.2): the asset build compiles src/landing/runtime/addons/<AddonChunk>.ts
 * for each add-on name with a budget, so this one line makes ../entry-v3.ts (the maintainer's LP-16 fork of
 * ../entry.ts) that chunk. src/landing/document.tsx inlines it in place of the `landing` core chunk on documents whose
 * #lp-config is v3; it is never an "after the core" add-on.
 */
import "../entry-v3";

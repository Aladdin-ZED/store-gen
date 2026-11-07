/**
 * The per-kind `test:prepublish` fixtures of the storefront checks (S1 STOREFRONT, storefront.md STO-§27.2, STO-§23.6;
 * core §K.4 "extension files"). Created empty at the R2 contract step (C2-D); the core's harness
 * (src/lib/render/selftest-prepublish.ts) imports `storefrontGateFixtures` and runs every entry, so S1 adds cases
 * here and never edits the harness. A fixture proves one behaviour of `./storefront.ts` (a kind's budget profile, a
 * `storefront:*` item under its code, a page kind's gate) and throws (node:assert) when it does not hold.
 * Test data only: `scripts/qa/registries-check.ts` ignores `*.fixtures.ts`, and no runtime path imports this file.
 */

export interface StorefrontGateFixture {
  /** what it proves, e.g. "pdp: the hero image over its kind's budget is a hard item" */
  name: string;
  /** the STO-§6.1 page kind it exercises, when it is about one kind */
  kind?: string;
  run(): void | Promise<void>;
}

export const storefrontGateFixtures: StorefrontGateFixture[] = [];

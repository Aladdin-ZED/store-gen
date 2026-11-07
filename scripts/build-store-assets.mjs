#!/usr/bin/env node
/**
 * build-store-assets — the store runtime chunks (S1 STOREFRONT, storefront.md STO-§14.6, STO-R13; core §H.13, §K.4):
 * runs in `prebuild` / `predev` right after scripts/build-landing-assets.mjs (the store chunks reuse the landing's
 * units-matrix / units-fields / fill-steps-box chunks). Written minimal at the R2 contract step (C2-D); S1 adds the
 * chunk builds (pdp, store, cart, checkout, store-pixels, store-thanks, search) and keeps the rule below.
 *
 * The derived `store-page` cap (rev 3, STO-R26 restated / ENGP-31), checked on every run: budgets.json's
 * `store-page` must be at least ceil500 of the sum of the budgets of `compositions["store-page"]` (the heaviest set:
 * pdp + checkout + store-pixels + units-matrix + units-fields + fill-steps-box = 41,000 B gz in R2). Exit 1 when it is
 * below, or when a chunk of the composition has no budget. Fast (no build yet): reads one JSON file.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const budgets = JSON.parse(readFileSync(join(ROOT, "src", "landing", "runtime", "budgets.json"), "utf8"));
const names = budgets.compositions?.["store-page"];
const fail = (msg) => {
  console.error(`build-store-assets: ${msg}`);
  process.exit(1);
};
if (!Array.isArray(names) || !names.length) fail('budgets.json has no compositions["store-page"]');
const missing = names.filter((n) => typeof budgets[n] !== "number");
if (missing.length) fail(`compositions["store-page"]: ${missing.join(", ")} have no budget`);
const sum = names.reduce((n, k) => n + budgets[k], 0);
const derived = Math.ceil(sum / 500) * 500;
if (typeof budgets["store-page"] !== "number") fail('budgets.json has no "store-page" budget');
if (budgets["store-page"] < derived) fail(`store-page ${budgets["store-page"]} B is below the derived cap ceil500(${sum}) = ${derived} B (ENGP-31)`);
console.log(`build-store-assets: store-page cap ${budgets["store-page"]} B ≥ ceil500(${sum}) = ${derived} B; store chunks not built yet (S1)`);

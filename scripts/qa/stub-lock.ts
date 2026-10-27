/**
 * The STUB-BUILD LOCK at build time (maintainer; docs/STORE-SAAS.md §K.2 P0 stub rule, §H.10, ENGC-21; P0 maintainer
 * decision 5): the first step of `prebuild`. While design's height model is the P0 stub (src/lib/design/heights.ts,
 * asked through `heightModelIsStub()`), the budget gate only writes notes (C2, C3 and F1 cannot be measured, and no row
 * refuses a page before P6, see docs/STORE-SAAS.md §K.2's maintainer build note), so a build must not ship:
 * this exits 1 with the lock message unless SG_STUB_BUILD_OK=1, which only the maintainer's merge gates before P6 set.
 * Hostinger's build never sets it, so a stub build is red there; scripts/deploy/archive.mjs refuses a gate file written
 * with the stub (`stubBuild: true`, scripts/qa/gate-ok.ts), so it is never archived either. Once P6 merges the real
 * model this passes without the variable. No secret is read.
 *
 *   npx tsx scripts/qa/stub-lock.ts            (exit 1 while the stub is in place and SG_STUB_BUILD_OK is not "1")
 */
import { heightModelIsStub, STUB_LOCK_MESSAGE } from "@/lib/render/prepublish/budget-limits";

if (!heightModelIsStub()) {
  console.log("stub-lock: ✓ design's height model is real; every budget row can refuse a page");
} else if (process.env.SG_STUB_BUILD_OK === "1") {
  console.log("stub-lock: ⚠ SG_STUB_BUILD_OK=1: building with the P0 height stub (the budget gate only writes notes); the gate file will say stubBuild: true and no archive is made from it");
} else {
  console.error(STUB_LOCK_MESSAGE);
  process.exit(1);
}

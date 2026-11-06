/**
 * `test:design` (P6 DESIGN; design.md DES-§25.1, DES-§1.4): runs every group registered in src/lib/design/selftest.ts.
 *
 *   npx tsx scripts/qa/design-check.ts            the seeded fast subset (npm test, ≤ the design share of §J.1)
 *   npx tsx scripts/qa/design-check.ts --full     the full sweeps (test:design:full, in test:slow)
 *   npx tsx scripts/qa/design-check.ts --only typography,n7
 *
 * Exit code 1 on any failure; each group prints its ids, its checks and its time.
 */
import { DESIGN_GROUPS, type GroupCtx } from "@/lib/design/selftest";
// step 2 (genome core): determinism, H-rules, compile, genomeOf, gene spread, hints, distance, tokens, Director vocabulary
import "@/lib/design/selftest-genome";
// step 3 (measurement core): the height model against the calibration, the fold contract, the form, the features
import "@/lib/design/selftest-heights";
// step 6 (choreography and generator integration): expansions, rhythm planners, the 140-plan sweep, N5 / N6, DG-12 R1
import "@/lib/design/selftest-choreography";
// step 7 (copy engine): normalisers, the cliché fixture, the register sets, the copy rules, the compositional sweep, bottom-k
import "@/lib/design/selftest-copy";
// step 8 (gates, repairs, digest): TC-1, the calibration fixtures, Q anchors, repairs, items, RD-1, GN-1, kinds, seeds
import "@/lib/design/selftest-gates";
// step 9 (novelty service): the pool's bounds-first verdicts, the DS57 timing, the niche shares, the capacity (--full)
import "@/lib/design/selftest-novelty";
// step 11 (wizard and reveal): the alpha estimate, the DES-§14.2 pipeline on the fixtures, its degraded paths
import "@/lib/design/selftest-wizard";
import { registerDesignGroup } from "@/lib/design/selftest";

// step 4 (section kit redraws): the 41 baseline documents against their goldens (--full; test:render runs the 14
// fixture defaults on every run)
registerDesignGroup({
  id: "baseline",
  title: "the 41 baseline documents: checksums unchanged, markup changed only in the reviewed redraws (--full)",
  ids: ["DS4", "V40", "CRIT15"],
  async run({ full, check, note }) {
    if (!full) {
      note("the 41 run with --full (test:render compares the 14 fixture defaults)");
      return;
    }
    const { BASELINE, compareBaseline } = await import("./design-baseline");
    const problems = await compareBaseline(BASELINE);
    check(problems.length === 0, problems.slice(0, 20).join("\n    "));
  },
});

async function main() {
  const full = process.argv.includes("--full");
  const onlyArg = process.argv.indexOf("--only");
  const only = onlyArg > 0 ? new Set((process.argv[onlyArg + 1] ?? "").split(",").filter(Boolean)) : null;
  let failures = 0;
  let checks = 0;
  const t0 = performance.now();
  for (const g of DESIGN_GROUPS) {
    if (only && !only.has(g.id)) continue;
    const fails: string[] = [];
    const notes: string[] = [];
    let n = 0;
    const ctx: GroupCtx = {
      full,
      check(cond, message) {
        n++;
        if (!cond) fails.push(message);
      },
      note(message) {
        notes.push(message);
      },
    };
    const g0 = performance.now();
    try {
      await g.run(ctx);
    } catch (e) {
      fails.push(`threw ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    }
    checks += n;
    failures += fails.length;
    console.log(`${fails.length ? "✗" : "✓"} ${g.id} [${g.ids.join(", ")}] ${g.title} · ${n} checks in ${((performance.now() - g0) / 1000).toFixed(1)} s`);
    for (const m of notes) console.log(`    ${m}`);
    for (const m of fails.slice(0, 25)) console.log(`    FAIL ${m}`);
    if (fails.length > 25) console.log(`    … ${fails.length - 25} more`);
  }
  console.log(`\n${full ? "full" : "fast"} · ${checks} checks · ${((performance.now() - t0) / 1000).toFixed(1)} s · ${failures ? `${failures} FAILURE(S)` : "ALL OK"}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

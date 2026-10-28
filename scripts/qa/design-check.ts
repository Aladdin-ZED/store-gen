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

/**
 * Deploy gate (docs/OFFERS.md §I.3; docs/STORE-SAAS.md §D.8 "Read-only gates", §H.10): READ ONLY.
 *
 *   npm run qa:upgrade-dry-run -- --db mysql://user:pass@127.0.0.1:3306/cod_studio [--json report.json] [--require-envelopes]
 *
 * Two sections, both must pass:
 *  - offers: every pages.draft, every page_versions.doc and every non-revoked export's version through the v1 → v2
 *    upgrade the build applies on read: 0 unreadable documents, ids preserved, offerMath (cents) == v1 bundleMath per
 *    bundle, orderTotals equal for each bundle × bump on/off, Sheets labels identical; repair counts by kind and every
 *    money value changed by rounding are printed;
 *  - tenancy: on a dump taken before R1.0 ("pre-tenancy"), what 0004 and the store #1 conversion will find (store #1,
 *    its handle, an active owner, the legacy envelopes); on a migrated database, NULL store ids, stores without an
 *    active owner, cross-store references, legacy envelopes, handles and the tenancy_v1 marker; on both, the tenant
 *    tables of schema.ts against §D.3 (ENGC-31). `--require-envelopes` makes an envelope this APP_SECRET cannot open a
 *    problem: run it with the production secret in the environment (never printed) before the R1.0 deploy.
 * The session is switched to read-only transactions before the first query. Run it on the XAMPP database and on a
 * fresh dump of production imported into XAMPP before every deploy. Exit code 1 when the gate fails.
 */
import Module from "node:module";
import { writeFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { runTenancyCheck, runUpgradeCheck, tenancyCheckOk, tenancyCheckSummary, upgradeCheckOk, upgradeCheckSummary } from "@/lib/db/upgrade-check";

// the tenancy section opens envelopes with src/lib/security/crypto.ts, marked `import "server-only"`; outside Next that import throws
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = require.resolve("mysql2/promise"); // any resolvable module: server-only exports nothing used
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    return req === "server-only" ? stub : orig.call(this, req, ...rest);
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const url = arg("db");
  if (!url || !/^mysql:\/\//.test(url)) {
    console.error("upgrade-dry-run: --db mysql://… is required (read-only)");
    process.exit(2);
  }
  const conn = await mysql.createConnection({ uri: url, charset: "utf8mb4_unicode_ci", timezone: "Z", connectTimeout: 10_000 });
  try {
    const started = Date.now();
    const report = await runUpgradeCheck(conn);
    const offersOk = upgradeCheckOk(report);
    console.log("offers:");
    for (const line of upgradeCheckSummary(report)) console.log(`  ${line}`);
    const tenancy = await runTenancyCheck(conn, { requireEnvelopes: process.argv.includes("--require-envelopes") });
    const tenancyOk = tenancyCheckOk(tenancy);
    console.log("tenancy:");
    for (const line of tenancyCheckSummary(tenancy)) console.log(`  ${line}`);
    const ok = offersOk && tenancyOk;
    console.log(`${ok ? "✓ upgrade dry run passed" : `✗ upgrade dry run FAILED (${[offersOk ? "" : "offers", tenancyOk ? "" : "tenancy"].filter(Boolean).join(", ")})`} (${Date.now() - started} ms)`);
    const json = arg("json");
    if (json) writeFileSync(json, JSON.stringify({ offers: report, tenancy }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    await conn.end().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error("upgrade-dry-run:", err instanceof Error ? err.message : err);
  process.exit(2);
});

/**
 * qa:detached-job-probe (P7 AI; ai.md AI-§B.13 step 5, AI-§Q.4; docs/STORE-SAAS.md §H.12 rule 1, D56): manual, run
 * against the live site (or a local production server) before the deep pass is enabled. It measures how long Next's
 * `after()` keeps a detached job alive past the response on that host, and whether a poll that runs a stage inside its
 * own request (≈ 60 s) gets through the host's proxy. It never changes the release flag `ai_detached_jobs`: that is a
 * staff toggle in Console → Flags (audited), decided from the line this prints.
 *
 *   1. A staff member (admin or super admin, a member of the store) starts the probe job from the staff-only probe
 *      action of Settings → AI (`enqueueProbeJob` through `storeAction`: about 5 minutes of 60 s sleep stages that
 *      heartbeat every 10 s, no model, no credit; its `after()` driver is scheduled whatever the flag says).
 *   2. QA_PROBE_COOKIE='<the Cookie header of that staff session>' \
 *        npm run qa:detached-job-probe -- --base https://<host> --store <handle> --job <jobId> [--write]
 *      watches the job through the real route `GET /api/app/<handle>/ai/jobs/<id>?advance=0` every 10 s (read only:
 *      no Sec-Fetch-Site header, so the poll never drives it), up to 6 minutes or until the heartbeats stop for 40 s.
 *      survivedMs = the last heartbeat (or the finished stage) seen − the job's creation.
 *   3. When stages are left (`after()` died first), one same-origin `advance=1` poll runs the next stage inside the
 *      request: an answer means a ≈ 60 s request got through (proxyCutMs null); a 502 / 504 / reset at T means the
 *      proxy cut it at T (proxyCutMs = T).
 *   4. Prints the result as JSON and the HANDOFF line; `--write` records `{ survivedMs, proxyCutMs, at }` into
 *      `platform_ai.probe.detachedJob` through the app's settings (DATABASE_URL of that site, `.env.local` read when
 *      unset; the databases cod_studio and cod_storegen are refused). The cookie is never printed.
 * Exit code 1 when the job cannot be read.
 */
import { existsSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const nodeRequire = createRequire(__filename);
const load = <T>(id: string): T => nodeRequire(id) as T;
const argv = process.argv.slice(2);
const arg = (f: string) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};
const BASE = (arg("--base") ?? "").replace(/\/+$/, "");
const STORE = arg("--store") ?? "";
const JOB = arg("--job") ?? "";
const WRITE = argv.includes("--write");
const COOKIE = process.env.QA_PROBE_COOKIE ?? "";

const WATCH_MS = 6 * 60_000;
const SAMPLE_MS = 10_000;
/** no new heartbeat for this long: the detached driver is gone */
const SILENT_MS = 40_000;
/** on when `after()` survived at least this long past the response (AI-§B.13 step 5) */
const AFTER_ON_MS = 30_000;

interface JobBody {
  ok?: boolean;
  status?: string;
  stage?: string | null;
  progress?: { done: number; total: number };
  heartbeatAt?: string | null;
  driver?: string | null;
  createdAt?: string;
  error?: string | null;
}

if (!BASE || !/^[a-z0-9-]{2,63}$/.test(STORE) || !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(JOB) || !COOKIE) {
  console.error("usage: QA_PROBE_COOKIE='<Cookie header>' npm run qa:detached-job-probe -- --base <origin> --store <handle> --job <jobId> [--write]");
  process.exit(2);
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const url = (advance: 0 | 1) => `${BASE}/api/app/${encodeURIComponent(STORE)}/ai/jobs/${JOB}?advance=${advance}`;

async function read(): Promise<JobBody | null> {
  const res = await fetch(url(0), { headers: { cookie: COOKIE, accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (res.status !== 200) return null;
  return (await res.json()) as JobBody;
}

async function main(): Promise<void> {
  const first = await read();
  if (!first?.createdAt) {
    console.error("✗ the job cannot be read through the jobs route (wrong store, job id or session)");
    process.exit(1);
  }
  const created = Date.parse(first.createdAt);
  console.log(`watching job ${JOB} (${first.progress?.total ?? "?"} stages, created ${first.createdAt}) for up to ${WATCH_MS / 60_000} min, read only`);
  let lastAlive = created;
  let lastBody = first;
  const until = Date.now() + WATCH_MS;
  while (Date.now() < until) {
    const b = await read().catch(() => null);
    if (b) {
      lastBody = b;
      const beat = Math.max(b.heartbeatAt ? Date.parse(b.heartbeatAt) : 0, b.progress?.done ? Date.now() : 0);
      if (b.heartbeatAt) lastAlive = Math.max(lastAlive, Date.parse(b.heartbeatAt));
      console.log(`  ${new Date().toISOString()} status ${b.status} stage ${b.stage ?? "-"} done ${b.progress?.done ?? 0}/${b.progress?.total ?? 0} heartbeat ${b.heartbeatAt ?? "-"}`);
      if (b.status === "done" || b.status === "failed" || b.status === "cancelled") {
        if (b.status === "done") lastAlive = Math.max(lastAlive, beat);
        break;
      }
      if (Date.now() - lastAlive > SILENT_MS && lastAlive > created) break;
      if (Date.now() - created > SILENT_MS && lastAlive === created) break;
    }
    await wait(SAMPLE_MS);
  }
  const survivedMs = Math.max(0, lastAlive - created);

  // the proxy leg: one same-origin poll that runs a stage inside its own request
  let proxyCutMs: number | null = null;
  let proxyNote = "not measured (no stage left)";
  if (lastBody.status === "queued" || lastBody.status === "running") {
    const t0 = Date.now();
    try {
      const res = await fetch(url(1), { headers: { cookie: COOKIE, accept: "application/json", "sec-fetch-site": "same-origin" }, signal: AbortSignal.timeout(130_000) });
      const ms = Date.now() - t0;
      if (res.status === 502 || res.status === 504) {
        proxyCutMs = ms;
        proxyNote = `cut by the proxy at ${Math.round(ms / 1000)} s (${res.status})`;
      } else proxyNote = `a ${Math.round(ms / 1000)} s poll got through (${res.status})`;
    } catch {
      proxyCutMs = Date.now() - t0;
      proxyNote = `the connection was reset at ${Math.round(proxyCutMs / 1000)} s`;
    }
  }

  const result = { survivedMs, proxyCutMs, at: new Date().toISOString() };
  console.log(JSON.stringify(result));
  const advice = survivedMs >= AFTER_ON_MS ? "≥ 30 s: ai_detached_jobs may be turned on in Console → Flags" : "< 30 s: keep ai_detached_jobs off (polls drive the jobs)";
  console.log(`HANDOFF: detached-job probe ${result.at} on ${new URL(BASE).host}: after() kept the job alive ${Math.round(survivedMs / 1000)} s past the response (${advice}); proxy: ${proxyNote}.`);

  if (WRITE) {
    const M = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
    const orig = M._resolveFilename;
    const empty = nodeRequire.resolve("drizzle-orm");
    M._resolveFilename = function (request: string, ...rest: unknown[]) {
      return request === "server-only" || request === "client-only" ? empty : (orig as (...a: unknown[]) => string).call(this, request, ...rest);
    };
    const env = process.env as Record<string, string | undefined>;
    if (!env.DATABASE_URL) {
      const p = path.join(ROOT, ".env.local");
      // loads the variables without printing any of them
      if (existsSync(p)) (process as unknown as { loadEnvFile(p: string): void }).loadEnvFile(p);
    }
    const dbName = (() => {
      try {
        return decodeURIComponent(new URL(env.DATABASE_URL ?? "").pathname.replace(/^\//, ""));
      } catch {
        return "";
      }
    })();
    if (!dbName || dbName === "cod_studio" || dbName === "cod_storegen") {
      console.error(`✗ --write refused on the database "${dbName || "(none)"}"`);
      process.exit(2);
    }
    const { getPlatformSetting, setPlatformSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
    const cur = await getPlatformSetting("platform_ai", { fresh: true });
    const probe = { ...(cur.probe ?? { callShape: null, streamTransport: null, tokPerSec: {}, prices: {}, lines: {} }), at: result.at, detachedJob: result };
    await setPlatformSetting("platform_ai", { ...cur, probe } as never, { id: "detached-job-probe", kind: "system" });
    console.log("✓ written to platform_ai.probe.detachedJob (ai_detached_jobs unchanged)");
    const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
    await pool().end();
  }
  process.exit(0);
}

void main().catch((err) => {
  console.error(`✗ probe failed: ${err instanceof Error ? err.name : "error"}`);
  process.exit(1);
});

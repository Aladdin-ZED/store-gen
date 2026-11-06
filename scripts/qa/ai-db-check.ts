/**
 * test:ai-db (P7 AI; ai.md AI-§Q.2, AI-§C.2, AI-§C.3, AI-§E.5, AI-§A.4; docs/STORE-SAAS.md §J.2): the AI layer against
 * a real MariaDB. A throwaway database (cod_test_p7_* by default; any other name than cod_test_* is refused) is created,
 * migrated 0000…0005 through the app's migrator, seeded with store A (active, beta), store B (active, beta) and store
 * P (pending), then dropped.
 *
 *   npm run test:ai-db                                   (tsx scripts/qa/ai-db-check.ts)
 *   npx tsx scripts/qa/ai-db-check.ts --db cod_test_p7_aidb --keep --verbose
 *
 * Cases (step 6; later steps append theirs):
 *   reserve      reserve → reconcile (a refund, then an excess charged with allowOver past the limit, the next call
 *                refused); release before any provider billing restores every counter; a second release is a no-op
 *   races        20 parallel reservations at 1 credit left → exactly 1; the ai_credits_day race → exactly 1, the month
 *                counter refunded for the 19 others
 *   pending      the pending daily floor 10 (an active store's floor 50 in the same settings); the pending stores'
 *                platform share at its limit → quota_platform_pending while an active store's call succeeds
 *   director     a beta store at 180 of 300 Director credits → quota_director, a copy reservation succeeds; the pass
 *                counter charged once per pass, never reconciled, refused at 30 a day
 *   cache        a cache hit served to its own store only, its run row via 'cache' with 0 credits and no counter moved
 *   memory       30 active items at most, 300 characters, tombstones, pins, the screen; store B's assembled prompt
 *                with A's rows present holds none of A's strings; a forged A row throws cross_store_context
 *   policy       aiPolicyFor: the cloud available for A, the pending share block for P, impersonation (live [],
 *                state, local off, no counter moved), the kill switch reflected within 30 s (fake clock)
 *   runs         linkAiRuns links only the store's own, unlinked runs; recent runs are metadata; aiUsageForStore
 *   jobs, key, prompt-versions, sf-05 (no AI path reads orders or leads; the R1 writers carry no customer column;
 *                the 0006/0007 rows are skipped until those tables exist)
 *   run-ai       (step 7) runAi against the localhost fake provider (src/lib/ai/testing/fake-anthropic.ts, reached only
 *                through the ai-base-url seam): AI-01 (1) disabled / no key / no cap → 0 requests and the library
 *                answers; AI-01 (2) one copy.page run → one ai_runs row (server, model, prompt version, tokens, cost,
 *                credits = ⌈cost / 10,000⌉) and ai_credits charged by exactly those credits; AI-01 (3) quota_store → no
 *                call, 0 credits; AI-01 (9) the same input again → no call, via 'cache', 0 credits; a refusal and a
 *                malformed answer with its one retry; AI-01 (15) 12 stubbed 2 s calls on a pool of 4 → no pool wait
 *                above 100 ms while they are in flight
 *   jobs-b       (step 8) pattern B with the fake provider: creation (row, reservation, pass, no after() with the flag
 *                off, after() once with it on, none under the ai-no-after seam), aj_active_uq dedupe and busy, a job
 *                done through polls alone (SG_AI_NO_AFTER=1), the same input run twice to done, a stage killed
 *                mid-call re-claimed by the next poll (stage_resumed) and finished, a second kill → failed with the
 *                instant result kept and the ledger reconciled, a driverless job handed to a one-item batch and
 *                finished by ai.batches, the sweep making no provider / advanceJob / after() call (spies), two
 *                concurrent polls running one stage once, the pool free during a stage's call, aiJobsForPulse
 *                isolation, the 31st Director pass and the 6th deep pass refused, a concurrent twin deduped or busy
 *   batches      queueAi dedupe and the 0.5x reservation, one submitted batch of 120 without betas, an ingest cut by
 *                the budget resumed next tick with nothing twice, the yields every 50 items, a replayed result skipped,
 *                the reservations reconciled at ingest
 *   rollups      the automatic rollback of a canary on 20 synthetic generations within one ai.rollups run (audit row,
 *                notification), a healthy canary's slice recomputed, ai_runs → ai_usage_daily idempotent, ai.reconcile
 *                of an abandoned run
 *   eval-live    the estimate, a live run (2 cases × 2 reps) through Batches with its judge items (judge ≠ candidate on
 *                every item) to a done row with the judge's cost apart, a smoke run scored at once
 *   routes       (step 9) AI-01 (11) poll-only completion through the real handler functions: the critique-as-job from
 *                director/critique (202 within 500 ms), a poll without Sec-Fetch-Site same-origin leaves it queued, the
 *                same-origin poll hands its batch-only stage to a batch; a fitting job finished by same-origin polls
 *                alone (SG_AI_NO_AFTER=1, flag off), the job body without its input;
 *                copy.page on the poll transport finished through runs/[id] alone; cancel's 204
 * Exit code 1 when a check fails.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import type { StoreCtx, StoreRow, StoreScope, WriteCtx as WriteCtxT, WriteScope } from "@/lib/tenancy/types";

/* ------------------------------------------------------------------ */
/* process                                                             */
/* ------------------------------------------------------------------ */

const ROOT = path.resolve(__dirname, "..", "..");
const nodeRequire = createRequire(__filename);
const load = <T>(id: string): T => nodeRequire(id) as T;

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const DB_NAME = flag("db") ?? `cod_test_p7_aidb_${randomBytes(3).toString("hex")}`;
const DB_SERVER = (process.env.AI_DB_SERVER ?? "mysql://root@127.0.0.1:3306").replace(/\/+$/, "");
const VERBOSE = process.argv.includes("--verbose");
const KEEP = process.argv.includes("--keep");

if (!/^cod_test_[a-z0-9_]{1,48}$/.test(DB_NAME)) {
  console.error(`✗ refusing to run on database "${DB_NAME}": use a throwaway cod_test_* name`);
  process.exit(1);
}

/** A fake provider key in the shape the reader accepts: never a real one, never printed. */
const FAKE_KEY = `sk-ant-aidbcheck-${randomBytes(16).toString("hex")}`;

{
  const env = process.env as Record<string, string | undefined>;
  for (const k of ["PUBLIC_URL", "STORE_ROOT_DOMAIN", "ADMIN_HOST", "EDGE_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN"]) delete env[k];
  env.DATABASE_URL = `${DB_SERVER}/${DB_NAME}`;
  env.SG_TEST_CONTEXT = "1";
  env.APP_SECRET = randomBytes(32).toString("hex");
  env.PLATFORM_URL = "http://localhost:3452";
  // AI-01 (15): the pool of 4 the no-connection-across-a-call case is measured on (the whole check runs on it)
  env.DB_POOL_SIZE = "4";
  for (const k of ["SG_E2E", "SG_AI_BASE_URL"]) delete env[k];
  if (!env.NODE_ENV || env.NODE_ENV === "production") env.NODE_ENV = "test";
  (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;
}

{
  const M = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const empty = nodeRequire.resolve("drizzle-orm");
  M._resolveFilename = function (request: string, ...rest: unknown[]) {
    return request === "server-only" || request === "client-only" ? empty : (orig as (...a: unknown[]) => string).call(this, request, ...rest);
  };
}

/* ------------------------------------------------------------------ */
/* checks                                                              */
/* ------------------------------------------------------------------ */

let passed = 0;
const failures: string[] = [];
let suiteName = "";
function suite(name: string): void {
  suiteName = name;
  if (VERBOSE) console.log(`\n— ${name}`);
}
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    passed++;
    if (VERBOSE) console.log(`  ✓ ${name}`);
    return;
  }
  failures.push(`[${suiteName}] ${name}`);
  console.error(`  ✗ [${suiteName}] ${name}${detail === undefined ? "" : `: ${JSON.stringify(detail)?.slice(0, 400)}`}`);
}
function skipped(name: string, why: string): void {
  console.log(`  - [${suiteName}] ${name}: ${why}`);
}
async function rejects(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
}

/* ------------------------------------------------------------------ */
/* database                                                            */
/* ------------------------------------------------------------------ */

async function rootQuery(sqlText: string): Promise<unknown> {
  const mysql = load<typeof import("mysql2/promise")>("mysql2/promise");
  const conn = await mysql.createConnection({ uri: DB_SERVER, charset: "utf8mb4_unicode_ci" });
  try {
    const [rows] = await conn.query(sqlText);
    return rows;
  } finally {
    await conn.end();
  }
}

/** A statement on the throwaway database (seeding and counter set-up only). */
async function q<T = Record<string, unknown>>(sqlText: string, params: unknown[] = []): Promise<T[]> {
  const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const [rows] = await pool().query(sqlText, params);
  return rows as T[];
}

async function dropDatabase(): Promise<string[]> {
  try {
    const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
    await pool().end();
  } catch {
    // never opened
  }
  if (!KEEP) await rootQuery(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
  const left = (await rootQuery("SHOW DATABASES LIKE 'cod\\_test\\_p7\\_%'")) as Record<string, string>[];
  return left.map((r) => Object.values(r)[0]!);
}

/* ------------------------------------------------------------------ */
/* fixtures                                                            */
/* ------------------------------------------------------------------ */

interface StoreFx {
  id: string;
  owner: string;
  row: StoreRow;
  scope: WriteScope;
}
interface Fx {
  A: StoreFx;
  B: StoreFx;
  P: StoreFx;
  staff: string;
}

const scopeOf = (storeId: string, kind: StoreScope["kind"] = "member"): StoreScope => load<typeof import("@/lib/tenancy/seam")>("@/lib/tenancy/seam").mintScope(kind, storeId);

async function seed(): Promise<Fx> {
  const { newId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const { getStoreById } = load<typeof import("@/lib/tenancy/public")>("@/lib/tenancy/public");
  const user = async (email: string, name: string, role = "none") => {
    const id = newId();
    await q("INSERT INTO users (id, email, name, password_hash, platform_role) VALUES (?, ?, ?, 'ai-db-check:no-password', ?)", [id, email, name, role]);
    return id;
  };
  const store = async (key: string, status: "active" | "pending"): Promise<StoreFx> => {
    const owner = await user(`owner-${key}@ai-db.test`, `Owner ${key}`);
    const id = newId();
    await q("INSERT INTO stores (id, handle, name, status, brand_seed, created_by, default_locale) VALUES (?, ?, ?, ?, ?, ?, 'fr')", [id, `aidb-${key}-${randomBytes(2).toString("hex")}`, `Store ${key}`, status, randomBytes(8).toString("hex"), owner]);
    await q("INSERT INTO store_members (store_id, user_id, role) VALUES (?, ?, 'owner')", [id, owner]);
    return { id, owner, row: (await getStoreById(id))!, scope: scopeOf(id) as WriteScope };
  };
  const A = await store("a", "active");
  const B = await store("b", "active");
  const P = await store("p", "pending");
  const staff = await user("staff@ai-db.test", "Staff", "super_admin");
  return { A, B, P, staff };
}

/** A store context as the seam hands it (member, or a read-only "View as store" with the synthetic membership). */
function ctxOf(s: StoreFx, userId: string, kind: "member" | "impersonation" = "member"): StoreCtx {
  return {
    user: { id: userId, email: "x@ai-db.test", name: "x", totpEnabled: true, sessionId: "s", platformRole: kind === "impersonation" ? "super_admin" : "none", locale: null, lastStoreId: null },
    store: s.row,
    membership: kind === "impersonation" ? { role: "viewer", status: "active", synthetic: "impersonation" } : { role: "owner", status: "active" },
    scope: scopeOf(s.id, kind),
    actor: kind === "impersonation" ? { kind: "impersonation", userId, impersonatorId: userId, ip: null } : { kind: "user", userId, impersonatorId: null, ip: null },
    impersonation: kind === "impersonation" ? { id: "imp", storeId: s.id, staffUserId: userId, mode: "read", reason: "ticket", expiresAt: new Date(Date.now() + 600_000) } : null,
    stepUpUntil: null,
    can: () => kind === "member",
  };
}

/* ------------------------------------------------------------------ */
/* counters                                                            */
/* ------------------------------------------------------------------ */

const NOW = new Date();
const TZ = "Africa/Casablanca";

function periods() {
  const { periodOf } = load<typeof import("@/lib/tenancy/entitlement-keys")>("@/lib/tenancy/entitlement-keys");
  const { platformPeriodOf } = load<typeof import("@/lib/tenancy/usage")>("@/lib/tenancy/usage");
  return { month: periodOf("month", NOW, TZ), day: periodOf("day", NOW, TZ), platform: platformPeriodOf("month", NOW) };
}

type StoreMetric = "ai_credits" | "ai_credits_day" | "ai_credits_director" | "ai_director_passes" | "ai_deep_passes";
const DAILY: ReadonlySet<StoreMetric> = new Set(["ai_credits_day", "ai_director_passes", "ai_deep_passes"]);

async function setUsage(storeId: string, metric: StoreMetric, value: number): Promise<void> {
  const p = periods();
  const period = DAILY.has(metric) ? p.day : p.month;
  await q("INSERT INTO store_usage (store_id, metric, period, value, updated_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE value = VALUES(value)", [storeId, metric, period, value]);
}
async function usage(storeId: string, metric: StoreMetric): Promise<number> {
  const p = periods();
  const rows = await q<{ value: number }>("SELECT value FROM store_usage WHERE store_id = ? AND metric = ? AND period = ?", [storeId, metric, DAILY.has(metric) ? p.day : p.month]);
  return rows.length ? Number(rows[0]!.value) : 0;
}
async function setPlatform(metric: "ai_cost_micros" | "ai_cost_micros_pending", value: number): Promise<void> {
  await q("INSERT INTO platform_usage (metric, period, value, updated_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE value = VALUES(value)", [metric, periods().platform, value]);
}
async function platformUsage(metric: "ai_cost_micros" | "ai_cost_micros_pending"): Promise<number> {
  const rows = await q<{ value: number }>("SELECT value FROM platform_usage WHERE metric = ? AND period = ?", [metric, periods().platform]);
  return rows.length ? Number(rows[0]!.value) : 0;
}
async function resetStore(storeId: string): Promise<void> {
  await q("DELETE FROM store_usage WHERE store_id = ?", [storeId]);
}
async function snapshot(storeId: string): Promise<string> {
  // a row at 0 is the same counter as no row (a refund leaves the row in place)
  const rows = await q("SELECT metric, period, value FROM store_usage WHERE store_id = ? AND value <> 0 ORDER BY metric, period", [storeId]);
  const plat = await q("SELECT metric, period, value FROM platform_usage WHERE metric LIKE 'ai\\_%' AND value <> 0 ORDER BY metric, period");
  return JSON.stringify({ rows, plat });
}

async function setAi(patch: Record<string, unknown>, staff: string): Promise<void> {
  const { setPlatformSetting, getPlatformSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
  const cur = await getPlatformSetting("platform_ai", { fresh: true });
  const next = { ...cur, ...patch, caps: { ...cur.caps, ...((patch.caps as object | undefined) ?? {}) } };
  await setPlatformSetting("platform_ai", next as never, { id: staff, kind: "platform" });
}

/* ------------------------------------------------------------------ */
/* suites                                                              */
/* ------------------------------------------------------------------ */

type Q = typeof import("@/lib/ai/quota/reserve");
const quota = () => load<Q>("@/lib/ai/quota/reserve");
const codeOf = (err: unknown): string | null => (err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : null);
let seq = 0;
const runId = () => `RUN${String(++seq).padStart(23, "0")}`;

async function reserveSuite(fx: Fx): Promise<void> {
  suite("reserve");
  const { reserve, reconcile, release } = quota();
  const { A } = fx;
  await resetStore(A.id);
  await setPlatform("ai_cost_micros", 0);
  const r = await reserve(A.scope, { micros: 50_000, credits: 5 }, runId(), { task: "copy.page" });
  check("reserve charges month, day and the platform month", (await usage(A.id, "ai_credits")) === 5 && (await usage(A.id, "ai_credits_day")) === 5 && (await platformUsage("ai_cost_micros")) === 50_000);
  check("keys: store, day, platform (no director, pass or pending for copy on an active store)", r.keys.store && r.keys.day && r.keys.platform && !r.keys.director && !r.keys.pass && !r.keys.pending, r.keys);
  await reconcile(r, { micros: 30_000, credits: 3 });
  check("reconcile below the reservation refunds the difference on every charged counter", (await usage(A.id, "ai_credits")) === 3 && (await usage(A.id, "ai_credits_day")) === 3 && (await platformUsage("ai_cost_micros")) === 30_000);
  await reconcile(r, { micros: 0, credits: 0 });
  check("a second reconcile is a no-op", (await usage(A.id, "ai_credits")) === 3);

  await setUsage(A.id, "ai_credits", 295);
  const full = await reserve(A.scope, { micros: 50_000, credits: 5 }, runId(), { task: "copy.page" });
  check("a reservation up to the month limit succeeds", (await usage(A.id, "ai_credits")) === 300);
  await reconcile(full, { micros: 80_000, credits: 8 });
  check("reconcile above the reservation charges the excess with allowOver, past the limit", (await usage(A.id, "ai_credits")) === 303, await usage(A.id, "ai_credits"));
  const next = await rejects(() => reserve(A.scope, { micros: 10_000, credits: 1 }, runId(), { task: "copy.field" }));
  check("the next call is refused quota_store", codeOf(next) === "quota_store", codeOf(next));
  check("the refused call left nothing charged", (await usage(A.id, "ai_credits")) === 303 && (await usage(A.id, "ai_credits_day")) === 11);

  await resetStore(A.id);
  const before = await snapshot(A.id);
  const rel = await reserve(A.scope, { micros: 400_000, credits: 40 }, runId(), { task: "design.plan" });
  check("a Director stage charged the share and the pass counter", rel.keys.director && rel.keys.pass && (await usage(A.id, "ai_director_passes")) === 1);
  await release(rel);
  check("release before any provider billing restores every counter, the pass included", (await snapshot(A.id)) === before);
  await release(rel);
  check("a second release is a no-op", (await snapshot(A.id)) === before);
  const bad = await rejects(() => reserve(A.scope, { micros: -1, credits: 1 }, runId(), { task: "copy.page" }));
  check("a negative estimate is refused before any counter", bad instanceof RangeError && (await snapshot(A.id)) === before);
  const imp = await rejects(() => reserve(scopeOf(A.id, "impersonation") as WriteScope, { micros: 10_000, credits: 1 }, runId(), { task: "copy.page" }));
  check("an impersonation scope forced through a cast is refused with state, nothing charged", codeOf(imp) === "state" && (await snapshot(A.id)) === before, codeOf(imp));
}

async function raceSuite(fx: Fx): Promise<void> {
  suite("races");
  const { reserve } = quota();
  const { B } = fx;
  await resetStore(B.id);
  await setUsage(B.id, "ai_credits", 299);
  const month = await Promise.allSettled(Array.from({ length: 20 }, () => reserve(B.scope, { micros: 10_000, credits: 1 }, runId(), { task: "copy.field" })));
  const ok = month.filter((x) => x.status === "fulfilled").length;
  const refused = month.filter((x) => x.status === "rejected" && codeOf(x.reason) === "quota_store").length;
  check("20 parallel reservations at 1 credit left: exactly 1 succeeds", ok === 1 && refused === 19, { ok, refused });
  check("the month counter is exactly at its limit, the day counter charged once", (await usage(B.id, "ai_credits")) === 300 && (await usage(B.id, "ai_credits_day")) === 1);

  await resetStore(B.id);
  await setUsage(B.id, "ai_credits_day", 74); // beta: max(50, ⌈300 × 25 %⌉) = 75
  const day = await Promise.allSettled(Array.from({ length: 20 }, () => reserve(B.scope, { micros: 10_000, credits: 1 }, runId(), { task: "copy.field" })));
  const dayOk = day.filter((x) => x.status === "fulfilled").length;
  const dayRefused = day.filter((x) => x.status === "rejected" && codeOf(x.reason) === "quota_day").length;
  check("the ai_credits_day race: exactly 1 of 20 succeeds", dayOk === 1 && dayRefused === 19, { dayOk, dayRefused });
  check("the 19 refused calls refunded their month charge", (await usage(B.id, "ai_credits")) === 1 && (await usage(B.id, "ai_credits_day")) === 75, { month: await usage(B.id, "ai_credits"), day: await usage(B.id, "ai_credits_day") });
}

async function pendingSuite(fx: Fx): Promise<void> {
  suite("pending");
  const { reserve } = quota();
  const { A, P } = fx;
  await resetStore(A.id);
  await resetStore(P.id);
  await setAi({ caps: { storeDailyCapPct: 5 } }, fx.staff);
  const ten = await rejects(() => reserve(P.scope, { micros: 10_000, credits: 10 }, runId(), { task: "copy.page" }));
  check("a pending store reserves up to its daily floor of 10", ten === null, codeOf(ten));
  const eleventh = await rejects(() => reserve(P.scope, { micros: 1_000, credits: 1 }, runId(), { task: "copy.field" }));
  check("the 11th credit of the day is refused quota_day", codeOf(eleventh) === "quota_day", codeOf(eleventh));
  const active = await rejects(() => reserve(A.scope, { micros: 11_000, credits: 11 }, runId(), { task: "copy.page" }));
  check("an active store under the same settings has its floor of 50", active === null, codeOf(active));
  await setAi({ caps: { storeDailyCapPct: 25 } }, fx.staff);

  await resetStore(P.id);
  const slice = 100 * 1_000_000 * 0.1; // monthlyUsd 100 × pendingSharePct 10 %
  await setPlatform("ai_cost_micros_pending", slice - 100);
  const beforeP = await snapshot(P.id);
  const [pend, act] = await Promise.all([
    rejects(() => reserve(P.scope, { micros: 1_000, credits: 1 }, runId(), { task: "copy.field" })),
    rejects(() => reserve(A.scope, { micros: 1_000, credits: 1 }, runId(), { task: "copy.field" })),
  ]);
  check("the pending share at its limit: the pending store gets quota_platform_pending", codeOf(pend) === "quota_platform_pending", codeOf(pend));
  check("an active store's call in the same second succeeds", act === null, codeOf(act));
  check("the pending store's month, day and platform charges were refunded", (await snapshot(P.id)) !== "" && (await usage(P.id, "ai_credits")) === 0 && (await usage(P.id, "ai_credits_day")) === 0 && (await platformUsage("ai_cost_micros_pending")) === slice - 100, beforeP.length);
  await setPlatform("ai_cost_micros_pending", 0);
}

async function directorSuite(fx: Fx): Promise<void> {
  suite("director");
  const { reserve, reconcile } = quota();
  const { A } = fx;
  await resetStore(A.id);
  await setUsage(A.id, "ai_credits", 180);
  await setUsage(A.id, "ai_credits_director", 180); // 60 % of 300
  const plan = await rejects(() => reserve(A.scope, { micros: 100_000, credits: 10 }, runId(), { task: "design.plan" }));
  check("a beta store at 180 of 300 Director credits: the pass is refused quota_director", codeOf(plan) === "quota_director", codeOf(plan));
  check("the refusal refunded the month and day charges", (await usage(A.id, "ai_credits")) === 180 && (await usage(A.id, "ai_credits_day")) === 0 && (await usage(A.id, "ai_director_passes")) === 0);
  const copy = await rejects(() => reserve(A.scope, { micros: 100_000, credits: 10 }, runId(), { task: "copy.page" }));
  check("a copy reservation of the same store succeeds", copy === null && (await usage(A.id, "ai_credits")) === 190, codeOf(copy));

  await resetStore(A.id);
  const first = await reserve(A.scope, { micros: 100_000, credits: 10 }, runId(), { task: "design.plan" });
  const second = await reserve(A.scope, { micros: 160_000, credits: 16 }, runId(), { task: "design.critique", passCharged: true });
  check("the pass counter is charged by the first stage only", (await usage(A.id, "ai_director_passes")) === 1 && first.keys.pass && !second.keys.pass);
  check("both stages charge the Director share", (await usage(A.id, "ai_credits_director")) === 26 && first.keys.director && second.keys.director);
  await reconcile(first, { micros: 50_000, credits: 5 });
  await reconcile(second, { micros: 0, credits: 0 });
  check("reconcile never touches the pass counter", (await usage(A.id, "ai_director_passes")) === 1 && (await usage(A.id, "ai_credits_director")) === 5);
  await setUsage(A.id, "ai_director_passes", 30);
  const thirty = await rejects(() => reserve(A.scope, { micros: 10_000, credits: 1 }, runId(), { task: "design.plan" }));
  check("the 31st pass of the day is refused (quota_day) and refunded", codeOf(thirty) === "quota_day" && (await usage(A.id, "ai_director_passes")) === 30 && (await usage(A.id, "ai_credits_director")) === 5, codeOf(thirty));
  const later = await rejects(() => reserve(A.scope, { micros: 10_000, credits: 1 }, runId(), { task: "design.critique", passCharged: true }));
  check("a later stage of a pass already counted still runs at 30", later === null, codeOf(later));
}

async function cacheSuite(fx: Fx): Promise<void> {
  suite("cache");
  const { cacheLookup, cacheWrite, cacheExpiry } = load<typeof import("@/lib/ai/store/cache")>("@/lib/ai/store/cache");
  const { insertRun, recentRuns, getRunMeta } = load<typeof import("@/lib/ai/store/runs")>("@/lib/ai/store/runs");
  const { sha256Hex } = load<typeof import("@/lib/ai/prompts/sha256")>("@/lib/ai/prompts/sha256");
  const { A, B } = fx;
  const key = { task: "copy.hero" as const, inputHash: sha256Hex("same input"), promptVersion: "copy.hero@s1", model: "claude-sonnet-5-5" };
  check("an output ≤ 64 KB is cached", await cacheWrite(A.scope, key, { headline: "Huile d'argan" }, cacheExpiry(7)));
  check("an output over 64 KB is not", !(await cacheWrite(A.scope, { ...key, inputHash: sha256Hex("big") }, { text: "x".repeat(70_000) }, cacheExpiry(7))));
  const hit = await cacheLookup(A.scope, key);
  check("A's lookup hits and counts the hit", hit !== null && hit.hits === 1 && JSON.stringify(hit.output).includes("argan"), hit);
  check("B's lookup of the identical key misses (keyed by store)", (await cacheLookup(B.scope, key)) === null);
  await cacheWrite(A.scope, { ...key, inputHash: sha256Hex("old") }, { a: 1 }, new Date(Date.now() - 1_000));
  check("an expired entry misses", (await cacheLookup(A.scope, { ...key, inputHash: sha256Hex("old") })) === null);
  const before = await snapshot(A.id);
  const id = await insertRun(A.scope, { userId: A.owner, task: "copy.hero", provider: "server", via: "cache", inputHash: key.inputHash, promptVersion: key.promptVersion, finished: { status: "ok", credits: 0, costMicros: 0, ms: 4, flags: ["cache_hit"], output: hit?.output, reconciled: true } });
  const meta = await getRunMeta(A.scope, id);
  check("the cache-hit run row: via cache, 0 credits, ok, flagged", meta?.via === "cache" && meta.credits === 0 && meta.status === "ok" && meta.flags.includes("cache_hit"), meta);
  check("a cache hit moves no counter", (await snapshot(A.id)) === before);
  check("B cannot read A's run by id", (await getRunMeta(B.scope, id)) === null);
  const recent = await recentRuns(A.scope);
  check("recent runs list it as metadata only (no output, no input hash)", recent.some((r) => r.id === id) && !JSON.stringify(recent).includes("argan") && !JSON.stringify(recent).includes(key.inputHash));
  check("B's recent runs hold none of A's", !(await recentRuns(B.scope)).some((r) => r.id === id));
}

async function memorySuite(fx: Fx): Promise<void> {
  suite("memory");
  const M = load<typeof import("@/lib/ai/store/memory")>("@/lib/ai/store/memory");
  const { assembleFor } = load<typeof import("@/lib/ai/prompts/assemble.server")>("@/lib/ai/prompts/assemble.server");
  const { assembleDepsFor } = load<typeof import("@/lib/ai/prompts/deps.server")>("@/lib/ai/prompts/deps.server");
  const { AiAssemblyError } = load<typeof import("@/lib/ai/prompts/assemble")>("@/lib/ai/prompts/assemble");
  const { PROMPTS } = load<typeof import("@/lib/ai/prompts/registry")>("@/lib/ai/prompts/registry");
  const { A, B } = fx;
  const tag = randomBytes(4).toString("hex");
  const aText = `a-memory-${tag} toujours parler de la récolte`;
  const bText = `b-memory-${tag} ton chaleureux`;
  const aId = await M.addMemory(A.scope, { kind: "prefer", text: aText }, A.owner);
  await M.addMemory(B.scope, { kind: "prefer", text: bText }, B.owner);
  check("an item over 300 characters is refused", (await rejects(() => M.addMemory(A.scope, { kind: "fact", text: "x".repeat(301) }, A.owner))) !== null);
  for (let i = (await M.listMemory(A.scope)).length; i < M.MEMORY_MAX_ACTIVE; i++) await M.addMemory(A.scope, { kind: "fact", text: `fait ${i} ${tag}` }, A.owner);
  const full = await rejects(() => M.addMemory(A.scope, { kind: "fact", text: "one too many" }, A.owner));
  check("the 31st active item is refused memory_full", codeOf(full) === "memory_full", codeOf(full));
  check("B's list holds none of A's items", !(await M.listMemory(B.scope)).some((m) => m.text.includes(tag) && m.text.startsWith("a-")));
  const notFound = await rejects(() => M.deleteMemory(B.scope, aId));
  check("B cannot delete A's item (not_found)", codeOf(notFound) === "not_found");
  await M.setMemoryPinned(A.scope, aId, true);
  check("a pin is kept", (await M.listMemory(A.scope)).find((m) => m.id === aId)?.pinned === true);

  const store = { market: "MA" as const, currency: "MAD", primaryLocale: "fr" as const };
  const input = { locale: "fr" as const, market: "MA" as const, product: { name: "Sérum", category: "skincare", priceMinor: 19_900, currency: "MAD", facts: [] }, analysis: null, deliveryText: null, direction: null, kickers: null };
  const p = PROMPTS["copy.page@s1"]!;
  const asB = JSON.stringify(await assembleFor(B.scope, p as never, input as never, store, {}, assembleDepsFor()));
  check("B's assembled prompt carries B's memory", asB.includes(bText));
  check("B's assembled prompt with A's rows present holds none of A's strings", !asB.includes(`a-memory-${tag}`) && !asB.includes(`fait 1 ${tag}`));
  const asA = JSON.stringify(await assembleFor(A.scope, p as never, input as never, store, {}, assembleDepsFor()));
  check("A's own prompt carries A's memory (the check is not blind)", asA.includes(`a-memory-${tag}`));
  const forged = await rejects(() => assembleFor(B.scope, p as never, input as never, store, {}, { ...assembleDepsFor({ recordError: () => undefined }), memory: () => M.activeMemory(A.scope) }));
  check("a forged A row in B's assembly throws cross_store_context", forged instanceof AiAssemblyError && forged.code === "cross_store_context", codeOf(forged));
  check("the refusal carries no row text", !(forged instanceof Error && forged.message.includes(tag)));

  await M.markMemoryScreen(A.scope, aId, { suspicious: true, reason: "planted" });
  const screened = JSON.stringify(await assembleFor(A.scope, p as never, input as never, store, {}, assembleDepsFor()));
  check("a screened item is out of the prompt until cleared", !screened.includes(`a-memory-${tag}`) && (await M.listMemory(A.scope)).find((m) => m.id === aId)?.screened === true);
  await M.clearMemoryScreen(A.scope, aId, fx.staff);
  const cleared = JSON.stringify(await assembleFor(A.scope, p as never, input as never, store, {}, assembleDepsFor()));
  check("cleared by staff, it is back", cleared.includes(`a-memory-${tag}`));
  await M.deleteMemory(A.scope, aId);
  check("a deleted item is a tombstone: out of the list and of the active rows", !(await M.listMemory(A.scope)).some((m) => m.id === aId) && !(await M.activeMemory(A.scope)).some((m) => m.id === aId));
  const [row] = await q<{ active: number; evidence: string }>("SELECT active, evidence FROM ai_memory WHERE id = ?", [aId]);
  check("the tombstone row keeps evidence.deleted", Number(row?.active) === 0 && String(row?.evidence).includes('"deleted":true'));
}

async function policySuite(fx: Fx): Promise<void> {
  suite("policy");
  const { aiPolicyFor, invalidateAiPolicy } = load<typeof import("@/lib/ai/router/server")>("@/lib/ai/router/server");
  const { A, P } = fx;
  for (const s of [A, P]) await resetStore(s.id);
  await setPlatform("ai_cost_micros", 0);
  await setPlatform("ai_cost_micros_pending", 0);
  (process.env as Record<string, string>).ANTHROPIC_API_KEY = FAKE_KEY;
  invalidateAiPolicy(A.id);
  const a = await aiPolicyFor(ctxOf(A, A.owner));
  check("A: cloud available with a key, a cap and the kill switch on", a.cloud.available && a.cloud.block === null, a.cloud);
  check("A: credits left 300 of the beta month, 75 today", a.cloud.creditsLeft === 300 && a.cloud.dayLeft === 75, { m: a.cloud.creditsLeft, d: a.cloud.dayLeft });
  check("A: R1 server tasks are live, R2 / R3 tasks and flagged-off Director tasks are not", a.live.includes("copy.page") && a.live.includes("analyze") && !a.live.includes("seo.meta") && !a.live.includes("design.plan"), a.live);
  check("A: the Director line is unavailable without its release flag, the pass price shown", a.cloud.director === "unavailable" && a.cloud.directorPassCredits === 53);
  check("A: the worker name is the platform brand's", a.workerName.endsWith(" AI") && a.workerName.length > 3);
  check("A: the local prompt versions of the live tasks", a.promptVersions["copy.page"] === "copy.page@l1");

  await setPlatform("ai_cost_micros_pending", 10_000_000);
  invalidateAiPolicy(P.id);
  const p = await aiPolicyFor(ctxOf(P, P.owner));
  check("P: the pending share spent blocks with quota_platform_pending", !p.cloud.available && p.cloud.block === "quota_platform_pending", p.cloud.block);
  check("P: a pending store's month is the pending cap (100)", p.cloud.creditsLeft === 100, p.cloud.creditsLeft);
  invalidateAiPolicy(A.id);
  check("A in the same second is untouched by the pending share", (await aiPolicyFor(ctxOf(A, A.owner))).cloud.available);
  await setPlatform("ai_cost_micros_pending", 0);

  const before = await snapshot(A.id);
  const imp = await aiPolicyFor(ctxOf(A, fx.staff, "impersonation"));
  check("impersonation: live [], cloud unavailable with state, local off", imp.live.length === 0 && !imp.cloud.available && imp.cloud.block === "state" && !imp.local.enabled, { live: imp.live, block: imp.cloud.block, local: imp.local });
  check("impersonation: no credits, passes or voice are shown", imp.cloud.creditsLeft === null && imp.cloud.directorPassesLeft === null && imp.voiceLocal === "");
  check("impersonation: no counter moved", (await snapshot(A.id)) === before);

  // the kill switch, on a fake clock: the flags cache answers for 30 s at most
  const realNow = Date.now;
  let t = realNow();
  Date.now = () => t;
  try {
    invalidateAiPolicy(A.id);
    check("before the switch: available", (await aiPolicyFor(ctxOf(A, A.owner))).cloud.available);
    await q("UPDATE flags SET default_value = 'false' WHERE `key` = 'ai_generation_enabled'");
    t += 5_000;
    const cached = await aiPolicyFor(ctxOf(A, A.owner));
    check("5 s later the cached flag may still answer (no promise before the TTL)", cached.cloud.block === null || cached.cloud.block === "kill");
    t += 26_000;
    const killed = await aiPolicyFor(ctxOf(A, A.owner));
    check("31 s after the switch the policy says kill", !killed.cloud.available && killed.cloud.block === "kill", killed.cloud.block);
    check("the kill switch leaves the local rung and the live list", killed.local.enabled && killed.live.includes("copy.page"));
  } finally {
    await q("UPDATE flags SET default_value = 'true' WHERE `key` = 'ai_generation_enabled'");
    t += 31_000;
    await aiPolicyFor(ctxOf(A, A.owner));
    Date.now = realNow;
  }
  invalidateAiPolicy(A.id);
  check("switched back on: available again", (await aiPolicyFor(ctxOf(A, A.owner))).cloud.available);

  await q("INSERT INTO flags (`key`, kind, description, default_value, owner_track, type) VALUES ('ai_director_brief', 'release', 'test', 'true', 'ai', 'boolean') ON DUPLICATE KEY UPDATE default_value = 'true'");
  const { invalidateAiFlags } = load<typeof import("@/lib/ai/server/flags")>("@/lib/ai/server/flags");
  invalidateAiFlags();
  invalidateAiPolicy(A.id);
  const dir = await aiPolicyFor(ctxOf(A, A.owner));
  check("with ai_director_brief on: Director tasks live, the mode is the platform default ask", dir.live.includes("design.plan") && dir.cloud.director === "ask" && dir.cloud.directorPassesLeft === 30, { d: dir.cloud.director, left: dir.cloud.directorPassesLeft });
  await setUsage(A.id, "ai_credits_director", 180);
  invalidateAiPolicy(A.id);
  const share = await aiPolicyFor(ctxOf(A, A.owner));
  check("the Director share spent: director unavailable with quota_director, the cloud still available", share.cloud.available && share.cloud.director === "unavailable" && share.cloud.directorBlock === "quota_director");
  await resetStore(A.id);
  invalidateAiPolicy(A.id);
}

async function runsSuite(fx: Fx): Promise<void> {
  suite("runs");
  const { insertRun, finishRun, insertReportRows, LocalReport } = load<typeof import("@/lib/ai/store/runs")>("@/lib/ai/store/runs");
  const { linkAiRuns } = load<typeof import("@/lib/ai/feedback.server")>("@/lib/ai/feedback.server");
  const { aiUsageForStore } = load<typeof import("@/lib/ai/summary.server")>("@/lib/ai/summary.server");
  const { sha256Hex } = load<typeof import("@/lib/ai/prompts/sha256")>("@/lib/ai/prompts/sha256");
  const { A, B, P } = fx;
  const h = sha256Hex("runs");
  const a1 = await insertRun(A.scope, { userId: A.owner, task: "copy.page", provider: "server", via: "stream", class: "worker", inputHash: h, reservedCredits: 5 });
  const done = await finishRun(A.scope, a1, { status: "ok", model: "claude-sonnet-5-5", stopReason: "end_turn", usage: { inTok: 1000, outTok: 500, cacheReadTok: 3000, cacheWriteTok: 0 }, costMicros: 12_345, credits: 2, ms: 900, ttftMs: 300, output: { headline: "x" }, reconciled: true });
  check("finishRun updates the store's own row", done);
  check("finishRun of A's run through B's scope changes nothing", !(await finishRun(B.scope, a1, { status: "error", ms: 1 })));
  const [row] = await q<{ status: string; reconciled_at: unknown; cost_micros: number }>("SELECT status, reconciled_at, cost_micros FROM ai_runs WHERE id = ?", [a1]);
  check("status, cost and reconciled_at written in one statement", row?.status === "ok" && row.reconciled_at !== null && Number(row.cost_micros) === 12_345);
  const big = await insertRun(A.scope, { userId: null, task: "copy.page", provider: "server", via: "stream", inputHash: h, finished: { status: "ok", ms: 1, output: { t: "y".repeat(70_000) } } });
  const [bigRow] = await q<{ output: unknown }>("SELECT output FROM ai_runs WHERE id = ?", [big]);
  check("an output over 64 KB is not stored", bigRow?.output === null);

  const b1 = await insertRun(B.scope, { userId: B.owner, task: "copy.page", provider: "server", via: "stream", inputHash: h });
  const page = `PAGE${randomBytes(4).toString("hex")}`;
  await linkAiRuns(A.scope, [a1, b1, "not-a-ulid"], { kind: "page", id: page });
  const refs = await q<{ id: string; ref_id: string | null }>("SELECT id, ref_id FROM ai_runs WHERE id IN (?, ?)", [a1, b1]);
  check("linkAiRuns links A's run and never B's", refs.find((r) => r.id === a1)?.ref_id === page && refs.find((r) => r.id === b1)?.ref_id === null, refs);
  await linkAiRuns(A.scope, [a1], { kind: "page", id: "OTHER" });
  check("a run already linked keeps its first ref", (await q<{ ref_id: string }>("SELECT ref_id FROM ai_runs WHERE id = ?", [a1]))[0]?.ref_id === page);
  check("a bad ref is refused", (await rejects(() => linkAiRuns(A.scope, [a1], { kind: "Page; DROP", id: "x" }))) instanceof RangeError);

  const reports = await insertReportRows(A.scope, A.owner, [LocalReport.parse({ task: "copy.page", model: "gemma-3n", promptVersion: "copy.page@l1", ms: 4200, status: "ok", rejected: ["hero.headline"] })]);
  const [rep] = await q<{ provider: string; via: string; credits: number; rejected_fields: string }>("SELECT provider, via, credits, rejected_fields FROM ai_runs WHERE id = ?", [reports[0]]);
  check("a local report row: provider local, via report, 0 credits, the rejected field names", rep?.provider === "local" && rep.via === "report" && Number(rep.credits) === 0 && String(rep.rejected_fields).includes("hero.headline"), rep);
  check("a report carrying text fields is refused by its schema", !LocalReport.safeParse({ task: "copy.page", ms: 1, status: "ok", output: "secret copy" }).success);

  const { month } = periods();
  await resetStore(A.id);
  await setUsage(A.id, "ai_credits", 42);
  const ua = await aiUsageForStore(A.scope, month);
  check("aiUsageForStore: the month's credits, the beta limit and the run cost", ua.creditsUsed === 42 && ua.creditsLimit === 300 && ua.costMicros === 12_345, ua);
  const up = await aiUsageForStore(P.scope, month);
  check("aiUsageForStore: a pending store's limit is the pending cap", up.creditsLimit === 100 && up.creditsUsed === 0, up);
  check("aiUsageForStore: B's cost holds none of A's runs", (await aiUsageForStore(B.scope, month)).costMicros === 0);
  check("aiUsageForStore: a bad month is refused", (await rejects(() => aiUsageForStore(A.scope, "2026-13"))) instanceof RangeError);
}

async function jobsSuite(fx: Fx): Promise<void> {
  suite("jobs");
  const J = load<typeof import("@/lib/ai/store/jobs")>("@/lib/ai/store/jobs");
  const { newId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const { sha256Hex } = load<typeof import("@/lib/ai/prompts/sha256")>("@/lib/ai/prompts/sha256");
  const { A, B } = fx;
  const id = newId();
  await q("INSERT INTO ai_jobs (id, store_id, kind, task, status, active, input_hash, progress, created_by) VALUES (?, ?, 'director_deep', 'design.critique', 'running', '1', ?, ?, ?)", [id, A.id, sha256Hex(`job-${id}`), JSON.stringify({ done: 1, total: 3, stages: { read: "done" }, plan: ["read", "critique", "repair"] }), A.owner]);
  const view = await J.getAiJob(A.scope, id);
  check("getAiJob: A's job with its progress, no result while running", view?.status === "running" && view.progress.done === 1 && view.progress.total === 3 && view.result === null, view);
  check("getAiJob: another store's id is null", (await J.getAiJob(B.scope, id)) === null);
  check("activeJobsFor: the viewer's own active jobs", (await J.activeJobsFor(A.scope, { userId: A.owner })).some((j) => j.id === id) && (await J.activeJobsFor(A.scope, { userId: fx.staff })).length === 0);
  check("hasActiveDeepJob: A yes, B no", (await J.hasActiveDeepJob(A.scope)) && !(await J.hasActiveDeepJob(B.scope)));
  await q("UPDATE ai_jobs SET status = 'done', active = NULL, result = ? WHERE id = ?", [JSON.stringify({ runIds: ["R1"] }), id]);
  check("a done job shows its result and frees the deep slot", (await J.getAiJob(A.scope, id))?.result?.runIds[0] === "R1" && !(await J.hasActiveDeepJob(A.scope)));
}

async function keySuite(): Promise<void> {
  suite("key");
  const { keySource, resolveKey } = load<typeof import("@/lib/ai/server/key")>("@/lib/ai/server/key");
  const env = process.env as Record<string, string | undefined>;
  const lines: string[] = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  const capture = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
  console.log = console.error = console.warn = capture;
  try {
    delete env.ANTHROPIC_API_KEY;
    const none = await keySource();
    env.ANTHROPIC_API_KEY = "not-a-key";
    const malformed = await keySource();
    env.ANTHROPIC_API_KEY = FAKE_KEY;
    const fromEnv = await keySource();
    const resolved = await resolveKey();
    console.log = orig.log;
    console.error = orig.error;
    console.warn = orig.warn;
    check("no key → none", none === "none");
    check("a value that is not a key shape is no key", malformed === "none");
    check("env key → env, resolved to itself", fromEnv === "env" && resolved === FAKE_KEY);
    check("nothing about the key was logged", !lines.some((l) => l.includes("sk-ant")));
  } finally {
    console.log = orig.log;
    console.error = orig.error;
    console.warn = orig.warn;
  }
}

async function promptVersionsSuite(): Promise<void> {
  suite("prompt-versions");
  const { syncPromptVersions, promptVersionRows } = load<typeof import("@/lib/ai/platform/prompt-versions")>("@/lib/ai/platform/prompt-versions");
  const { PROMPTS, SEED_VERSIONS } = load<typeof import("@/lib/ai/prompts/registry")>("@/lib/ai/prompts/registry");
  const n = Object.keys(PROMPTS).length;
  await syncPromptVersions();
  await syncPromptVersions();
  const rows = await promptVersionRows();
  check("one row per registered version, idempotent", rows.length === n, { rows: rows.length, n });
  check("each family's seed version is active", Object.values(SEED_VERSIONS).every((s) => rows.find((r) => r.version === s.server)?.status === "active" && (!s.local || rows.find((r) => r.version === s.local)?.status === "active")));
  check("template hashes and the Director rubric recorded", rows.every((r) => /^[0-9a-f]{64}$/.test(r.templateHash)) && rows.find((r) => r.task === "director.plan")?.rubricVersion === "v3");
  await q("UPDATE prompt_versions SET status = 'retired' WHERE version = 'copy.hero@s1'");
  await syncPromptVersions();
  check("a sync never changes a row's status", (await promptVersionRows()).find((r) => r.version === "copy.hero@s1")?.status === "retired");
}

/** SF-05 (R1 part): the AI code never reads orders or leads, and its R1 tables have no customer column. */
async function sf05Suite(): Promise<void> {
  suite("sf-05");
  const { getTableConfig } = load<typeof import("drizzle-orm/mysql-core")>("drizzle-orm/mysql-core");
  const S = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const f = path.join(dir, name);
      if (statSync(f).isDirectory()) walk(f);
      else if (/\.tsx?$/.test(name)) files.push(f);
    }
  };
  walk(path.join(ROOT, "src", "lib", "ai"));
  const offenders = files.filter((f) => {
    const text = readFileSync(f, "utf8");
    const schemaImport = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*"@\/lib\/db\/schema"/g;
    let m: RegExpExecArray | null;
    while ((m = schemaImport.exec(text))) if (/\b(orders|leads|orderEvents|blocklist)\b/.test(m[1]!)) return true;
    return /from\s*"@\/lib\/(orders|leads)\b/.test(text) || /\bFROM\s+`?(orders|leads)`?\b/i.test(text);
  });
  check(`no file of src/lib/ai (${files.length}) imports the orders or leads tables or modules`, offenders.length === 0, offenders.map((f) => path.relative(ROOT, f)));
  const CUSTOMER = /phone|address|email|customer|order|lead|landmark|^name$|^city$/i;
  for (const [label, table] of [["ai_runs", S.aiRuns], ["ai_usage_daily", S.aiUsageDaily], ["ai_memory", S.aiMemory], ["ai_cache", S.aiCache]] as const) {
    const cols = getTableConfig(table).columns.map((c) => c.name);
    const bad = cols.filter((c) => CUSTOMER.test(c));
    check(`${label} carries no customer column`, bad.length === 0, bad);
  }
  skipped("stats_version_daily is_test rows", "skipped until 0006/0007");
  skipped("ai_feedback market rows", "skipped until 0006/0007");
  skipped("gene_stats_* rows", "skipped until 0006/0007");
}

/** AI-01 (1)(2)(3)(9)(15) through runAi and the fake provider (step 7). */
async function runAiSuite(fx: Fx): Promise<void> {
  suite("run-ai");
  const { startFakeAnthropic } = load<typeof import("@/lib/ai/testing/fake-anthropic")>("@/lib/ai/testing/fake-anthropic");
  const { runAi } = load<typeof import("@/lib/ai/router/server")>("@/lib/ai/router/server");
  const { resetAnthropic } = load<typeof import("@/lib/ai/server/client")>("@/lib/ai/server/client");
  const { breaker } = load<typeof import("@/lib/ai/server/breaker")>("@/lib/ai/server/breaker");
  const { ALL_FIXTURES } = load<typeof import("@/lib/ai/eval/fixtures")>("@/lib/ai/eval/fixtures");
  const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const { A } = fx;
  const env = process.env as Record<string, string | undefined>;
  const fake = await startFakeAnthropic();
  env.SG_E2E = "1";
  env.SG_AI_BASE_URL = fake.origin;
  env.ANTHROPIC_API_KEY = FAKE_KEY;
  resetAnthropic();
  breaker().reset();
  const actor = { kind: "user" as const, userId: A.owner, impersonatorId: null, ip: null };
  const opts = { actor, surface: "wizard" as const };
  const fixture = ALL_FIXTURES.find((f) => f.id === "copy.page/core-blender-ar")!;
  const recorded = JSON.parse(readFileSync(path.join(ROOT, "src/lib/ai/eval/sets/copy.page/recorded/copy.page@s1.json"), "utf8")) as { runs: Record<string, { output: unknown }[]> };
  const copyOut = recorded.runs[fixture.id]![0]!.output;
  const screen = (i: number) => ({ text: `Savon artisanal au lait de chèvre, lot ${i}`, source: "note" as const });
  type RunRow = { id: string; provider: string; via: string; model: string | null; prompt_version: string | null; in_tok: number | null; out_tok: number | null; cost_micros: number | null; credits: number | null; status: string; task: string };
  const runRows = async () => q<RunRow>("SELECT * FROM ai_runs WHERE store_id = ? ORDER BY created_at, id", [A.id]);
  try {
    await resetStore(A.id);
    await setPlatform("ai_cost_micros", 0);
    await setAi({ enabled: true, caps: { monthlyUsd: 100, storeDailyCapPct: 25 } }, fx.staff);
    await q("DELETE FROM ai_runs WHERE store_id = ?", [A.id]);
    await q("DELETE FROM ai_cache WHERE store_id = ?", [A.id]);

    // AI-01 (1): enabled false / no key / no cap → no request reaches the provider; the library still answers
    await setAi({ enabled: false }, fx.staff);
    const off = await runAi(A.scope, "copy.page", fixture.input as never, { ...opts, ladder: "server-only" });
    const offLib = await runAi(A.scope, "copy.page", fixture.input as never, opts);
    await setAi({ enabled: true }, fx.staff);
    delete env.ANTHROPIC_API_KEY;
    const noKey = await runAi(A.scope, "injection.screen", screen(0), { ...opts, ladder: "server-only" });
    env.ANTHROPIC_API_KEY = FAKE_KEY;
    await setAi({ caps: { monthlyUsd: null } }, fx.staff);
    const noCap = await runAi(A.scope, "injection.screen", screen(0), { ...opts, ladder: "server-only" });
    await setAi({ caps: { monthlyUsd: 100 } }, fx.staff);
    check("AI-01 (1): disabled / no key / no cap answer their codes", !off.ok && off.code === "disabled" && !noKey.ok && noKey.code === "no_key" && !noCap.ok && noCap.code === "no_cap", [off, noKey, noCap].map((o) => (o.ok ? "ok" : o.code)));
    check("AI-01 (1): no request reached the provider", fake.total() === 0, fake.calls);
    check("AI-01 (1): the ladder answers from the library with a note", offLib.ok && offLib.provider === "library" && offLib.notes[0]?.code === "disabled", offLib.ok ? offLib.provider : offLib.code);
    check("AI-01 (1): no counter moved, no run row", (await usage(A.id, "ai_credits")) === 0 && (await runRows()).length === 0);

    // AI-01 (2): one copy.page run → one ai_runs row; ai_credits charged by exactly ⌈cost / 10,000⌉
    fake.enqueue({ kind: "ok", json: copyOut, usage: { input_tokens: 1_700, output_tokens: 2_900, cache_read_input_tokens: 3_400, cache_creation_input_tokens: 0 } });
    const fields: string[] = [];
    const first = await runAi(A.scope, "copy.page", fixture.input as never, { ...opts, onField: (p) => void fields.push(p) });
    const rows = await runRows();
    const row = rows[0];
    const credits = await usage(A.id, "ai_credits");
    check("AI-01 (2): served by the server on the Worker class", first.ok && first.provider === "server" && first.class === "worker" && first.model === "claude-sonnet-5-5" && first.promptVersion === "copy.page@s1", first.ok ? [first.provider, first.class, first.model, first.promptVersion] : first.code);
    check("AI-01 (2): one ai_runs row: provider server, model, prompt version, tokens, cost", rows.length === 1 && row?.provider === "server" && row.status === "ok" && row.model === "claude-sonnet-5-5" && row.prompt_version === "copy.page@s1" && Number(row.in_tok) === 1_700 && Number(row.out_tok) === 2_900 && Number(row.cost_micros) > 0, row);
    const cost = Number(row?.cost_micros ?? 0);
    check("AI-01 (2): credits = ⌈cost / 10,000⌉ on the row and in store_usage after reconcile", Number(row?.credits) === Math.ceil(cost / 10_000) && credits === Math.ceil(cost / 10_000), { cost, row: row?.credits, credits });
    check("AI-01 (2): the request was streamed and its fields guarded before they were shown", fake.requests.some((r) => r.body?.stream === true) && fields.includes("headline") && fields.indexOf("kicker") <= fields.indexOf("headline"), fields.slice(0, 6));
    const req = fake.requests.find((r) => r.path === "/v1/messages");
    const body = req?.body ?? {};
    check("the request: effort low, fallbacks default with its beta, no thinking or sampling", (body.output_config as { effort?: string } | undefined)?.effort === "low" && body.fallbacks === "default" && (req?.beta ?? "").includes("server-side-fallback-2026-07-01") && !("thinking" in body) && !("temperature" in body), { beta: req?.beta, fallbacks: body.fallbacks });
    check("the key travels as x-api-key only, never a Bearer token", !!req?.headerNames.includes("x-api-key") && !req.headerNames.includes("authorization"), req?.headerNames);

    // AI-01 (9): the same input again → no call, via 'cache', 0 credits
    const callsBefore = fake.total("/v1/messages");
    const again = await runAi(A.scope, "copy.page", fixture.input as never, opts);
    const rows2 = await runRows();
    check("AI-01 (9): a cache hit makes no provider call", fake.total("/v1/messages") === callsBefore);
    check("AI-01 (9): via 'cache', 0 credits, flagged cache_hit", again.ok && again.flags.includes("cache_hit") && again.usage?.credits === 0 && rows2.length === 2 && rows2[1]!.via === "cache" && Number(rows2[1]!.credits) === 0 && (await usage(A.id, "ai_credits")) === credits, rows2[1]);
    fake.enqueue({ kind: "ok", json: copyOut });
    const nonce = await runAi(A.scope, "copy.page", fixture.input as never, { ...opts, nonce: "again-1" });
    check("'Write again' (a nonce) bypasses the cache", nonce.ok && !nonce.flags.includes("cache_hit") && fake.total("/v1/messages") === callsBefore + 1);

    // a refusal: stop_reason first; a malformed answer gets one retry; a 529 is retried
    fake.enqueue({ kind: "refusal", category: "general_harms", partial: '{"suspicious": tr' });
    const refused = await runAi(A.scope, "injection.screen", screen(1), { ...opts, ladder: "server-only" });
    check("a refusal → refused (no parse of the partial text)", !refused.ok && refused.code === "refused", refused.ok ? "ok" : refused.code);
    fake.enqueue({ kind: "malformed" }, { kind: "ok", json: { suspicious: false, reason: "plain product data" } });
    const before3 = fake.total("/v1/messages");
    const retried = await runAi(A.scope, "injection.screen", screen(2), opts);
    const retryReq = fake.requests.filter((r) => r.path === "/v1/messages").slice(-1)[0];
    const lastMsg = (retryReq?.body?.messages as { role: string }[] | undefined)?.slice(-1)[0];
    check("a malformed answer: one retry carrying the parse error as a system message, then ok", retried.ok && retried.provider === "server" && fake.total("/v1/messages") === before3 + 2 && lastMsg?.role === "system", retried.ok ? retried.provider : retried.code);
    fake.enqueue({ kind: "malformed" }, { kind: "malformed" });
    const invalid = await runAi(A.scope, "injection.screen", screen(3), opts);
    check("two malformed answers → invalid_output, then the library rung (keyword heuristic)", invalid.ok && invalid.provider === "library" && invalid.notes[0]?.code === "invalid_output", invalid.ok ? invalid.notes : invalid.code);
    fake.enqueue({ kind: "status", status: 529 }, { kind: "ok", json: { suspicious: false, reason: "plain" } });
    const overloaded = await runAi(A.scope, "injection.screen", screen(4), opts);
    check("a 529 is retried once after 1 s on the same reservation", overloaded.ok && overloaded.provider === "server", overloaded.ok ? overloaded.provider : overloaded.code);

    // AI-01 (3): quota_store → no call, 0 credits
    await setUsage(A.id, "ai_credits", 300);
    const n3 = fake.total();
    const quotaOut = await runAi(A.scope, "copy.field", { locale: "fr", field: "hero.headline", text: "Un savon doux", max: 84, intent: "shorter", targetLocale: null, product: { name: "Savon", facts: [] }, mustAvoid: [] }, { ...opts, ladder: "server-only" });
    check("AI-01 (3): quota_store, no provider call, no credit charged", !quotaOut.ok && quotaOut.code === "quota_store" && fake.total() === n3 && (await usage(A.id, "ai_credits")) === 300, quotaOut.ok ? "ok" : quotaOut.code);

    // AI-01 (15): 12 stubbed 2 s calls on a pool of 4 → no pool wait above 100 ms while they are in flight
    await resetStore(A.id);
    fake.reset();
    fake.delayMs = 2_000;
    const runs = Array.from({ length: 12 }, (_, i) => runAi(A.scope, "injection.screen", screen(100 + i), { ...opts, nonce: `pool-${i}` }));
    const t0 = Date.now();
    while (fake.inFlight < 12 && Date.now() - t0 < 8_000) await new Promise((r) => setTimeout(r, 20));
    const waits: number[] = [];
    for (let i = 0; i < 8; i++) {
      const s = performance.now();
      await pool().query("SELECT 1");
      waits.push(Math.round(performance.now() - s));
      await new Promise((r) => setTimeout(r, 40));
    }
    const done = await Promise.all(runs);
    check("AI-01 (15): 12 calls in flight at once on the fast class", fake.maxInFlight === 12, fake.maxInFlight);
    check("AI-01 (15): no pool wait above 100 ms while the 12 calls are in flight (pool of 4)", Math.max(...waits) <= 100, waits);
    check("AI-01 (15): all 12 completed on the server", done.every((o) => o.ok && o.provider === "server"), done.map((o) => (o.ok ? o.provider : o.code)));
  } finally {
    await fake.close();
    delete env.SG_E2E;
    delete env.SG_AI_BASE_URL;
    resetAnthropic();
  }
}

/* ------------------------------------------------------------------ */
/* step 8: detached jobs, Batches, rollups, live eval                  */
/* ------------------------------------------------------------------ */

type JobCtxT = import("@/lib/jobs/runner").JobCtx & { yields: number };

/** A cron context of the job runner's shape (P8's runner is not in R1 yet): a deadline, yields counted. */
function jobCtx(job: string, budgetMs = 60_000, onYield?: (ctx: JobCtxT) => void): JobCtxT {
  const { systemCtx } = load<typeof import("@/lib/jobs/scope")>("@/lib/jobs/scope");
  const ctx: JobCtxT = {
    ...systemCtx(job),
    deadline: Date.now() + budgetMs,
    tickId: `t-${randomBytes(3).toString("hex")}`,
    cursor: "",
    setCursor: async () => undefined,
    yields: 0,
    yield: async () => {
      ctx.yields++;
      onYield?.(ctx);
      await new Promise<void>((r) => setImmediate(r));
    },
    lagMs: () => 0,
  };
  return ctx;
}

async function flagOverride(key: string, storeId: string, on: boolean | null): Promise<void> {
  if (on === null) await q("DELETE FROM flag_overrides WHERE flag_key = ? AND scope = 'store' AND scope_id = ?", [key, storeId]);
  else await q("INSERT INTO flag_overrides (flag_key, scope, scope_id, value, updated_at) VALUES (?, 'store', ?, ?, UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE value = VALUES(value)", [key, storeId, JSON.stringify(on)]);
  load<typeof import("@/lib/ai/server/flags")>("@/lib/ai/server/flags").invalidateAiFlags();
}

const clearBuckets = (storeId: string) => q("DELETE FROM rate_limits WHERE bucket LIKE ?", [`s:${storeId}:%`]);

type JobRowT = { id: string; status: string; active: string | null; stage: string | null; stage_attempts: number; driver: string | null; transport: string; class: string; error: string | null; result: string | null; progress: string | null; input_hash: string };
const jobRow = async (id: string) => (await q<JobRowT>("SELECT * FROM ai_jobs WHERE id = ?", [id]))[0];
const jobDoc = async (id: string) => JSON.parse((await jobRow(id))?.result ?? "{}") as { reservation?: { state: string } | null; instant?: unknown; outputs?: Record<string, unknown>; input?: unknown };

async function jobsSuiteB(fx: Fx): Promise<void> {
  suite("jobs-b");
  const { startFakeAnthropic } = load<typeof import("@/lib/ai/testing/fake-anthropic")>("@/lib/ai/testing/fake-anthropic");
  const { resetAnthropic } = load<typeof import("@/lib/ai/server/client")>("@/lib/ai/server/client");
  const { breaker } = load<typeof import("@/lib/ai/server/breaker")>("@/lib/ai/server/breaker");
  const { ALL_FIXTURES } = load<typeof import("@/lib/ai/eval/fixtures")>("@/lib/ai/eval/fixtures");
  const E = load<typeof import("@/lib/ai/jobs/enqueue")>("@/lib/ai/jobs/enqueue");
  const R = load<typeof import("@/lib/ai/jobs/run")>("@/lib/ai/jobs/run");
  const C = load<typeof import("@/lib/ai/jobs/claim")>("@/lib/ai/jobs/claim");
  const { recoverOrphans } = load<typeof import("@/lib/ai/jobs/recover")>("@/lib/ai/jobs/recover");
  const { aiJobsForPulse } = load<typeof import("@/lib/ai/jobs/pulse")>("@/lib/ai/jobs/pulse");
  const { aiPolicyFor, invalidateAiPolicy } = load<typeof import("@/lib/ai/router/server")>("@/lib/ai/router/server");
  const { jobs: aiTrackJobs } = load<typeof import("@/lib/jobs/tracks/ai")>("@/lib/jobs/tracks/ai");
  const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const { A, B } = fx;
  const env = process.env as Record<string, string | undefined>;
  const fake = await startFakeAnthropic();
  env.SG_E2E = "1";
  env.SG_AI_BASE_URL = fake.origin;
  env.SG_AI_NO_AFTER = "1";
  env.ANTHROPIC_API_KEY = FAKE_KEY;
  resetAnthropic();
  breaker().reset();
  const spy = { after: 0, trace: [] as string[] };
  R.jobDeps.after = () => void spy.after++;
  R.jobDeps.trace = (e, _id, d) => void spy.trace.push(`${e}:${d ?? ""}`);
  const ctxA = ctxOf(A, A.owner);
  const crit = ALL_FIXTURES.find((f) => f.task === "design.critique")!;
  const plan = ALL_FIXTURES.find((f) => f.task === "design.plan")!;
  const recorded = JSON.parse(readFileSync(path.join(ROOT, "src/lib/ai/eval/sets/director.critique/recorded/director.critique@s1.json"), "utf8")) as { runs: Record<string, { output: unknown }[]> };
  const critOut = recorded.runs[crit.id]![0]!.output;
  const input = (n: number) => ({ critique: crit.input, run: n });
  const job = (n: number, instant?: unknown) => E.enqueueAiJob(ctxA, { kind: "director_deep", task: "design.critique", input: input(n), ...(instant !== undefined ? { instant } : {}) });
  const msgs = () => fake.total("/v1/messages");
  const stale = (id: string) => q("UPDATE ai_jobs SET heartbeat_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 61 SECOND) WHERE id = ?", [id]);
  const sweep = async () => {
    const before = { msgs: fake.total(), after: spy.after, trace: spy.trace.length };
    const r = await recoverOrphans(jobCtx("ai.jobs", 5_000));
    const newTrace = spy.trace.slice(before.trace);
    return { r, providerCalls: fake.total() - before.msgs, afterCalls: spy.after - before.after, drivers: newTrace.filter((t) => t.startsWith("advance") || t.startsWith("after") || t.startsWith("stage")) };
  };
  try {
    await resetStore(A.id);
    await clearBuckets(A.id);
    await setPlatform("ai_cost_micros", 0);
    await setAi({ enabled: true, caps: { monthlyUsd: 100, storeDailyCapPct: 100 } }, fx.staff);
    await flagOverride("ai_director_brief", A.id, true);
    await flagOverride("ai_detached_jobs", A.id, false);

    // creation: the row, the reservation, the pass, no after() while the flag is off (seam off too)
    delete env.SG_AI_NO_AFTER;
    const j1 = await job(1, { picks: ["c1", "c2", "c3"] });
    env.SG_AI_NO_AFTER = "1";
    const r1 = j1.ok ? await jobRow(j1.jobId) : undefined;
    check("enqueueAiJob: the critique-as-job is queued, active, its plan one critique stage on the interactive class", j1.ok && !j1.deduped && r1?.status === "queued" && r1.active === "1" && JSON.parse(r1.progress ?? "{}").plan?.join() === "critique" && r1.class === "director_interactive", j1.ok ? r1 : j1.code);
    check("enqueueAiJob: one reservation for every stage, the Director pass counted once", (await jobDoc(j1.ok ? j1.jobId : "")).reservation?.state === "open" && (await usage(A.id, "ai_director_passes")) === 1 && (await usage(A.id, "ai_credits")) > 0);
    check("flag ai_detached_jobs off: the creating request schedules no after() (spy)", spy.after === 0);
    check("no model call at creation", msgs() === 0);
    const [d1, d2] = await Promise.all([job(1), job(1)]);
    check("aj_active_uq: an identical active job answers the first's id, deduped", d1.ok && d2.ok && d1.jobId === (j1.ok ? j1.jobId : "") && d2.jobId === d1.jobId && d1.deduped && d2.deduped, [d1, d2]);
    const other = await job(2);
    check("one deep job per store at a time: a second, different one answers busy", !other.ok && other.code === "busy", other);
    check("dedupe and busy charged nothing more", (await usage(A.id, "ai_director_passes")) === 1);

    // polls alone (SG_AI_NO_AFTER=1) drive the job to done
    const id1 = j1.ok ? j1.jobId : "";
    fake.enqueue({ kind: "ok", json: critOut, usage: { input_tokens: 15_000, output_tokens: 4_000, cache_read_input_tokens: 9_000, cache_creation_input_tokens: 0 } });
    const v1 = await R.advanceJob(A.scope, id1, "poll", 90_000);
    const runs1 = await q<{ id: string; via: string; job_id: string; flags: string | null; credits: number; status: string }>("SELECT * FROM ai_runs WHERE job_id = ?", [id1]);
    check("SG_AI_NO_AFTER=1: one poll ran the stage and the job is done", v1?.status === "done" && v1.progress.done === 1 && v1.outputs?.critique !== undefined && msgs() === 1, v1);
    check("the stage's run row: via job, its job id, flagged stage_resumed (a poll drove it)", runs1.length === 1 && runs1[0]!.via === "job" && runs1[0]!.status === "ok" && (runs1[0]!.flags ?? "").includes("stage_resumed"), runs1);
    const doc1 = await jobDoc(id1);
    check("done: active NULL, the input dropped, the reservation reconciled at the run's credits", (await jobRow(id1))?.active === null && doc1.input === undefined && doc1.reservation?.state === "reconciled" && (await usage(A.id, "ai_credits")) === Number(runs1[0]!.credits), { doc: doc1.reservation, credits: await usage(A.id, "ai_credits"), run: runs1[0]?.credits });
    check("ai.job_done notified to the requester", (await q("SELECT id FROM notifications WHERE kind = 'ai.job_done' AND user_id = ?", [A.owner])).length === 1);
    const again = await job(1);
    fake.enqueue({ kind: "ok", json: critOut });
    const v1b = again.ok && !again.deduped ? await R.advanceJob(A.scope, again.jobId, "poll", 90_000) : null;
    const twins = await q<{ active: string | null; status: string }>("SELECT active, status FROM ai_jobs WHERE input_hash = ?", [r1?.input_hash ?? ""]);
    check("the same input run twice to done: two rows, both active NULL, no unique-key error", again.ok && !again.deduped && v1b?.status === "done" && twins.length === 2 && twins.every((t) => t.status === "done" && t.active === null), twins);

    // a process killed mid-stage: the sweep clears the lease, the next poll re-claims (stage_resumed) and finishes
    await clearBuckets(A.id);
    const j3 = await job(3, { picks: ["k"] });
    const id3 = j3.ok ? j3.jobId : "";
    const c3 = await C.claimStage(A.scope, id3, "after");
    await stale(id3);
    const s3 = await sweep();
    const r3 = await jobRow(id3);
    check("killed mid-stage: the sweep clears the stale lease, the stage kept for a re-claim", "stage" in c3 && s3.r.cleared === 1 && r3?.status === "running" && r3.stage === "critique" && r3.stage_attempts === 0, { c3, s3: s3.r, r3 });
    check("the sweep made no provider call, no advanceJob, no after() (spies)", s3.providerCalls === 0 && s3.afterCalls === 0 && s3.drivers.length === 0, s3);
    fake.enqueue({ kind: "ok", json: critOut });
    const v3 = await R.advanceJob(A.scope, id3, "poll", 90_000);
    const run3 = await q<{ flags: string | null }>("SELECT flags FROM ai_runs WHERE job_id = ?", [id3]);
    check("the next poll re-claims the same stage and finishes the job (stage_resumed)", v3?.status === "done" && run3.length === 1 && (run3[0]!.flags ?? "").includes("stage_resumed") && spy.trace.includes("stage:poll:critique"), { v3: v3?.status, run3 });

    // a second kill of the same stage: failed, the instant result kept, the ledger reconciled
    await clearBuckets(A.id);
    const j4 = await job(4, { picks: ["kept"] });
    const id4 = j4.ok ? j4.jobId : "";
    await C.claimStage(A.scope, id4, "after");
    await stale(id4);
    await sweep();
    const re = await C.claimStage(A.scope, id4, "poll");
    const attempts = (await jobRow(id4))?.stage_attempts;
    check("the re-claim of an orphaned stage counts stage_attempts 1 (resumed)", "stage" in re && re.resumed && attempts === 1, { re, attempts });
    await stale(id4);
    const s4 = await sweep();
    const r4 = await jobRow(id4);
    const doc4 = await jobDoc(id4);
    check("a second orphaning fails the job: orphaned:critique, active NULL", s4.r.failed === 1 && r4?.status === "failed" && r4.error === "orphaned:critique" && r4.active === null, { s4: s4.r, r4: r4 && { status: r4.status, error: r4.error } });
    check("the instant result is kept and the ledger reconciled (the orphaned stage at its share)", JSON.stringify(doc4.instant) === JSON.stringify({ picks: ["kept"] }) && doc4.reservation?.state === "reconciled", doc4);
    check("the requester is told (ai.job_failed); the recovery path never called after() or a provider", (await q("SELECT id FROM notifications WHERE kind = 'ai.job_failed'")).length >= 1 && s4.afterCalls === 0 && s4.providerCalls === 0);

    // a driverless job: the sweep hands its stage to a one-item batch; ai.batches collects it
    await clearBuckets(A.id);
    const j5 = await job(5);
    const id5 = j5.ok ? j5.jobId : "";
    await q("UPDATE ai_jobs SET created_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 2 MINUTE), updated_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 61 SECOND) WHERE id = ?", [id5]);
    const s5 = await sweep();
    const r5 = await jobRow(id5);
    const items5 = await q<{ id: string; ref_kind: string; ref_id: string; reserved_credits: number; state: string }>("SELECT * FROM ai_batch_items WHERE ref_kind = 'job' AND ref_id = ?", [`${id5}:critique`]);
    check("a driverless job (60 s without poll or after()): its stage goes to a one-item batch", s5.r.resubmitted === 1 && r5?.stage === "batch:critique" && r5.transport === "batch" && r5.driver === "cron" && items5.length === 1 && items5[0]!.state === "queued" && Number(items5[0]!.reserved_credits) === 0, { s5: s5.r, r5: r5 && { stage: r5.stage, transport: r5.transport, driver: r5.driver }, items5 });
    check("the hand-off made no provider call, no advanceJob, no after()", s5.providerCalls === 0 && s5.afterCalls === 0 && s5.drivers.length === 0, s5);
    const m5 = msgs();
    const polled = await R.advanceJob(A.scope, id5, "poll", 90_000);
    check("a poll while the batch owns the stage runs nothing", polled?.status === "running" && polled.stage === "batch:critique" && msgs() === m5, polled);
    const batches = aiTrackJobs.find((j) => j.name === "ai.batches")!;
    fake.enqueue({ kind: "ok", json: critOut });
    const b1 = await batches.run(jobCtx("ai.batches", 8_000));
    const b2 = await batches.run(jobCtx("ai.batches", 8_000));
    const r5b = await jobRow(id5);
    const run5 = await q<{ via: string; flags: string | null }>("SELECT via, flags FROM ai_runs WHERE job_id = ?", [id5]);
    check("ai.batches submits the job stage, ingests it and the job is done by the batch", r5b?.status === "done" && r5b.driver === "batch" && r5b.active === null && run5.length === 1 && run5[0]!.via === "batch" && (run5[0]!.flags ?? "").includes("job_degraded_to_batch"), { b1: b1.summary, b2: b2.summary, r5b: r5b && { status: r5b.status, driver: r5b.driver }, run5 });

    // two concurrent polls run one stage once (the lease race)
    await clearBuckets(A.id);
    const j6 = await job(6);
    const id6 = j6.ok ? j6.jobId : "";
    fake.delayMs = 800;
    fake.enqueue({ kind: "ok", json: critOut });
    const before6 = msgs();
    const [p1, p2] = await Promise.all([R.advanceJob(A.scope, id6, "poll", 90_000), R.advanceJob(A.scope, id6, "poll", 90_000)]);
    fake.delayMs = 0;
    const statuses = [p1?.status, p2?.status].sort().join();
    check("two concurrent polls: one stage, one model call; the other answered at once", msgs() === before6 + 1 && (await q("SELECT id FROM ai_runs WHERE job_id = ?", [id6])).length === 1 && (statuses === "done,running" || statuses === "done,done"), { calls: msgs() - before6, statuses });

    // each stage releases its pool connection before the model call (pool of 4)
    await clearBuckets(A.id);
    const j7 = await job(7);
    const id7 = j7.ok ? j7.jobId : "";
    fake.delayMs = 1_500;
    fake.enqueue({ kind: "ok", json: critOut });
    const inflight = R.advanceJob(A.scope, id7, "poll", 90_000);
    const t0 = Date.now();
    while (fake.inFlight < 1 && Date.now() - t0 < 5_000) await new Promise((r) => setTimeout(r, 10));
    const s0 = performance.now();
    await Promise.all(Array.from({ length: 4 }, () => pool().query("SELECT SLEEP(0.2)")));
    const parallelMs = Math.round(performance.now() - s0);
    const v7 = await inflight;
    fake.delayMs = 0;
    check("while a stage's model call is in flight, all 4 pool connections are free (4 × SLEEP(0.2) in parallel < 390 ms)", parallelMs < 390 && v7?.status === "done", { parallelMs, status: v7?.status });

    // the flag on: after() is the free first driver (spy); the seam ai-no-after turns it off
    await clearBuckets(A.id);
    await flagOverride("ai_detached_jobs", A.id, true);
    delete env.SG_AI_NO_AFTER;
    const afterBefore = spy.after;
    const j8 = await job(8);
    check("flag ai_detached_jobs on: the creating request schedules after() once", j8.ok && spy.after === afterBefore + 1, spy.after - afterBefore);
    if (j8.ok) await E.cancelAiJob(ctxA, j8.jobId);
    const r8 = j8.ok ? await jobRow(j8.jobId) : undefined;
    check("cancelAiJob: cancelled, active NULL, the untouched reservation released", r8?.status === "cancelled" && r8.active === null && (await jobDoc(j8.ok ? j8.jobId : "")).reservation?.state === "released");
    env.SG_AI_NO_AFTER = "1";
    const j9 = await job(9);
    check("the ai-no-after seam: no after() even with the flag on", j9.ok && spy.after === afterBefore + 1);
    if (j9.ok) await E.cancelAiJob(ctxA, j9.jobId);
    await flagOverride("ai_detached_jobs", A.id, false);

    // the pulse: the viewer's own jobs of the scope's store only
    const pulseA = await aiJobsForPulse(A.scope, { userId: A.owner }, new Date(Date.now() - 5 * 60_000));
    const pulseB = await aiJobsForPulse(B.scope, { userId: A.owner }, new Date(Date.now() - 5 * 60_000));
    const pulseStaff = await aiJobsForPulse(A.scope, { userId: fx.staff }, new Date(Date.now() - 5 * 60_000));
    check("aiJobsForPulse: A's owner sees A's finished jobs", pulseA.done.includes(id1) && pulseA.done.includes(id5), pulseA);
    check("aiJobsForPulse: never another store's ids nor another viewer's", pulseB.running === 0 && pulseB.done.length === 0 && pulseStaff.running === 0 && pulseStaff.done.length === 0, { pulseB, pulseStaff });

    // the caps: the 31st Director pass of the day, the 6th deep pass, a second concurrent deep job
    await clearBuckets(A.id);
    await setUsage(A.id, "ai_director_passes", 30);
    const p31 = await job(10);
    check("the 31st Director pass of the day is skipped (quota_day), nothing charged", !p31.ok && p31.code === "quota_day" && (await usage(A.id, "ai_director_passes")) === 30, p31);
    await setUsage(A.id, "ai_deep_passes", 5);
    const deep = await E.enqueueAiJob(ctxA, { kind: "director_deep", task: "design.plan", input: { brief: plan.input, critique: crit.input } });
    invalidateAiPolicy(A.id);
    const pol = await aiPolicyFor(ctxA);
    check("the 6th deep pass is refused (quota_day) and the policy shows 0 left with the reset", !deep.ok && deep.code === "quota_day" && pol.cloud.deepPassesLeft === 0, { deep, left: pol.cloud.deepPassesLeft });
    await setUsage(A.id, "ai_deep_passes", 0);
    await setUsage(A.id, "ai_director_passes", 0);
    await clearBuckets(A.id);
    const [x1, x2] = await Promise.all([job(11), job(11)]);
    const x3 = await job(12);
    check("a second concurrent deep job is deduped or busy", x1.ok && x2.ok && x1.jobId === x2.jobId && (x1.deduped || x2.deduped) && !x3.ok && x3.code === "busy", { x1, x2, x3 });
    if (x1.ok) await E.cancelAiJob(ctxA, x1.jobId);
  } finally {
    R.jobDeps.trace = null;
    await fake.close();
    delete env.SG_E2E;
    delete env.SG_AI_BASE_URL;
    delete env.SG_AI_NO_AFTER;
    resetAnthropic();
  }
}

async function batchesSuite(fx: Fx): Promise<void> {
  suite("batches");
  const { startFakeAnthropic } = load<typeof import("@/lib/ai/testing/fake-anthropic")>("@/lib/ai/testing/fake-anthropic");
  const { resetAnthropic } = load<typeof import("@/lib/ai/server/client")>("@/lib/ai/server/client");
  const { queueAi } = load<typeof import("@/lib/ai/router/server")>("@/lib/ai/router/server");
  const { submitQueued } = load<typeof import("@/lib/ai/batch/submit")>("@/lib/ai/batch/submit");
  const { pollAndIngest, ingestResult } = load<typeof import("@/lib/ai/batch/ingest")>("@/lib/ai/batch/ingest");
  const { itemById } = load<typeof import("@/lib/ai/platform/batches")>("@/lib/ai/platform/batches");
  const { getPlatformSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
  const { A } = fx;
  const env = process.env as Record<string, string | undefined>;
  const fake = await startFakeAnthropic();
  env.SG_E2E = "1";
  env.SG_AI_BASE_URL = fake.origin;
  env.ANTHROPIC_API_KEY = FAKE_KEY;
  resetAnthropic();
  try {
    await resetStore(A.id);
    await q("DELETE FROM ai_runs WHERE store_id = ?", [A.id]);
    await setAi({ enabled: true, caps: { monthlyUsd: 100, storeDailyCapPct: 100 } }, fx.staff);
    const tag = randomBytes(3).toString("hex");
    const ids: string[] = [];
    for (let i = 0; i < 120; i++) ids.push((await queueAi(A.scope, "injection.screen", { text: `Savon ${tag} ${i}`, source: "note" }, { kind: "test", id: `${tag}-${i}` })).itemId);
    const dup = await queueAi(A.scope, "injection.screen", { text: `Savon ${tag} 0`, source: "note" }, { kind: "test", id: `${tag}-0` });
    const reserved = await usage(A.id, "ai_credits");
    check("queueAi: 120 items, the same work queued twice is one item (dedupe)", new Set(ids).size === 120 && dup.deduped && dup.itemId === ids[0], dup);
    check("queueAi: credits reserved at queue time (the batch price)", reserved > 0, reserved);
    const sub = await submitQueued(jobCtx("ai.batches", 8_000));
    const batchRows = await q<{ id: string; items: number; provider_batch_id: string; model: string }>("SELECT * FROM ai_batches ORDER BY created_at DESC LIMIT 1");
    const batchReq = fake.requests.filter((r) => r.path === "/v1/messages/batches").slice(-1)[0];
    const reqs = (batchReq?.body?.requests ?? []) as { custom_id: string; params: Record<string, unknown> }[];
    check("submit: one batch of 120 (≥ 20 queued), one model, custom_id i_<id>", sub.batches === 1 && sub.items === 120 && reqs.length === 120 && reqs.every((r) => /^i_[0-9A-Z]{26}$/.test(r.custom_id) && r.params.model === batchRows[0]?.model), { sub, n: reqs.length });
    check("a batch request carries no betas, fallbacks or speed", reqs.every((r) => !("fallbacks" in r.params) && !("speed" in r.params) && !("betas" in r.params)) && (batchReq?.beta ?? null) === null);
    // a budget cut at the first yield (item 50): resumable, nothing ingested twice afterwards
    const cut = jobCtx("ai.batches", 60_000, (c) => void (c.deadline = 0));
    const i1 = await pollAndIngest(cut);
    const after1 = (await q("SELECT id FROM ai_runs WHERE store_id = ? AND via = 'batch'", [A.id])).length;
    check("ingest cut by the budget at its first yield: resumable, 49 ingested", i1.resumable && i1.ingested === 49 && after1 === 49 && cut.yields >= 1, { i1, after1 });
    const full = jobCtx("ai.batches", 60_000);
    const i2 = await pollAndIngest(full);
    const after2 = await q<{ credits: number }>("SELECT credits FROM ai_runs WHERE store_id = ? AND via = 'batch'", [A.id]);
    check("the next tick streams the batch again and ingests the 71 left, none twice", i2.ingested === 71 && after2.length === 120, { i2, n: after2.length });
    check("the ingest loop yields every 50 items (core §H.2)", full.yields >= 2, full.yields);
    const i3 = await pollAndIngest(jobCtx("ai.batches", 60_000));
    check("a third tick ingests nothing (idempotent)", i3.ingested === 0 && (await q("SELECT id FROM ai_runs WHERE store_id = ? AND via = 'batch'", [A.id])).length === 120, i3);
    const item0 = await itemById(ids[0]!);
    const settings = await getPlatformSetting("platform_ai");
    const replay = item0 ? await ingestResult(jobCtx("ai.batches"), item0, { type: "succeeded", message: { id: "m", type: "message", role: "assistant", model: item0.model, content: [{ type: "text", text: '{"suspicious":false,"reason":"x"}', citations: null }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: null, service_tier: null } } as never }, settings) : null;
    check("an item already ingested is skipped by a replayed result", item0?.state === "ingested" && item0.dedupe === null && replay === "skipped", { state: item0?.state, replay });
    const billed = after2.reduce((n, r) => n + Number(r.credits ?? 0), 0);
    check("each item's reservation reconciled at ingest: ai_credits = the runs' credits", (await usage(A.id, "ai_credits")) === billed, { usage: await usage(A.id, "ai_credits"), billed });
  } finally {
    await fake.close();
    delete env.SG_E2E;
    delete env.SG_AI_BASE_URL;
    resetAnthropic();
  }
}

async function rollupsSuite(fx: Fx): Promise<void> {
  suite("rollups");
  const { newId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const { syncPromptVersions } = load<typeof import("@/lib/ai/platform/prompt-versions")>("@/lib/ai/platform/prompt-versions");
  const { jobs: aiTrackJobs } = load<typeof import("@/lib/jobs/tracks/ai")>("@/lib/jobs/tracks/ai");
  const { A } = fx;
  await syncPromptVersions();
  await q("DELETE FROM ai_runs WHERE store_id = ?", [A.id]);
  const canary = async (task: string, version: string) =>
    q("INSERT INTO prompt_versions (task, version, provider, template_hash, status, canary_bp, canary_started_at, created_at) VALUES (?, ?, 'server', ?, 'canary', 5000, DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 2 DAY), UTC_TIMESTAMP(3))", [task, version, "0".repeat(64)]);
  const runs = async (task: string, version: string, n: number, status: (i: number) => string) => {
    for (let i = 0; i < n; i++) {
      await q("INSERT INTO ai_runs (id, store_id, task, surface, provider, via, class, prompt_version, input_hash, status, ms, credits, cost_micros, created_at) VALUES (?, ?, ?, 'wizard', 'server', 'stream', 'worker', ?, ?, ?, 1200, 1, 9000, DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 HOUR))", [newId(), A.id, task, version, randomBytes(32).toString("hex"), status(i)]);
    }
  };
  await canary("copy.hero", "copy.hero@s9");
  await runs("copy.hero", "copy.hero@s9", 20, (i) => (i < 8 ? "invalid_output" : "ok"));
  await runs("copy.hero", "copy.hero@s1", 40, () => "ok");
  await canary("copy.field", "copy.field@s9");
  await runs("copy.field", "copy.field@s9", 25, () => "ok");
  await runs("copy.field", "copy.field@s1", 25, () => "ok");
  const rollups = aiTrackJobs.find((j) => j.name === "ai.rollups")!;
  const res = await rollups.run(jobCtx("ai.rollups", 5_000));
  const hero = (await q<{ status: string; notes: string | null; rolled_back_at: unknown; rollback_reason: string | null }>("SELECT * FROM prompt_versions WHERE version = 'copy.hero@s9'"))[0];
  const field = (await q<{ status: string; canary_bp: number; canary_runs: number }>("SELECT * FROM prompt_versions WHERE version = 'copy.field@s9'"))[0];
  check("20 synthetic generations with 40 % invalid outputs: retired within one ai.rollups run", hero?.status === "retired" && hero.notes === "auto-rollback: invalid_refusal_timeout" && hero.rolled_back_at !== null, { hero, summary: res.summary });
  check("the rollback's audit row and staff notification", (await q("SELECT id FROM audit_log WHERE action = 'platform.ai.prompt_rolled_back' AND target = 'copy.hero@s9'")).length === 1 && (await q("SELECT id FROM notifications WHERE kind = 'ai.canary_rolled_back'")).length === 1);
  check("a healthy canary keeps running; its slice recomputed from the 7-day volume (< 400 runs → 5,000 bp)", field?.status === "canary" && Number(field.canary_bp) === 5_000 && Number(field.canary_runs) === 25, field);
  const usage1 = await q<{ runs: number; ok: number; invalid: number; cost_micros: number }>("SELECT runs, ok, invalid, cost_micros FROM ai_usage_daily WHERE store_id = ? AND task = 'copy.hero' ORDER BY day", [A.id]);
  check("ai_runs → ai_usage_daily for the store (copy.hero: 60 runs, 52 ok, 8 invalid)", usage1.reduce((n, r) => n + Number(r.runs), 0) === 60 && usage1.reduce((n, r) => n + Number(r.invalid), 0) === 8, usage1);
  await rollups.run(jobCtx("ai.rollups", 5_000));
  const usage2 = await q<{ runs: number }>("SELECT runs FROM ai_usage_daily WHERE store_id = ? AND task = 'copy.hero'", [A.id]);
  check("a second rollup writes the same numbers (idempotent 2-day upsert)", usage2.reduce((n, r) => n + Number(r.runs), 0) === 60);
  // the reconcile job: an abandoned running run
  const stale = newId();
  await q("INSERT INTO ai_runs (id, store_id, task, surface, provider, via, input_hash, status, ms, reserved_credits, created_at) VALUES (?, ?, 'copy.page', 'wizard', 'server', 'stream', ?, 'running', 0, 7, DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 11 MINUTE))", [stale, A.id, "a".repeat(64)]);
  await aiTrackJobs.find((j) => j.name === "ai.reconcile")!.run(jobCtx("ai.reconcile", 2_000));
  const ab = (await q<{ status: string; error_code: string; credits: number; reconciled_at: unknown }>("SELECT * FROM ai_runs WHERE id = ?", [stale]))[0];
  check("ai.reconcile: a run running for 10 min → error/abandoned, reconciled at its reservation", ab?.status === "error" && ab.error_code === "abandoned" && Number(ab.credits) === 7 && ab.reconciled_at !== null, ab);
}

async function evalLiveSuite(fx: Fx): Promise<void> {
  suite("eval-live");
  const { startFakeAnthropic } = load<typeof import("@/lib/ai/testing/fake-anthropic")>("@/lib/ai/testing/fake-anthropic");
  const { resetAnthropic } = load<typeof import("@/lib/ai/server/client")>("@/lib/ai/server/client");
  const { startEvalRun, estimateEvalRun } = load<typeof import("@/lib/ai/eval/live")>("@/lib/ai/eval/live");
  const { getPlatformSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
  const { jobs: aiTrackJobs } = load<typeof import("@/lib/jobs/tracks/ai")>("@/lib/jobs/tracks/ai");
  const env = process.env as Record<string, string | undefined>;
  const fake = await startFakeAnthropic();
  env.SG_E2E = "1";
  env.SG_AI_BASE_URL = fake.origin;
  env.ANTHROPIC_API_KEY = FAKE_KEY;
  resetAnthropic();
  try {
    await setPlatform("ai_cost_micros", 0);
    await setAi({ enabled: true, caps: { monthlyUsd: 100 } }, fx.staff);
    const settings = await getPlatformSetting("platform_ai", { fresh: true });
    const est = estimateEvalRun({ family: "copy.hero", kind: "live", version: "copy.hero@s1" }, settings);
    check("the estimate first: cases × reps, judge items and a cost line", !!est && est.reps === 2 && est.candidateItems === est.cases * 2 && est.judgeItems > 0 && /items × 2 reps · about \$/.test(est.line), est);
    const started = await startEvalRun({ userId: fx.staff }, { family: "copy.hero", kind: "live", version: "copy.hero@s1", limit: 2 });
    check("startEvalRun(live): the oracle and the null passed the harness check, the row is running", started.ok && started.status === "running", started);
    const runId = started.ok ? started.runId : "";
    const batches = aiTrackJobs.find((j) => j.name === "ai.batches")!;
    for (let i = 0; i < 6; i++) {
      await batches.run(jobCtx("ai.batches", 8_000));
      const st = (await q<{ status: string }>("SELECT status FROM ai_eval_runs WHERE id = ?", [runId]))[0]?.status;
      if (st === "done" || st === "failed") break;
    }
    const row = (await q<{ status: string; model: string; passed: number | null; scores: string | null; gate: string | null; cost_micros: number; judge_cost_micros: number; fixtures_hash: string }>("SELECT * FROM ai_eval_runs WHERE id = ?", [runId]))[0];
    const items = await q<{ ref_kind: string; model: string; state: string }>("SELECT ref_kind, model, state FROM ai_batch_items WHERE eval_run_id = ?", [runId]);
    const cands = items.filter((i) => i.ref_kind === "eval");
    const judges = items.filter((i) => i.ref_kind === "eval_judge");
    check("live: 2 cases × 2 reps through Batches, then the judge items, then the row done with its gate", row?.status === "done" && cands.length === 4 && judges.length > 0 && row.gate !== null && row.scores !== null && /^[0-9a-f]{64}$/.test(row.fixtures_hash), { status: row?.status, cands: cands.length, judges: judges.length });
    check("judge ≠ candidate on every batch item (AI-07 (4))", judges.every((j) => j.model !== row?.model) && cands.every((c) => c.model === row?.model), { model: row?.model, judges: [...new Set(judges.map((j) => j.model))] });
    check("the judge's cost is recorded apart from the candidate's", Number(row?.cost_micros) > 0 && Number(row?.judge_cost_micros) > 0, { cost: row?.cost_micros, judge: row?.judge_cost_micros });
    check("the eval's cost counted against the platform month", (await platformUsage("ai_cost_micros")) > 0);
    const smoke = await startEvalRun({ userId: fx.staff }, { family: "copy.hero", kind: "smoke", version: "copy.hero@s1", limit: 1 });
    const srow = smoke.ok ? (await q<{ status: string; kind: string }>("SELECT status, kind FROM ai_eval_runs WHERE id = ?", [smoke.runId]))[0] : undefined;
    check("startEvalRun(smoke): interactive calls, scored at once", smoke.ok && smoke.status === "done" && srow?.status === "done" && srow.kind === "smoke", smoke);
  } finally {
    await fake.close();
    delete env.SG_E2E;
    delete env.SG_AI_BASE_URL;
    resetAnthropic();
  }
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* step 9: the route handlers, poll-only                               */
/* ------------------------------------------------------------------ */

/**
 * AI-01 (11) through the real handler functions (src/lib/ai/http/handlers.ts, what every ai route calls after its
 * storeGuard), with `SG_AI_NO_AFTER=1` and the flag ai_detached_jobs off: the critique-as-job is created by
 * `director/critique` (202 within 500 ms, no model call), a poll without `Sec-Fetch-Site: same-origin` leaves it queued
 * and the same-origin poll hands its batch-only stage to a batch; a job whose stage fits is taken to done by same-origin
 * polls alone, the job body never carrying the input; a stream task on the poll transport (202 { runId }) is completed
 * through `runs/[id]` alone with the events in order; cancel is a 204 whatever the id.
 */
async function routesSuite(fx: Fx): Promise<void> {
  suite("routes");
  const { startFakeAnthropic } = load<typeof import("@/lib/ai/testing/fake-anthropic")>("@/lib/ai/testing/fake-anthropic");
  const { resetAnthropic } = load<typeof import("@/lib/ai/server/client")>("@/lib/ai/server/client");
  const { breaker } = load<typeof import("@/lib/ai/server/breaker")>("@/lib/ai/server/breaker");
  const { ALL_FIXTURES } = load<typeof import("@/lib/ai/eval/fixtures")>("@/lib/ai/eval/fixtures");
  const H = load<typeof import("@/lib/ai/http/handlers")>("@/lib/ai/http/handlers");
  const R = load<typeof import("@/lib/ai/jobs/run")>("@/lib/ai/jobs/run");
  const { B } = fx;
  const env = process.env as Record<string, string | undefined>;
  const fake = await startFakeAnthropic();
  env.SG_E2E = "1";
  env.SG_AI_BASE_URL = fake.origin;
  env.SG_AI_NO_AFTER = "1";
  env.ANTHROPIC_API_KEY = FAKE_KEY;
  resetAnthropic();
  breaker().reset();
  const spy = { after: 0, httpAfter: 0 };
  R.jobDeps.after = () => void spy.after++;
  H.httpDeps.after = (fn) => {
    spy.httpAfter++;
    void fn();
  };
  const ctxB = ctxOf(B, B.owner);
  const recordedOf = (family: string, id: string) =>
    (JSON.parse(readFileSync(path.join(ROOT, `src/lib/ai/eval/sets/${family}/recorded/${family}@s1.json`), "utf8")) as { runs: Record<string, { output: unknown }[]> }).runs[id]![0]!.output;
  const crit = ALL_FIXTURES.find((f) => f.task === "design.critique")!;
  const critOut = recordedOf("director.critique", crit.id);
  const page = ALL_FIXTURES.find((f) => f.id === "copy.page/core-blender-fr")!;
  const pageOut = recordedOf("copy.page", page.id);
  const msgs = () => fake.total("/v1/messages");
  const req = (method: string, rel: string, body?: unknown, headers: Record<string, string> = {}) =>
    new Request(`http://localhost:3452/api/app/${B.row.handle}/ai/${rel}`, { method, headers: { "content-type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const sameOrigin = { "sec-fetch-site": "same-origin" };
  const read = async (res: Response) => ({ status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null });
  const probe = { at: new Date().toISOString(), callShape: null, streamTransport: null, tokPerSec: { director_interactive: 60 }, detachedJob: null, prices: {}, lines: {} };
  try {
    await resetStore(B.id);
    await clearBuckets(B.id);
    await setPlatform("ai_cost_micros", 0);
    await setAi({ enabled: true, streamTransport: "stream", probe, caps: { monthlyUsd: 100, storeDailyCapPct: 100 } }, fx.staff);
    await flagOverride("ai_director_brief", B.id, true);
    await flagOverride("ai_detached_jobs", B.id, false);

    // the critique-as-job (probe line 11 below 80 tok/s): 202 { jobId } at once, nothing run
    const t0 = Date.now();
    const created = await read(await H.handleDirector(ctxB, req("POST", "director/critique", { input: crit.input, pass: { session: "sessaidb0001", id: "passaidb0001" } }), "critique"));
    const ms = Date.now() - t0;
    const jobId = String(created.body?.jobId ?? "");
    check("director/critique below 80 tok/s: 202 { jobId } within 500 ms, no model call, no after() (flag off)", created.status === 202 && /^[0-9A-Z]{26}$/.test(jobId) && ms < 500 && msgs() === 0 && spy.after === 0, { created, ms });

    // a poll without Sec-Fetch-Site: same-origin reads only
    const before = await jobRow(jobId);
    const ro = await read(await H.handleJobPoll(ctxB, req("GET", `jobs/${jobId}?advance=1`), jobId));
    check("jobs/[id]?advance=1 without Sec-Fetch-Site: same-origin: the read-only view, the row unchanged", ro.status === 200 && ro.body?.status === "queued" && msgs() === 0 && JSON.stringify(await jobRow(jobId)) === JSON.stringify(before), ro);
    const ro0 = await read(await H.handleJobPoll(ctxB, req("GET", `jobs/${jobId}?advance=0`, undefined, sameOrigin), jobId));
    check("jobs/[id]?advance=0 (same-origin): metadata only, nothing run", ro0.status === 200 && ro0.body?.status === "queued" && msgs() === 0, ro0);

    // below 80 tok/s the slim critique cannot fit a 90 s stage (step 8, AI-§B.8 case b): the same-origin poll hands it
    // to a one-item batch, no model call inside the request
    const handed = (await read(await H.handleJobPoll(ctxB, req("GET", `jobs/${jobId}`, undefined, sameOrigin), jobId))).body;
    check("the same-origin poll of the critique-as-job hands its batch-only stage to a one-item batch, no inline model call", handed?.status === "running" && String(handed?.stage ?? "").startsWith("batch:") && msgs() === 0, handed);
    const cancelled = await H.handleJobCancel(ctxB, jobId);
    check("jobs/[id]/cancel of the store's own job: 204, the job cancelled", cancelled.status === 204 && (await jobRow(jobId))?.status === "cancelled", (await jobRow(jobId))?.status);

    // a job whose stage fits (the measured throughput back at the default): same-origin polls alone take it to done
    await setAi({ probe: null }, fx.staff);
    const { enqueueAiJob } = load<typeof import("@/lib/ai/jobs/enqueue")>("@/lib/ai/jobs/enqueue");
    const deep = await enqueueAiJob(ctxB, { kind: "director_deep", task: "design.critique", input: { critique: crit.input, run: 9 } });
    const deepId = deep.ok ? deep.jobId : "";
    fake.enqueue({ kind: "ok", json: critOut });
    let view: Record<string, unknown> | null = null;
    let polls = 0;
    while (polls < 4 && view?.status !== "done") {
      polls++;
      view = (await read(await H.handleJobPoll(ctxB, req("GET", `jobs/${deepId}`, undefined, sameOrigin), deepId))).body;
    }
    const outputs = (view?.outputs ?? null) as Record<string, unknown> | null;
    check("same-origin polls alone (SG_AI_NO_AFTER=1, flag off) take the job to done through handleJobPoll", deep.ok && view?.status === "done" && polls === 1 && !!outputs?.critique && msgs() === 1 && spy.after === 0, { view, polls });
    check(
      "the job body: progress with its plan, the driver poll, the cost in credits, never the input",
      (view?.progress as { plan?: string[] } | undefined)?.plan?.join() === "critique" && view?.driver === "poll" && Number(view?.costCredits) > 0 && !("input" in (view ?? {})),
      view,
    );
    const twice = await read(await H.handleJobPoll(ctxB, req("GET", `jobs/${deepId}`, undefined, sameOrigin), deepId));
    check("a poll of a finished job runs nothing more", twice.body?.status === "done" && msgs() === 1);

    // a stream task on the poll transport: 202 { runId }, finished through runs/[id] alone
    await setAi({ streamTransport: "poll" }, fx.staff);
    fake.enqueue({ kind: "ok", json: pageOut, deltaMs: 5 });
    const started = await read(await H.handleTask(ctxB, req("POST", "copy.page", { input: page.input, surface: "wizard", nonce: "aidbpoll1" }), "copy.page"));
    const runId = String(started.body?.runId ?? "");
    check("copy.page on the poll transport: 202 { runId }, the call continuing in after()", started.status === 202 && /^[0-9A-Z]{26}$/.test(runId) && spy.httpAfter === 1, started);
    type Ev = { s: number; t: string; value?: unknown };
    const events: Ev[] = [];
    let after = -1;
    let done = false;
    for (let i = 0; i < 150 && !done; i++) {
      const r = await read(await H.handleRunPoll(ctxB, req("GET", `runs/${runId}?after=${after}`), runId));
      const evs = (r.body?.events ?? []) as Ev[];
      events.push(...evs);
      if (evs.length) after = evs[evs.length - 1]!.s;
      done = r.body?.done === true;
      if (!done) await new Promise((res) => setTimeout(res, 100));
    }
    const types = events.map((e) => e.t);
    const final = events.find((e) => e.t === "final");
    check("runs/[id] alone completes the run: start first, fields, final last, seq strictly increasing", done && types[0] === "start" && types[types.length - 1] === "final" && types.includes("field") && events.every((e, i) => i === 0 || e.s > events[i - 1]!.s), types);
    check("the final event carries the guarded page", !!final && typeof (final.value as { headline?: unknown } | undefined)?.headline === "string", final);
    const again = await read(await H.handleRunPoll(ctxB, req("GET", `runs/${runId}?after=${after}`), runId));
    check("a poll after the last seq: no events, done", again.status === 200 && ((again.body?.events ?? []) as unknown[]).length === 0 && again.body?.done === true, again);

    // cancel answers 204 whatever the id
    const c1 = await H.handleJobCancel(ctxB, deepId);
    const c2 = await H.handleJobCancel(ctxB, "01J0000000000000000000GH0S");
    const c3 = await H.handleJobCancel(ctxB, "not-an-id");
    check("jobs/[id]/cancel: 204 for a finished job, a missing id and a malformed one; the done job stays done", c1.status === 204 && c2.status === 204 && c3.status === 204 && (await jobRow(deepId))?.status === "done");
  } finally {
    await setAi({ streamTransport: "stream", probe: null }, fx.staff).catch(() => undefined);
    await flagOverride("ai_director_brief", B.id, null);
    await flagOverride("ai_detached_jobs", B.id, null);
    await fake.close();
    delete env.SG_E2E;
    delete env.SG_AI_BASE_URL;
    delete env.SG_AI_NO_AFTER;
    resetAnthropic();
  }
}

async function settingsSuite(fx: Fx): Promise<void> {
  suite("settings");
  const W = load<typeof import("@/lib/ai/settings/write.server")>("@/lib/ai/settings/write.server");
  const { loadAiSettings } = load<typeof import("@/lib/ai/settings/load.server")>("@/lib/ai/settings/load.server");
  const { storeBlockCtxFor } = load<typeof import("@/lib/ai/prompts/assemble.server")>("@/lib/ai/prompts/assemble.server");
  const { renderStoreBlock } = load<typeof import("@/lib/ai/prompts/store-block")>("@/lib/ai/prompts/store-block");
  const { getStoreSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
  const { A, B } = fx;
  const owner = ctxOf(A, A.owner) as WriteCtxT;
  const noManage = { ...ctxOf(A, A.owner), can: () => false } as WriteCtxT;
  const viewing = ctxOf(A, fx.staff, "impersonation") as WriteCtxT;
  const key = () => randomBytes(9).toString("base64url");
  const facts = { market: "MA" as const, currency: "MAD", primaryLocale: "fr" as const };
  const version = async () => renderStoreBlock(await storeBlockCtxFor(A.scope, facts)).voiceVersion;
  const voice = { formality: "tu" as const, darija: "light" as const, ctaByLocale: { fr: "Je réserve", ar: "" }, wordsUse: ["récolte", "Récolte", "x"], wordsAvoid: ["miracle"] };

  // AI-06 (1): voice and memory writes require ai.manage; "View as store" is refused before anything is read
  const before = JSON.stringify(await getStoreSetting(A.scope, "store_ai", { fresh: true }));
  const v0 = await version();
  check("saveVoice without ai.manage: forbidden", codeOf(await rejects(() => W.saveVoice(noManage, { key: key(), voice }))) === "forbidden");
  check("saveVoice as View as store: impersonation_read_only", codeOf(await rejects(() => W.saveVoice(viewing, { key: key(), voice }))) === "impersonation_read_only");
  check("addMemoryItem without ai.manage: forbidden", codeOf(await rejects(() => W.addMemoryItem(noManage, { key: key(), item: { kind: "fact", text: "refused item" } }))) === "forbidden");
  check("saveMode / saveDirector without ai.manage: forbidden", codeOf(await rejects(() => W.saveMode(noManage, { key: key(), mode: "local" }))) === "forbidden" && codeOf(await rejects(() => W.saveDirector(noManage, { key: key(), director: "off" }))) === "forbidden");
  check("the refused writes left store_ai as it was", JSON.stringify(await getStoreSetting(A.scope, "store_ai", { fresh: true })) === before);

  // AI-06 (4): a voice change changes voiceVersion
  const saved = await W.saveVoice(owner, { key: key(), voice });
  check("saveVoice keeps the cleaned fields (empty button text dropped, words deduplicated)", saved.formality === "tu" && saved.ctaByLocale.fr === "Je réserve" && !("ar" in saved.ctaByLocale) && saved.wordsUse.length === 1, saved);
  const v1 = await version();
  check("a voice change changes voiceVersion", v0 !== v1, { v0, v1 });
  const k = key();
  await W.saveVoice(owner, { key: k, voice: { ...voice, formality: "vous" } });
  const v2 = await version();
  await W.saveVoice(owner, { key: k, voice: { ...voice, formality: "tu" } });
  check("a replayed idempotency key writes nothing again", (await version()) === v2 && (await getStoreSetting(A.scope, "store_ai", { fresh: true })).voice.formality === "vous");

  // memory through the actions' bodies: idempotent add, pin, delete; B's id space
  const mk = key();
  const a1 = await W.addMemoryItem(owner, { key: mk, item: { kind: "prefer", text: "Toujours parler de la récolte" } });
  const a2 = await W.addMemoryItem(owner, { key: mk, item: { kind: "prefer", text: "Toujours parler de la récolte" } });
  const [{ n }] = await q<{ n: number }>("SELECT COUNT(*) AS n FROM ai_memory WHERE store_id = ? AND text = ?", [A.id, "Toujours parler de la récolte"]);
  check("a double submit adds one item (same key, same id)", a1.id === a2.id && Number(n) === 1, { a1, a2, n });
  await W.pinMemoryItem(owner, { key: key(), id: a1.id, pinned: true });
  check("pin through the action", Number((await q<{ pinned: number }>("SELECT pinned FROM ai_memory WHERE id = ?", [a1.id]))[0]?.pinned) === 1);
  check("B's owner cannot pin or delete A's item (not found)", (await rejects(() => W.pinMemoryItem(ctxOf(B, B.owner) as WriteCtxT, { key: key(), id: a1.id, pinned: false }))) !== null && (await rejects(() => W.deleteMemoryItem(ctxOf(B, B.owner) as WriteCtxT, { key: key(), id: a1.id }))) !== null);
  await W.deleteMemoryItem(owner, { key: key(), id: a1.id });
  check("delete through the action leaves a tombstone", Number((await q<{ active: number }>("SELECT active FROM ai_memory WHERE id = ?", [a1.id]))[0]?.active) === 0);
  const audits = await q<{ action: string; meta: string | null }>("SELECT action, meta FROM audit_log WHERE store_id = ? AND action LIKE 'store.ai.%'", [A.id]).catch(() => [] as { action: string; meta: string | null }[]);
  const acts = new Set(audits.map((r) => r.action));
  check("audited: settings, voice, memory added, pinned and deleted", ["store.ai.voice_updated", "store.ai.memory_added", "store.ai.memory_pinned", "store.ai.memory_deleted"].every((a) => acts.has(a)), [...acts]);
  check("the audit rows carry no memory text", !audits.some((r) => String(r.meta ?? "").includes("récolte")));

  // the probe (D56): staff only
  const notStaff = await rejects(() => W.startProbe(ctxOf(A, A.owner), { key: key() }));
  check("startProbe by a store owner who is not staff: the staff-only answer, no job", notStaff instanceof Error && notStaff.message === "ai.settings.probe.staff_only" && (await q("SELECT id FROM ai_jobs WHERE store_id = ? AND kind = 'probe'", [A.id])).length === 0);
  check("startProbe under View as store: impersonation_read_only", codeOf(await rejects(() => W.startProbe(viewing, { key: key() }))) === "impersonation_read_only");

  // the page's read: metadata and store data only, read-only under View as store
  await W.saveMode(owner, { key: key(), mode: "auto" });
  const view = await loadAiSettings(ctxOf(A, A.owner));
  check("the view reads the store's own settings and credits", view.handle === A.row.handle && view.settings.voice.formality === "vous" && view.readOnly === null && typeof view.credits.used === "number");
  const asStaff = await loadAiSettings(ctxOf(A, fx.staff, "impersonation"));
  check("View as store: read-only, no probe card, memory still listed", asStaff.readOnly === "impersonation" && !asStaff.staffProbe);
  check("B's view holds none of A's memory or voice", !JSON.stringify(await loadAiSettings(ctxOf(B, B.owner))).includes("Je réserve"));
}

/* ------------------------------------------------------------------ */
/* step 13: Console → AI (platform actions, aiStoreSummary, aiHealth)  */
/* ------------------------------------------------------------------ */

/** A staff context as `requirePlatform` hands it (super_admin), with or without a fresh step-up. */
function platformCtxOf(staff: string, fresh: boolean): import("@/lib/tenancy/types").PlatformCtx {
  return {
    user: { id: staff, email: "staff@ai-db.test", name: "Staff", totpEnabled: true, sessionId: "s", platformRole: "super_admin", locale: null, lastStoreId: null },
    role: "super_admin",
    actor: { kind: "platform", userId: staff, impersonatorId: null, ip: null },
    can: () => true,
    stepUpFresh: fresh,
    stepUpUntil: fresh ? new Date(Date.now() + 300_000) : null,
  } as unknown as import("@/lib/tenancy/types").PlatformCtx;
}

/**
 * AI-01 console scope, AI-07 (3)(4 UI)(5), AI-19 (9)(10), AI-§K.2, AI-§K.4 through the action bodies
 * (src/lib/ai/platform/console-write.ts, what each `platformAction("ai.platform", …)` of the console calls): the jury
 * rule at save, the class gate and the emergency path (step-up, not_found only, audited), Canary and Activate gates,
 * Auto by default behind the preference test, the key's step-up and that it never leaves (answers, audit rows, logs);
 * then aiStoreSummary (metadata only) and the aiHealth shape.
 */
async function consoleSuite(fx: Fx): Promise<void> {
  suite("console");
  const W = load<typeof import("@/lib/ai/platform/console-write")>("@/lib/ai/platform/console-write");
  const { storeSummary, platformHealth } = load<typeof import("@/lib/ai/platform/summary")>("@/lib/ai/platform/summary");
  const { aiStoreSummary, aiHealth } = load<typeof import("@/lib/ai/summary.server")>("@/lib/ai/summary.server");
  const { fixturesHash } = load<typeof import("@/lib/ai/eval/fixtures")>("@/lib/ai/eval/fixtures");
  const { syncPromptVersions } = load<typeof import("@/lib/ai/platform/prompt-versions")>("@/lib/ai/platform/prompt-versions");
  const { getPlatformSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
  const { startFakeAnthropic } = load<typeof import("@/lib/ai/testing/fake-anthropic")>("@/lib/ai/testing/fake-anthropic");
  const { resetAnthropic } = load<typeof import("@/lib/ai/server/client")>("@/lib/ai/server/client");
  const { newId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const fresh = platformCtxOf(fx.staff, true);
  const stale = platformCtxOf(fx.staff, false);
  const codeOfOutcome = (o: { ok: boolean; code?: string }) => (o.ok ? "ok" : (o.code ?? "?"));
  const evalRun = async (o: { kind: string; task: string; version: string; model?: string | null; rubric?: string | null; hash: string; passed: boolean; daysAgo?: number }) => {
    const id = newId();
    await q(
      "INSERT INTO ai_eval_runs (id, kind, task, model, prompt_version, rubric_version, fixtures_hash, status, passed, created_at, done_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'done', ?, DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? DAY), UTC_TIMESTAMP(3))",
      [id, o.kind, o.task, o.model ?? null, o.version, o.rubric ?? null, o.hash, o.passed ? 1 : 0, o.daysAgo ?? 0],
    );
    return id;
  };
  const audits = async (action: string) => q<{ meta: string | null; target: string | null }>("SELECT meta, target FROM audit_log WHERE action = ? ORDER BY created_at DESC", [action]);

  const env = process.env as Record<string, string | undefined>;
  const fake = await startFakeAnthropic();
  env.SG_E2E = "1";
  env.SG_AI_BASE_URL = fake.origin;
  env.ANTHROPIC_API_KEY = FAKE_KEY;
  resetAnthropic();
  try {
    await setAi({ enabled: true, caps: { monthlyUsd: 100 } }, fx.staff);
    const base = await getPlatformSetting("platform_ai", { fresh: true });

    // AI-07 (4): a jury containing the candidate class's model is refused at save
    const juryBad = await W.saveJury(fresh, { class: "director_interactive", models: [base.classes.director_interactive.model, "claude-sonnet-5-5"] });
    check("a jury containing the candidate's model is refused at save (jury)", codeOfOutcome(juryBad) === "jury", juryBad);
    const judgeBad = await W.saveJury(fresh, { class: "worker", models: [base.classes.worker.model] });
    check("the Worker's judge cannot be the Worker model (jury)", codeOfOutcome(judgeBad) === "jury", judgeBad);
    check("the refused juries left the setting as it was", JSON.stringify((await getPlatformSetting("platform_ai", { fresh: true })).evalGate) === JSON.stringify(base.evalGate));

    // AI-§F.6: a class model change needs step-up, a checked model and a passing full live run ≤ 14 days
    const worker = base.classes.worker;
    const next = { class: "worker", model: "claude-opus-5", effort: worker.effort, maxTokens: worker.maxTokens, timeoutMs: worker.timeoutMs, fallbacks: worker.fallbacks, batch: worker.batch };
    check("a model change without a fresh step-up: step_up", codeOf(await rejects(() => W.saveClass(stale, next))) === "step_up");
    const unchecked = await W.saveClass(fresh, next);
    check("an unchecked model id cannot be saved (not_checked)", codeOfOutcome(unchecked) === "not_checked", unchecked);
    const checked = await W.checkModelInfo(fresh, { id: "claude-opus-5" });
    check("Check model stores the model's facts", checked.ok && checked.value.id === "claude-opus-5" && !!(await getPlatformSetting("platform_ai", { fresh: true })).modelInfo["claude-opus-5"], checked);
    const missing = await W.checkModelInfo(fresh, { id: "claude-missing-model" });
    check("Check model on an id the API does not know: model_not_found", codeOfOutcome(missing) === "model_not_found", missing);
    const noRun = await W.saveClass(fresh, next);
    check("a class model change without a passing full live run is refused (needs_live_run)", codeOfOutcome(noRun) === "needs_live_run", noRun);
    await evalRun({ kind: "smoke", task: "copy.page", version: "copy.page@s1", model: "claude-opus-5", hash: fixturesHash("copy.page"), passed: true });
    check("…a smoke run is not enough for a class change", codeOfOutcome(await W.saveClass(fresh, next)) === "needs_live_run");
    await evalRun({ kind: "live", task: "copy.page", version: "copy.page@s1", model: "claude-opus-5", hash: "0".repeat(64), passed: true });
    check("…nor a live run on another fixtures hash", codeOfOutcome(await W.saveClass(fresh, next)) === "needs_live_run");
    await evalRun({ kind: "live", task: "copy.page", version: "copy.page@s1", model: "claude-opus-5", hash: fixturesHash("copy.page"), passed: true, daysAgo: 15 });
    check("…nor one older than 14 days", codeOfOutcome(await W.saveClass(fresh, next)) === "needs_live_run");
    await evalRun({ kind: "live", task: "copy.page", version: "copy.page@s1", model: "claude-opus-5", hash: fixturesHash("copy.page"), passed: true });
    const allowed = await W.saveClass(fresh, next);
    check("with a passing live run ≤ 14 days on the current hash the change saves", allowed.ok && (await getPlatformSetting("platform_ai", { fresh: true })).classes.worker.model === "claude-opus-5", allowed);
    check("…audited platform.ai.model_changed with from and to", (await audits("platform.ai.model_changed")).some((r) => String(r.meta).includes("claude-opus-5") && String(r.meta).includes(worker.model)));

    // AI-D15: the emergency switch, only on not_found, with step-up and a typed reason
    const reachable = await W.emergencySwitch(fresh, { class: "worker", model: "claude-sonnet-5-5", reason: "the provider retired the model" });
    check("emergency switch while the active model answers: refused (not_not_found)", codeOfOutcome(reachable) === "not_not_found", reachable);
    await setAi({ classes: { ...(await getPlatformSetting("platform_ai", { fresh: true })).classes, worker: { ...worker, model: "claude-missing-worker" } } }, fx.staff);
    check("emergency switch without a fresh step-up: step_up", codeOf(await rejects(() => W.emergencySwitch(stale, { class: "worker", model: "claude-sonnet-5-5", reason: "the provider retired the model" }))) === "step_up");
    check("emergency switch without a typed reason: refused before anything", (await rejects(() => W.emergencySwitch(fresh, { class: "worker", model: "claude-sonnet-5-5", reason: "gone" }))) !== null);
    const switched = await W.emergencySwitch(fresh, { class: "worker", model: "claude-sonnet-5-5", reason: "the provider retired the model" });
    const sw = await audits("platform.ai.model_emergency_switch");
    check("the active model answers not_found: the switch saves without a passing run", switched.ok && (await getPlatformSetting("platform_ai", { fresh: true })).classes.worker.model === "claude-sonnet-5-5", switched);
    check("…with the audit row platform.ai.model_emergency_switch (class, from, to, reason)", sw.length === 1 && String(sw[0]?.meta).includes("claude-missing-worker") && String(sw[0]?.meta).includes("the provider retired the model"), sw[0]);
    await setAi({ classes: { ...(await getPlatformSetting("platform_ai", { fresh: true })).classes, worker } }, fx.staff);

    // AI-07 (5): Canary only with a passing smoke or full run on the current hash; Activate only at the threshold
    await syncPromptVersions();
    await q("INSERT INTO prompt_versions (task, version, provider, template_hash, status, created_at) VALUES ('copy.page', 'copy.page@s8', 'server', ?, 'draft', UTC_TIMESTAMP(3))", ["a".repeat(64)]);
    const canaryNone = await W.startCanary(fresh, { family: "copy.page", version: "copy.page@s8" });
    check("Canary without a passing smoke or full run: refused (no_canary_run)", codeOfOutcome(canaryNone) === "no_canary_run", canaryNone);
    await evalRun({ kind: "smoke", task: "copy.page", version: "copy.page@s8", hash: "f".repeat(64), passed: true });
    check("…a passing smoke run on another fixtures hash does not count", codeOfOutcome(await W.startCanary(fresh, { family: "copy.page", version: "copy.page@s8" })) === "no_canary_run");
    await evalRun({ kind: "smoke", task: "copy.page", version: "copy.page@s8", hash: fixturesHash("copy.page"), passed: true });
    const canaried = await W.startCanary(fresh, { family: "copy.page", version: "copy.page@s8" });
    const row = (await q<{ status: string; canary_bp: number }>("SELECT status, canary_bp FROM prompt_versions WHERE version = 'copy.page@s8'"))[0];
    check("with a passing smoke run on the current hash: canary at the computed slice (< 400 runs a week → 50 %)", canaried.ok && row?.status === "canary" && Number(row.canary_bp) === 5_000, { canaried, row });
    check("…audited platform.ai.prompt_canaried", (await audits("platform.ai.prompt_canaried")).some((r) => r.target === "copy.page"));
    check("Activate without a fresh step-up: step_up", codeOf(await rejects(() => W.activateVersion(stale, { family: "copy.page", version: "copy.page@s8" }))) === "step_up");
    const early = await W.activateVersion(fresh, { family: "copy.page", version: "copy.page@s8" });
    check("Activate before the promotion threshold: refused (not_ready)", codeOfOutcome(early) === "not_ready", early);
    check("…and the low-volume path before day 28 too (not_low_volume)", codeOfOutcome(await W.activateLowVolume(fresh, { family: "copy.page", version: "copy.page@s8" })) === "not_low_volume");
    check("the family's active version is unchanged", ((await getPlatformSetting("platform_ai", { fresh: true })).promptVersions["copy.page"] ?? "copy.page@s1") === "copy.page@s1");
    const rolled = await W.rollbackVersion(fresh, { family: "copy.page", version: "copy.page@s8", reason: "test cleanup" });
    check("Roll back retires the canary, audited", rolled.ok && (await q<{ status: string }>("SELECT status FROM prompt_versions WHERE version = 'copy.page@s8'"))[0]?.status === "retired" && (await audits("platform.ai.prompt_rolled_back")).some((r) => String(r.meta).includes("test cleanup")));

    // AI-19 (10): Auto by default only with the recorded passing preference test
    const autoNo = await W.setDirectorDefault(fresh, { auto: true });
    check("Auto by default without a preference run: refused (needs_preference)", codeOfOutcome(autoNo) === "needs_preference" && !(await getPlatformSetting("platform_ai", { fresh: true })).directorAutoDefault, autoNo);
    const weak = await W.recordPreference(fresh, { lowerBound: 0.51, pairs: 60 });
    check("a preference test below 0.55 is recorded as failing and unlocks nothing", weak.ok && !weak.value.pass && codeOfOutcome(await W.setDirectorDefault(fresh, { auto: true })) === "needs_preference");
    const strong = await W.recordPreference(fresh, { lowerBound: 0.61, pairs: 64 });
    const autoYes = await W.setDirectorDefault(fresh, { auto: true });
    check("a passing preference run (≥ 0.55 over ≥ 60 pairs) unlocks Auto by default", strong.ok && strong.value.pass && autoYes.ok && (await getPlatformSetting("platform_ai", { fresh: true })).directorAutoDefault === true, { strong, autoYes });
    check("…audited preference_recorded and director_default_changed", (await audits("platform.ai.preference_recorded")).length === 2 && (await audits("platform.ai.director_default_changed")).length === 1);
    await W.setDirectorDefault(fresh, { auto: false });
    const cal = await W.recordCalibration(fresh, { labels: [{ caseId: "not-a-case", score: 5 }] });
    check("naturalness labels for unknown cases are refused (state)", codeOfOutcome(cal) === "state", cal);

    // the cap and the key: step-up, and the key never leaves (answers, audit rows, logs)
    check("the monthly cap without a fresh step-up: step_up", codeOf(await rejects(() => W.saveCap(stale, { monthlyUsd: 50 }))) === "step_up");
    const cap = await W.saveCap(fresh, { monthlyUsd: 120 });
    check("the cap saves with step-up, audited cap_changed from → to", cap.ok && (await audits("platform.ai.cap_changed")).some((r) => String(r.meta).includes("120")));
    const secret = `sk-ant-console${randomBytes(18).toString("hex")}`;
    const logged: string[] = [];
    const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
    for (const k of ["log", "error", "warn", "info"] as const) console[k] = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
    let answer: unknown;
    let staleKey: unknown;
    let badKey: unknown;
    try {
      staleKey = await rejects(() => W.setKey(stale, { apiKey: secret }));
      badKey = await W.setKey(fresh, { apiKey: "not-a-key" });
      answer = await W.setKey(fresh, { apiKey: secret });
    } finally {
      Object.assign(console, orig);
    }
    check("Set key without a fresh step-up: step_up", codeOf(staleKey) === "step_up");
    check("a malformed key is refused without echoing it (invalid_key)", JSON.stringify(badKey).includes("invalid_key") && !JSON.stringify(badKey).includes("not-a-key"));
    check("Set key answers the key source, never the key", JSON.stringify(answer).includes("settings") && !JSON.stringify(answer).includes(secret), answer);
    const keyAudits = await q<{ action: string; meta: string | null }>("SELECT action, meta FROM audit_log WHERE action LIKE 'platform.%' ORDER BY created_at DESC LIMIT 100");
    check("…audited key_set, and no audit row carries the key", keyAudits.some((r) => r.action === "platform.ai.key_set") && !keyAudits.some((r) => String(r.meta).includes(secret.slice(7, 30))));
    check("…and nothing logged carries it", !logged.some((l) => l.includes(secret.slice(7, 30))), logged.slice(0, 5));
    const raw = (await q<{ value: string }>("SELECT value FROM settings WHERE `key` = 'platform_ai_secret'"))[0];
    check("…the stored value is sealed (the key is not in the row)", !!raw && !String(raw.value).includes(secret.slice(7, 30)));
    const removed = await W.removeKey(fresh);
    check("Remove key (step-up): the source falls back to the environment, audited key_removed", removed.ok && removed.value.keySource === "env" && (await audits("platform.ai.key_removed")).length === 1, removed);
  } finally {
    await fake.close();
    delete env.SG_E2E;
    delete env.SG_AI_BASE_URL;
    resetAnthropic();
  }

  // AI-§K.4: aiStoreSummary is metadata only, through the console scope
  const { A } = fx;
  const tag = `console-canary-${randomBytes(4).toString("hex")}`;
  await q(
    "INSERT INTO ai_runs (id, store_id, task, surface, provider, via, class, model, prompt_version, input_hash, status, output, rejected_fields, flags, ms, credits, cost_micros, created_at) VALUES (?, ?, 'copy.hero', 'wizard', 'server', 'stream', 'worker', 'claude-sonnet-5-5', 'copy.hero@s1', ?, 'ok', ?, ?, ?, 1200, 3, 900, UTC_TIMESTAMP(3))",
    [newId(), A.id, "e".repeat(64), JSON.stringify({ headline: `${tag} headline text` }), JSON.stringify(["faq"]), JSON.stringify(["fallback_model"])],
  );
  const summary = await storeSummary(fresh, A.id);
  const viaStub = await aiStoreSummary(fresh, A.id);
  const text = JSON.stringify(summary);
  check("aiStoreSummary: the store's runs grouped by task, class and provider, with latency", summary.runs.some((r) => r.by === "task" && r.key === "copy.hero" && r.p50Ms !== null) && summary.runs.some((r) => r.by === "class") && summary.runs.some((r) => r.by === "provider" && r.key === "server" && r.fallbacks >= 1));
  check("…the guard-rejection heat-map by field names", summary.rejections.some((r) => r.task === "copy.hero" && r.field === "faq"));
  check("…the last runs as metadata, credits and cost, through the frozen export", summary.recent.length > 0 && typeof summary.credits.month.used === "number" && typeof summary.costMicrosMonth === "number" && JSON.stringify(viaStub) === text);
  check("aiStoreSummary returns no text field (no output, prompt or memory text)", !text.includes(tag) && !text.includes("headline text") && !/"(output|prompt|text|input)"\s*:/.test(text));
  check("aiStoreSummary needs console.read (the platform scope)", (await rejects(() => storeSummary({ ...fresh, can: () => false }, A.id))) !== null);
  check("aiStoreSummary of an unknown store: not_found", codeOf(await rejects(() => storeSummary(fresh, newId()))) === "not_found");

  // AI-§O: the aiHealth shape
  const h = await platformHealth();
  const viaHealth = await aiHealth();
  const keys = ["keySource", "enabled", "classes", "breaker", "transport", "deepTransport", "lastOkAt", "batches", "jobs", "spend", "refusalRate24h", "errorsLastHour", "directorShareRefusals24h", "canary", "detachedJobs"];
  check("aiHealth carries every AI-§O field", keys.every((k) => k in h) && Object.keys(viaHealth).sort().join() === Object.keys(h).sort().join(), Object.keys(h));
  check("…four classes with the served model and fallback use in 24 h", h.classes.length === 4 && h.classes.every((k) => typeof k.model === "string" && typeof k.fallbacks24h === "number" && ["ok", "paused", "unavailable"].includes(k.state)));
  check("…jobs with the driver shares, batches with the oldest age, spend with the pending slice", typeof h.jobs.running === "number" && typeof h.jobs.drivers === "object" && "oldestAgeMin" in h.batches && "pendingSliceUsedPct" in h.spend && typeof h.detachedJobs.flag === "boolean");
  check("…the last successful call, refusals and fallbacks read from the runs", h.lastOkAt !== null && h.classes.find((k) => k.class === "worker")!.fallbacks24h >= 1);
  check("aiHealth never carries a key", !JSON.stringify(h).includes("sk-ant"));
}

async function main(): Promise<void> {
  const started = Date.now();
  let done = false;
  try {
    await rootQuery(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
    await rootQuery(`CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const { runMigrations } = load<typeof import("@/lib/db/migrate")>("@/lib/db/migrate");
    const migrated = await runMigrations();
    suite("setup");
    check("migrations 0000…0005 applied on the throwaway database", (migrated as { status?: string }).status === "applied", migrated);
    const fx = await seed();
    await setAi({ enabled: true, caps: { monthlyUsd: 100 } }, fx.staff);
    check("seeded: A and B active, P pending", fx.A.row.status === "active" && fx.B.row.status === "active" && fx.P.row.status === "pending");
    await reserveSuite(fx);
    await raceSuite(fx);
    await pendingSuite(fx);
    await directorSuite(fx);
    await cacheSuite(fx);
    await memorySuite(fx);
    await policySuite(fx);
    await runsSuite(fx);
    await jobsSuite(fx);
    await keySuite();
    await runAiSuite(fx);
    await promptVersionsSuite();
    await sf05Suite();
    await jobsSuiteB(fx);
    await batchesSuite(fx);
    await rollupsSuite(fx);
    await evalLiveSuite(fx);
    await routesSuite(fx);
    await settingsSuite(fx);
    await consoleSuite(fx);
    done = true;
  } catch (err) {
    check("the suite ran to the end", false, err instanceof Error ? err.stack : String(err));
  } finally {
    const left = await dropDatabase().catch((e) => [`cleanup failed: ${e instanceof Error ? e.message : String(e)}`]);
    const secs = Math.round((Date.now() - started) / 1000);
    console.log(`test:ai-db: ${passed} passed, ${failures.length} failed · database ${DB_NAME} ${KEEP ? "kept" : "dropped"}; cod_test_p7_* left: ${left.length ? left.join(", ") : "none"} · ${secs} s`);
    process.exit(failures.length || !done ? 1 : 0);
  }
}

if (require.main === module) void main();

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
 * Exit code 1 when a check fails.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import type { StoreCtx, StoreRow, StoreScope, WriteScope } from "@/lib/tenancy/types";

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

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

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
    await promptVersionsSuite();
    await sf05Suite();
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

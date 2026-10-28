/**
 * Store Health DB checks (platform.md PLA-§O.2 "health-db-check", PLA-§6.3.5, PLA-§O.3 case 8; core §J.2): the
 * `platform.health` and `platform.alarms` jobs against a throwaway database. `npm run test:health-db`, in `test:db`
 * from the P1 merge.
 *
 *   npx tsx scripts/qa/health-db-check.ts [--db cod_test_p1_health] [--keep] [--verbose]
 *
 * A `cod_test_*` database on the local MariaDB as root without a password (127.0.0.1:3306, or SG_TEST_SERVER): created,
 * migrated with the app's migrator, seeded, checked, dropped (`--keep` keeps it). No network. The jobs are called
 * through their own functions with a test `JobCtx` (P8's runner, which writes `job_runs`, is a stub on `r1/p1`: the
 * summary checked here is the one the job hands the runner).
 *
 * Seed: three stores with an owner and an admin each: "clean" (active, one live page), "busy" (active: a 20-minute
 * Sheets backlog and media at 85 % through injected sources, and a test-only rule standing in for P5's
 * `int:sheets_backlog`; one order carrying the customer canaries) and "parked" (suspended). Then:
 *   1. dirty first, the snapshot upsert (`dirty_at` NULL), the expected flags and scores, both rings read one score;
 *   2. milestones once over two runs, `quota.80` once per metric and period, `health.issue_new` once per week, never on
 *      a first computation, a snooze honoured by the next run, no tenant table written;
 *   3. the canary scan of `issues`, `flags`, `metrics`, the notifications and the audit rows (PLA-§O.3 case 8);
 *   4. the slot budget (PD78): sources stubbed at 300 ms per store → about ten stores in 3 s, `perStoreP50Ms`,
 *      `perStoreP95Ms` and `cycleMin` in the summary; a 30-row dirty queue drained oldest first in three or four ticks;
 *   5. `health_stale` on a 300-store fixture: silent at 1.4 × cycleMin, raised once at 1.6 × (fake clock).
 */
import Module from "node:module";
import mysql from "mysql2/promise";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = require.resolve("drizzle-orm");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    return req === "server-only" ? stub : orig.call(this, req, ...rest);
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v && !v.startsWith("--") ? v : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const DB = arg("db") ?? process.env.SG_TEST_DB ?? "cod_test_p1_health";
const SERVER = process.env.SG_TEST_SERVER ?? "mysql://root@127.0.0.1:3306/";
if (!/^cod_test_[a-z0-9_]{1,40}$/.test(DB)) {
  console.error(`health-db-check: the database must be a cod_test_* name, got "${DB.slice(0, 60)}"`);
  process.exit(2);
}
const KEEP = flag("keep");
const VERBOSE = flag("verbose");
const env = process.env as Record<string, string | undefined>;
env.DATABASE_URL = SERVER + DB;
env.APP_SECRET = "health-db-check-secret-71c0e2a95d4b3f86";
env.PLATFORM_URL = "http://localhost:3461";
for (const k of ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "SMTP_URL", "STORE_ROOT_DOMAIN", "EDGE_KEY", "ADMIN_HOST"]) delete env[k];
if (env.NODE_ENV === "production") throw new Error("health-db-check never runs with NODE_ENV=production");

let passed = 0;
const failures: string[] = [];
let section = "";
function ok(label: string, cond: unknown, info?: unknown): void {
  if (cond) {
    passed++;
    if (VERBOSE) console.log(`    ✓ ${label}`);
  } else failures.push(`${section}: ${label}${info === undefined ? "" : `\n      ${JSON.stringify(info)}`}`);
}

const CANARY = { phone: "+212600000777", name: "Canaryname Zzz", address: "Rue Canary 77", note: "canary-note-77", email: "canary.seller@example.test" } as const;

type Conn = mysql.Connection;
async function rows<T = Record<string, unknown>>(conn: Conn, q: string, args: unknown[] = []): Promise<T[]> {
  return ((await conn.query(q, args)) as unknown as [T[]])[0];
}
const count = async (conn: Conn, q: string, args: unknown[] = []) => Number((await rows<{ n: number }>(conn, q, args))[0]?.n ?? 0);

async function main(): Promise<number> {
  const root = await mysql.createConnection({ uri: SERVER });
  await root.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await root.query(`CREATE DATABASE \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.end();
  let conn: Conn | null = null;
  const t0 = Date.now();
  try {
    const { runMigrations } = await import("@/lib/db/migrate");
    section = "setup";
    ok("migrations applied", (await runMigrations()).status === "applied");
    conn = await mysql.createConnection({ uri: SERVER + DB, timezone: "Z", charset: "utf8mb4_unicode_ci" });
    await checks(conn);
  } catch (err) {
    failures.push(`${section}: threw ${err instanceof Error ? `${err.name}: ${err.message}\n${err.stack?.split("\n").slice(1, 4).join("\n")}` : String(err)}`);
  } finally {
    await conn?.end().catch(() => undefined);
    const { pool } = await import("@/lib/db/client");
    await pool()
      .end()
      .catch(() => undefined);
    await globalThis.__sgLockPool?.pool.end().catch(() => undefined);
    if (!KEEP) {
      const r = await mysql.createConnection({ uri: SERVER });
      await r.query(`DROP DATABASE IF EXISTS \`${DB}\``);
      await r.end();
    } else console.log(`  kept ${DB}`);
  }
  for (const f of failures) console.error(`  ✗ ${f}`);
  const ms = Date.now() - t0;
  if (failures.length) {
    console.error(`✗ health-db-check: ${failures.length} failed, ${passed} passed (${ms} ms)`);
    return 1;
  }
  console.log(`✓ health-db-check: ${passed} checks passed (${ms} ms)`);
  return 0;
}

async function checks(conn: Conn): Promise<void> {
  const { newId } = await import("@/lib/db/ids");
  const { systemCtx, systemScope } = await import("@/lib/jobs/scope");
  const { mintScope } = await import("@/lib/tenancy/seam");
  const run = await import("@/lib/health/run");
  const { DEFAULT_SOURCES } = await import("@/lib/health/inputs");
  const { HEALTH_RULES } = await import("@/lib/health/registry");
  const { HEALTH_STATE_KEY } = await import("@/lib/health/window");
  const snapshot = await import("@/lib/platform/health-snapshot");
  const alarms = await import("@/lib/platform/alarms");
  const { writeJobState } = await import("@/lib/platform/job-state");
  const { pointsFor, hourBucket } = await import("@/lib/platform/health-score");
  const { invalidateStore } = await import("@/lib/tenancy/cache");
  type JobCtx = import("@/lib/jobs/runner").JobCtx;
  type HealthSources = import("@/lib/health/inputs").HealthSources;
  type HealthRule = import("@/lib/health/types").HealthRule;
  type StoreCtx = import("@/lib/tenancy/types").StoreCtx;

  /* ---------------------------------------------------------------- */
  /* seed                                                             */
  /* ---------------------------------------------------------------- */

  const user = async (email: string, name: string) => {
    const id = newId();
    await conn.query("INSERT INTO users (id, email, name, password_hash, platform_role) VALUES (?, ?, ?, 'health-db-check:no-password', 'none')", [id, email, name]);
    return id;
  };
  const store = async (handle: string, name: string, status: string) => {
    const id = newId();
    await conn.query("INSERT INTO stores (id, handle, name, status, brand_seed) VALUES (?, ?, ?, ?, ?)", [id, handle, name, status, id.slice(-16).toLowerCase()]);
    return { id, handle, name };
  };
  const people = async (storeId: string, handle: string) => {
    const owner = await user(handle === "busy-souk" ? CANARY.email : `owner@${handle}.test`, "Owner");
    const admin = await user(`admin@${handle}.test`, "Admin");
    await conn.query("INSERT INTO store_members (store_id, user_id, role) VALUES (?, ?, 'owner'), (?, ?, 'admin')", [storeId, owner, storeId, admin]);
    return { owner, admin };
  };
  const page = async (storeId: string, slug: string, name: string, seoTitle: string | null) => {
    const pageId = newId();
    const versionId = newId();
    const doc = JSON.stringify({ seo: { title: seoTitle } });
    await conn.query("INSERT INTO page_versions (id, store_id, page_id, kind, doc, checksum) VALUES (?, ?, ?, 'publish', ?, ?)", [versionId, storeId, pageId, doc, "0".repeat(64)]);
    await conn.query("INSERT INTO pages (id, store_id, slug, name, status, public_key, draft, published_version_id) VALUES (?, ?, ?, ?, 'published', ?, '{}', ?)", [pageId, storeId, slug, name, newId().toLowerCase(), versionId]);
    return pageId;
  };

  const clean = await store("clean-argan", "Clean Argan", "active");
  const busy = await store("busy-souk", "Busy Souk", "active");
  const parked = await store("parked-deco", "Parked Deco", "suspended");
  const team = { clean: await people(clean.id, clean.handle), busy: await people(busy.id, busy.handle), parked: await people(parked.id, parked.handle) };
  await page(clean.id, "huile", "Huile d'argan", "Huile d'argan pure");
  await conn.query(
    "INSERT INTO orders (id, store_id, page_id, name, phone, city, address, note, product_name, items, qty, subtotal, shipping, total, currency, idem) VALUES (?, ?, ?, ?, ?, 'Casablanca', ?, ?, 'Tapis', ?, 1, 19900, 0, 19900, 'MAD', ?)",
    [`CMD-${newId().slice(-6)}`, busy.id, newId(), CANARY.name, CANARY.phone, CANARY.address, CANARY.note, JSON.stringify([{ name: "Tapis", qty: 1, unit: 19900 }]), newId().slice(0, 36)],
  );

  // the busy store's injected readings (PLA-§O.2: "via injected sources"), changed between runs
  const busyState = { oldestMin: 20, mediaPct: 85 };
  const MiB = 1024 * 1024;
  const sources: HealthSources = {
    ...DEFAULT_SOURCES,
    sheets: async (scope, s, now) => (s.id === busy.id ? { pending: 14, oldestMin: busyState.oldestMin, lastRunFailedAt: null } : DEFAULT_SOURCES.sheets(scope, s, now)),
    usage: async (scope, s, now) => (s.id === busy.id ? [{ metric: "media_bytes", period: "total", used: busyState.mediaPct * MiB, limit: 100 * MiB }] : DEFAULT_SOURCES.usage(scope, s, now)),
  };
  // a test-only rule standing in for P5's int:sheets_backlog (PLA-§6.3.5: one Sheets store, threshold 15 min, severity 3)
  const p5Stand: HealthRule = {
    id: "int:sheets_backlog",
    group: "integrations",
    release: "R1",
    collect: async (_scope, inputs) =>
      inputs.sheets && (inputs.sheets.oldestMin ?? 0) > 15
        ? {
            id: "int:sheets_backlog",
            group: "integrations",
            severity: 3,
            points: pointsFor(3),
            evidence: { metric: "sheets_oldest_min", value: inputs.sheets.oldestMin ?? 0, baseline: 15, window: "now", n: inputs.sheets.pending },
            fix: { kind: "action", actionId: "integrations.sync_sheets", label: "health.platform.quota.fix" },
            text: "health.platform.quota.fix",
          }
        : null,
  };
  const rules = [...HEALTH_RULES, p5Stand];

  const ctxFor = (budgetMs: number): JobCtx => ({
    ...systemCtx("platform.health"),
    deadline: Date.now() + budgetMs,
    tickId: `t-${Date.now()}`,
    cursor: "",
    setCursor: async () => undefined,
    yield: () => new Promise<void>((r) => setImmediate(r)),
    lagMs: () => 0,
  });
  const tick = async (opts: { budgetMs?: number; sources?: HealthSources; now?: () => Date } = {}) => {
    const order: string[] = [];
    const res = await run.runHealthTick(ctxFor(opts.budgetMs ?? 60_000), { sources: opts.sources ?? sources, rules, now: opts.now, onStore: (r) => order.push(r.storeId) });
    return { ...res, order };
  };
  const row = async (storeId: string) =>
    (await rows<{ score: number; attention: number; flags: string; issues: string; metrics: string; milestones: string | null; snoozed: string | null; dirty_at: Date | null; computed_at: Date }>(conn, "SELECT * FROM store_health WHERE store_id = ?", [storeId]))[0];
  const tenantChecksum = async () =>
    JSON.stringify(await rows(conn, "SELECT (SELECT COUNT(*) FROM pages) p, (SELECT COUNT(*) FROM page_versions) v, (SELECT COUNT(*) FROM orders) o, (SELECT COUNT(*) FROM store_settings) s, (SELECT COUNT(*) FROM store_usage) u, (SELECT COUNT(*) FROM store_members) m"));

  /* ---------------------------------------------------------------- */
  /* 1. dirty first, the upsert, flags and scores                     */
  /* ---------------------------------------------------------------- */

  section = "1 dirty first";
  await snapshot.markHealthDirty(parked.id);
  await new Promise((r) => setTimeout(r, 20));
  await snapshot.markHealthDirty(busy.id);
  const stub = await row(parked.id);
  ok("markHealthDirty inserts a dirty stub for a store with no row", stub && stub.dirty_at !== null && stub.computed_at.getTime() === 0);
  ok("a stub reads as not computed (null)", (await snapshot.getStoreHealth(systemScope(systemCtx("platform.health"), parked.id))) === null);
  const before = await tenantChecksum();
  const first = await tick();
  ok("dirty rows first, oldest mark first, then the store with no snapshot", first.order.slice(0, 3).join() === [parked.id, busy.id, clean.id].join(), first.order);
  ok("the run stops when every store was computed after its start (done)", first.done && first.summary.stores === 3, first.summary);
  for (const s of [clean, busy, parked]) {
    const r = await row(s.id);
    ok(`${s.handle}: upserted with dirty_at NULL`, r && r.dirty_at === null && r.computed_at.getTime() > 0);
  }
  const busyRow = await row(busy.id);
  const busyFlags = JSON.parse(busyRow!.flags) as { code: string; severity: number }[];
  const busyIssues = JSON.parse(busyRow!.issues) as { id: string; evidence: { metric: string } }[];
  ok("busy: the Sheets issue once (severity 3) and the quota issue: 100 − 10 − 3 = 87", busyRow!.score === 87 && busyIssues.filter((i) => i.id === "int:sheets_backlog").length === 1 && busyIssues.some((i) => i.id === "platform:quota_high"), { score: busyRow!.score, issues: busyIssues.map((i) => i.id) });
  ok("busy: the derived sheets_backlog flag (no extra points) and quota_high", ["sheets_backlog", "quota_high"].every((c) => busyFlags.some((f) => f.code === c)) && busyFlags.filter((f) => f.code === "sheets_backlog").length === 1, busyFlags);
  const parkedRow = await row(parked.id);
  ok("parked (suspended): attention 3, score 100, flag suspended", parkedRow!.attention === 3 && parkedRow!.score === 100 && (JSON.parse(parkedRow!.flags) as { code: string }[]).some((f) => f.code === "suspended"));
  const cleanRow = await row(clean.id);
  ok("clean: 100, attention 0, no flag", cleanRow!.score === 100 && cleanRow!.attention === 0 && JSON.parse(cleanRow!.flags).length === 0, cleanRow);
  ok("no tenant table written by the job", (await tenantChecksum()) === before);

  // both rings read one score; only staff scopes see the flags
  const sys = await snapshot.getStoreHealth(systemScope(systemCtx("platform.health"), busy.id));
  const plat = await snapshot.getStoreHealth(mintScope("platform", busy.id));
  const member = await snapshot.getStoreHealth(mintScope("member", busy.id));
  ok("getStoreHealth(systemScope) and getStoreHealth(platformScope) read the same score", sys?.score === 87 && plat?.score === 87 && member?.score === 87);
  ok("flags for the platform scope, none for a member", Array.isArray(plat?.flags) && plat!.flags!.length > 0 && member !== null && !("flags" in member));
  ok("the view carries staleAfterMin (the setting before any measured cycle is long)", (plat?.staleAfterMin ?? 0) >= 60, plat?.staleAfterMin);
  ok("an issue's link fix is rebuilt for the store's handle", plat?.issues.find((i) => i.id === "platform:quota_high")?.fix.kind === "link" && (plat.issues.find((i) => i.id === "platform:quota_high")!.fix as { href: (h: string) => string }).href(busy.handle).includes(`/app/${busy.handle}/settings/plan`));

  /* ---------------------------------------------------------------- */
  /* 2. once-only side effects, snooze                                */
  /* ---------------------------------------------------------------- */

  section = "2 once only";
  const milestones = () => count(conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'store.milestone.reached' AND store_id = ?", [clean.id]);
  const firstMilestones = await milestones();
  ok("clean: first_draft, first_publish and first_member reached, audited by the system", firstMilestones === 3 && (await count(conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'store.milestone.reached' AND actor_kind = 'system' AND store_id = ?", [clean.id])) === 3, firstMilestones);
  const quota80 = () => count(conn, "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'quota.80' AND store_id = ? AND dedupe_key = ?", [busy.id, `quota80:${busy.id}:media_bytes:total`]);
  ok("quota.80 once for media_bytes (owners and admins)", (await quota80()) === 1);
  const issueNew = () => count(conn, "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'health.issue_new' AND store_id = ?", [busy.id]);
  ok("no health.issue_new on a store's first computation", (await issueNew()) === 0);

  for (const s of [clean, busy]) await snapshot.markHealthDirty(s.id);
  await tick();
  ok("milestones once over two runs", (await milestones()) === 3);
  ok("quota.80 still once (deduplicated per metric and period)", (await quota80()) === 1);
  // the backlog clears, then comes back twice in one week: one health.issue_new
  busyState.oldestMin = 5;
  await snapshot.markHealthDirty(busy.id);
  await tick();
  busyState.oldestMin = 22;
  await snapshot.markHealthDirty(busy.id);
  await tick();
  ok("a new severity-3 issue notifies owners and admins", (await issueNew()) === 1);
  busyState.oldestMin = 5;
  await snapshot.markHealthDirty(busy.id);
  await tick();
  busyState.oldestMin = 25;
  await snapshot.markHealthDirty(busy.id);
  await tick();
  ok("health.issue_new once per issue id and ISO week", (await issueNew()) === 1);
  const [nRow] = await rows<{ roles: string; dedupe_key: string }>(conn, "SELECT roles, dedupe_key FROM notifications WHERE kind = 'health.issue_new' AND store_id = ?", [busy.id]);
  ok("… to owners and admins, keyed health:<storeId>:int:sheets_backlog:<YYYY-Www>", nRow && /"owner"/.test(nRow.roles) && /"admin"/.test(nRow.roles) && new RegExp(`^health:${busy.id}:int:sheets_backlog:\\d{4}-W\\d{2}$`).test(nRow.dedupe_key), nRow);

  // snooze: the points go at once and the next run keeps the snooze
  const ownerCtx = {
    user: { id: team.busy.owner },
    store: { id: busy.id, handle: busy.handle },
    membership: { role: "owner", synthetic: false },
    scope: mintScope("member", busy.id),
    actor: { kind: "user", userId: team.busy.owner, impersonatorId: null, ip: null },
    impersonation: null,
    stepUpUntil: null,
    can: (p: string) => p === "health.snooze",
  } as unknown as StoreCtx;
  await snapshot.snoozeHealthIssue(ownerCtx, "int:sheets_backlog", 7);
  const snoozedRow = await row(busy.id);
  ok("snoozing writes snoozed[issueId] and gives the points back (97)", snoozedRow!.score === 97 && JSON.parse(snoozedRow!.snoozed ?? "{}")["int:sheets_backlog"], snoozedRow?.score);
  ok("the snooze is audited store.health.snoozed", (await count(conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'store.health.snoozed' AND store_id = ?", [busy.id])) === 1);
  await snapshot.markHealthDirty(busy.id);
  await tick();
  const afterRun = await row(busy.id);
  const kept = (JSON.parse(afterRun!.issues) as { id: string; snoozedUntil?: string }[]).find((i) => i.id === "int:sheets_backlog");
  ok("the next run honours the snooze: 97, the issue kept with snoozedUntil", afterRun!.score === 97 && !!kept?.snoozedUntil, { score: afterRun?.score, kept });
  let refused = "ok";
  try {
    await snapshot.snoozeHealthIssue({ ...ownerCtx, can: () => false } as StoreCtx, "int:sheets_backlog", 7);
  } catch (e) {
    refused = (e as { code?: string }).code ?? "threw";
  }
  ok("snooze without health.snooze → forbidden", refused === "forbidden", refused);
  try {
    await snapshot.snoozeHealthIssue(ownerCtx, "platform:not_there", 7);
    refused = "ok";
  } catch (e) {
    refused = (e as { code?: string }).code ?? "threw";
  }
  ok("snooze of an issue not in the row → not_found", refused === "not_found", refused);
  await snapshot.unsnoozeHealthIssue(ownerCtx, "int:sheets_backlog");
  ok("unsnooze puts the points back (87)", (await row(busy.id))!.score === 87);
  // "Recompute now": 6 an hour, the 7th rate_limited, the row dirty once
  await conn.query("UPDATE store_health SET dirty_at = NULL WHERE store_id = ?", [busy.id]);
  const outcomes: string[] = [];
  for (let i = 0; i < 7; i++) {
    try {
      await snapshot.requestHealthRecompute(ownerCtx);
      outcomes.push("ok");
    } catch (e) {
      outcomes.push((e as { code?: string }).code ?? "threw");
    }
  }
  ok("requestHealthRecompute: 6 an hour, the 7th rate_limited", outcomes.slice(0, 6).every((o) => o === "ok") && outcomes[6] === "rate_limited", outcomes);
  ok("… and the row is dirty", (await row(busy.id))!.dirty_at !== null);

  /* ---------------------------------------------------------------- */
  /* 3. canary scan (PLA-§O.3 case 8)                                 */
  /* ---------------------------------------------------------------- */

  section = "3 canary";
  const canaries = Object.values(CANARY);
  const blobs = await rows<{ b: string }>(conn, "SELECT CONCAT(issues, flags, metrics, COALESCE(milestones, ''), COALESCE(snoozed, '')) AS b FROM store_health");
  ok("no customer or seller canary in any snapshot column", blobs.every((r) => !canaries.some((c) => r.b.includes(c))));
  const notes = await rows<{ b: string }>(conn, "SELECT CONCAT(COALESCE(vars, ''), COALESCE(text, ''), COALESCE(link, '')) AS b FROM notifications");
  ok("no canary in the job's notifications", notes.every((r) => !canaries.some((c) => r.b.includes(c))));
  const audits = await rows<{ b: string }>(conn, "SELECT COALESCE(meta, '') AS b FROM audit_log WHERE action IN ('store.milestone.reached', 'store.health.snoozed')");
  ok("no canary in the job's audit rows", audits.length > 0 && audits.every((r) => !canaries.some((c) => r.b.includes(c))));

  /* ---------------------------------------------------------------- */
  /* 4. the slot budget (PD78)                                        */
  /* ---------------------------------------------------------------- */

  section = "4 budget";
  const extra: string[] = [];
  for (let i = 0; i < 30; i++) extra.push((await store(`queue-${String(i).padStart(2, "0")}`, `Queue ${i}`, "active")).id);
  const slow = (ms: number): HealthSources =>
    Object.fromEntries(Object.keys(DEFAULT_SOURCES).map((k) => [k, () => new Promise((r) => setTimeout(() => r(null), ms))])) as unknown as HealthSources;
  const timed = await tick({ budgetMs: 3_000, sources: slow(300) });
  ok("with sources at 300 ms a store the job stops at its deadline: about ten stores", timed.summary.stores >= 7 && timed.summary.stores <= 11 && !timed.done, timed.summary);
  ok("perStoreP50Ms and perStoreP95Ms are measured (≥ 300 ms)", timed.summary.perStoreP50Ms >= 300 && timed.summary.perStoreP95Ms >= timed.summary.perStoreP50Ms, timed.summary);
  const rotation = await count(conn, "SELECT COUNT(*) AS n FROM stores WHERE status IN ('pending', 'active', 'restricted') AND handle IS NOT NULL");
  ok("cycleMin = ceil(rotation / storesPerTickP50) × 5 in the summary", timed.summary.rotation === rotation && timed.summary.cycleMin >= 5 && timed.summary.cycleMin % 5 === 0, { summary: timed.summary, rotation });
  ok("rulesSlowest is a joined string (job_runs.summary takes scalars)", typeof timed.summary.rulesSlowest === "string");

  // a 30-row dirty queue drained oldest first over three or four ticks
  const base = Date.now() - 60_000;
  for (let i = 0; i < extra.length; i++) {
    await snapshot.markHealthDirty(extra[i]!);
    await conn.query("UPDATE store_health SET dirty_at = ? WHERE store_id = ?", [new Date(base + i * 1_000), extra[i]]);
  }
  await conn.query("UPDATE store_health SET dirty_at = NULL WHERE store_id NOT IN (?)", [extra]);
  const drained: string[] = [];
  let ticks = 0;
  while (ticks < 6) {
    const left = await count(conn, "SELECT COUNT(*) AS n FROM store_health WHERE dirty_at IS NOT NULL");
    if (!left) break;
    ticks++;
    const r = await tick({ budgetMs: 3_000, sources: slow(300) });
    drained.push(...r.order.filter((id) => extra.includes(id)));
  }
  ok("the dirty queue is served oldest first", drained.slice(0, 30).join() === extra.join(), { got: drained.slice(0, 30).map((id) => extra.indexOf(id)) });
  ok("… and drained in three or four ticks (≈ 10 a tick)", ticks >= 3 && ticks <= 4, ticks);

  /* ---------------------------------------------------------------- */
  /* 5. health_stale on a 300-store fixture (fake clock)              */
  /* ---------------------------------------------------------------- */

  section = "5 stale";
  const T0 = new Date();
  const values: unknown[] = [];
  for (let i = 0; i < 300; i++) {
    const id = newId();
    await conn.query("INSERT INTO stores (id, handle, name, status, brand_seed) VALUES (?, ?, ?, 'active', ?)", [id, `fx-${i}-${id.slice(-6).toLowerCase()}`, `Fixture ${i}`, id.slice(-16).toLowerCase()]);
    values.push(id);
  }
  await conn.query(
    `INSERT INTO store_health (store_id, score, attention, flags, issues, components, metrics, computed_at) SELECT id, 100, 0, '[]', '[]', '{}', '{}', ? FROM stores WHERE id NOT IN (SELECT store_id FROM store_health)`,
    [T0],
  );
  await conn.query("UPDATE store_health SET computed_at = ?, dirty_at = NULL", [T0]);
  await writeJobState(HEALTH_STATE_KEY, { storesPerTick: Array(12).fill(10), slowStreak: 0, cycleMin: 150, rotation: 300, lastRunAt: T0.toISOString(), lastP50Ms: 280 });
  for (const id of values as string[]) invalidateStore(id);
  const alarmSources = { ...alarms.DEFAULT_ALARM_SOURCES, ai: async () => null, backup: async () => null, breakglass: async () => null };
  const staleAlarms = () => count(conn, "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'staff.alarm' AND dedupe_key LIKE 'alarm:health_stale:%'");
  const at = (factor: number) => new Date(T0.getTime() + factor * 150 * 60_000);
  const early = await alarms.evaluateAlarms(at(1.4), alarmSources);
  ok("staleAfterMin = max(60, 1.5 × 150) = 225: silent at 1.4 × cycleMin", !early.some((a) => a.code === "health_stale"), early.map((a) => a.code));
  await alarms.runAlarms(systemCtx("platform.alarms"), { now: at(1.4), sources: alarmSources });
  ok("… no staff.alarm", (await staleAlarms()) === 0);
  const late = await alarms.runAlarms(systemCtx("platform.alarms"), { now: at(1.6), sources: alarmSources });
  ok("raised at 1.6 × cycleMin", late.summary.codes.split(",").includes("health_stale") && late.summary.notified >= 1, late.summary);
  await alarms.runAlarms(systemCtx("platform.alarms"), { now: new Date(at(1.6).getTime() + 5 * 60_000), sources: alarmSources });
  await alarms.runAlarms(systemCtx("platform.alarms"), { now: new Date(at(1.6).getTime() + 70 * 60_000), sources: alarmSources });
  ok("… and notified once while it stays raised", (await staleAlarms()) === 1);
  const [alarmRow] = await rows<{ vars: string; platform_min_role: string; dedupe_key: string }>(conn, "SELECT vars, platform_min_role, dedupe_key FROM notifications WHERE kind = 'staff.alarm' AND dedupe_key LIKE 'alarm:health_stale:%'");
  ok("staff.alarm { alarm: health_stale, value } to admins, keyed by the hour", alarmRow && JSON.parse(alarmRow.vars).alarm === "health_stale" && JSON.parse(alarmRow.vars).value >= 300 && alarmRow.platform_min_role === "admin" && alarmRow.dedupe_key === `alarm:health_stale:${hourBucket(at(1.6))}`, alarmRow);
}

if (/[\\/]scripts[\\/]qa[\\/]health-db-check\.ts$/.test(process.argv[1] ?? "")) {
  main().then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error("✗ health-db-check crashed:", err instanceof Error ? `${err.name}: ${err.message}` : err);
      process.exit(1);
    },
  );
}

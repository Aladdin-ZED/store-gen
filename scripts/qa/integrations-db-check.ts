// proves: IN-03, SF-03, SF-06
/**
 * Integration health against a real MariaDB (P5 INTEGRATIONS; operations.md OPE-§28.2, §28.3 (3)-(5), §27.2, §27.3,
 * §21.4, OPE-§L; OPE-§O.2 `test:integrations-db`, OPE-§O.4 IN-03, SF-03, SF-06). Two stores, A and B, and one question
 * asked everywhere: does B ever see, count or change A's rows. Exit code 1 on failure.
 *
 *   npm run test:integrations-db [-- --db cod_test_p5_integrations] [--keep]
 *   (node --conditions=react-server --import tsx: the modules under test are `server-only`)
 *
 * Creates a throwaway database on the local MariaDB (root, no password, 127.0.0.1:3306; the name must be
 * cod_test_*), migrates it, seeds two stores and drops it at the end (unless --keep). A fresh APP_SECRET and a P-mode
 * platform; nothing is read from the .env files.
 *  - the write throttle: 1,000 results on one row over 10 fake minutes write ≤ 1 row per minute, a state change
 *    always writes, and the SQL guard holds when this process's memory is stale (another process wrote);
 *  - the state rules on the stored row per kind; a transition into failing notifies the owners and admins once per
 *    incident per hour, calls the incident listeners, and `int.delivery_dead` batches per kind;
 *  - `listDeliveries`: the store's own rows only, never `mail`, no phone, name or sealed payload (canaries), plain-words
 *    errors, the order summary from the store's own order, filters, ≤ 10 pages;
 *  - `integrationHealth`, `sheetsBacklog`, `syncFailedCount` and the run history (≤ 20 runs, ≤ 4 KB) per store;
 *  - the `int:*` rules on the seeded stores fire for A, stay silent for B and never count A's rows from B;
 *  - the pulse contributor: `{ syncFailed }` within 50 ms, nothing for an agent, a failure omits the key.
 */
import Module from "node:module";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

const flag = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const dbName = flag("db") ?? "cod_test_p5_integrations";
const KEEP = process.argv.includes("--keep");
if (!/^cod_test_[a-z0-9_]{1,48}$/.test(dbName)) {
  console.error(`✗ refusing to run on database "${dbName}": use a throwaway cod_test_* name`);
  process.exit(1);
}
const DB_SERVER = "mysql://root@127.0.0.1:3306";
{
  // this process's platform: a fresh secret, P mode, never the owner's environment
  const env = process.env as Record<string, string | undefined>;
  for (const k of ["PUBLIC_URL", "STORE_ROOT_DOMAIN", "EDGE_KEY", "ADMIN_HOST", "LEGACY_PLATFORM_HOSTS", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "GOOGLE_SA_JSON_B64"]) delete env[k];
  env.DATABASE_URL = `${DB_SERVER}/${dbName}`;
  env.APP_SECRET = randomBytes(32).toString("hex");
  env.PLATFORM_URL = "http://localhost:3451";
}

{
  // next/navigation as Next's route bundles load it (the server build): the seam's notFound / redirect need it, and the
  // client build needs React's createContext, which the react-server condition's React does not have
  // (scripts/qa/public-api-security.ts does the same)
  const M = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
  const resolve = M._resolveFilename;
  const navigation = require.resolve("next/dist/client/components/navigation.react-server.js");
  M._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
    return request === "next/navigation" ? navigation : resolve.call(this, request, ...rest);
  };
}

async function rootQuery(q: string): Promise<void> {
  const mysql = (await import("mysql2/promise")).default;
  const conn = await mysql.createConnection({ uri: DB_SERVER, charset: "utf8mb4_unicode_ci" });
  try {
    await conn.query(q);
  } finally {
    await conn.end();
  }
}

let pass = 0;
const failures: string[] = [];
const ok = (label: string, cond: boolean, info?: unknown) => {
  if (cond) pass++;
  else failures.push(`${label}${info === undefined ? "" : `\n    ${JSON.stringify(info)}`}`);
};
const eq2 = (label: string, got: unknown, want: unknown) => ok(label, JSON.stringify(got) === JSON.stringify(want), { got, want });

/** the modules under test load after the environment above is in place */
const load = <T>(id: string): T => Module.createRequire(__filename)(id) as T;

/** canaries: customer data and a sealed payload that must never reach a deliveries row */
const PHONE = "+212600000001";
const NAME = "Canary Lastname";
const SEALED = "SEALED-PAYLOAD-CANARY";
const RAW_ERROR = `Error: refused for ${PHONE} (${NAME})`;

const MIN = 60_000;

async function main() {
  await rootQuery(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await rootQuery(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const { runMigrations } = load<typeof import("@/lib/db/migrate")>("@/lib/db/migrate");
  await runMigrations();

  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const { cronCursors, integrationStatus, notifications, orders, outbox, stores } = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { newId, newOrderId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const { systemCtx, systemScope } = load<typeof import("@/lib/jobs/scope")>("@/lib/jobs/scope");
  const { dayKey, dayStart, addDays } = load<typeof import("@/lib/admin-data/time")>("@/lib/admin-data/time");
  const status = load<typeof import("@/lib/integrations/status")>("@/lib/integrations/status");
  const health = load<typeof import("@/lib/integrations/health")>("@/lib/integrations/health");
  const deliveries = load<typeof import("@/lib/integrations/deliveries")>("@/lib/integrations/deliveries");
  const history = load<typeof import("@/lib/sheets/history")>("@/lib/sheets/history");
  const { rules } = load<typeof import("@/lib/health/rules/integrations")>("@/lib/health/rules/integrations");
  const { contributor } = load<typeof import("@/lib/pulse/contributors/integrations")>("@/lib/pulse/contributors/integrations");
  type HealthInputs = import("@/lib/health/types").HealthInputs;

  /* ---------------- two stores ---------------- */
  const ctx = systemCtx("qa.integrations_db");
  const ids = { A: newId(), B: newId() };
  for (const [key, handle] of [
    ["A", "int-a"],
    ["B", "int-b"],
  ] as const) {
    await db.insert(stores).values({ id: ids[key], handle, name: `Store ${key}`, status: "active", brandSeed: "0123456789abcdef" });
  }
  const A = systemScope(ctx, ids.A);
  const B = systemScope(ctx, ids.B);
  const now = Date.now();

  const orderIds: Record<"A" | "B", string[]> = { A: [], B: [] };
  async function insertOrder(scope: typeof A, over: Partial<typeof orders.$inferInsert> = {}): Promise<string> {
    const id = newOrderId();
    await db.insert(orders).values({
      id,
      storeId: scope.storeId,
      pageId: newId(),
      name: NAME,
      phone: PHONE,
      productName: "Argan oil",
      items: { bundleId: "b1", bundleLabel: "1", qty: 1, unitPrice: 349, variants: [] } as never,
      qty: 1,
      subtotal: 349,
      shipping: 0,
      total: 349,
      currency: "MAD",
      idem: randomUUID(),
      ...over,
    });
    orderIds[scope.storeId === ids.A ? "A" : "B"].push(id);
    return id;
  }

  /* ================================================================ */
  /* 1. the write throttle (OPE-§28.3 (5), OPE-§O.4 IN-03)             */
  /* ================================================================ */
  status.clearStatusCache();
  const T0 = Math.floor(now / 3_600_000) * 3_600_000 + MIN; // an hour start + 1 min: the incident hours below are known
  const pixel = "meta:111111111111111";
  const rowOf = async (scope: typeof A, kind: "sheets" | "capi" | "telegram", targetId = "") =>
    (await db.select().from(integrationStatus).where(and(eq(integrationStatus.storeId, scope.storeId), eq(integrationStatus.kind, kind), eq(integrationStatus.targetId, targetId))).limit(1))[0];

  let writes = 0;
  const writeTimes: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const at = T0 + i * 600; // 1,000 results over 10 minutes
    const r = await status.recordIntegrationStatus(A, { kind: "capi", targetId: pixel, outcome: "ok" }, { now: at });
    if (r.wrote) {
      writes++;
      writeTimes.push(at);
    }
  }
  const span = 999 * 600;
  ok("throttle: 1,000 ok results write at most once per minute", writes <= Math.floor(span / MIN) + 1 && writes >= Math.floor(span / MIN), { writes });
  ok("throttle: consecutive writes are ≥ 60 s apart", writeTimes.every((t, i) => i === 0 || t - writeTimes[i - 1]! >= MIN), writeTimes);
  const after = await rowOf(A, "capi", pixel);
  eq2("throttle: the row holds the last written time and state", [after?.updatedAt.getTime(), after?.state], [writeTimes.at(-1), "ok"]);

  // a state change always writes, even inside the minute
  const tFlip = writeTimes.at(-1)! + 5_000;
  const flip = await status.recordIntegrationStatus(A, { kind: "capi", targetId: pixel, outcome: "retry", status: 503 }, { now: tFlip });
  const flipBack = await status.recordIntegrationStatus(A, { kind: "capi", targetId: pixel, outcome: "ok" }, { now: tFlip + 1_000 });
  eq2("throttle: ok → warn → ok inside one minute writes both changes", [flip.state, flip.changed, flip.wrote, flipBack.state, flipBack.wrote], ["warn", true, true, "ok", true]);

  // the SQL guard: another process wrote 30 s after this one (same state); this process's memory is stale
  const tOther = tFlip + 1_000 + 30_000;
  await db.update(integrationStatus).set({ updatedAt: new Date(tOther) }).where(and(eq(integrationStatus.storeId, ids.A), eq(integrationStatus.targetId, pixel)));
  const guarded = await status.recordIntegrationStatus(A, { kind: "capi", targetId: pixel, outcome: "ok" }, { now: tFlip + 1_000 + 61_000 });
  eq2("throttle: the SQL guard refuses a write within a minute of another process's", [guarded.wrote, (await rowOf(A, "capi", pixel))?.updatedAt.getTime()], [false, tOther]);
  const later = await status.recordIntegrationStatus(A, { kind: "capi", targetId: pixel, outcome: "ok" }, { now: tOther + 61_000 + 60_000 });
  ok("throttle: a minute later it writes again", later.wrote);
  // a fresh process (no memory) reads the row back and keeps the throttle
  status.clearStatusCache(ids.A);
  const cold = await status.recordIntegrationStatus(A, { kind: "capi", targetId: pixel, outcome: "ok" }, { now: tOther + 121_000 + 10_000 });
  ok("throttle: a cold cache reads the row and does not write inside the minute", !cold.wrote && !cold.changed, cold);

  /* ================================================================ */
  /* 2. state rules on the stored row; incidents (OPE-§28.2, §21.4)   */
  /* ================================================================ */
  const incidents: { store: string; kind: string; code: string }[] = [];
  const off = status.onIntegrationIncident(async (scope, incident) => {
    incidents.push({ store: scope.storeId, kind: incident.kind, code: incident.code });
  });
  const notesOf = async (scope: typeof A, kind: string) =>
    db.select().from(notifications).where(and(eq(notifications.storeId, scope.storeId), eq(notifications.kind, kind)));

  const P2 = "meta:222222222222222";
  const t1 = T0 + 20 * MIN;
  for (let i = 0; i < 3; i++) await status.recordIntegrationStatus(A, { kind: "capi", targetId: P2, outcome: "failed", code: "token_revoked", status: 400 }, { now: t1 + i * 1_000 });
  let row2 = await rowOf(A, "capi", P2);
  eq2("capi: 3 refusals with no success → failing, failures 3, the code kept", [row2?.state, row2?.failures, row2?.lastErrorCode], ["failing", 3, "token_revoked"]);
  const capiNotes = await notesOf(A, "int.capi_failing");
  eq2("capi: the incident notifies the owners and admins once", capiNotes.map((n) => [n.audience, n.roles, n.link]), [["store_role", ["owner", "admin"], "/app/int-a/integrations"]]);
  const vars = capiNotes[0]?.vars as Record<string, unknown> | undefined;
  eq2("capi: the notification carries a code and minutes only", vars && Object.keys(vars).sort(), ["code", "sinceMinutes"]);
  for (let i = 0; i < 5; i++) await status.recordIntegrationStatus(A, { kind: "capi", targetId: P2, outcome: "failed", code: "token_revoked" }, { now: t1 + 10_000 + i * 1_000 });
  eq2("capi: more failures inside the incident notify nothing new", (await notesOf(A, "int.capi_failing")).length, 1);
  row2 = await rowOf(A, "capi", P2);
  eq2("capi: the row stays failing with its cause (the counts wait for the next minute's write)", [row2?.state, row2?.failures, row2?.lastErrorCode], ["failing", 3, "token_revoked"]);

  // Telegram: failing at once; a 429 keeps the incident and its cause; a recovery then a new failure in the same hour
  // is a second incident but not a second notification; the next hour notifies again
  const tg = await status.recordIntegrationStatus(A, { kind: "telegram", outcome: "failed", status: 401 }, { now: t1 });
  eq2("telegram: a revoked token turns the row failing at once", [tg.state, (await rowOf(A, "telegram"))?.lastErrorCode], ["failing", "bot_token_revoked"]);
  const tg429 = await status.recordIntegrationStatus(A, { kind: "telegram", outcome: "retry", status: 429 }, { now: t1 + 2 * MIN });
  eq2("telegram: a 429 afterwards keeps it failing, with the token as its cause", [tg429.state, (await rowOf(A, "telegram"))?.lastErrorCode], ["failing", "bot_token_revoked"]);
  await status.recordIntegrationStatus(A, { kind: "telegram", outcome: "ok" }, { now: t1 + 5 * MIN });
  await status.recordIntegrationStatus(A, { kind: "telegram", outcome: "failed", code: "chat_not_found", status: 400 }, { now: t1 + 6 * MIN });
  let tgNotes = await notesOf(A, "int.telegram_failing");
  eq2("telegram: a second incident in the same hour does not notify again", tgNotes.map((n) => (n.vars as Record<string, unknown>).code), ["bot_token_revoked"]);
  await status.recordIntegrationStatus(A, { kind: "telegram", outcome: "ok" }, { now: t1 + 61 * MIN });
  await status.recordIntegrationStatus(A, { kind: "telegram", outcome: "failed", status: 401 }, { now: t1 + 62 * MIN });
  tgNotes = await notesOf(A, "int.telegram_failing");
  eq2("telegram: an incident in the next hour notifies again", tgNotes.map((n) => (n.vars as Record<string, unknown>).code), ["bot_token_revoked", "bot_token_revoked"]);

  const sheetsBreaker = await status.recordIntegrationStatus(B, { kind: "sheets", outcome: "breaker", code: "breaker", backlog: 7, oldestPendingAt: new Date(t1 - 30 * MIN) }, { now: t1 });
  const bNote = (await notesOf(B, "int.sheets_failing"))[0];
  eq2("sheets: the breaker fails B's row and B's owners hear it, with the backlog", [sheetsBreaker.state, (bNote?.vars as Record<string, unknown> | undefined)?.backlog, bNote?.link], ["failing", 7, "/app/int-b/integrations"]);
  const sheetsOff = await status.recordIntegrationStatus(B, { kind: "sheets", outcome: "off" }, { now: t1 + 5_000 });
  eq2("sheets: disabled is off", sheetsOff.state, "off");
  eq2("incidents: every transition into failing reached the listener", incidents, [
    { store: ids.A, kind: "capi", code: "token_revoked" },
    { store: ids.A, kind: "telegram", code: "bot_token_revoked" },
    { store: ids.A, kind: "telegram", code: "chat_not_found" },
    { store: ids.A, kind: "telegram", code: "bot_token_revoked" },
    { store: ids.B, kind: "sheets", code: "breaker" },
  ]);
  off();
  eq2("incidents: A's incidents never notified B", (await notesOf(B, "int.capi_failing")).length + (await notesOf(B, "int.telegram_failing")).length, 0);

  for (let i = 0; i < 3; i++) await status.notifyDeliveryDead(A, "capi");
  await status.notifyDeliveryDead(A, "telegram");
  const dead = await notesOf(A, "int.delivery_dead");
  eq2(
    "delivery dead: one row per outbox kind per hour, counted",
    dead.map((n) => [(n.vars as Record<string, unknown>).kind, (n.vars as Record<string, unknown>).count, n.link]).sort(),
    [
      ["capi", 3, "/app/int-a/integrations#deliveries"],
      ["telegram", 1, "/app/int-a/integrations#deliveries"],
    ],
  );

  /* ================================================================ */
  /* 3. orders, outbox and the deliveries log (OPE-§28.3 (3), (4))     */
  /* ================================================================ */
  const mins = (m: number) => new Date(now - m * MIN);
  const a1 = await insertOrder(A, { sheetStatus: "pending", createdAt: mins(40) });
  await insertOrder(A, { sheetStatus: "pending", createdAt: mins(10) });
  await insertOrder(A, { sheetStatus: "pending", isTest: true, createdAt: mins(90) });
  await insertOrder(A, { sheetStatus: "failed", createdAt: mins(20) });
  await insertOrder(A, { sheetStatus: "failed", isTest: true, createdAt: mins(25) });
  await insertOrder(A, { sheetStatus: "synced", sheetDirty: 1, createdAt: mins(60) });
  await insertOrder(A, { sheetStatus: "synced", createdAt: mins(70) });
  await insertOrder(A, { sheetStatus: "disabled", createdAt: mins(5) });
  const b1 = await insertOrder(B, { sheetStatus: "failed", total: 99, createdAt: mins(15) });

  type Ob = typeof outbox.$inferInsert;
  async function insertOutbox(scope: typeof A | null, over: Partial<Ob>): Promise<string> {
    const id = newId();
    await db.insert(outbox).values({
      id,
      storeId: scope?.storeId ?? null,
      kind: "capi",
      topic: "Purchase",
      targetId: pixel,
      dedupeKey: `t:${id}`,
      payload: JSON.stringify({ sealed: SEALED, phone: PHONE, name: NAME }),
      encrypted: true,
      ...over,
    });
    await new Promise((r) => setTimeout(r, 2)); // ULIDs are ordered by the millisecond
    return id;
  }
  const obA = {
    done: await insertOutbox(A, { state: "done", dedupeKey: `capi:${pixel}:${a1}:Purchase`, attempts: 1, lastStatus: 200 }),
    dead: await insertOutbox(A, { state: "dead", dedupeKey: `capi:${pixel}:${a1}:ConfirmedOrder`, topic: "ConfirmedOrder", attempts: 7, lastStatus: 400, lastError: "token_revoked" }),
    pending: await insertOutbox(A, { state: "pending", dedupeKey: `capi:${pixel}:${a1}:DeliveredOrder`, topic: "DeliveredOrder", attempts: 2, lastStatus: 503, lastError: RAW_ERROR, nextAt: new Date(now + 5 * MIN) }),
    foreign: await insertOutbox(A, { state: "cancelled", dedupeKey: `capi:${pixel}:${b1}:Purchase` }),
    tgDead: await insertOutbox(A, { kind: "telegram", topic: "new_order", targetId: "chat-hash", dedupeKey: `tg:new_order:${a1}`, state: "dead", attempts: 1, lastStatus: 400, lastError: "chat_not_found" }),
    tgRunning: await insertOutbox(A, { kind: "telegram", topic: "daily_summary", targetId: "chat-hash", dedupeKey: `tg:daily:${ids.A}:2026-10-27`, state: "running" }),
  };
  const mailA = await insertOutbox(A, { kind: "mail", topic: "invite", targetId: null, dedupeKey: `mail:${newId()}`, state: "dead" });
  await insertOutbox(null, { kind: "mail", topic: "staff", targetId: null, dedupeKey: `mail:${newId()}`, state: "dead" });
  const obB = [await insertOutbox(B, { state: "dead", dedupeKey: `capi:meta:999999999999999:${b1}:Purchase`, targetId: "meta:999999999999999", lastError: "pixel_not_found" })];

  const listA = await deliveries.listDeliveries(A, {});
  const aIds = Object.values(obA);
  eq2("deliveries: A lists its own rows, newest first, never mail", listA.rows.map((r) => r.id), [...aIds].reverse());
  ok("deliveries: no mail row (A's or the platform's)", !listA.rows.some((r) => r.id === mailA || (r.kind as string) === "mail"));
  const textA = JSON.stringify(listA);
  ok("deliveries: no phone, name or sealed payload in any row (canaries)", ![PHONE, PHONE.slice(1), NAME, SEALED, "Canary"].some((c) => textA.includes(c)), textA);
  const byId = new Map(listA.rows.map((r) => [r.id, r]));
  eq2("deliveries: a done row: summary from A's order, masked target, no error, no next try", byId.get(obA.done), {
    id: obA.done,
    at: byId.get(obA.done)?.at,
    kind: "capi",
    topic: "Purchase",
    target: "meta:1111",
    state: "done",
    attempts: 1,
    nextAt: null,
    lastStatus: 200,
    lastErrorKey: null,
    summary: { orderId: a1, event: "Purchase", amountCents: 34900 },
  });
  eq2("deliveries: a dead row names its cause in plain words", byId.get(obA.dead)?.lastErrorKey, "int.cause.token_revoked");
  eq2("deliveries: a raw stored error reads from its status, never as text", [byId.get(obA.pending)?.lastErrorKey, byId.get(obA.pending)?.nextAt], ["int.cause.server_error", new Date(now + 5 * MIN).toISOString()]);
  eq2("deliveries: another store's order id in a key gives no order and no amount", byId.get(obA.foreign)?.summary, { orderId: null, event: "Purchase", amountCents: null });
  eq2("deliveries: Telegram rows", [byId.get(obA.tgDead)?.lastErrorKey, byId.get(obA.tgDead)?.summary.orderId, byId.get(obA.tgRunning)?.summary.orderId, byId.get(obA.tgDead)?.target], ["int.cause.chat_not_found", a1, null, null]);
  eq2("deliveries: filter by kind", (await deliveries.listDeliveries(A, { kind: "telegram" })).rows.map((r) => r.id), [obA.tgRunning, obA.tgDead]);
  eq2("deliveries: filter by state", (await deliveries.listDeliveries(A, { state: "dead" })).rows.map((r) => r.id), [obA.tgDead, obA.dead]);
  eq2("deliveries: mail asked for by name lists nothing", (await deliveries.listDeliveries(A, { kind: "mail" as never })).rows, []);
  // ≤ 10 pages back: one row per page over A's 6 rows + 6 more
  for (let i = 0; i < 6; i++) await insertOutbox(A, { state: "done", dedupeKey: `capi:${pixel}:${a1}:extra${i}` });
  const seen: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  for (;;) {
    const page = await deliveries.listDeliveries(A, { limit: 1, after: cursor });
    pages++;
    seen.push(...page.rows.map((r) => r.id));
    if (!page.next) break;
    cursor = page.next;
  }
  ok("deliveries: paging stops after 10 pages", pages === 10 && seen.length === 10, { pages, seen: seen.length });
  ok("deliveries: pages never repeat and go back in time", new Set(seen).size === seen.length && seen.every((id, i) => i === 0 || id < seen[i - 1]!));
  eq2("deliveries: a malformed or out-of-range cursor opens the first page", [(await deliveries.listDeliveries(A, { limit: 1, after: "11.x" })).rows[0]?.id, (await deliveries.listDeliveries(A, { limit: 1, after: `11.${seen[0]}` })).rows[0]?.id], [seen[0], seen[0]]);
  eq2("deliveries: limit is capped at 100", (await deliveries.listDeliveries(A, { limit: 10_000 })).rows.length, 12);

  const listB = await deliveries.listDeliveries(B, {});
  eq2("deliveries: B lists only its own row", listB.rows.map((r) => r.id), obB);
  const crossed = await deliveries.listDeliveries(B, { after: `2.${obA.tgRunning}` });
  ok("deliveries: B with a cursor made of A's id lists none of A's rows", !crossed.rows.some((r) => aIds.includes(r.id)), crossed);

  /* ================================================================ */
  /* 4. health reads and the run history (OPE-§28.1, §19.8, OPE-§L)   */
  /* ================================================================ */
  const healthA = await health.integrationHealth(A);
  eq2(
    "integrationHealth: A's rows in kind order, causes in plain words",
    healthA.map((r) => [r.kind, r.targetId, r.state, r.lastErrorKey]),
    [
      ["capi", pixel, "ok", "int.cause.server_error"],
      ["capi", P2, "failing", "int.cause.token_revoked"],
      ["telegram", "", "failing", "int.cause.bot_token_revoked"],
    ],
  );
  eq2("integrationHealth: B reads only its own row", (await health.integrationHealth(B)).map((r) => [r.kind, r.state]), [["sheets", "off"]]);

  for (let i = 0; i < 25; i++) {
    await history.recordSheetsRun(
      A,
      { at: new Date(now - (25 - i) * MIN).toISOString(), ms: 400 + i, appended: i, updated: 1, pulled: 0, calls: 2, ok: i % 5 !== 0, error: i % 5 === 0 ? (i === 20 ? RAW_ERROR : "sheet_not_shared") : null, trigger: "tick" },
      { now },
    );
  }
  const runsA = await history.sheetsRunHistory(A);
  const [hRow] = await db.select().from(cronCursors).where(eq(cronCursors.job, `sheets.push:${ids.A}`));
  eq2("history: the last 20 runs, newest first", [runsA.length, runsA[0]?.appended, runsA.at(-1)?.appended], [20, 24, 5]);
  ok("history: ≤ 4 KB in cron_cursors.state of sheets.push per store", Buffer.byteLength(JSON.stringify(hRow?.state), "utf8") <= history.RUN_HISTORY_BYTES, JSON.stringify(hRow?.state).length);
  ok("history: a raw error is stored as a code", !JSON.stringify(runsA).includes(PHONE) && runsA.find((r) => r.appended === 20)?.error === "unknown");
  eq2("history: B has none of A's runs", await history.sheetsRunHistory(B), []);
  eq2("history: trimRuns keeps 20 within the byte bound", history.trimRuns(Array.from({ length: 30 }, (_, i) => ({ ...runsA[0]!, at: new Date(now - i * MIN).toISOString() }))).length, 20);
  await history.recordSheetsRun(B, { at: new Date(now).toISOString(), ms: 1, appended: 0, updated: 0, pulled: 3, calls: 1, ok: true, error: null }, { now });
  history.forgetActiveSheetsStores();
  eq2("activeSheetsStores: the stores whose push ran in the last hour", await history.activeSheetsStores(now), 2);
  history.forgetActiveSheetsStores();
  eq2("activeSheetsStores: none two hours later", await history.activeSheetsStores(now + 2 * 60 * MIN), 0);
  history.forgetActiveSheetsStores();

  const backlogA = await health.sheetsBacklog(A);
  eq2("sheetsBacklog: A's pending, dirty and failed, test orders excluded", [backlogA.pending, backlogA.dirty, backlogA.failed, backlogA.oldestPendingAt], [2, 1, 1, mins(40).toISOString()]);
  eq2("sheetsBacklog: the last run and the last failed run", [backlogA.lastRunAt, backlogA.lastRunFailedAt], [runsA[0]!.at, runsA.find((r) => !r.ok)!.at]);
  eq2("sheetsBacklog: B counts only its own order", [(await health.sheetsBacklog(B)).failed, (await health.sheetsBacklog(B)).pending], [1, 0]);
  eq2("syncFailedCount: A = 1 failed row + 2 dead deliveries (mail never)", await health.syncFailedCount(A), 3);
  eq2("syncFailedCount: B = its failed row + its dead delivery", await health.syncFailedCount(B), 2);

  /* ================================================================ */
  /* 5. the int:* rules on the seeded stores (SF-03, two stores)       */
  /* ================================================================ */
  const tz = "Africa/Casablanca";
  const yesterday = addDays(dayKey(new Date(now), tz), -1);
  const yStart = dayStart(yesterday, tz).getTime();
  const flagged = (f: string[]) => ({ flags: f, sheetStatus: "synced" as const, createdAt: new Date(yStart + 3 * 60 * MIN) });
  for (let i = 0; i < 25; i++) await insertOrder(A, flagged(i < 10 ? ["captcha_missing"] : []));
  for (let i = 0; i < 30; i++) await insertOrder(A, flagged(["honeypot", "captcha_missing"]));
  for (let i = 0; i < 5; i++) await insertOrder(A, { ...flagged(["captcha_unverified"]), isTest: true });
  for (let i = 0; i < 19; i++) await insertOrder(B, flagged(["captcha_unverified"]));
  const yEnd = dayStart(dayKey(new Date(now), tz), tz).getTime();
  const [{ n: realYesterday }] = (await db.execute(
    sql`SELECT COUNT(*) AS n FROM orders WHERE store_id = ${ids.A} AND is_test = 0 AND created_at >= ${new Date(yStart)} AND created_at < ${new Date(yEnd)} AND NOT JSON_CONTAINS(COALESCE(flags, '[]'), '"honeypot"')`,
  ))[0] as unknown as { n: number }[];

  const storeRow = (scope: typeof A) => ({ id: scope.storeId, handle: scope === A ? "int-a" : "int-b", timezone: tz }) as HealthInputs["store"];
  const inputsOf = async (scope: typeof A): Promise<HealthInputs> => {
    const backlog = await health.sheetsBacklog(scope);
    return {
      store: storeRow(scope),
      now: new Date(now),
      integrations: await health.integrationHealth(scope),
      sheets: { pending: backlog.pending, oldestMin: backlog.oldestPendingAt ? Math.floor((now - Date.parse(backlog.oldestPendingAt)) / MIN) : null, lastRunFailedAt: backlog.lastRunFailedAt ? new Date(backlog.lastRunFailedAt) : null },
    } as HealthInputs;
  };
  // A's Sheets row: connected and late
  await status.recordIntegrationStatus(A, { kind: "sheets", outcome: "ok", backlog: 3, oldestPendingAt: mins(40) }, { now });
  const inA = await inputsOf(A);
  const inB = await inputsOf(B);
  const fired = async (id: string, scope: typeof A, inputs: HealthInputs) => rules.find((r) => r.id === id)!.collect(scope, inputs);
  const dd = await fired("int:delivery_dead", A, inA);
  eq2("int:delivery_dead fires for A with its 2 dead deliveries", [dd?.severity, dd?.evidence.value], [2, 2]);
  eq2("int:delivery_dead counts B's own dead delivery only", (await fired("int:delivery_dead", B, inB))?.evidence.value, 1);
  const ts = await fired("int:turnstile", A, inA);
  eq2("int:turnstile fires for A on yesterday's real orders (test and honeypot excluded)", [ts?.evidence.window, ts?.evidence.n], ["yesterday", Number(realYesterday)]);
  eq2("int:turnstile is silent for B below minN, whatever A holds", await fired("int:turnstile", B, inB), null);
  const sb = await fired("int:sheets_backlog", A, inA);
  eq2("int:sheets_backlog fires for A (40 min, 2 active stores: 15 min)", [sb?.severity, sb?.evidence.baseline, sb?.evidence.value], [3, 15, 40]);
  eq2("int:sheets_backlog is silent for B (Sheets off)", await fired("int:sheets_backlog", B, inB), null);
  eq2("int:capi_failing fires for A (1 of 2 pixels)", [(await fired("int:capi_failing", A, inA))?.evidence.value, (await fired("int:capi_failing", A, inA))?.evidence.n], [1, 2]);
  eq2("int:telegram_failing fires for A, not for B", [(await fired("int:telegram_failing", A, inA))?.severity, await fired("int:telegram_failing", B, inB)], [2, null]);
  for (const r of rules) {
    await r.collect(A, inA);
    const t = performance.now();
    await r.collect(A, inA);
    const ms = performance.now() - t;
    ok(`${r.id}: collect ≤ 40 ms`, ms <= 40, Math.round(ms));
  }

  /* ================================================================ */
  /* 6. the pulse contributor (OPE-§27.3, SF-06)                       */
  /* ================================================================ */
  const owner = { userId: newId(), role: "owner" };
  await contributor.contribute(A, owner); // warm: the lazy import and the first read
  await new Promise((r) => setTimeout(r, 5_100)); // past the 5 s cache
  let t = performance.now();
  const pulseA = await contributor.contribute(A, owner);
  const coldMs = performance.now() - t;
  await new Promise((r) => setTimeout(r, 300)); // a load that ran past 50 ms has filled the cache by now
  t = performance.now();
  const cachedA = await contributor.contribute(A, owner);
  const warmMs = performance.now() - t;
  ok("pulse: A's owner gets syncFailed within 50 ms (or the key is omitted)", ("syncFailed" in pulseA ? pulseA.syncFailed === 3 : true) && coldMs <= 50 + 10, { pulseA, coldMs });
  eq2("pulse: the cached answer within 5 s", cachedA, { syncFailed: 3 });
  ok("pulse: a cached answer is immediate", warmMs <= 50, warmMs);
  eq2("pulse: B's manager counts B only", await contributor.contribute(B, { userId: newId(), role: "manager" }), { syncFailed: 2 });
  eq2("pulse: an agent gets no key", await contributor.contribute(A, { userId: newId(), role: "agent" }), {});
  eq2("pulse: a failure omits the key", await contributor.contribute({ ...A, storeId: "" } as typeof A, owner), {});

  void orderIds;
}

main()
  .catch((e: unknown) => {
    failures.push(`crashed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  })
  .finally(async () => {
    try {
      const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
      await pool().end();
    } catch {
      /* the pool may never have opened */
    }
    if (KEEP) console.log(`· kept ${dbName}`);
    else await rootQuery(`DROP DATABASE IF EXISTS \`${dbName}\``).catch((e: unknown) => console.error(`✗ could not drop ${dbName}:`, e instanceof Error ? e.message : e));
    for (const f of failures) console.log(`✗ ${f}`);
    console.log(failures.length ? `✗ test:integrations-db: ${failures.length} failure(s), ${pass} passed` : `✓ test:integrations-db: ${pass} checks passed`);
    process.exit(failures.length ? 1 : 0);
  });

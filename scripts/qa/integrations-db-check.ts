// proves: IN-01, IN-03, SF-03, SF-05, SF-06
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
 *  - the pulse contributor: `{ syncFailed }` within 50 ms, nothing for an agent, a failure omits the key;
 *  - the Sheets push (IN-01, SF-05; OPE-§19.5, §19.7, §26, §28.2) against a fake Google (src/lib/sheets/client.ts
 *    `setGapiDoubleForTests`: a call counter, scripted 429 / 403, a slow sheet): ≤ 3 calls per store per tick and ≤ 2 on
 *    the after() path; the bucket stops a run and keeps its work; a 429 opens the 90 s breaker for every store; oldest
 *    waiting order first across 20 stores, and a slow sheet never starves the others; a test order is never appended,
 *    "Send again" included; rev-guarded marks; the deleted-row case; the run history; the integration_status
 *    transitions; the preconditions; B's run never touches A; the `sheets.push` job; the transport seam.
 */
import Module from "node:module";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";

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
  await sheetsPushSuite();
}

/* ================================================================== */
/* 7. the Sheets push (IN-01, SF-05; OPE-§19.5, §19.7, §26, §28.2)     */
/* ================================================================== */

/** One Sheets API call as the fake Google saw it. */
type CallKind = "read" | "append" | "update" | "other";
interface FakeSheet {
  /** the rows from A2 down: [id, date, label, …] */
  rows: unknown[][];
  calls: { kind: CallKind; at: number; body: string | null }[];
  /** HTTP error statuses answered to the next calls, in order (429, 403) */
  script: number[];
  /** every answer waits this long (a slow sheet) */
  delayMs: number;
  /** runs before a call is applied (a person or another writer changing the order meanwhile) */
  before?: (kind: CallKind) => Promise<void>;
}

async function sheetsPushSuite(): Promise<void> {
  const { generateKeyPairSync } = await import("node:crypto");
  const http = await import("node:http");
  const env = process.env as Record<string, string | undefined>;
  // a throwaway service account: the fake never checks the token, the transport check signs a real JWT with it
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const sa = { client_email: "store-gen-qa@store-gen-qa.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), private_key_id: "qa" };
  env.GOOGLE_SA_JSON_B64 = Buffer.from(JSON.stringify(sa)).toString("base64");

  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const { cronCursors, flags, integrationStatus, notifications, orders, sheetBindings, stores } = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { newId, newOrderId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const { systemCtx, systemScope } = load<typeof import("@/lib/jobs/scope")>("@/lib/jobs/scope");
  const client = load<typeof import("@/lib/sheets/client")>("@/lib/sheets/client");
  const push = load<typeof import("@/lib/sheets/push")>("@/lib/sheets/push");
  const sync = load<typeof import("@/lib/sheets/sync")>("@/lib/sheets/sync");
  const config = load<typeof import("@/lib/sheets/config")>("@/lib/sheets/config");
  const history = load<typeof import("@/lib/sheets/history")>("@/lib/sheets/history");
  const { ROW_NOT_FOUND } = load<typeof import("@/lib/sheets/plan")>("@/lib/sheets/plan");
  const { statusLabel } = load<typeof import("@/lib/sheets/row")>("@/lib/sheets/row");
  const status = load<typeof import("@/lib/integrations/status")>("@/lib/integrations/status");
  const transport = load<typeof import("@/lib/integrations/transport")>("@/lib/integrations/transport");
  const { testSeam } = load<typeof import("@/lib/security/test-seams")>("@/lib/security/test-seams");
  const { invalidateFlags } = load<typeof import("@/lib/tenancy/entitlements")>("@/lib/tenancy/entitlements");
  const { platformBucket } = load<typeof import("@/lib/security/rate-limit")>("@/lib/security/rate-limit");
  const { setStoreSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
  const { hooks } = load<typeof import("@/lib/orders/hooks/integrations")>("@/lib/orders/hooks/integrations");
  const { JOBS, TICK_GUARANTEED_MS } = load<typeof import("@/lib/jobs/registry")>("@/lib/jobs/registry");
  type OrderStatus = import("@/lib/orders/contract").OrderStatus;
  status.clearStatusCache();

  /* ---------------- the fake Google (client.ts test double) ---------------- */
  const fakes = new Map<string, FakeSheet>();
  /** spreadsheet ids in the order of their first call (reset per scenario) */
  const served: string[] = [];
  const json = (v: unknown, code = 200) => new Response(JSON.stringify(v), { status: code, headers: { "content-type": "application/json" } });
  const colIndex = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const GOOGLE_ERRORS: Record<number, { status: string; message: string }> = {
    429: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded for quota metric 'Write requests'" },
    403: { status: "PERMISSION_DENIED", message: "The caller does not have permission" },
  };
  client.setGapiDoubleForTests(async (call) => {
    const [path = "", query = ""] = call.path.split("?");
    const m = /^\/([^/]+)\/values(.*)$/.exec(path);
    const id = m ? decodeURIComponent(m[1]!) : "";
    const f = fakes.get(id);
    if (!f) return json({ error: { code: 404, status: "NOT_FOUND", message: "Requested entity was not found." } }, 404);
    const rest = m![2]!;
    const kind: CallKind = rest === ":batchGet" ? "read" : rest.endsWith(":append") ? "append" : rest === ":batchUpdate" ? "update" : "other";
    f.calls.push({ kind, at: Date.now(), body: call.body });
    if (!served.includes(id)) served.push(id);
    const scripted = f.script.shift();
    if (scripted) return json({ error: { code: scripted, ...GOOGLE_ERRORS[scripted] } }, scripted);
    if (f.delayMs) await new Promise((r) => setTimeout(r, f.delayMs));
    if (f.before) await f.before(kind);
    if (kind === "read") {
      // the header range first (no optional columns in these sheets), then A2:C
      const ranges = new URLSearchParams(query).getAll("ranges");
      return json({ valueRanges: ranges.map((_, i) => (i === 0 ? {} : { values: f.rows.map((r) => r.slice(0, 3)) })) });
    }
    if (kind === "append") {
      const body = JSON.parse(call.body ?? "{}") as { values: unknown[][] };
      for (const row of body.values) f.rows.push([...row]);
      return json({ updates: { updatedRows: body.values.length } });
    }
    if (kind === "update") {
      const body = JSON.parse(call.body ?? "{}") as { data: { range: string; values: unknown[][] }[] };
      for (const d of body.data) {
        const cell = /!([A-Z]+)(\d+)/.exec(d.range);
        if (!cell) continue;
        const row = (f.rows[Number(cell[2]) - 2] ??= []);
        d.values[0]!.forEach((v, j) => (row[colIndex(cell[1]!) + j] = v));
      }
      return json({ totalUpdatedCells: body.data.length });
    }
    return json({});
  });

  /* ---------------- stores, orders, helpers ---------------- */
  const ctx = systemCtx("sheets.push");
  const actor = { id: "qa-system", kind: "system" as const };
  const SA_KEY = platformBucket(push.SA_BUCKET.name);
  const resetBucket = () => db.execute(sql`DELETE FROM rate_limits WHERE bucket = ${SA_KEY}`);
  const fillBucket = (used: number) =>
    db.execute(sql`INSERT INTO rate_limits (bucket, count, reset_at) VALUES (${SA_KEY}, ${used}, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 60 SECOND))
      ON DUPLICATE KEY UPDATE count = ${used}, reset_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 60 SECOND)`);
  const closeBreaker = async () => {
    await db.delete(cronCursors).where(eq(cronCursors.job, "sheets.push"));
    push.forgetSheetsBreaker();
  };
  const fresh = async () => {
    await resetBucket();
    await closeBreaker();
    served.length = 0;
  };
  let seq = 0;
  async function sheetStore(handle: string, opts: { status?: "active" | "pending" } = {}) {
    const id = newId();
    await db.insert(stores).values({ id, handle, name: `Store ${handle}`, status: opts.status ?? "active", brandSeed: "0123456789abcdef" });
    const scope = systemScope(ctx, id);
    const spreadsheetId = `1QaSheet${String(++seq).padStart(3, "0")}${randomBytes(12).toString("hex")}`;
    const fake: FakeSheet = { rows: [], calls: [], script: [], delayMs: 0 };
    fakes.set(spreadsheetId, fake);
    // saveSheetsConfig claims the binding (the ownership proof is step 5's; here the store owns its sheet)
    await config.saveSheetsConfig(scope, { spreadsheetId, sheetId: 0, sheetTitle: "Commandes", enabled: true }, actor);
    return { id, scope, spreadsheetId, fake };
  }
  type SheetStore = Awaited<ReturnType<typeof sheetStore>>;
  /** one order of `s`; `label` puts its row in the fake sheet with that status label */
  async function order(s: SheetStore, over: Partial<typeof orders.$inferInsert> = {}, label?: OrderStatus): Promise<string> {
    const id = newOrderId();
    await db.insert(orders).values({
      id,
      storeId: s.id,
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
    if (label) s.fake.rows.push([id, "", statusLabel(label)]);
    return id;
  }
  const rowOf = async (s: SheetStore, id: string) => (await db.select().from(orders).where(and(eq(orders.storeId, s.id), eq(orders.id, id))).limit(1))[0]!;
  const inSheet = (s: SheetStore, id: string) => s.fake.rows.filter((r) => r?.[0] === id);
  const kinds = (s: SheetStore, from = 0) => s.fake.calls.slice(from).map((c) => c.kind);
  const statusRow = async (s: SheetStore) =>
    (await db.select().from(integrationStatus).where(and(eq(integrationStatus.storeId, s.id), eq(integrationStatus.kind, "sheets"))).limit(1))[0];
  const notesOf = async (s: SheetStore, kind: string) => db.select().from(notifications).where(and(eq(notifications.storeId, s.id), eq(notifications.kind, kind)));
  const pause = async (...list: SheetStore[]) => {
    for (const s of list) await config.setSheetsEnabled(s.scope, false, actor);
  };

  /* ---------------- 7.1 oldest pending first across 20 stores, ≤ 3 calls each, the bucket ---------------- */
  await fresh();
  const F: SheetStore[] = [];
  const ageMin = (i: number) => 100 + ((i * 7) % 20); // a permutation of 100…119 (7 and 20 are coprime)
  for (let i = 0; i < 20; i++) {
    const s = await sheetStore(`sp-f${String(i).padStart(2, "0")}`);
    await order(s, { sheetStatus: "pending", createdAt: new Date(Date.now() - ageMin(i) * MIN) });
    await order(s, { sheetStatus: "synced", sheetDirty: 1, status: "confirmed", createdAt: new Date(Date.now() - 300 * MIN) }, "new");
    F.push(s);
  }
  const oldestFirst = F.map((s, i) => ({ s, age: ageMin(i) }))
    .sort((a, b) => b.age - a.age)
    .map((x) => x.s);
  const tick1 = await push.runSheetsPushTick(ctx, { budgetMs: 18_000 });
  ok("fairness: no store's run makes more than 3 Google calls in a tick", F.every((s) => s.fake.calls.length <= 3), F.map((s) => s.fake.calls.length));
  eq2("fairness: stores are served oldest waiting order first", served, oldestFirst.slice(0, served.length).map((s) => s.spreadsheetId));
  eq2("fairness: the p:sheets:sa bucket (50 / 60 s) serves 16 stores fully and the 17th in part, then the slot stops", [served.length, tick1.calls, tick1.stoppedBy, tick1.done], [17, 50, "quota", false]);
  ok("fairness: the 16 first stores got one read, one append, one batchUpdate", oldestFirst.slice(0, 16).every((s) => JSON.stringify(kinds(s)) === JSON.stringify(["read", "append", "update"])));
  const s17 = oldestFirst[16]!;
  eq2("fairness: the 17th got its read and its append; its batchUpdate waits for a token", kinds(s17), ["read", "append"]);
  const s17rows = await db.select({ status: orders.sheetStatus, dirty: orders.sheetDirty }).from(orders).where(eq(orders.storeId, s17.id)).orderBy(orders.createdAt);
  eq2("fairness: the 17th's changed row stays dirty for the next run", s17rows, [{ status: "synced", dirty: 1 }, { status: "synced", dirty: 0 }]);
  const waiting = oldestFirst.slice(17);
  const waitingRows = await db
    .select({ status: orders.sheetStatus, attempts: orders.sheetAttempts, error: orders.sheetError })
    .from(orders)
    .where(and(inArray(orders.storeId, waiting.map((s) => s.id)), eq(orders.sheetStatus, "pending")));
  eq2("fairness: the 3 last stores made no call and kept their work untouched", [waiting.map((s) => s.fake.calls.length), waitingRows.length, waitingRows.every((r) => r.attempts === 0 && r.error === null)], [[0, 0, 0], 3, true]);

  await resetBucket();
  served.length = 0;
  const calls1 = F.map((s) => s.fake.calls.length);
  const tick2 = await push.runSheetsPushTick(ctx, { budgetMs: 18_000 });
  eq2("fairness: the next tick serves the stores that waited, oldest first, then the 17th's last write", served, [...waiting, s17].map((s) => s.spreadsheetId));
  ok("fairness: ≤ 3 calls per store in the second tick too", F.every((s, i) => s.fake.calls.length - calls1[i]! <= 3));
  const leftF = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(orders)
    .where(and(inArray(orders.storeId, F.map((s) => s.id)), sql`(${orders.sheetStatus} <> 'synced' OR ${orders.sheetDirty} > 0)`));
  eq2("fairness: after two ticks every order of the 20 stores is in its sheet", [Number(leftF[0]?.n), tick2.stoppedBy, F.every((s) => s.fake.rows.length === 2)], [0, null, true]);
  await pause(...F);

  /* ---------------- 7.2 a slow sheet never starves the stores behind it ---------------- */
  await fresh();
  const G = [await sheetStore("sp-g1"), await sheetStore("sp-g2"), await sheetStore("sp-g3")];
  G[0]!.fake.delayMs = 1_500;
  const gIds: string[] = [];
  for (let i = 0; i < 3; i++) gIds.push(await order(G[i]!, { sheetStatus: "pending", createdAt: new Date(Date.now() - (90 - i) * MIN) }));
  await push.runSheetsPushTick(ctx, { budgetMs: 18_000, storeSliceMs: 400 });
  const g0 = await rowOf(G[0]!, gIds[0]!);
  const g0run = (await history.sheetsRunHistory(G[0]!.scope))[0];
  eq2("slow sheet: served first, it times out inside its slice and backs off", [served[0], g0.sheetStatus, g0.sheetAttempts, g0run?.ok, g0run?.error], [G[0]!.spreadsheetId, "failed", 1, false, "network"]);
  ok("slow sheet: its run ended with its slice, not with the sheet", (g0run?.ms ?? Infinity) < 1_200, g0run?.ms);
  ok("slow sheet: the drawer gets plain words", !!g0.sheetError && !g0.sheetError.includes("aborted"), g0.sheetError);
  eq2("slow sheet: the two stores behind it are served in the same tick", [(await rowOf(G[1]!, gIds[1]!)).sheetStatus, (await rowOf(G[2]!, gIds[2]!)).sheetStatus], ["synced", "synced"]);
  const gCalls = G[0]!.fake.calls.length;
  await push.runSheetsPushTick(ctx, { budgetMs: 18_000, storeSliceMs: 400 });
  eq2("slow sheet: backing off, it costs the next tick no call", G[0]!.fake.calls.length, gCalls);
  await pause(...G);

  /* ---------------- 7.3 the after() path: debounced, ≤ 2 calls; the R1.0 facade ---------------- */
  await fresh();
  const P = await sheetStore("sp-p1");
  const p1 = await order(P, { sheetStatus: "pending" });
  for (let i = 0; i < 3; i++) push.scheduleSheetPush(P.scope);
  await push.settleSheetPushes(P.id);
  let runsP = await history.sheetsRunHistory(P.scope);
  eq2("after(): three changes inside 2 s share one push of 2 calls (the header read, the append)", [runsP.length, runsP[0]?.trigger, runsP[0]?.calls, runsP[0]?.appended, kinds(P)], [1, "after", 2, 1, ["read", "append"]]);
  eq2("after(): appended → synced, sheet_label = the label written", [(await rowOf(P, p1)).sheetStatus, (await rowOf(P, p1)).sheetLabel, inSheet(P, p1).length], ["synced", "new", 1]);

  // the admin's status write (OD2): mark dirty + schedule, the status itself written by the caller right after
  const marked = await sync.pushOrderStatus(P.scope, p1, "confirmed");
  await db.update(orders).set({ status: "confirmed", updatedAt: new Date() }).where(and(eq(orders.storeId, P.id), eq(orders.id, p1)));
  const p1dirty = await rowOf(P, p1);
  eq2("pushOrderStatus: never waits for Google: the status bit and a rev bump, then the push", [marked, p1dirty.sheetDirty & 1, p1dirty.rev], ["updated", 1, 1]);
  const from = P.fake.calls.length;
  await push.settleSheetPushes(P.id);
  eq2("pushOrderStatus: the scheduled push rewrites column C (read + batchUpdate)", [kinds(P, from), inSheet(P, p1)[0]?.[2], (await rowOf(P, p1)).sheetDirty, (await rowOf(P, p1)).sheetLabel], [["read", "update"], statusLabel("confirmed"), 0, "confirmed"]);
  const p2 = await order(P, { sheetStatus: "pending" });
  eq2("pushOrderStatus: an order not in the sheet yet is not_found (its append carries the status)", await sync.pushOrderStatus(P.scope, p2, "confirmed"), "not_found");
  // a new order and a changed row at once: the after() run spends its 2 calls, the rest waits for the tick
  await db.update(orders).set({ sheetDirty: 2, rev: sql`${orders.rev} + 1` }).where(and(eq(orders.storeId, P.id), eq(orders.id, p1)));
  push.scheduleSheetPush(P.scope);
  await push.settleSheetPushes(P.id);
  runsP = await history.sheetsRunHistory(P.scope);
  const afterRuns = runsP.filter((r) => r.trigger === "after");
  ok("after(): every after() run made ≤ 2 calls", afterRuns.length === 3 && afterRuns.every((r) => r.calls <= 2), runsP);
  eq2("after(): the new order went out; the changed row waits (2 calls spent)", [(await rowOf(P, p2)).sheetStatus, (await rowOf(P, p1)).sheetDirty], ["synced", 2]);
  const pTick = await push.pushStore(P.scope, { maxCalls: 3, trigger: "tick" });
  eq2("after(): the tick's run writes the rest", [pTick.updated, (await rowOf(P, p1)).sheetDirty], [1, 0]);
  const p3 = await order(P, { sheetStatus: "pending" });
  eq2("syncPendingOrders (R1.0 name): one run, the R1.0 answer", await sync.syncPendingOrders(P.scope, { force: true, limit: 200 }), { status: "ok", appended: 1, updated: 0, skipped: 0, failed: 0 });
  eq2("syncPendingOrders: \"Sync now\" is a manual run", (await history.sheetsRunHistory(P.scope))[0]?.trigger, "manual");
  eq2("selectSyncBatch (R1.0 name): whole rows of the store, nothing left once synced", [(await sync.selectSyncBatch(P.scope, {})).length, (await rowOf(P, p3)).sheetStatus], [0, "synced"]);
  await pause(P);

  /* ---------------- 7.4 the bucket: a token before every call; none left → stop, keep the work ---------------- */
  await fresh();
  const U = await sheetStore("sp-u1");
  const u1 = await order(U, { sheetStatus: "pending" });
  const u2 = await order(U, { sheetStatus: "synced", sheetDirty: 1, status: "confirmed" }, "new");
  await fillBucket(push.SA_BUCKET.limit - 1);
  const cut = await push.pushStore(U.scope, { maxCalls: 3, trigger: "tick" });
  eq2("bucket: one token left → one call (the read), then the run stops", [cut.calls, cut.stopped, cut.ok, kinds(U)], [1, "quota", true, ["read"]]);
  const ru1 = await rowOf(U, u1);
  eq2("bucket: the new order still waits, unclaimed and without an error; the changed row stays dirty", [ru1.sheetStatus, ru1.sheetAttempts, ru1.sheetError, (await rowOf(U, u2)).sheetDirty], ["pending", 0, null, 1]);
  const empty = await push.pushStore(U.scope, { maxCalls: 3, trigger: "tick" });
  eq2("bucket: empty → skipped before any call, with the owner's words", [empty.skipped, empty.calls, U.fake.calls.length, !!empty.message, sync.syncResultOf(empty).status], ["quota", 0, 1, true, "error"]);
  const tickQ = await push.runSheetsPushTick(ctx, { budgetMs: 5_000 });
  eq2("bucket: the slot serves no store while the bucket is empty", [tickQ.calls, tickQ.stoppedBy], [0, "quota"]);
  await resetBucket();
  const resumed = await push.pushStore(U.scope, { maxCalls: 3, trigger: "tick" });
  eq2("bucket: refilled, the next run finishes the work", [resumed.appended, resumed.updated, (await rowOf(U, u1)).sheetStatus, (await rowOf(U, u2)).sheetDirty, inSheet(U, u1).length], [1, 1, "synced", 0, 1]);
  await pause(U);

  /* ---------------- 7.5 a 429 opens the platform breaker for 90 s, for every store ---------------- */
  await fresh();
  const Q1 = await sheetStore("sp-q1");
  const Q2 = await sheetStore("sp-q2");
  const q1 = await order(Q1, { sheetStatus: "pending" });
  const q2 = await order(Q2, { sheetStatus: "pending" });
  Q1.fake.script.push(429);
  const t429 = Date.now();
  const hit = await push.pushStore(Q1.scope, { maxCalls: 3, trigger: "tick" });
  const rq1 = await rowOf(Q1, q1);
  eq2("breaker: a 429 opens it; the run fails and marks nothing failed", [hit.breaker, hit.ok, hit.error, hit.calls, rq1.sheetStatus, rq1.sheetError, rq1.sheetAttempts], [true, false, "breaker", 1, "pending", null, 0]);
  const [bRow] = await db.select().from(cronCursors).where(eq(cronCursors.job, "sheets.push"));
  const until = Date.parse(String((bRow?.state as Record<string, unknown> | null)?.breakerUntil));
  ok("breaker: 90 s, kept in cron_cursors.state of sheets.push", until >= t429 + push.BREAKER_MS - 1_000 && until <= Date.now() + push.BREAKER_MS + 1_000, { until, t429 });
  eq2("breaker: the store whose run opened it is failing (OPE-§28.2)", [(await statusRow(Q1))?.state, (await statusRow(Q1))?.lastErrorCode], ["failing", "breaker"]);
  const held = await push.pushStore(Q2.scope, { maxCalls: 3, trigger: "tick" });
  eq2("breaker: another store waits with no call (this process's copy)", [held.skipped, held.calls, Q2.fake.calls.length, (await rowOf(Q2, q2)).sheetStatus, !!held.message], ["breaker", 0, 0, "pending", true]);
  push.forgetSheetsBreaker();
  const cold = await push.pushStore(Q2.scope, { maxCalls: 3, trigger: "tick" });
  eq2("breaker: another process (no copy in memory) reads it from the row", [cold.skipped, Q2.fake.calls.length], ["breaker", 0]);
  const tickB = await push.runSheetsPushTick(ctx, { budgetMs: 5_000 });
  eq2("breaker: the slot calls Google for no store while it is open", [tickB.calls, tickB.stoppedBy, Q1.fake.calls.length + Q2.fake.calls.length], [0, "breaker", 1]);
  await db.update(cronCursors).set({ state: { breakerUntil: new Date(Date.now() - 1_000).toISOString() } }).where(eq(cronCursors.job, "sheets.push"));
  push.forgetSheetsBreaker();
  const reopened = await push.pushStore(Q2.scope, { maxCalls: 3, trigger: "tick" });
  eq2("breaker: once closed, the waiting work goes out", [reopened.appended, (await rowOf(Q2, q2)).sheetStatus], [1, "synced"]);
  await pause(Q1, Q2);

  /* ---------------- 7.6 a test order never reaches a sheet (OPE-§26, D54), "Send again" included ---------------- */
  await fresh();
  const T = await sheetStore("sp-t1");
  const tIds = [
    await order(T, { isTest: true, sheetStatus: "disabled" }), // as the public path stores it
    await order(T, { isTest: true, sheetStatus: "pending", sheetAttempts: 1 }), // "Send again" forced past its guard
    await order(T, { isTest: true, sheetStatus: "failed", sheetAttempts: 3, updatedAt: new Date(Date.now() - 24 * 60 * MIN) }),
    await order(T, { isTest: true, sheetStatus: "synced", sheetDirty: 7 }),
  ];
  const real = await order(T, { sheetStatus: "pending" });
  await push.pushStore(T.scope, { maxCalls: 3, force: true, trigger: "manual" });
  await sync.syncPendingOrders(T.scope, { force: true });
  await push.pushStore(T.scope, { maxCalls: 3, trigger: "tick" });
  const sentT = JSON.stringify(T.fake.calls.map((c) => c.body)) + JSON.stringify(T.fake.rows);
  ok("test orders: none reaches the sheet, through Sync now, Send again or the tick", tIds.every((id) => !sentT.includes(id)), T.fake.rows);
  eq2("test orders: the real order is appended, once", inSheet(T, real).length, 1);
  const tRows = await Promise.all(tIds.map((id) => rowOf(T, id)));
  eq2("test orders: their sheet bookkeeping is untouched", tRows.map((r) => [r.sheetStatus, r.sheetAttempts, r.sheetDirty]), [["disabled", 0, 0], ["pending", 1, 0], ["failed", 3, 0], ["synced", 0, 7]]);
  eq2("test orders: never in a sync batch, never in the backlog", [(await sync.selectSyncBatch(T.scope, { force: true, limit: 200 })).filter((o) => tIds.includes(o.id)).length, (await statusRow(T))?.backlog], [0, 0]);

  const hook = hooks.find((h) => h.name === "int.sheets");
  eq2("int.sheets: afterCommit, on transition and edited", [hook?.phase, hook?.on], ["afterCommit", ["transition", "edited"]]);
  const snap = (id: string, isTest: boolean) => ({ id, rev: 1, status: "confirmed", states: {}, isTest, customerId: null, assigneeId: null, cityKey: null, totalCents: 34900 });
  const T2 = await sheetStore("sp-t2");
  const t2real = await order(T2, { sheetStatus: "synced", sheetDirty: 1, status: "confirmed" }, "new");
  const waitingReal = await order(T, { sheetStatus: "pending" }); // a push of T would take it
  const tCalls = T.fake.calls.length;
  const userActor = { kind: "user", userId: null };
  await hook!.run(T.scope, { on: "transition", before: snap(tIds[1]!, true), after: snap(tIds[1]!, true), moves: [], actor: userActor, source: "ui" } as never);
  await hook!.run(T2.scope, { on: "edited", before: snap(t2real, false), after: snap(t2real, false), fields: ["address"], actor: userActor } as never);
  await Promise.all([push.settleSheetPushes(T.id), push.settleSheetPushes(T2.id)]);
  eq2("int.sheets: a test order's transition schedules no push", [T.fake.calls.length, (await rowOf(T, waitingReal)).sheetStatus], [tCalls, "pending"]);
  eq2("int.sheets: a real order's edit pushes its row (read + batchUpdate)", [kinds(T2), (await rowOf(T2, t2real)).sheetDirty, inSheet(T2, t2real)[0]?.[2]], [["read", "update"], 0, statusLabel("confirmed")]);
  await pause(T, T2);

  /* ---------------- 7.7 rev-guarded marks: an order changed meanwhile stays dirty ---------------- */
  await fresh();
  const R = await sheetStore("sp-r1");
  const x = await order(R, { sheetStatus: "pending" }); // an R1 writer changes it during its append (rev + bit)
  const z = await order(R, { sheetStatus: "pending" }); // an R1.0 writer changes it during its append (updated_at only)
  const y = await order(R, { sheetStatus: "synced", sheetDirty: 1, status: "confirmed" }, "new"); // changed during its batchUpdate
  const mine = (id: string) => and(eq(orders.storeId, R.id), eq(orders.id, id));
  R.fake.before = async (kind) => {
    if (kind === "append") {
      await db.update(orders).set({ status: "confirmed", rev: sql`${orders.rev} + 1`, sheetDirty: sql`${orders.sheetDirty} | 1` }).where(mine(x));
      await db.update(orders).set({ status: "cancelled", updatedAt: sql`DATE_ADD(${orders.updatedAt}, INTERVAL 1 SECOND)` }).where(mine(z));
    }
    if (kind === "update") await db.update(orders).set({ status: "delivered", rev: sql`${orders.rev} + 1`, sheetDirty: sql`${orders.sheetDirty} | 1` }).where(mine(y));
  };
  const firstR = await push.pushStore(R.scope, { maxCalls: 3, trigger: "tick" });
  R.fake.before = undefined;
  eq2("rev guard: one read, one append, one batchUpdate", [firstR.calls, firstR.appended, firstR.updated, kinds(R)], [3, 2, 1, ["read", "append", "update"]]);
  const [rx, rz, ry] = [await rowOf(R, x), await rowOf(R, z), await rowOf(R, y)];
  eq2("rev guard: changed during its append (rev) → not marked synced, its bit kept", [rx.sheetStatus, rx.sheetDirty & 1], ["pending", 1]);
  eq2("rev guard: changed during its append by an R1.0 writer (updated_at) → not marked synced", rz.sheetStatus, "pending");
  eq2("rev guard: changed during its batchUpdate → its bit is not cleared", [ry.sheetStatus, ry.sheetDirty & 1], ["synced", 1]);
  for (let i = 0; i < 3; i++) await push.pushStore(R.scope, { maxCalls: 3, trigger: "tick" });
  eq2(
    "rev guard: the next runs converge: each order once in the sheet, with its latest status",
    [x, z, y].map((id) => [inSheet(R, id).length, inSheet(R, id)[0]?.[2]]),
    [
      [1, statusLabel("confirmed")],
      [1, statusLabel("cancelled")],
      [1, statusLabel("delivered")],
    ],
  );
  const finalR = await Promise.all([x, z, y].map((id) => rowOf(R, id)));
  eq2("rev guard: all synced, nothing dirty, sheet_label = the label written", finalR.map((r) => [r.sheetStatus, r.sheetDirty, r.sheetLabel]), [["synced", 0, "confirmed"], ["synced", 0, "cancelled"], ["synced", 0, "delivered"]]);
  await pause(R);

  /* ---------------- 7.8 a row deleted in the sheet ---------------- */
  await fresh();
  const D = await sheetStore("sp-d1");
  const kept = await order(D, { sheetStatus: "synced", sheetDirty: 1, status: "confirmed" }, "new");
  const gone = await order(D, { sheetStatus: "synced", sheetDirty: 1, status: "confirmed" }); // its row was deleted by a person
  const delRun = await push.pushStore(D.scope, { maxCalls: 3, trigger: "tick" });
  const rg = await rowOf(D, gone);
  eq2("deleted row: \"Row not found in the sheet\", sheet_dirty 0, still synced", [rg.sheetError, rg.sheetDirty, rg.sheetStatus, delRun.missing], [ROW_NOT_FOUND, 0, "synced", 1]);
  eq2("deleted row: never re-appended; the other row is written", [kinds(D), D.fake.rows.length, inSheet(D, kept)[0]?.[2]], [["read", "update"], 1, statusLabel("confirmed")]);
  const delAgain = await push.pushStore(D.scope, { maxCalls: 3, trigger: "tick" });
  eq2("deleted row: nothing left for the next run", [delAgain.calls, D.fake.calls.length], [0, 2]);
  await pause(D);

  /* ---------------- 7.9 the run history: ≤ 20 entries, ≤ 4 KB ---------------- */
  await fresh();
  const H = await sheetStore("sp-h1");
  for (let i = 0; i < 22; i++) {
    await order(H, { sheetStatus: "pending" });
    await push.pushStore(H.scope, { maxCalls: 2, trigger: "manual" });
  }
  const runsH = await history.sheetsRunHistory(H.scope);
  const [hRow] = await db.select().from(cronCursors).where(eq(cronCursors.job, `sheets.push:${H.id}`));
  eq2("history: every run recorded, the last 20 kept", [runsH.length, runsH.every((r) => r.trigger === "manual" && r.ok && r.appended === 1 && r.calls === 1)], [20, true]);
  ok("history: newest first", runsH.every((r, i) => i === 0 || r.at <= runsH[i - 1]!.at));
  ok("history: ≤ 4 KB, counts and codes only", Buffer.byteLength(JSON.stringify(hRow?.state), "utf8") <= history.RUN_HISTORY_BYTES && !JSON.stringify(hRow?.state).includes(PHONE));
  await pause(H);

  /* ---------------- 7.10 integration_status (sheets): ok, warn, failing, ok, off ---------------- */
  await fresh();
  const S = await sheetStore("sp-s1");
  await push.pushStore(S.scope, { maxCalls: 3, trigger: "tick" });
  eq2("status: a run with no error → ok", (await statusRow(S))?.state, "ok");
  await order(S, { sheetStatus: "pending", createdAt: new Date(Date.now() - 10 * MIN) });
  await push.pushStore(S.scope, { maxCalls: 1, trigger: "tick" }); // its one call reads the header: the order still waits
  const warnRow = await statusRow(S);
  eq2("status: the oldest waiting order > 5 min → warn, with the backlog", [warnRow?.state, warnRow?.backlog], ["warn", 1]);
  S.fake.script.push(403, 403, 403);
  for (let i = 0; i < 3; i++) await push.pushStore(S.scope, { maxCalls: 3, force: true, trigger: "manual" });
  const failRow = await statusRow(S);
  eq2("status: 3 failed runs in a row → failing, the cause as a code", [failRow?.state, failRow?.failures, failRow?.lastErrorCode], ["failing", 3, "sheet_not_shared"]);
  eq2("status: the incident notifies once", (await notesOf(S, "int.sheets_failing")).length, 1);
  const goodS = await push.pushStore(S.scope, { maxCalls: 3, force: true, trigger: "manual" });
  eq2("status: a good run → ok, nothing waiting", [goodS.appended, (await statusRow(S))?.state, (await statusRow(S))?.backlog], [1, "ok", 0]);
  await pause(S);
  const paused = await push.pushStore(S.scope, { maxCalls: 3, trigger: "tick" });
  eq2("status: paused → off, no call", [paused.skipped, (await statusRow(S))?.state, S.fake.calls.length], ["disabled", "off", 6]);

  /* ---------------- 7.11 preconditions: service account, binding, kill switch, pending store ---------------- */
  await fresh();
  const K = await sheetStore("sp-k1");
  const k1 = await order(K, { sheetStatus: "pending" });
  const saKey = env.GOOGLE_SA_JSON_B64;
  delete env.GOOGLE_SA_JSON_B64;
  const noSa = await push.pushStore(K.scope, { maxCalls: 3, trigger: "tick" });
  env.GOOGLE_SA_JSON_B64 = saKey;
  await db.delete(sheetBindings).where(eq(sheetBindings.spreadsheetId, K.spreadsheetId));
  const unbound = await push.pushStore(K.scope, { maxCalls: 3, trigger: "tick" });
  await config.claimSheetBinding(K.scope, K.spreadsheetId, actor);
  // the kill switch (§H.8): its seeded row tripped, then restored as it was
  const [killRow] = await db.select().from(flags).where(eq(flags.key, "sheets_sync_enabled")).limit(1);
  await db.insert(flags).values({ key: "sheets_sync_enabled", kind: "kill", defaultValue: false }).onDuplicateKeyUpdate({ set: { defaultValue: false } });
  invalidateFlags();
  const killed = await push.pushStore(K.scope, { maxCalls: 3, trigger: "tick" });
  if (killRow) await db.update(flags).set({ defaultValue: killRow.defaultValue }).where(eq(flags.key, "sheets_sync_enabled"));
  else await db.delete(flags).where(eq(flags.key, "sheets_sync_enabled"));
  invalidateFlags();
  const Kp = await sheetStore("sp-k2", { status: "pending" });
  await order(Kp, { sheetStatus: "pending" });
  const pendingStore = await push.pushStore(Kp.scope, { maxCalls: 3, trigger: "tick" });
  eq2(
    "preconditions: no service account, unbound, kill switch, pending store → skipped",
    [noSa.skipped, unbound.skipped, killed.skipped, killed.offReason, pendingStore.skipped, pendingStore.offReason],
    ["not_configured", "unbound", "feature_off", "kill", "feature_off", "state"],
  );
  eq2("preconditions: no Google call, the order keeps waiting (§A.5.2, §H.8)", [K.fake.calls.length, Kp.fake.calls.length, (await rowOf(K, k1)).sheetStatus], [0, 0, "pending"]);
  eq2("preconditions: the R1.0 answer reads them as not configured", [noSa, unbound, killed].map((r) => sync.syncResultOf(r).status), ["not_configured", "not_configured", "not_configured"]);
  eq2("preconditions: all met again, the order goes out", [(await push.pushStore(K.scope, { maxCalls: 3, trigger: "tick" })).appended, (await rowOf(K, k1)).sheetStatus], [1, "synced"]);
  await pause(K, Kp);

  /* ---------------- 7.12 two stores: B's run never touches A's orders or A's sheet ---------------- */
  await fresh();
  const TA = await sheetStore("sp-ta");
  const TB = await sheetStore("sp-tb");
  const aOrders = [
    await order(TA, { sheetStatus: "pending" }),
    await order(TA, { sheetStatus: "synced", sheetDirty: 1, status: "confirmed" }, "new"),
    await order(TA, { sheetStatus: "failed", sheetAttempts: 2, updatedAt: new Date(Date.now() - 24 * 60 * MIN) }),
  ];
  const b1 = await order(TB, { sheetStatus: "pending" });
  await order(TB, { sheetStatus: "synced", sheetDirty: 1, status: "delivered" }, "new");
  TB.fake.rows.push([aOrders[1], "", statusLabel("new")]); // B's sheet names A's order (ids are customer-visible)
  const snapA = async () =>
    JSON.stringify(
      await db
        .select({ id: orders.id, s: orders.sheetStatus, a: orders.sheetAttempts, d: orders.sheetDirty, l: orders.sheetLabel, e: orders.sheetError, r: orders.rev, u: orders.updatedAt })
        .from(orders)
        .where(eq(orders.storeId, TA.id))
        .orderBy(orders.id),
    );
  const beforeA = await snapA();
  const bRun = await push.pushStore(TB.scope, { maxCalls: 3, force: true, trigger: "manual" });
  eq2("tenancy: B's run does its own work", [bRun.appended, bRun.updated, (await rowOf(TB, b1)).sheetStatus], [1, 1, "synced"]);
  eq2("tenancy: B's run never reads, writes or marks A's orders, nor calls A's sheet", [(await snapA()) === beforeA, TA.fake.calls.length], [true, 0]);
  ok("tenancy: nothing of A's orders reaches B's sheet", !aOrders.some((id) => JSON.stringify(TB.fake.calls.map((c) => c.body)).includes(id)));
  // B configured with A's spreadsheet (a pasted id, written past saveSheetsConfig): unbound for B, so no call
  await setStoreSetting(TB.scope, "sheets", { spreadsheetId: TA.spreadsheetId, sheetId: 0, sheetTitle: "Commandes", enabled: true }, actor);
  await order(TB, { sheetStatus: "pending" });
  const crossed = await push.pushStore(TB.scope, { maxCalls: 3, force: true, trigger: "manual" });
  eq2("tenancy: B pointing at A's spreadsheet is unbound: no call reaches A's sheet", [crossed.skipped, TA.fake.calls.length, (await snapA()) === beforeA], ["unbound", 0, true]);
  eq2("tenancy: B cannot claim A's spreadsheet", await config.claimSheetBinding(TB.scope, TA.spreadsheetId, actor).then(() => "claimed", (e: { code?: string }) => e.code), "binding_conflict");
  await pause(TA, TB);

  /* ---------------- 7.13 the sheets.push job (core §H.2 slot 1, OPE-§J) ---------------- */
  await fresh();
  const job = JOBS.find((j) => j.name === "sheets.push");
  eq2("job: sheets.push every tick, 18 s, ≤ 50 stores over pending_sheets", [job?.every, job?.budgetMs, job?.perStore?.where, job?.perStore?.maxStoresPerTick], ["tick", 18_000, "pending_sheets", 50]);
  ok("job: the registered budgets fit the 95 s tick; names are unique", JOBS.reduce((n, j) => n + j.budgetMs, 0) <= TICK_GUARANTEED_MS && new Set(JOBS.map((j) => j.name)).size === JOBS.length, JOBS.map((j) => [j.name, j.budgetMs]));
  const J = await sheetStore("sp-j1");
  const j1 = await order(J, { sheetStatus: "pending" });
  let yields = 0;
  const jobCtx = {
    ...systemCtx("sheets.push"),
    deadline: Date.now() + 18_000,
    tickId: "qa-tick",
    cursor: "",
    setCursor: async () => undefined,
    yield: async () => {
      yields++;
      await new Promise((r) => setImmediate(r));
    },
    lagMs: () => 0,
  };
  const jr = await job!.run(jobCtx);
  eq2("job: one run serves the store, the summary holds counts and codes only", [jr.done, jr.summary?.appended, jr.summary?.stoppedBy, (await rowOf(J, j1)).sheetStatus], [true, 1, "none", "synced"]);
  ok("job: ctx.yield() between stores", yields >= 1, yields);
  ok("job: the summary carries no customer field", !JSON.stringify(jr).includes(PHONE) && !JSON.stringify(jr).includes(NAME));
  await pause(J);

  /* ---------------- 7.14 the transport seam (integrationFetch) and the client's test double ---------------- */
  eq2("transport: seam off → the URL as it is", transport.routeIntegrationUrl("https://sheets.googleapis.com/v4/spreadsheets/x/values:batchGet?ranges=A1", null), { url: "https://sheets.googleapis.com/v4/spreadsheets/x/values:batchGet?ranges=A1", host: null });
  eq2("transport: seam on → the mock origin, path and query kept", transport.routeIntegrationUrl("https://graph.facebook.com/v21.0/123/events?x=1", "http://127.0.0.1:4010"), { url: "http://127.0.0.1:4010/v21.0/123/events?x=1", host: "graph.facebook.com" });
  eq2("transport: any other host never moves", [transport.routeIntegrationUrl("https://example.com/v4/x", "http://127.0.0.1:4010").host, transport.routeIntegrationUrl("http://sheets.googleapis.com/v4/x", "http://127.0.0.1:4010").host], [null, null]);
  const recorded: { url: string; host: string; auth: boolean }[] = [];
  const server = http.createServer((req, res) => {
    recorded.push({ url: req.url ?? "", host: String(req.headers[transport.E2E_HOST_HEADER] ?? ""), auth: /^Bearer /.test(String(req.headers.authorization ?? "")) });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(req.url === "/token" ? JSON.stringify({ access_token: "qa-token", expires_in: 3600 }) : JSON.stringify({ valueRanges: [] }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as import("node:net").AddressInfo).port;
  env.SG_E2E = "1";
  env.SG_E2E_MOCK_ORIGIN = `http://127.0.0.1:${port}`;
  try {
    const res = await transport.integrationFetch("https://api.telegram.org/botQA/sendMessage?x=1", { method: "POST", body: "{}" });
    eq2("transport: SG_E2E=1, a loopback origin and a cod_test_* database → the recorder gets the call", [res.status, recorded[0]], [200, { url: "/botQA/sendMessage?x=1", host: "api.telegram.org", auth: false }]);
    client.setGapiDoubleForTests(null);
    await client.gapi("/1QaTransport0000000000000/values:batchGet?ranges=A1", {}, { maxRetries: 0 });
    eq2(
      "transport: the Sheets client goes through it (the OAuth token, then the API call with its Bearer)",
      recorded.slice(1).map((r) => [r.url.split("?")[0], r.host, r.auth]),
      [
        ["/token", "oauth2.googleapis.com", false],
        ["/v4/spreadsheets/1QaTransport0000000000000/values:batchGet", "sheets.googleapis.com", true],
      ],
    );
    const dbUrl = env.DATABASE_URL;
    env.DATABASE_URL = `${DB_SERVER}/cod_storegen`;
    const refusedDb = testSeam("e2e-mocks");
    env.DATABASE_URL = dbUrl;
    env.SG_E2E = "0";
    const refusedFlag = testSeam("e2e-mocks");
    env.SG_E2E = "1";
    env.SG_E2E_MOCK_ORIGIN = "https://mock.example.com";
    const refusedOrigin = testSeam("e2e-mocks");
    eq2("transport: a non-test database, SG_E2E ≠ 1 or a non-loopback origin keeps the seam off", [refusedDb, refusedFlag, refusedOrigin], [null, null, null]);
  } finally {
    delete env.SG_E2E;
    delete env.SG_E2E_MOCK_ORIGIN;
    await new Promise<void>((r) => server.close(() => r()));
  }
  const nodeEnv = env.NODE_ENV;
  env.NODE_ENV = "production";
  let refused = false;
  try {
    client.setGapiDoubleForTests(async () => json({}));
  } catch {
    refused = true;
  }
  if (nodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = nodeEnv;
  ok("client: the gapi test double is refused under NODE_ENV=production", refused);
  client.setGapiDoubleForTests(null);
  delete env.GOOGLE_SA_JSON_B64;
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

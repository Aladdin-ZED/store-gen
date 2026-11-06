// proves: IN-01, IN-02, IN-03, IN-04, IN-09, OP-16, SF-03, SF-05, SF-06
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
 *    transitions; the preconditions; B's run never touches A; the `sheets.push` job; the transport seam;
 *  - the bindings and the pull (IN-01, IN-09 R1, OP-16 R1; OPE-§19.2, §19.3, §19.6): the ownership proof (code found,
 *    not found, a code planted in a cell, a spreadsheet another store holds → the one generic refusal with no Google
 *    call, a reconnect without a proof, the duplicate-key race of two verifies, disconnect, moving to another sheet,
 *    the feature gate); the `sheets.bind_legacy` pass (idempotent, the earliest connectedAt keeps a shared
 *    spreadsheet, a code proof is never moved, a later legacy holder gives it up, ≤ 50 ms ticks, a no-op once done)
 *    and the push binding a free legacy sheet in the same run; the pull on the push's read with a spy on P4's
 *    applyExternalStatus / appendOrderEvent stubs (calls, refs, agentLabel, the sheet_label / sheet_dirty
 *    bookkeeping, OD5 write-backs), the Agent / Note agent / Tracking / Transporteur writes and their dedupe, the
 *    R1.0 path while the stubs throw, a test order and another store's ids never touched, the window, the history,
 *    the `sheets.pull` job and the `pullStatuses` facade.
 *  - server ad events (IN-02, IN-03, SF-05 CAPI half; OPE-§20.4, §20.9 (2)-(6), §28.3 (1)) with spies standing in for
 *    P8's enqueue / drain / enqueueRenders and P4's appendOrderEvent (the enqueue double is a real INSERT IGNORE on the
 *    caller's handle): the creation path (one Purchase per pixel with a token, drained; the risk gate; test and
 *    honeypot orders send nothing), the capi_ctx seal / open round trip (B never opens A's), the int.capi hook on a
 *    confirmation and a delivery inside the order's transaction (exactly one Purchase per pixel with event_id = order
 *    id, the current total, the dedupe of a retried transition, an inTx failure rolled back with no outbox row, the
 *    context nulled when nothing is left, a test order untouched, server fields only without a context, typed orders
 *    only with manualOrders), the `capi` handler against a fake fetch (done / retry / final, A's token never signs B's
 *    event, the 7-day guard → cancelled + capi_stale, a removed token, the kill switch, health, int.delivery_dead), the
 *    `ops.capi_ctx_purge` job, `applyConversionsChange` re-rendering the pages whose trigger changed, and the render's
 *    `purchaseInBrowserFor` parity with `triggerFor`.
 *  - Telegram (IN-04, SF-05 Telegram half; OPE-§21, §26, §28.1-§28.3) with P8's enqueue / drain and P4's maskPhone /
 *    orderKpis / queueCounts as doubles and a fake Bot API: the int.telegram hook on the order's transaction (the
 *    batch window, dedupe, rollback, honeypot, test orders only with the switch), the handler merging one store's new
 *    orders into one message, >= 1 s between two messages of a chat, a 429's retry_after honoured, a revoked token
 *    failing within one send and notified once, "[TEST]" only with the switch, Send again on done rows as one
 *    "(renvoi)" message, B's item never reading A's order, a migrated group, the Sheets incident at its 15th minute,
 *    the daily job (one per day, figures left out when unread), the setup functions, and the token canary over every
 *    outbox row, audit row and log line.
 *  - the store-side replay (OPE-§28.1, OPE-§L "Replay", §Q.26; P8's `replay` behind a double): Replay of a dead row,
 *    Send again of a done Telegram row, refused for a done or cancelled CAPI row, a pending row a no-op, one
 *    `integrations.outbox.replayed` row per replayed row, the 31st call of the hour refused, Replay all capped at 50 as
 *    one call, and B never replaying A's row.
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
  const yEnd = dayStart(dayKey(new Date(now), tz), tz).getTime();
  // B ends one order below minN yesterday, counting the orders seeded minutes ago (a run just after midnight dates them yesterday)
  const [{ n: bYesterday }] = (await db.execute(
    sql`SELECT COUNT(*) AS n FROM orders WHERE store_id = ${ids.B} AND is_test = 0 AND created_at >= ${new Date(yStart)} AND created_at < ${new Date(yEnd)}`,
  ))[0] as unknown as { n: number }[];
  for (let i = 0; i < 19 - Number(bYesterday); i++) await insertOrder(B, flagged(["captcha_unverified"]));
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
  await capiSuite();
  await telegramSuite();
  await replaySuite();
  await serverEventsSuite();
}

/* ================================================================== */
/* 7. the Sheets push (IN-01, SF-05; OPE-§19.5, §19.7, §26, §28.2)     */
/* ================================================================== */

/** One Sheets API call as the fake Google saw it. */
type CallKind = "read" | "append" | "update" | "meta" | "other";
interface FakeSheet {
  /** the rows from A2 down: [id, date, label, …] */
  rows: unknown[][];
  /** the header cells from N1 (the optional columns); none by default */
  header?: string[];
  /** the spreadsheet's title and tabs (the metadata read of the proof and of connectSheet) */
  title?: string;
  tabs?: { sheetId: number; title: string }[];
  calls: { kind: CallKind; at: number; body: string | null; query: string }[];
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
  const gapiFake = async (call: { method: string; path: string; body: string | null }) => {
    const [path = "", query = ""] = call.path.split("?");
    const m = /^\/([^/:]+)(.*)$/.exec(path);
    const id = m ? decodeURIComponent(m[1]!) : "";
    const f = fakes.get(id);
    if (!f) return json({ error: { code: 404, status: "NOT_FOUND", message: "Requested entity was not found." } }, 404);
    const rest = m![2]!;
    const kind: CallKind =
      rest === "/values:batchGet" ? "read" : /^\/values\/.+:append$/.test(rest) ? "append" : rest === "/values:batchUpdate" ? "update" : rest === "" && call.method === "GET" ? "meta" : "other";
    f.calls.push({ kind, at: Date.now(), body: call.body, query: decodeURIComponent(query) });
    if (!served.includes(id)) served.push(id);
    const scripted = f.script.shift();
    if (scripted) return json({ error: { code: scripted, ...GOOGLE_ERRORS[scripted] } }, scripted);
    if (f.delayMs) await new Promise((r) => setTimeout(r, f.delayMs));
    if (f.before) await f.before(kind);
    if (kind === "read") {
      // the header range first (N1:AZ1), then A2:<the read width>
      const ranges = new URLSearchParams(query).getAll("ranges");
      const width = (r: string) => colIndex(/!A2:([A-Z]+)$/.exec(r)?.[1] ?? "C") + 1;
      return json({ valueRanges: ranges.map((r, i) => (i === 0 ? (f.header?.length ? { values: [f.header] } : {}) : { values: f.rows.map((row) => row.slice(0, width(r))) })) });
    }
    if (kind === "meta") {
      const tabs = f.tabs ?? [{ sheetId: 0, title: "Commandes" }];
      return json({ properties: { title: f.title ?? "Ventes" }, sheets: tabs.map((t) => ({ properties: t })) });
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
  };
  client.setGapiDoubleForTests(gapiFake);

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
  /** the next tick comes 5 minutes later: every store's 290 s pull window (s:<sid>:sheets:pull) has closed by then */
  const nextTick = () => db.execute(sql`DELETE FROM rate_limits WHERE bucket LIKE 's:%:sheets:pull'`);
  const fresh = async () => {
    await resetBucket();
    await closeBreaker();
    await nextTick();
    served.length = 0;
  };
  let seq = 0;
  async function sheetStore(handle: string, opts: { status?: "active" | "pending"; pull?: boolean } = {}) {
    const id = newId();
    await db.insert(stores).values({ id, handle, name: `Store ${handle}`, status: opts.status ?? "active", brandSeed: "0123456789abcdef" });
    const scope = systemScope(ctx, id);
    const spreadsheetId = `1QaSheet${String(++seq).padStart(3, "0")}${randomBytes(12).toString("hex")}`;
    const fake: FakeSheet = { rows: [], calls: [], script: [], delayMs: 0 };
    fakes.set(spreadsheetId, fake);
    // saveSheetsConfig claims the binding (the ownership proof is step 5's; here the store owns its sheet)
    await config.saveSheetsConfig(scope, { spreadsheetId, sheetId: 0, sheetTitle: "Commandes", enabled: true, pull: opts.pull ?? true }, actor);
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

  // the next tick, 95 s later: the 17 stores read in tick 1 are inside their 290 s pull window
  await resetBucket();
  served.length = 0;
  const calls1 = F.map((s) => s.fake.calls.length);
  await push.runSheetsPushTick(ctx, { budgetMs: 18_000 });
  ok(
    "fairness: the next tick serves the stores that waited, oldest first (the 17th's last write at once when pending_sheets matches sheet_dirty > 0, CCR r1-p5-6; else when its window reopens)",
    JSON.stringify(served.slice(0, 3)) === JSON.stringify(waiting.map((s) => s.spreadsheetId)) && served.slice(3).every((id) => id === s17.spreadsheetId),
    served,
  );
  ok("fairness: ≤ 3 calls per store in the second tick too", F.every((s, i) => s.fake.calls.length - calls1[i]! <= 3));
  // five minutes later every window is open again: each store pulls on one read, the 17th writes its last row
  await resetBucket();
  await nextTick();
  const tick2 = await push.runSheetsPushTick(ctx, { budgetMs: 18_000 });
  const leftF = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(orders)
    .where(and(inArray(orders.storeId, F.map((s) => s.id)), sql`(${orders.sheetStatus} <> 'synced' OR ${orders.sheetDirty} > 0)`));
  eq2("fairness: after the next ticks every order of the 20 stores is in its sheet", [Number(leftF[0]?.n), tick2.stoppedBy, F.every((s) => s.fake.rows.length === 2)], [0, null, true]);
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
  const S = await sheetStore("sp-s1", { pull: false });
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
  // K's spreadsheet held by another store: unbound for K (a free one would be bound on the spot as legacy, 8.2)
  const holder = await sheetStore("sp-k0");
  await db.update(sheetBindings).set({ storeId: holder.id }).where(eq(sheetBindings.spreadsheetId, K.spreadsheetId));
  const unbound = await push.pushStore(K.scope, { maxCalls: 3, trigger: "tick" });
  await db.update(sheetBindings).set({ storeId: K.id }).where(eq(sheetBindings.spreadsheetId, K.spreadsheetId));
  push.forgetLegacyAttempts();
  await pause(holder);
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

  await bindPullSuite({ fakes, kinds, sheetStore, order, rowOf, fresh, nextTick, pause, ctx, actor });

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

/* ================================================================== */
/* 8. bindings, the legacy pass and the pull (IN-01, IN-09, OP-16)     */
/* ================================================================== */

type OrderRow = typeof import("@/lib/db/schema").orders.$inferSelect;
type OrderInsert = typeof import("@/lib/db/schema").orders.$inferInsert;
type OStatus = import("@/lib/orders/contract").OrderStatus;
/** A store of the Sheets suites (src/lib/jobs/scope.ts `systemScope`, its fake sheet). */
interface KitStore {
  id: string;
  scope: ReturnType<typeof import("@/lib/jobs/scope").systemScope>;
  spreadsheetId: string;
  fake: FakeSheet;
}
/** What the push suite hands the bindings and pull suite (its fake Google, stores and orders). */
interface BindPullKit {
  fakes: Map<string, FakeSheet>;
  kinds: (s: KitStore, from?: number) => CallKind[];
  sheetStore: (handle: string, opts?: { status?: "active" | "pending"; pull?: boolean }) => Promise<KitStore>;
  order: (s: KitStore, over?: Partial<OrderInsert>, label?: OStatus) => Promise<string>;
  rowOf: (s: KitStore, id: string) => Promise<OrderRow>;
  fresh: () => Promise<void>;
  nextTick: () => Promise<unknown>;
  pause: (...list: KitStore[]) => Promise<void>;
  ctx: import("@/lib/tenancy/types").SystemCtx;
  actor: { id: string; kind: "system" };
}

/** the optional columns of these sheets: N "Agent", O "Note agent", P "Tracking", Q "Transporteur" */
const OPT = { agent: 13, note: 14, tracking: 15, carrier: 16 } as const;
const GENERIC_REFUSAL = "This sheet can't be connected. Create a new Google Sheet for this store.";

async function bindPullSuite(k: BindPullKit): Promise<void> {
  const { fakes, kinds, sheetStore, order, rowOf, fresh, nextTick, pause, ctx, actor } = k;
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const { auditLog, integrationStatus, orderEvents, orders, sheetBindings, stores } = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { newId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const { systemCtx, systemScope } = load<typeof import("@/lib/jobs/scope")>("@/lib/jobs/scope");
  const push = load<typeof import("@/lib/sheets/push")>("@/lib/sheets/push");
  const sync = load<typeof import("@/lib/sheets/sync")>("@/lib/sheets/sync");
  const config = load<typeof import("@/lib/sheets/config")>("@/lib/sheets/config");
  const connect = load<typeof import("@/lib/sheets/connect")>("@/lib/sheets/connect");
  const legacy = load<typeof import("@/lib/sheets/bind-legacy")>("@/lib/sheets/bind-legacy");
  const pull = load<typeof import("@/lib/sheets/pull")>("@/lib/sheets/pull");
  const history = load<typeof import("@/lib/sheets/history")>("@/lib/sheets/history");
  const { proofHash } = load<typeof import("@/lib/sheets/proof")>("@/lib/sheets/proof");
  const { SheetsError } = load<typeof import("@/lib/sheets/client")>("@/lib/sheets/client");
  const { statusLabel } = load<typeof import("@/lib/sheets/row")>("@/lib/sheets/row");
  const { getStoreSetting, setStoreSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
  const { storeValues } = load<typeof import("@/lib/tenancy/sql")>("@/lib/tenancy/sql");
  const { EntitlementError } = load<typeof import("@/lib/tenancy/entitlements")>("@/lib/tenancy/entitlements");
  const { messageOf } = load<typeof import("@/lib/i18n/admin")>("@/lib/i18n/admin");
  const { JOBS } = load<typeof import("@/lib/jobs/registry")>("@/lib/jobs/registry");

  const member = ctx.actor; // the audit actor of connect, verify and disconnect (the routes pass the member's)
  const how = { currency: "MAD", stepUp: "totp" as const };
  const url = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`;
  const sheet = (over: Partial<FakeSheet> = {}) => {
    const id = `1QaBind${randomBytes(12).toString("hex")}`;
    const f: FakeSheet = { rows: [], calls: [], script: [], delayMs: 0, ...over };
    fakes.set(id, f);
    return { id, f };
  };
  const bindingOf = async (spreadsheetId: string) => (await db.select().from(sheetBindings).where(eq(sheetBindings.spreadsheetId, spreadsheetId)).limit(1))[0] ?? null;
  const settingOf = (s: { scope: KitStore["scope"] }) => getStoreSetting(s.scope, "sheets", { fresh: true });
  const audits = (s: { id: string }, action: string) => db.select().from(auditLog).where(and(eq(auditLog.storeId, s.id), eq(auditLog.action, action)));
  const statusOf = async (s: { id: string }) => {
    const [r] = await db.select().from(integrationStatus).where(and(eq(integrationStatus.storeId, s.id), eq(integrationStatus.kind, "sheets"))).limit(1);
    return r ? [r.state, r.lastErrorCode] : null;
  };
  /** what a call threw, as the route maps it */
  const errOf = (p: Promise<unknown>) =>
    p.then(
      () => "resolved",
      (e: unknown) =>
        e instanceof config.SheetBindingConflict
          ? `conflict:${e.message}`
          : e instanceof connect.SheetsProofError
            ? e.code
            : e instanceof EntitlementError
              ? "feature_off"
              : e instanceof SheetsError
                ? `google:${e.status}`
                : `other:${e instanceof Error ? e.message : String(e)}`,
    );
  const start = async (s: KitStore, spreadsheetId: string) => {
    const r = await connect.startSheetConnect(s.scope, url(spreadsheetId), member, how);
    return r.kind === "proof" ? r.code : "";
  };

  /* ---------------- 8.1 the ownership proof (OPE-§19.3, TENANCY-MAP §7.7, SHT-09) ---------------- */
  await fresh();
  const P1 = await sheetStore("bp-p1");
  const P2 = await sheetStore("bp-p2");
  const p1Order = await order(P1, { sheetStatus: "synced", sheetLabel: "new" }, "new");
  const X = sheet({ title: "Ventes" });
  const s1 = await connect.startSheetConnect(P1.scope, url(X.id), member, how);
  const code1 = s1.kind === "proof" ? s1.code : "";
  const pending1 = (await settingOf(P1)).pending;
  ok(
    "proof: a spreadsheet nobody holds answers a one-time code (SG- + 10 Crockford), kept as its hash for 24 h, before any Google call",
    s1.kind === "proof" && /^SG-[0-9A-HJKMNP-TV-Z]{10}$/.test(code1) && pending1?.codeHash === proofHash(code1) && pending1.spreadsheetId === X.id && !JSON.stringify(pending1).includes(code1) && X.f.calls.length === 0,
    { s1, pending1 },
  );
  eq2("proof: no code anywhere → code_missing, after one metadata read of the titles (no cell)", [await errOf(connect.verifySheetConnect(P1.scope, member, how)), X.f.calls.map((c) => c.kind), X.f.calls[0]?.query], ["code_missing", ["meta"], "fields=properties(title),sheets(properties(title))"]);
  X.f.rows.push(["CMD-AAAA0001", "", "Nouvelle", `Rue 4, ${code1}`]);
  eq2("proof: the code planted in a cell (a shopper's address) is never found", await errOf(connect.verifySheetConnect(P1.scope, member, how)), "code_missing");
  X.f.tabs = [
    { sheetId: 0, title: "Commandes" },
    { sheetId: 7, title: `  ${code1.toLowerCase()} ` },
  ];
  const v1 = await connect.verifySheetConnect(P1.scope, member, how);
  const b1 = await bindingOf(X.id);
  const set1 = await settingOf(P1);
  eq2(
    "proof: the code in a tab title (any case, padded) → the binding (code), the orders tab set up, enabled with the pull on, the proof cleared",
    [b1?.storeId === P1.id, b1?.method, v1.sheet.spreadsheetId, set1.enabled, set1.pull, set1.pending, X.f.calls.map((c) => c.kind).filter((x) => x === "meta").length >= 2],
    [true, "code", X.id, true, true, null, true],
  );
  eq2("proof: moving to the new spreadsheet releases the previous one", await bindingOf(P1.spreadsheetId), null);
  const connected1 = (await audits(P1, "integrations.sheets.connected")).map((r) => r.meta);
  eq2("proof: audit integrations.sheets.connected with meta.stepUp (§F.5)", connected1, [{ created: v1.result.created, proof: true, stepUp: "totp" }]);
  ok("proof: the Sheets screen's 'connected' means a setting and its binding", await connect.sheetConnected(P1.scope));
  // the tab the verify created, as Google lists it from now on
  if (!X.f.tabs.some((t) => t.sheetId === v1.result.sheetId)) X.f.tabs.push({ sheetId: v1.result.sheetId, title: v1.result.sheetTitle });

  const xCalls = X.f.calls.length;
  const refusedStart = await errOf(connect.startSheetConnect(P2.scope, url(X.id), member, how));
  const refusedGid = await errOf(connect.startSheetConnect(P2.scope, `https://docs.google.com/spreadsheets/d/${X.id}/edit#gid=7`, member, how));
  eq2(
    "proof: a spreadsheet another store holds → the one generic refusal (any tab of it), no Google call, nothing saved, the holder untouched",
    [refusedStart, refusedGid, X.f.calls.length - xCalls, (await settingOf(P2)).pending, (await bindingOf(X.id))?.storeId === P1.id, (await settingOf(P2)).spreadsheetId === P2.spreadsheetId],
    [`conflict:${GENERIC_REFUSAL}`, `conflict:${GENERIC_REFUSAL}`, 0, null, true, true],
  );
  eq2("proof: the refusal's screen text (en) is the brief's sentence; ar and fr exist", [messageOf("int.sheets.refused", "en"), !!messageOf("int.sheets.refused", "ar"), !!messageOf("int.sheets.refused", "fr")], [GENERIC_REFUSAL, true, true]);

  const re = await connect.startSheetConnect(P1.scope, url(X.id), member, how);
  eq2(
    "proof: the store's own spreadsheet reconnects without a proof (its tab reused, the binding kept)",
    [re.kind, re.kind === "connected" ? re.result.created : null, (await settingOf(P1)).pending, (await bindingOf(X.id))?.method, (await audits(P1, "integrations.sheets.connected")).at(-1)?.meta],
    ["connected", false, null, "code", { created: false, proof: false, stepUp: "totp" }],
  );

  // two stores proving the same spreadsheet at the same moment: the primary key decides
  const P3 = await sheetStore("bp-p3");
  const P4 = await sheetStore("bp-p4");
  const Y = sheet();
  const c3 = await start(P3, Y.id);
  const c4 = await start(P4, Y.id);
  Y.f.title = `Ventes ${c3} ${c4}`;
  const race = await Promise.allSettled([connect.verifySheetConnect(P3.scope, member, how), connect.verifySheetConnect(P4.scope, member, how)]);
  const won = race.map((r) => r.status === "fulfilled");
  const lost = race.map((r) => r.status === "rejected" && r.reason instanceof config.SheetBindingConflict);
  const winner = won[0] ? P3 : P4;
  const loser = won[0] ? P4 : P3;
  eq2(
    "proof: a duplicate-key race of two verifies → one binding, the other the generic refusal with its proof dropped and its own sheet kept",
    [won.filter(Boolean).length, lost.filter(Boolean).length, (await bindingOf(Y.id))?.storeId === winner.id, (await settingOf(loser)).pending, (await settingOf(loser)).spreadsheetId === loser.spreadsheetId, await config.sheetBound(loser.scope, loser.spreadsheetId)],
    [1, 1, true, null, true, true],
  );

  // Google refusing the setup (not shared as Editor): the binding this verify created is given back
  const P5 = await sheetStore("bp-p5");
  const Z = sheet();
  const c5 = await start(P5, Z.id);
  Z.f.title = `Boutique ${c5}`;
  Z.f.script = [0, 403];
  eq2(
    "proof: a 403 while setting the tab up → no binding left, the proof still pending, the store's sheet unchanged",
    [await errOf(connect.verifySheetConnect(P5.scope, member, how)), await bindingOf(Z.id), !!(await config.pendingProof(P5.scope)), (await settingOf(P5)).spreadsheetId === P5.spreadsheetId],
    ["google:403", null, true, true],
  );
  const v5 = await connect.verifySheetConnect(P5.scope, member, how);
  eq2("proof: the retry once shared connects", [v5.sheet.spreadsheetId, (await bindingOf(Z.id))?.storeId === P5.id], [Z.id, true]);
  await config.savePendingProof(P5.scope, { spreadsheetId: Y.id, sheetId: null, codeHash: proofHash("SG-0000000000"), expiresAt: new Date(Date.now() - MIN).toISOString() }, actor);
  eq2("proof: an expired proof → no_proof", await errOf(connect.verifySheetConnect(P5.scope, member, how)), "no_proof");

  // the feature gate: a pending store (and the kill switch) starts nothing
  const PP = await sheetStore("bp-p6", { status: "pending" });
  eq2("proof: feature sheets off (a pending store) → start and verify refused", [await errOf(connect.startSheetConnect(PP.scope, url(sheet().id), member, how)), await errOf(connect.verifySheetConnect(PP.scope, member, how))], ["feature_off", "feature_off"]);

  // disconnect: the binding goes, the orders keep their sheet status, another store may prove the spreadsheet next
  const dc = await connect.disconnectSheet(P1.scope, member, { stepUp: "totp" });
  const set1b = await settingOf(P1);
  eq2(
    "disconnect: the binding deleted, sheets = { enabled: false }, the status row off, audited; the orders keep sheet_status",
    [dc, await bindingOf(X.id), set1b.enabled, set1b.spreadsheetId ?? null, (await rowOf(P1, p1Order)).sheetStatus, await statusOf(P1), (await audits(P1, "integrations.sheets.disconnected")).map((r) => r.meta)],
    [true, null, false, null, "synced", ["off", null], [{ stepUp: "totp" }]],
  );
  eq2("disconnect: nothing connected → false, no second audit row", [await connect.disconnectSheet(P1.scope, member), (await audits(P1, "integrations.sheets.disconnected")).length, await connect.sheetConnected(P1.scope)], [false, 1, false]);
  eq2("disconnect: the freed spreadsheet answers another store a code", (await connect.startSheetConnect(P2.scope, url(X.id), member, how)).kind, "proof");
  await config.savePendingProof(P2.scope, null, actor);
  await pause(P2, P3, P4, P5);

  /* ---------------- 8.2 the legacy bindings (OPE-§19.2, OPE-§J sheets.bind_legacy) ---------------- */
  await fresh();
  await legacy.resetLegacyPass();
  push.forgetLegacyAttempts();
  /** a store connected before 0005: its setting names a spreadsheet, no binding row */
  const legacyStore = async (handle: string, spreadsheetId: string, connectedAt: number | null): Promise<KitStore> => {
    const id = newId();
    await db.insert(stores).values({ id, handle, name: `Store ${handle}`, status: "active", brandSeed: "0123456789abcdef" });
    const scope = systemScope(ctx, id);
    await setStoreSetting(
      scope,
      "sheets",
      { url: url(spreadsheetId), spreadsheetId, sheetId: 0, sheetTitle: "Commandes", enabled: true, pull: false, pending: null, ...(connectedAt === null ? {} : { connectedAt: new Date(connectedAt).toISOString() }) },
      actor,
    );
    return { id, scope, spreadsheetId, fake: fakes.get(spreadsheetId)! };
  };
  const T0 = Date.now() - 600 * MIN;
  const SL = sheet();
  const L1 = await legacyStore("bp-l1", SL.id, T0);
  const l1o = await order(L1, { sheetStatus: "pending" });
  const rl1 = await push.pushStore(L1.scope, { maxCalls: 3, trigger: "tick" });
  eq2(
    "legacy: the push binds a free pre-0005 sheet on the spot (legacy) and syncs in the same run",
    [rl1.skipped, rl1.appended, (await bindingOf(SL.id))?.storeId === L1.id, (await bindingOf(SL.id))?.method, (await rowOf(L1, l1o)).sheetStatus],
    [null, 1, true, "legacy", "synced"],
  );
  eq2("legacy: ensureLegacyBinding is idempotent (already), a store without a sheet → none", [await legacy.ensureLegacyBinding(L1.scope), await legacy.ensureLegacyBinding(P1.scope)], ["already", "none"]);

  // Z: two stores on one spreadsheet; the later one's push binds it first (provisional until the pass)
  const SZ = sheet();
  const L2 = await legacyStore("bp-l2", SZ.id, T0 + 20 * MIN);
  const L3 = await legacyStore("bp-l3", SZ.id, T0 + 10 * MIN);
  const l2o = await order(L2, { sheetStatus: "pending" });
  const l3o = await order(L3, { sheetStatus: "pending" });
  const rl2 = await push.pushStore(L2.scope, { maxCalls: 3, trigger: "tick" });
  const zCalls = SZ.f.calls.length;
  const rl3 = await push.pushStore(L3.scope, { maxCalls: 3, trigger: "tick" });
  eq2(
    "legacy: before the pass, a shared spreadsheet goes to the first push; the other store is not connected and calls nothing",
    [rl2.appended, (await bindingOf(SZ.id))?.storeId === L2.id, rl3.skipped, SZ.f.calls.length - zCalls, await legacy.ensureLegacyBinding(L3.scope)],
    [1, true, "unbound", 0, "taken"],
  );
  // W: a code proof another store's earlier setting also names; V: the single-tenant sheet and a later legacy holder
  const L4 = await sheetStore("bp-l4");
  const L5 = await legacyStore("bp-l5", L4.spreadsheetId, null);
  const SV = sheet();
  const L6 = await legacyStore("bp-l6", SV.id, null);
  const L7 = await legacyStore("bp-l7", SV.id, T0 + 30 * MIN);
  await db.insert(sheetBindings).values({ spreadsheetId: SV.id, storeId: L7.id, method: "legacy", verifiedAt: new Date() });

  const first = await legacy.runBindLegacyTick(ctx, { budgetMs: 1, pageSize: 3 });
  ok("legacy: a tick whose budget is spent still reads one store (the pass never stalls)", first.visited >= 1 && !first.done, first);
  const ticks = [first];
  for (let i = 0; i < 400 && !ticks.at(-1)!.done; i++) ticks.push(await legacy.runBindLegacyTick(ctx, { budgetMs: 50 }));
  const end = ticks.at(-1)!;
  const slowest = Math.max(...ticks.slice(1).map((t) => t.ms));
  ok("legacy: the pass ends, in ticks of ≤ 50 ms (+ one store's reads of slack on a shared machine)", end.done && slowest <= 150, { ticks: ticks.length, slowest });
  ok("legacy: the pass's counts (counts only)", end.bound >= 2 && end.moved >= 1 && end.conflicts >= 3 && Object.keys(end).every((key) => ["done", "visited", "bound", "moved", "conflicts", "ms"].includes(key)), end);
  const pausedOf = async (s: KitStore) => [(await settingOf(s)).enabled, (await settingOf(s)).spreadsheetId === s.spreadsheetId, await statusOf(s)];
  const PAUSED = [false, true, ["off", "binding_conflict"]];
  eq2(
    "legacy: the earliest connectedAt keeps a shared spreadsheet; the later store's provisional binding moves, its sheet paused with binding_conflict (coordinates kept)",
    [(await bindingOf(SZ.id))?.storeId === L3.id, (await bindingOf(SZ.id))?.method, await pausedOf(L2)],
    [true, "legacy", PAUSED],
  );
  eq2("legacy: a code proof is never moved, even by an earlier setting", [(await bindingOf(L4.spreadsheetId))?.storeId === L4.id, (await bindingOf(L4.spreadsheetId))?.method, await pausedOf(L5), (await settingOf(L4)).enabled], [true, "code", PAUSED, true]);
  eq2("legacy: a setting with no connectedAt (the single-tenant sheet) reads as the earliest; the later legacy holder gives it up", [(await bindingOf(SV.id))?.storeId === L6.id, await pausedOf(L7)], [true, PAUSED]);
  eq2("legacy: a lone pre-0005 sheet keeps its binding", (await bindingOf(SL.id))?.storeId === L1.id, true);
  const tick2 = await legacy.runBindLegacyTick(ctx, { budgetMs: 50 });
  eq2("legacy: once done, a tick is a no-op", [tick2.done, tick2.visited, (await legacy.legacyPassState()).done], [true, 0, true]);

  const bindingsSnap = async () => JSON.stringify(await db.select({ id: sheetBindings.spreadsheetId, s: sheetBindings.storeId, m: sheetBindings.method }).from(sheetBindings).orderBy(sheetBindings.spreadsheetId));
  const beforeAgain = await bindingsSnap();
  await legacy.resetLegacyPass();
  let again = await legacy.runBindLegacyTick(ctx, { budgetMs: 5_000 });
  for (let i = 0; i < 50 && !again.done; i++) again = await legacy.runBindLegacyTick(ctx, { budgetMs: 5_000 });
  eq2("legacy: a second pass changes no binding (idempotent: the marker is the rows)", [again.done, again.bound, again.moved, (await bindingsSnap()) === beforeAgain], [true, 0, 0, true]);

  push.forgetLegacyAttempts();
  await nextTick();
  const rl3b = await push.pushStore(L3.scope, { maxCalls: 3, trigger: "tick" });
  const rl2b = await push.pushStore(L2.scope, { maxCalls: 3, trigger: "tick" });
  eq2("legacy: after the pass the keeper syncs; the paused store makes no call", [rl3b.appended, (await rowOf(L3, l3o)).sheetStatus, rl2b.skipped, (await rowOf(L2, l2o)).sheetStatus], [1, "synced", "disabled", "synced"]);
  const L9 = await legacyStore("bp-l9", L4.spreadsheetId, T0);
  eq2("legacy: once the pass is done, a store naming a held spreadsheet is a conflict at once", [await legacy.ensureLegacyBinding(L9.scope), await pausedOf(L9)], ["conflict", PAUSED]);
  ok("legacy: a paused store is 'not connected' on the Sheets screen", !(await connect.sheetConnected(L2.scope)) && (await connect.sheetConnected(L3.scope)));
  const pj = JOBS.find((j) => j.name === "sheets.pull");
  const bj = JOBS.find((j) => j.name === "sheets.bind_legacy");
  eq2("jobs: sheets.pull every tick, 12 s, active stores; sheets.bind_legacy every tick, 50 ms", [pj?.every, pj?.budgetMs, pj?.perStore?.states, bj?.every, bj?.budgetMs], ["tick", 12_000, ["active", "restricted"], "tick", 50]);
  await pause(L1, L3, L4);

  /* ---------------- 8.3 the pull (OPE-§19.6, OD2, OD5, OD54, OD55) ---------------- */
  await fresh();
  type ApplyFn = import("@/lib/sheets/pull").PullDeps["applyExternalStatus"];
  type EventFn = import("@/lib/sheets/pull").PullDeps["appendOrderEvent"];
  const applyCalls: { store: string; id: string; ext: unknown; src: unknown }[] = [];
  const eventCalls: { store: string; id: string; e: unknown }[] = [];
  /** orderId → the answer P4 would give (an implied path, a noop, a refusal); else the move below */
  const scripted = new Map<string, unknown>();
  const own = (scope: { storeId: string }, id: string) => and(eq(orders.storeId, scope.storeId), eq(orders.id, id));
  // P4's two calls reduced to what the pull reads back (the real moves are P4's test:ops-db, proven at the R1 integration)
  const spyApply = (async (scope, id, ext, src) => {
    applyCalls.push({ store: scope.storeId, id, ext: { ...ext }, src: { ...src } });
    const answer = scripted.get(id);
    if (answer) return answer as never;
    const [o] = await db.select({ rev: orders.rev, confirm: orders.confirmState, ship: orders.shipState, status: orders.status }).from(orders).where(own(scope, id)).limit(1);
    if (!o) return { ok: false, error: "not_found" } as never;
    const confirm = ext.legacy === "confirmed" || ext.ship ? "confirmed" : o.confirm;
    const ship = ext.ship ?? o.ship;
    const status = ext.legacy ?? (ext.ship ? "confirmed" : (o.status as OStatus));
    await db.update(orders).set({ confirmState: confirm, shipState: ship, status, rev: o.rev + 1, sheetDirty: sql`${orders.sheetDirty} | 1` }).where(own(scope, id));
    return { ok: true, changed: true, rev: o.rev + 1, status, states: { confirm, ship, money: "none" }, eventIds: [] } as never;
  }) as ApplyFn;
  const spyEvent = (async (scope, id, e) => {
    eventCalls.push({ store: scope.storeId, id, e: JSON.parse(JSON.stringify(e)) });
    const [o] = await db.select({ id: orders.id }).from(orders).where(own(scope, id)).limit(1);
    if (!o) return { ok: false, error: "not_found" };
    const [res] = await db.insert(orderEvents).values(storeValues(scope, { orderId: id, actorKind: e.actorKind, type: e.type, note: e.note ?? null, meta: e.meta ?? null }));
    return { ok: true, id: Number(res.insertId) };
  }) as EventFn;
  pull.setPullDoubleForTests({ applyExternalStatus: spyApply, appendOrderEvent: spyEvent });

  const L = (s: OStatus) => statusLabel(s);
  const KARIM = newId();
  const QUEUE_MEMBER = newId();
  const Q = await sheetStore("bp-q1");
  Q.fake.header = ["Agent", "Note agent", "Tracking", "Transporteur"];
  await setStoreSetting(Q.scope, "ops", { ...(await getStoreSetting(Q.scope, "ops")), agentLabels: { Karim: KARIM } }, actor);
  /** a synced order of `s` whose row shows `label` (its `sheet_label` recorded unless `over` says otherwise) */
  const synced = (s: KitStore, over: Partial<OrderInsert> = {}, label: OStatus = (over.status as OStatus | undefined) ?? "new") => order(s, { sheetStatus: "synced", sheetLabel: label, ...over }, label);
  const rowNo = (s: KitStore, id: string) => s.fake.rows.findIndex((r) => r?.[0] === id) + 2;
  const cells = (s: KitStore, id: string, c: { label?: string; agent?: string; note?: string; tracking?: string; carrier?: string }) => {
    const row = s.fake.rows.find((r) => r?.[0] === id)!;
    for (let i = row.length; i <= OPT.carrier; i++) row[i] = "";
    if (c.label !== undefined) row[2] = c.label;
    for (const key of ["agent", "note", "tracking", "carrier"] as const) if (c[key] !== undefined) row[OPT[key]] = c[key];
  };
  const confirmed = { status: "confirmed", confirmState: "confirmed" } as const;
  const q1 = await synced(Q);
  const q2 = await synced(Q);
  const q3 = await synced(Q);
  const q4 = await synced(Q);
  const q5 = await synced(Q, { isTest: true });
  const q7a = await synced(Q);
  const q7b = await synced(Q);
  const q8 = await synced(Q, { ...confirmed, sheetLabel: null });
  const q9 = await synced(Q, { ...confirmed });
  const q10 = await synced(Q, { ...confirmed, confirmedBy: QUEUE_MEMBER });
  const q11 = await synced(Q);
  const q12 = await synced(Q, { ...confirmed });
  const q13 = await synced(Q);
  const R = await sheetStore("bp-r1");
  const rA = await synced(R);

  // run 0: no work, the pull is due → one read (the header is learnt); a row synced before sheet_label gets its label
  const r0 = await push.pushStore(Q.scope, { maxCalls: 3, trigger: "tick" });
  eq2(
    "pull: a store with no push work but a due pull → one read; the cell showing the app's status records sheet_label (no move)",
    [kinds(Q), r0.pulled, r0.seen, (await rowOf(Q, q8)).sheetLabel, applyCalls.length],
    [["read"], 1, Q.fake.rows.length, "confirmed", 0],
  );

  cells(Q, q1, { label: L("confirmed"), agent: "Samira" });
  cells(Q, q2, { label: L("delivered") });
  scripted.set(q2, { ok: true, changed: true, rev: 1, status: "confirmed", states: { confirm: "confirmed", ship: "none", money: "none" }, eventIds: [] });
  cells(Q, q3, { label: L("cancelled") });
  scripted.set(q3, { ok: true, changed: false, noop: true });
  cells(Q, q4, { label: L("returned") });
  scripted.set(q4, { ok: false, error: "illegal" });
  cells(Q, q5, { label: L("confirmed") });
  Q.fake.rows.push([rA, "", L("cancelled"), "", "", "", "", "", "", "", "", "", "", "Samira", "R-CANARY note", "R-TRK", "R-Carrier"]);
  cells(Q, q7a, { label: "" });
  cells(Q, q7b, { label: "Bof" });
  cells(Q, q9, { agent: " karim " });
  cells(Q, q10, { agent: "Samira" });
  cells(Q, q11, { note: "Livrer samedi matin", agent: "Samira" });
  cells(Q, q12, { tracking: "TRK-123" });
  cells(Q, q13, { carrier: "Amana" });
  const q14 = await synced(Q, { sheetDirty: 2, trackingRef: "APP-1" });
  cells(Q, q14, { tracking: "OLD" });
  const rA0 = JSON.stringify(await rowOf(R, rA));
  const calls0 = Q.fake.calls.length;
  await nextTick();
  const r1 = await push.pushStore(Q.scope, { maxCalls: 3, trigger: "tick" });
  const ref = (id: string) => `row:${rowNo(Q, id)}`;
  eq2(
    "pull: the status cells first, then the tracking: applyExternalStatus(scope, id, { legacy }, { kind: sheet, ref: row:<n>, agentLabel }) per changed cell",
    applyCalls.map((c) => [c.store === Q.id, c.id, c.ext, c.src]),
    [
      [true, q1, { legacy: "confirmed" }, { kind: "sheet", ref: ref(q1), agentLabel: "Samira" }],
      [true, q2, { legacy: "delivered" }, { kind: "sheet", ref: ref(q2) }],
      [true, q3, { legacy: "cancelled" }, { kind: "sheet", ref: ref(q3) }],
      [true, q4, { legacy: "returned" }, { kind: "sheet", ref: ref(q4) }],
      [true, q12, { ship: "packed" }, { kind: "sheet", ref: ref(q12) }],
    ],
  );
  eq2("pull: one read (A2:Q with the optional columns) and the batchUpdate of the run's own dirty row", [kinds(Q, calls0), Q.fake.calls[calls0]?.query.includes("!A2:Q")], [["read", "update"], true]);
  const o = async (id: string) => {
    const r = await rowOf(Q, id);
    return { label: r.sheetLabel, dirty: r.sheetDirty, status: r.status, by: r.confirmedBy, byLabel: r.confirmedByLabel, tracking: r.trackingRef, carrier: r.carrierLabel, ship: r.shipState };
  };
  const q1r = await o(q1);
  eq2("pull: a confirmation applied as the cell said → sheet_label = label, the status bit cleared (same rev), the unmapped Agent → confirmed_by_label", [q1r.label, q1r.dirty, q1r.status, q1r.by, q1r.byLabel], ["confirmed", 0, "confirmed", null, "Samira"]);
  eq2(
    "pull: an implied path, a noop and a refusal → sheet_label = label and sheet_dirty |= 1 (the app's label goes back, OD5)",
    [await o(q2), await o(q3), await o(q4)].map((r) => [r.label, r.dirty & 1, r.status]),
    [
      ["delivered", 1, "new"],
      ["cancelled", 1, "new"],
      ["returned", 1, "new"],
    ],
  );
  eq2("pull: a test order is never moved; blank and unknown labels are skipped", [(await o(q5)).label, (await o(q5)).status, (await o(q7a)).label, (await o(q7b)).label], ["new", "new", "new", "new"]);
  eq2("pull: another store's order typed into this sheet is ignored (SHT-05): no call, no write", [applyCalls.some((c) => c.id === rA) || eventCalls.some((c) => c.id === rA), JSON.stringify(await rowOf(R, rA)) === rA0], [false, true]);
  const q9r = await o(q9);
  const q10r = await o(q10);
  eq2("pull: Agent on a confirmed order nobody credited → the mapped member (folded label) and the label; a queue confirmation is never re-attributed", [q9r.by === KARIM, q9r.byLabel, q10r.by === QUEUE_MEMBER, q10r.byLabel], [true, "karim", true, null]);
  const noteCall = eventCalls.find((c) => c.id === q11)?.e as { actorKind: string; type: string; note: string; meta: { cellHash: string; agentLabel: string } } | undefined;
  eq2(
    "pull: Note agent → a note event (actor sheet, the cell text, meta.agentLabel and the 16-hex cellHash)",
    [noteCall?.actorKind, noteCall?.type, noteCall?.note, noteCall?.meta.agentLabel, /^[0-9a-f]{16}$/.test(noteCall?.meta.cellHash ?? "")],
    ["sheet", "note", "Livrer samedi matin", "Samira", true],
  );
  const trackCall = eventCalls.find((c) => c.id === q12)?.e;
  const q12r = await o(q12);
  eq2("pull: Tracking pre-ship → the packed move, a tracking_set event, tracking_ref", [q12r.ship, q12r.tracking, trackCall], ["packed", "TRK-123", { actorKind: "sheet", type: "tracking_set", meta: { trackingRef: "TRK-123" } }]);
  eq2("pull: Transporteur → carrier_label", (await o(q13)).carrier, "Amana");
  eq2("pull: a text cell of an order whose own value is still on its way (bit 2) is not pulled; the push writes the app's value", [(await o(q14)).tracking, Q.fake.rows[rowNo(Q, q14) - 2]?.[OPT.tracking]], ["APP-1", "APP-1"]);
  eq2("pull: the run's counts (orders changed: q1, q2, q9, q11, q12, q13)", [r1.pulled, r1.pullDeferred, r1.seen, r1.ok], [6, 0, Q.fake.rows.length, true]);

  // run 2: nothing new in the sheet → no call to P4, the note deduped by its cellHash, the write-backs land
  await nextTick();
  const before2 = [applyCalls.length, eventCalls.length];
  const r2 = await push.pushStore(Q.scope, { maxCalls: 3, trigger: "tick" });
  eq2(
    "pull: the same sheet again → no move, no second note (cellHash), and the app's label written back to the refused cells",
    [applyCalls.length - before2[0]!, eventCalls.length - before2[1]!, r2.pulled, [q2, q3, q4].map((id) => Q.fake.rows[rowNo(Q, id) - 2]?.[2]), (await o(q2)).dirty],
    [0, 0, 0, [L("new"), L("new"), L("new")], 0],
  );

  // run 3: a cleared Tracking never clears tracking_ref; an Agent edited later on an attributed order updates the label
  cells(Q, q12, { tracking: "" });
  cells(Q, q1, { agent: "Nadia" });
  await nextTick();
  await push.pushStore(Q.scope, { maxCalls: 3, trigger: "tick" });
  eq2("pull: a cleared Tracking keeps tracking_ref; a later Agent cell relabels while nobody is credited", [(await o(q12)).tracking, (await o(q1)).byLabel, (await o(q1)).by], ["TRK-123", "Nadia", null]);

  // run 4: P4's P0 stubs throw "not implemented" → the status cell takes the R1.0 path, the rest waits in the sheet
  pull.setPullDoubleForTests(null);
  const q15 = await synced(Q);
  const q16 = await synced(Q);
  const q17 = await synced(Q, { ...confirmed });
  cells(Q, q15, { label: L("confirmed") });
  cells(Q, q16, { note: "Appeler après 18h" });
  cells(Q, q17, { tracking: "TRK-9" });
  await nextTick();
  const r4 = await push.pushStore(Q.scope, { maxCalls: 3, trigger: "tick" });
  const ev16 = await db.select().from(orderEvents).where(and(eq(orderEvents.storeId, Q.id), eq(orderEvents.orderId, q16)));
  eq2(
    "pull: P4's stubs not merged yet → the status cell applied as R1.0 did (status and sheet_label); the note and the tracking deferred, nothing logged as an error",
    [(await o(q15)).status, (await o(q15)).label, ev16.length, (await o(q17)).tracking, r4.pullDeferred, r4.ok],
    ["confirmed", "confirmed", 0, null, 2, true],
  );
  pull.setPullDoubleForTests({ applyExternalStatus: spyApply, appendOrderEvent: spyEvent });

  // the window: one full pull per store per 290 s; "Bring status changes back" off reads nothing
  const q18 = await order(Q, { sheetStatus: "pending" });
  const callsW = Q.fake.calls.length;
  const rW = await push.pushStore(Q.scope, { maxCalls: 3, trigger: "tick" });
  eq2("pull: inside the 290 s window a push with appends only makes no read (the header is known)", [kinds(Q, callsW), rW.seen, rW.pulled, (await rowOf(Q, q18)).sheetStatus], [["append"], 0, 0, "synced"]);
  const throttled = await sync.pullStatuses(Q.scope);
  const forced = await sync.pullStatuses(Q.scope, { force: true });
  eq2("pullStatuses (R1.0 facade): throttled inside the window, a forced pull reads once", [throttled.status, forced.status, forced.seen, kinds(Q, callsW + 1)], ["throttled", "ok", Q.fake.rows.length, ["read"]]);
  const Qoff = await sheetStore("bp-q2", { pull: false });
  const qo = await synced(Qoff);
  cells(Qoff, qo, { label: L("cancelled") });
  await order(Qoff, { sheetStatus: "pending" });
  const offPull = await sync.pullStatuses(Qoff.scope, { force: true });
  const applyOff = applyCalls.length;
  const offRun = await push.pushStore(Qoff.scope, { maxCalls: 3, trigger: "tick" });
  eq2(
    "pull: 'Bring status changes back' off → pullStatuses reads nothing; the push appends and never moves a status",
    [offPull, offRun.appended, applyCalls.length - applyOff, (await rowOf(Qoff, qo)).sheetLabel, Qoff.fake.calls.some((c) => c.kind === "read" && c.query.includes("!A2:"))],
    [{ status: "ok", seen: 0, updated: 0 }, 1, 0, "new", false],
  );

  // the sheets.pull job: the store whose window is open and had no push work; every other store was pulled a moment ago
  await fresh();
  const Q3 = await sheetStore("bp-q3");
  const q3o = await synced(Q3);
  cells(Q3, q3o, { label: L("confirmed") });
  await db.execute(sql`INSERT INTO rate_limits (bucket, count, reset_at)
    SELECT CONCAT('s:', id, ':sheets:pull'), 1, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 290 SECOND) FROM stores WHERE id <> ${Q3.id}
    ON DUPLICATE KEY UPDATE count = 1, reset_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 290 SECOND)`);
  const callsBefore = new Map([...fakes].map(([id, f]) => [id, f.calls.length]));
  const jobCtx = {
    ...systemCtx("sheets.pull"),
    deadline: Date.now() + 12_000,
    tickId: "qa-tick",
    cursor: "",
    setCursor: async () => undefined,
    yield: async () => new Promise<void>((r) => setImmediate(r)),
    lagMs: () => 0,
  };
  const jr = await pj!.run(jobCtx);
  const others = [...fakes].filter(([id, f]) => id !== Q3.spreadsheetId && f.calls.length !== callsBefore.get(id)).length;
  eq2(
    "job: sheets.pull reads the one store whose window is open (1 call) and applies its cell; no other store is called",
    [jr.done, jr.summary?.read, jr.summary?.pulled, kinds(Q3), others, (await rowOf(Q3, q3o)).sheetLabel, applyCalls.at(-1)?.id === q3o],
    [true, 1, 1, ["read"], 0, "confirmed", true],
  );
  ok("job: the pull summary carries counts and codes only", !JSON.stringify(jr).includes(PHONE) && !JSON.stringify(jr).includes(NAME) && !JSON.stringify(jr).includes(q3o), jr);
  const runsQ3 = await history.sheetsRunHistory(Q3.scope);
  const runsQ = await history.sheetsRunHistory(Q.scope);
  eq2("history: the pull run is recorded (trigger pull, its counts); a store keeps its last 20 runs at most", [runsQ3.some((r) => r.trigger === "pull" && r.pulled === 1 && r.calls === 1), runsQ.length <= history.RUN_HISTORY_MAX, runsQ.some((r) => r.pulled === 6)], [true, true, true]);

  await nextTick();
  pull.setPullDoubleForTests(null);
  await pause(Q, R, Qoff, Q3);
}

/* ================================================================== */
/* 8. server ad events (IN-02, IN-03, SF-05; OPE-§20.4, §20.9, §28.2)  */
/* ================================================================== */

async function capiSuite(): Promise<void> {
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const { auditLog, flags, integrationStatus, notifications, orders, outbox, pages, pageVersions, stores } = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { newId, newOrderId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const { systemCtx, systemScope } = load<typeof import("@/lib/jobs/scope")>("@/lib/jobs/scope");
  const conversions = load<typeof import("@/lib/orders/conversions")>("@/lib/orders/conversions");
  const core = load<typeof import("@/lib/orders/conversions-core")>("@/lib/orders/conversions-core");
  const handler = load<typeof import("@/lib/jobs/handlers/capi")>("@/lib/jobs/handlers/capi");
  const { outboxHandler } = load<typeof import("@/lib/jobs/outbox")>("@/lib/jobs/outbox");
  const { runOrderHooks } = load<typeof import("@/lib/orders/hooks")>("@/lib/orders/hooks");
  const { setStoreSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
  const status = load<typeof import("@/lib/integrations/status")>("@/lib/integrations/status");
  const { invalidateFlags } = load<typeof import("@/lib/tenancy/entitlements")>("@/lib/tenancy/entitlements");
  const { purchaseInBrowserFor } = load<typeof import("@/lib/render/store-context.server")>("@/lib/render/store-context.server");
  const { getFixture } = load<typeof import("@/lib/page/fixtures")>("@/lib/page/fixtures");
  const { JOBS } = load<typeof import("@/lib/jobs/registry")>("@/lib/jobs/registry");
  type Tx = import("@/lib/orders/hooks").Tx;
  type OutboxItem = import("@/lib/jobs/outbox").OutboxItem;
  type ClaimedItem = import("@/lib/jobs/outbox").ClaimedItem;
  type Conversions = import("@/lib/settings/keys/conversions").ConversionsSetting;
  status.clearStatusCache();

  const META = "333333333333333";
  const META_NOTOKEN = "444444444444444";
  const TT = "CCAPIPIXEL0000000001";
  const TOKEN_A = "EAAG-token-of-store-A-canary";
  const TOKEN_B = "EAAG-token-of-store-B-canary";
  const ctx = systemCtx("qa.integrations_db");

  /* ---------------- two stores, their pages, tokens and settings ---------------- */
  const doc = getFixture("massage").doc;
  async function capiStore(handle: string, token: string) {
    const id = newId();
    await db.insert(stores).values({ id, handle, name: handle, status: "active", brandSeed: "0123456789abcdef" });
    const scope = systemScope(ctx, id);
    const pageId = newId();
    const versionId = newId();
    const pageDoc = { ...doc, tracking: { metaPixelId: [META, META_NOTOKEN], tiktokPixelId: [TT] } };
    await db.insert(pages).values({ id: pageId, storeId: id, slug: `${handle}-p`, name: "P", status: "published", publicKey: `pk-${newId()}`, draft: pageDoc as never, publishedVersionId: versionId });
    await db.insert(pageVersions).values({ id: versionId, storeId: id, pageId, kind: "publish", doc: pageDoc as never, checksum: "0".repeat(64) });
    await setStoreSetting(scope, "tracking_secrets", { metaTokens: { [META]: token }, tiktokTokens: { [TT]: `${token}-tt` } } as never, { kind: "system" } as never);
    return { id, scope, pageId, versionId };
  }
  const SA = await capiStore("capi-a", TOKEN_A);
  const SB = await capiStore("capi-b", TOKEN_B);
  const setConv = (s: typeof SA, v: Partial<Conversions>) => setStoreSetting(s.scope, "conversions", { purchaseTrigger: "order", pageOverrides: {}, customEvents: true, manualOrders: false, ...v } as never, { kind: "system" } as never);

  const ITEMS = { bundleId: "b1", bundleLabel: "1", qty: 1, unitPrice: 349, variants: [] };
  async function capiOrder(s: typeof SA, over: Partial<typeof orders.$inferInsert> = {}): Promise<string> {
    const id = newOrderId();
    await db.insert(orders).values({
      id,
      storeId: s.id,
      pageId: s.pageId,
      versionId: s.versionId,
      name: NAME,
      phone: PHONE,
      productName: "Argan oil",
      items: ITEMS as never,
      qty: 1,
      subtotal: 349,
      shipping: 0,
      total: 349,
      currency: "MAD",
      idem: randomUUID(),
      ...over,
    });
    return id;
  }
  const conversionOf = (s: typeof SA, orderId: string, risk = 10) => ({
    orderId,
    eventId: orderId,
    pageId: s.pageId,
    source: "live" as const,
    time: new Date(),
    value: 349,
    currency: "MAD",
    qty: 1,
    contentId: "SKU-1",
    contentName: "Argan oil",
    customer: { phone: PHONE, email: null, name: NAME, city: "Casablanca", country: "MA" },
    client: { ip: "105.66.1.2", ua: "Mozilla/5.0 qa", fbp: "fb.1.1700000000000.123456789" },
    sourceUrl: "https://shop.example/argan",
    pixels: { meta: [META, META_NOTOKEN], tiktok: [TT] },
    risk,
  });

  /* ---------------- P8's enqueue / drain and P4's timeline as faithful doubles ---------------- */
  const drains: unknown[] = [];
  const renders: { pageIds: readonly string[] | "all-live"; reason: string; priority?: number }[] = [];
  const events: { storeId: string; orderId: string; type: string; meta?: Record<string, unknown> }[] = [];
  let enqueueFails = false;
  const enqueue = async (scope: { storeId: string } | "platform", items: readonly OutboxItem[], opts?: { tx?: Tx }) => {
    if (enqueueFails) throw new Error("qa: the outbox is down");
    const storeId = scope === "platform" ? null : scope.storeId;
    const runner = opts?.tx ?? db;
    let inserted = 0;
    for (const it of items) {
      const [res] = (await runner.execute(
        sql`INSERT IGNORE INTO outbox (id, store_id, kind, topic, target_id, dedupe_key, payload, encrypted, state, attempts, next_at, created_at)
            VALUES (${newId()}, ${storeId}, ${it.kind}, ${it.topic}, ${it.targetId ?? null}, ${it.dedupeKey}, ${JSON.stringify(it.payload)}, ${it.pii ? 1 : 0}, 'pending', 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
      )) as unknown as [{ affectedRows: number }];
      inserted += res.affectedRows;
    }
    return { inserted, duplicates: items.length - inserted };
  };
  conversions.setCapiDoubleForTests({
    enqueue: enqueue as never,
    drainOutbox: async (o) => (drains.push(o), { ms: 0, claimed: 0, done: 0, retried: 0, dead: 0, more: false }),
    enqueueRenders: async (_scope, pageIds, reason, priority) => (renders.push({ pageIds, reason, priority }), { enqueued: pageIds === "all-live" ? 0 : pageIds.length }),
    appendOrderEvent: async (scope, orderId, e) => (events.push({ storeId: scope.storeId, orderId, type: e.type, meta: e.meta }), { ok: true, id: events.length }),
  });
  const rowsOf = async (orderId: string) =>
    db.select({ id: outbox.id, storeId: outbox.storeId, topic: outbox.topic, targetId: outbox.targetId, dedupeKey: outbox.dedupeKey, payload: outbox.payload, state: outbox.state, encrypted: outbox.encrypted }).from(outbox).where(sql`${outbox.dedupeKey} LIKE ${`capi:%:${orderId}:%`}`);
  const ctxOf = async (orderId: string) => (await db.select({ c: orders.capiCtx }).from(orders).where(eq(orders.id, orderId)).limit(1))[0]?.c ?? null;

  /* ---------------- 8.1 creation: trigger order → the Purchase per pixel with a token, drained ---------------- */
  await setConv(SA, { purchaseTrigger: "order", customEvents: false });
  const o1 = await capiOrder(SA);
  const r1 = await conversions.conversionsAtCreation(SA.scope, conversionOf(SA, o1));
  const rows1 = await rowsOf(o1);
  eq2(
    "creation (order): one Purchase per pixel with its own token (the token-less pixel stays browser-only), pii, drained once for the store",
    [r1.enqueued, r1.sealed, rows1.map((r) => [r.topic, r.targetId, r.encrypted]).sort(), drains.length, JSON.stringify(drains[0])],
    [2, false, [["Purchase", `meta:${META}`, true], ["Purchase", `tiktok:${TT}`, true]], 1, JSON.stringify({ storeId: SA.id, kinds: ["capi"], budgetMs: 8000 })],
  );
  ok("creation: the dedupe keys are capi:<platform>:<pixel>:<order>:<event>", rows1.every((r) => r.dedupeKey === `capi:${r.targetId}:${o1}:Purchase`), rows1);
  const again = await conversions.conversionsAtCreation(SA.scope, conversionOf(SA, o1));
  eq2("creation: a repeat (a retried after()) adds no row", [again.enqueued, (await rowsOf(o1)).length], [2, 2]);
  const risky = await capiOrder(SA, { riskScore: 80 });
  eq2("creation: trigger order, risk 80 → no Purchase (OD19)", [(await conversions.conversionsAtCreation(SA.scope, conversionOf(SA, risky, 80))).enqueued, (await rowsOf(risky)).length], [0, 0]);
  const testO = await capiOrder(SA, { isTest: true });
  const rt = await conversions.conversionsAtCreation(SA.scope, conversionOf(SA, testO));
  eq2("creation: a test order sends nothing and seals nothing (OPE-§20.9 (5))", [rt, (await rowsOf(testO)).length, await ctxOf(testO)], [{ enqueued: 0, sealed: false, direct: false }, 0, null]);
  const honey = await capiOrder(SA, { flags: ["honeypot"] });
  eq2("creation: a honeypot row sends nothing", (await conversions.conversionsAtCreation(SA.scope, conversionOf(SA, honey))).enqueued, 0);

  /* ---------------- 8.2 creation: trigger confirmed → sealed, nothing sent; the envelope is the store's ---------------- */
  await setConv(SA, { purchaseTrigger: "confirmed", customEvents: true });
  const o2 = await capiOrder(SA, { riskScore: 85 });
  const r2 = await conversions.conversionsAtCreation(SA.scope, conversionOf(SA, o2, 85));
  const sealed2 = await ctxOf(o2);
  const opened = conversions.openCapiContext(SA.scope, sealed2);
  eq2("creation (confirmed): nothing enqueued, the context sealed", [r2.enqueued, r2.sealed, (await rowsOf(o2)).length, typeof sealed2 === "string" && sealed2.startsWith("v2.")], [0, true, 0, true]);
  eq2("capi_ctx: seal / open round trip (client data, source URL, items hash)", [opened?.client.ip, opened?.client.fbp, opened?.sourceUrl, opened?.itemsHash], ["105.66.1.2", "fb.1.1700000000000.123456789", "https://shop.example/argan", core.itemsHashOf(ITEMS)]);
  ok("capi_ctx: ≤ 8 KB, no phone or name inside the envelope", !!sealed2 && sealed2.length <= 8192 && !sealed2.includes(PHONE));
  eq2("capi_ctx: B's scope never opens A's context", conversions.openCapiContext(SB.scope, sealed2), null);
  const [revRow] = await db.select({ rev: orders.rev }).from(orders).where(eq(orders.id, o2));
  eq2("capi_ctx: sealing does not bump rev", revRow?.rev, 0);

  /* ---------------- 8.3 the int.capi hook on a confirmation, inside the order's transaction ---------------- */
  const snap = (id: string, confirm: string, ship = "none", isTest = false) =>
    ({ id, rev: 1, status: "confirmed", states: { confirm, ship, money: "unpaid" }, isTest, customerId: null, assigneeId: null, cityKey: null, totalCents: 31_900 }) as never;
  const transition = (id: string, moves: { axis: "confirm" | "ship"; from: string; to: string }[], isTest = false) =>
    ({ on: "transition", before: snap(id, "new", "none", isTest), after: snap(id, moves.find((m) => m.axis === "confirm")?.to ?? "confirmed", moves.find((m) => m.axis === "ship")?.to ?? "none", isTest), moves, actor: { kind: "user", userId: null }, source: "ui" }) as never;
  async function confirmInTx(scope: typeof SA.scope, id: string, set: Partial<typeof orders.$inferInsert>, moves: { axis: "confirm" | "ship"; from: string; to: string }[], isTest = false): Promise<string | null> {
    try {
      await db.transaction(async (tx) => {
        await tx.update(orders).set(set).where(and(eq(orders.id, id), eq(orders.storeId, scope.storeId)));
        await runOrderHooks("transition", "inTx", scope, transition(id, moves, isTest), tx);
      });
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }
  const confirmedAt = new Date(Date.now() - 2 * 3_600_000);
  // an agent corrected the total meanwhile: the event carries the current one
  const err3 = await confirmInTx(SA.scope, o2, { confirmState: "confirmed", confirmedAt, total: 319, status: "confirmed" }, [{ axis: "confirm", from: "new", to: "confirmed" }]);
  const rows3 = await rowsOf(o2);
  const pay3 = rows3.map((r) => JSON.parse(r.payload) as import("@/lib/orders/conversions-core").CapiPayload);
  eq2(
    "hook (confirmed): exactly one Purchase per pixel with event_id = order id, risk 85 included (OPE-§20.9 (2), (4))",
    [err3, rows3.map((r) => [r.topic, r.targetId]).sort(), pay3.map((p) => p.eventId), pay3.every((p) => p.eventTime === confirmedAt.toISOString())],
    [null, [["Purchase", `meta:${META}`], ["Purchase", `tiktok:${TT}`]], [o2, o2], true],
  );
  eq2("hook (confirmed): rebuilt from the sealed context with the current total", [pay3[0]?.ctx, pay3[0]?.conversion.value, pay3[0]?.conversion.client.ip], ["sealed", 319, "105.66.1.2"]);
  ok("hook (confirmed): the context is kept while the delivery can still send", (await ctxOf(o2)) !== null);
  const err3b = await confirmInTx(SA.scope, o2, { confirmState: "confirmed" }, [{ axis: "confirm", from: "callback", to: "confirmed" }]);
  eq2("hook: a retried transition adds no row (INSERT IGNORE on the dedupe key)", [err3b, (await rowsOf(o2)).length], [null, 2]);

  /* ---------------- 8.4 delivery: DeliveredOrder (Meta only) and the context nulled in the same transaction ---------------- */
  const deliveredAt = new Date(Date.now() - 3_600_000);
  const err4 = await confirmInTx(SA.scope, o2, { shipState: "delivered", deliveredAt, status: "delivered" }, [{ axis: "ship", from: "in_transit", to: "delivered" }]);
  const rows4 = (await rowsOf(o2)).filter((r) => r.topic === "DeliveredOrder");
  eq2(
    "hook (delivered): the custom event to Meta only, id <order>.d, and capi_ctx nulled",
    [err4, rows4.map((r) => r.targetId), rows4.map((r) => (JSON.parse(r.payload) as { eventId: string }).eventId), await ctxOf(o2)],
    [null, [`meta:${META}`], [`${o2}.d`], null],
  );

  /* ---------------- 8.5 an inTx failure rolls back with no outbox row ---------------- */
  await setConv(SA, { purchaseTrigger: "confirmed", customEvents: false });
  const o5 = await capiOrder(SA);
  await conversions.conversionsAtCreation(SA.scope, conversionOf(SA, o5));
  enqueueFails = true;
  const err5 = await confirmInTx(SA.scope, o5, { confirmState: "confirmed", confirmedAt: new Date(), status: "confirmed" }, [{ axis: "confirm", from: "new", to: "confirmed" }]);
  enqueueFails = false;
  const [st5] = await db.select({ c: orders.confirmState, ctx: orders.capiCtx }).from(orders).where(eq(orders.id, o5));
  eq2("hook: an enqueue failure rolls the confirmation back, with no outbox row and the context kept", [!!err5, st5?.c, (await rowsOf(o5)).length, st5?.ctx !== null], [true, "new", 0, true]);
  // the same confirmation once the outbox is back: trigger confirmed, custom events off → nothing after, so the context goes
  await confirmInTx(SA.scope, o5, { confirmState: "confirmed", confirmedAt: new Date(), status: "confirmed" }, [{ axis: "confirm", from: "new", to: "confirmed" }]);
  eq2("hook: nothing left to send after the confirmation → capi_ctx nulled at once", [(await rowsOf(o5)).length, await ctxOf(o5)], [2, null]);

  /* ---------------- 8.6 a test order returns at once; a refused ship ends the events; a missing context ---------------- */
  const o6 = await capiOrder(SA, { isTest: true, capiCtx: sealed2 });
  await confirmInTx(SA.scope, o6, { confirmState: "confirmed", confirmedAt: new Date() }, [{ axis: "confirm", from: "new", to: "confirmed" }], true);
  eq2("hook: a test order enqueues nothing and keeps its row as it was", [(await rowsOf(o6)).length, await ctxOf(o6)], [0, sealed2]);
  await setConv(SA, { purchaseTrigger: "delivered", customEvents: true });
  const o7 = await capiOrder(SA);
  await conversions.conversionsAtCreation(SA.scope, conversionOf(SA, o7));
  await confirmInTx(SA.scope, o7, { shipState: "refused", status: "refused" }, [{ axis: "ship", from: "in_transit", to: "refused" }]);
  eq2("hook: a refused ship sends nothing and nulls the context (no later moment)", [(await rowsOf(o7)).length, await ctxOf(o7)], [0, null]);
  const o8 = await capiOrder(SA);
  await confirmInTx(SA.scope, o8, { confirmState: "confirmed", confirmedAt: new Date() }, [{ axis: "confirm", from: "new", to: "confirmed" }]);
  const pay8 = (await rowsOf(o8)).map((r) => JSON.parse(r.payload) as import("@/lib/orders/conversions-core").CapiPayload);
  eq2(
    "hook: no context → the server fields only from the order's version, and the payload says so",
    [pay8.map((p) => [p.event, p.ctx, p.conversion.client.ip]), pay8[0]?.conversion.pixels],
    [[["ConfirmedOrder", "missing", null]], { meta: [META, META_NOTOKEN], tiktok: [TT] }],
  );

  /* ---------------- 8.7 typed orders: only with manualOrders ---------------- */
  await setConv(SA, { purchaseTrigger: "order", manualOrders: false });
  const created = async (o: string) => {
    const [row] = await db.select().from(orders).where(eq(orders.id, o));
    await db.transaction(async (tx) => runOrderHooks("created", "inTx", SA.scope, { on: "created", order: row!, conversion: null, target: { pageId: row!.pageId, versionId: row!.versionId, source: row!.source } }, tx));
    return (await rowsOf(o)).length;
  };
  const m1 = await capiOrder(SA, { source: "manual" });
  const pub = await capiOrder(SA);
  eq2("created hook: a manual order without manualOrders sends nothing; a public order is the route's", [await created(m1), await created(pub)], [0, 0]);
  await setConv(SA, { purchaseTrigger: "order", manualOrders: true });
  const m2 = await capiOrder(SA, { source: "whatsapp" });
  eq2("created hook: a WhatsApp order with manualOrders → the Purchase per pixel with a token", await created(m2), 2);

  /* ---------------- 8.8 the handler: done / retry / final, the token, health, the timeline ---------------- */
  const realFetch = globalThis.fetch;
  const calls: { url: string; headers: Headers; body: string }[] = [];
  let answer: () => Response = () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers), body: String(init?.body ?? "") });
    return answer();
  }) as typeof fetch;
  const claimed = (row: { id: string; storeId: string | null; topic: string; targetId: string | null; dedupeKey: string; payload: string }, attempts = 0): ClaimedItem => ({
    id: row.id,
    storeId: row.storeId,
    kind: "capi",
    topic: row.topic,
    targetId: row.targetId,
    dedupeKey: row.dedupeKey,
    payload: JSON.parse(row.payload) as unknown,
    attempts,
    createdAt: new Date(),
  });
  try {
    ok("handler: registered for kind capi (maxPerTick 60, perStorePerTick 20, timeoutMs 8000, paused)", (() => {
      const h = outboxHandler("capi");
      return !!h && h.maxPerTick === 60 && h.perStorePerTick === 20 && h.timeoutMs === 8000 && typeof h.paused === "function";
    })());
    const metaRow = rows1.find((r) => r.targetId === `meta:${META}`)!;
    const ttRow = rows1.find((r) => r.targetId === `tiktok:${TT}`)!;
    events.length = 0;
    const sent = await handler.sendCapiItem(claimed(metaRow));
    const c0 = calls[0]!;
    eq2(
      "handler: a 2xx with events_received → done; the Meta endpoint, the token in the body only, capi_sent with the pixel's last 4",
      [sent.ok, c0.url.includes(`/${META}/events`), c0.url.includes(TOKEN_A), JSON.parse(c0.body).access_token === TOKEN_A, events.map((e) => [e.type, e.meta?.pixel, e.meta?.event])],
      [true, true, false, true, [["capi_sent", META.slice(-4), "Purchase"]]],
    );
    ok("handler: the body carries the hashed phone, never the clear one", !c0.body.includes(PHONE) && !c0.body.includes(NAME));
    const [statusRow] = await db.select().from(integrationStatus).where(and(eq(integrationStatus.storeId, SA.id), eq(integrationStatus.kind, "capi"), eq(integrationStatus.targetId, `meta:${META}`)));
    eq2("handler: integration_status capi / meta:<pixel> is ok", statusRow?.state, "ok");
    calls.length = 0;
    answer = () => new Response(JSON.stringify({ code: 0, message: "OK" }), { status: 200 });
    const ttSent = await handler.sendCapiItem(claimed(ttRow));
    eq2("handler: TikTok: the Events API with the Access-Token header, never in the URL", [ttSent.ok, calls[0]?.url, calls[0]?.headers.get("access-token") === `${TOKEN_A}-tt`], [true, core.TIKTOK_EVENTS_URL, true]);

    // B's item for the same pixel id signs with B's token; A's token never signs B's event
    await setConv(SB, { purchaseTrigger: "order", customEvents: false });
    const ob = await capiOrder(SB);
    await conversions.conversionsAtCreation(SB.scope, conversionOf(SB, ob));
    const bRow = (await rowsOf(ob)).find((r) => r.targetId === `meta:${META}`)!;
    calls.length = 0;
    answer = () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
    await handler.sendCapiItem(claimed(bRow));
    eq2("handler: B's event for the same pixel id carries B's token, never A's", [JSON.parse(calls[0]!.body).access_token === TOKEN_B, calls[0]!.body.includes(TOKEN_A)], [true, false]);

    // retry and final
    answer = () => new Response("{}", { status: 503 });
    const r503 = await handler.sendCapiItem(claimed(metaRow, 0));
    eq2("handler: a 503 → retry (not final)", [r503.ok, !r503.ok && r503.retry], [false, true]);
    answer = () => new Response(JSON.stringify({ error: { code: 100, message: "Invalid parameter" } }), { status: 400 });
    events.length = 0;
    const before400 = (await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.storeId, SA.id), eq(notifications.kind, "int.delivery_dead")))).length;
    const r400 = await handler.sendCapiItem(claimed(metaRow, 1));
    const after400 = (await db.select({ id: notifications.id, vars: notifications.vars }).from(notifications).where(and(eq(notifications.storeId, SA.id), eq(notifications.kind, "int.delivery_dead"))));
    eq2(
      "handler: a 400 refusal → final (retry false), capi_failed once, int.delivery_dead for the owners",
      [r400.ok, !r400.ok && r400.retry, events.map((e) => [e.type, e.meta?.code]), after400.length > before400],
      [false, false, [["capi_failed", "event_rejected"]], true],
    );
    ok("handler: the stored error is a cause code and the platform's words, never a customer field", !r400.ok && r400.error.startsWith("event_rejected") && !r400.error.includes(PHONE), r400);
    answer = () => new Response("{}", { status: 429 });
    const r429last = await handler.sendCapiItem(claimed(metaRow, 6));
    eq2("handler: a retryable failure once the ladder is used up is final", [!r429last.ok && r429last.retry, (load<typeof import("@/lib/jobs/outbox")>("@/lib/jobs/outbox")).isFinalFailure({ attempts: 6 }, r429last)], [true, true]);
    answer = () => {
      throw new TypeError("fetch failed");
    };
    const rNet = await handler.sendCapiItem(claimed(metaRow, 0));
    eq2("handler: no answer → retry, cause network", [!rNet.ok && rNet.retry, !rNet.ok && rNet.error.startsWith("network")], [true, true]);

    // the 7-day guard (OPE-§20.9 (3))
    const stale = claimed(metaRow);
    const p = stale.payload as { eventTime: string; conversion: { time: string } };
    p.eventTime = new Date(Date.now() - core.CAPI_MAX_AGE_MS - 60_000).toISOString();
    calls.length = 0;
    events.length = 0;
    const rStale = await handler.sendCapiItem(stale);
    eq2("handler: an event older than 7 d − 1 h is never sent; cancelled, and the timeline says why (capi_stale)", [rStale.ok, !rStale.ok && rStale.error, calls.length, events.map((e) => e.type)], [false, "cancelled:stale_event", 0, ["capi_stale"]]);
    const fresh = claimed(metaRow);
    (fresh.payload as { eventTime: string }).eventTime = new Date(Date.now() - core.CAPI_MAX_AGE_MS + 60_000).toISOString();
    answer = () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
    eq2("handler: one minute inside the window is sent", (await handler.sendCapiItem(fresh)).ok, true);

    // a token removed meanwhile → done, nothing sent
    await setStoreSetting(SA.scope, "tracking_secrets", { metaTokens: {}, tiktokTokens: { [TT]: `${TOKEN_A}-tt` } } as never, { kind: "system" } as never);
    calls.length = 0;
    eq2("handler: a token removed meanwhile → done with nothing sent", [(await handler.sendCapiItem(claimed(metaRow))).ok, calls.length], [true, 0]);
    // a bad payload or a platform item is refused
    eq2("handler: a tampered payload and a storeless item are refused (final)", [(await handler.sendCapiItem({ ...claimed(metaRow), payload: { platform: "meta" } })).ok, (await handler.sendCapiItem({ ...claimed(metaRow), storeId: null })).ok], [false, false]);

    // the kill switch (§H.8): paused while capi_enabled is off
    const [killRow] = await db.select().from(flags).where(eq(flags.key, "capi_enabled")).limit(1);
    await db.insert(flags).values({ key: "capi_enabled", kind: "kill", defaultValue: false }).onDuplicateKeyUpdate({ set: { defaultValue: false } });
    invalidateFlags();
    const pausedOn = await handler.capiPaused();
    if (killRow) await db.update(flags).set({ defaultValue: killRow.defaultValue }).where(eq(flags.key, "capi_enabled"));
    else await db.delete(flags).where(eq(flags.key, "capi_enabled"));
    invalidateFlags();
    eq2("handler: paused while the capi_enabled kill switch is tripped, running again once restored", [pausedOn, await handler.capiPaused()], [true, false]);
  } finally {
    globalThis.fetch = realFetch;
  }

  /* ---------------- 8.9 the purge (ops.capi_ctx_purge) ---------------- */
  const day = 86_400_000;
  const oldA = await capiOrder(SA, { capiCtx: sealed2, createdAt: new Date(Date.now() - 9 * day) });
  const youngA = await capiOrder(SA, { capiCtx: sealed2, createdAt: new Date(Date.now() - 2 * day) });
  const oldB = await capiOrder(SB, { capiCtx: "v2.k1.x.y.z", createdAt: new Date(Date.now() - 9 * day) });
  const purged = await conversions.purgeCapiContexts(SA.scope);
  eq2("purge: A's 9-day-old context nulled, the 2-day-old kept, B's untouched by A's purge", [purged.done, purged.cleared >= 1, await ctxOf(oldA), (await ctxOf(youngA)) !== null, (await ctxOf(oldB)) !== null], [true, true, null, true, true]);
  const job = JOBS.find((j) => j.name === "ops.capi_ctx_purge");
  const jr = job
    ? await job.run({ ...systemCtx("ops.capi_ctx_purge"), deadline: Date.now() + 800, tickId: "qa", cursor: "", setCursor: async () => undefined, yield: async () => new Promise<void>((r) => setImmediate(r)), lagMs: () => 0 })
    : null;
  eq2("purge job: daily at 03:20, nulls B's old context too, summary counts only", [JSON.stringify(job?.every), await ctxOf(oldB), jr?.summary && !JSON.stringify(jr.summary).includes(PHONE)], [JSON.stringify({ dailyAt: "03:20" }), null, true]);

  /* ---------------- 8.10 the setting changed: re-render the pages whose trigger changed (OPE-§20.9 (6)) ---------------- */
  const page2 = newId();
  await db.insert(pages).values({ id: page2, storeId: SA.id, slug: "capi-a-p2", name: "P2", status: "published", publicKey: `pk-${newId()}`, draft: doc as never, publishedVersionId: newId() });
  const draftPage = newId();
  await db.insert(pages).values({ id: draftPage, storeId: SA.id, slug: "capi-a-p3", name: "P3", status: "draft", publicKey: `pk-${newId()}`, draft: doc as never });
  const conv = (v: Partial<Conversions>): Conversions => ({ purchaseTrigger: "order", pageOverrides: {}, customEvents: true, manualOrders: false, ...v });
  renders.length = 0;
  const change = await conversions.applyConversionsChange(SA.scope, conv({}), conv({ purchaseTrigger: "confirmed", pageOverrides: { [page2]: "order" } }), { kind: "system" } as never);
  eq2("change: only the live pages whose trigger changed, reason conversions, priority 4", [change.pages, renders.map((r) => [r.pageIds, r.reason, r.priority])], [[SA.pageId], [[[SA.pageId], "conversions", 4]]]);
  const all = await conversions.applyConversionsChange(SA.scope, conv({}), conv({ purchaseTrigger: "delivered" }), { kind: "system" } as never);
  eq2("change: switching the store's trigger re-renders every live page (never a draft)", [...all.pages].sort(), [SA.pageId, page2].sort());
  const audits = await db.select({ action: auditLog.action }).from(auditLog).where(and(eq(auditLog.storeId, SA.id), eq(auditLog.action, "integrations.conversions.changed")));
  ok("change: audited as integrations.conversions.changed", audits.length >= 2, audits.length);
  const none = await conversions.applyConversionsChange(SB.scope, conv({}), conv({ customEvents: false }), { kind: "system" } as never);
  eq2("change: a change that moves no trigger re-renders nothing; B's change never lists A's pages", none.pages, []);

  /* ---------------- 8.11 the render's parity with the one rule (OPE-§20.3, core §J.1) ---------------- */
  const pageIds = [SA.pageId, page2, null];
  let parity = 0;
  let total = 0;
  for (const purchaseTrigger of ["order", "confirmed", "delivered"] as const) {
    for (const override of [undefined, "order", "confirmed", "delivered"] as const) {
      const c = conv({ purchaseTrigger, pageOverrides: override ? { [page2]: override } : {} });
      for (const pid of pageIds) {
        total++;
        if (purchaseInBrowserFor(c, pid) === (core.triggerFor(c, pid) === "order")) parity++;
      }
    }
  }
  eq2("render parity: purchaseInBrowserFor = (triggerFor = order) over the whole matrix", parity, total);

  conversions.setCapiDoubleForTests(null);
}

/* ================================================================== */
/* 9. Telegram (IN-04, SF-05 Telegram half; OPE-§21, §26, §28.1-§28.3) */
/* ================================================================== */

async function telegramSuite(): Promise<void> {
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const { auditLog, integrationStatus, notifications, orders, outbox, stores } = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { newId, newOrderId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const { systemCtx, systemScope } = load<typeof import("@/lib/jobs/scope")>("@/lib/jobs/scope");
  const queue = load<typeof import("@/lib/integrations/telegram/queue")>("@/lib/integrations/telegram/queue");
  const handler = load<typeof import("@/lib/jobs/handlers/telegram")>("@/lib/jobs/handlers/telegram");
  const setup = load<typeof import("@/lib/integrations/telegram/setup.server")>("@/lib/integrations/telegram/setup.server");
  const daily = load<typeof import("@/lib/integrations/telegram/daily")>("@/lib/integrations/telegram/daily");
  const { outboxHandler } = load<typeof import("@/lib/jobs/outbox")>("@/lib/jobs/outbox");
  const { runOrderHooks } = load<typeof import("@/lib/orders/hooks")>("@/lib/orders/hooks");
  const { getStoreSetting, setStoreSetting, updateStoreSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
  const status = load<typeof import("@/lib/integrations/status")>("@/lib/integrations/status");
  const { JOBS } = load<typeof import("@/lib/jobs/registry")>("@/lib/jobs/registry");
  type Tx = import("@/lib/orders/hooks").Tx;
  type OutboxItem = import("@/lib/jobs/outbox").OutboxItem;
  type ClaimedItem = import("@/lib/jobs/outbox").ClaimedItem;
  type OrderRow = import("@/lib/orders/hooks").OrderRow;
  status.clearStatusCache();
  handler.clearTelegramPacing();

  const TOKEN_A = "123456789:AAH-telegram-A-token-canary-0001";
  const TOKEN_B = "987654321:AAH-telegram-B-token-canary-0002";
  const NEW_TOKEN = "555555555:AAH-telegram-new-token-canary-03";
  const CHAT_A = "-1001111111111";
  const CHAT_B = "2222222";
  const ctx = systemCtx("qa.integrations_db");
  const SYS = { id: "system", ip: null, kind: "system" as const };
  const actor = { kind: "system" as const, userId: null, impersonatorId: null, ip: null };

  // every log line of the suite, searched for the tokens at the end (canary)
  const logs: string[] = [];
  const real = { log: console.log, error: console.error, warn: console.warn };
  for (const k of ["log", "error", "warn"] as const) {
    console[k] = (...args: unknown[]) => {
      logs.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack ?? ""}` : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      real[k](...args);
    };
  }

  /* ---------------- two stores with their bots and chats ---------------- */
  async function tgStore(handle: string, token: string, chatId: string) {
    const id = newId();
    await db.insert(stores).values({ id, handle, name: `Boutique ${handle}`, status: "active", brandSeed: "0123456789abcdef", defaultLocale: "fr" });
    const scope = systemScope(ctx, id);
    await setStoreSetting(scope, "telegram", { enabled: true, botToken: token, chatId, pii: "masked" } as never, SYS);
    return { id, scope };
  }
  const SA = await tgStore("tg-a", TOKEN_A, CHAT_A);
  const SB = await tgStore("tg-b", TOKEN_B, CHAT_B);
  const setNotifications = (s: typeof SA, v: object) => setStoreSetting(s.scope, "notifications", v as never, SYS);

  async function tgOrder(s: typeof SA, over: Partial<typeof orders.$inferInsert> = {}): Promise<OrderRow> {
    const id = newOrderId();
    await db.insert(orders).values({
      id,
      storeId: s.id,
      pageId: newId(),
      name: NAME,
      phone: PHONE,
      city: "Casablanca",
      address: "12 rue des Canaris",
      productName: "Argan oil",
      items: { bundleId: "b1", bundleLabel: "Pack Duo", qty: 1, unitPrice: 349, variants: [] } as never,
      qty: 1,
      subtotal: 349,
      shipping: 0,
      total: 349,
      currency: "MAD",
      idem: randomUUID(),
      ...over,
    });
    return (await db.select().from(orders).where(eq(orders.id, id)))[0]!;
  }

  /* ---------------- P8's enqueue / drain and P4's masking and reads as doubles ---------------- */
  const drains: unknown[] = [];
  const enqueue = async (scope: { storeId: string } | "platform", items: readonly OutboxItem[], opts?: { tx?: Tx }) => {
    const storeId = scope === "platform" ? null : scope.storeId;
    const runner = opts?.tx ?? db;
    let inserted = 0;
    for (const it of items) {
      const nextAt = it.notBefore ?? new Date();
      const [res] = (await runner.execute(
        sql`INSERT IGNORE INTO outbox (id, store_id, kind, topic, target_id, dedupe_key, payload, encrypted, state, attempts, next_at, created_at)
            VALUES (${newId()}, ${storeId}, ${it.kind}, ${it.topic}, ${it.targetId ?? null}, ${it.dedupeKey}, ${JSON.stringify(it.payload)}, ${it.pii ? 1 : 0}, 'pending', 0, ${nextAt}, UTC_TIMESTAMP(3))`,
      )) as unknown as [{ affectedRows: number }];
      inserted += res.affectedRows;
    }
    return { inserted, duplicates: items.length - inserted };
  };
  let kpis: unknown = null;
  queue.setTelegramDoubleForTests({
    enqueue: enqueue as never,
    drainOutbox: async (o) => (drains.push(o), { ms: 0, claimed: 0, done: 0, retried: 0, dead: 0, more: false }),
    maskPhone: () => "06 •• •• 00 01",
    orderKpis: async () => {
      if (!kpis) throw new Error("not implemented: P4 orderKpis");
      return kpis as never;
    },
    queueCounts: async () => ({ callbacksDue: 6, deliveryRescue: 2 }) as never,
  });

  const rowsOf = (s: typeof SA, topic?: string) =>
    db.select().from(outbox).where(and(eq(outbox.storeId, s.id), eq(outbox.kind, "telegram"), topic ? eq(outbox.topic, topic) : undefined));
  const claimed = (row: typeof outbox.$inferSelect, attempts = 0): ClaimedItem => ({
    id: row.id,
    storeId: row.storeId,
    kind: "telegram",
    topic: row.topic,
    targetId: row.targetId,
    dedupeKey: row.dedupeKey,
    payload: JSON.parse(row.payload) as unknown,
    attempts,
    createdAt: row.createdAt,
  });
  const createdEvent = (row: OrderRow) => ({ on: "created" as const, order: row, conversion: null, target: { pageId: row.pageId, versionId: null, source: row.source } });
  const created = async (s: typeof SA, row: OrderRow) => db.transaction(async (tx) => runOrderHooks("created", "inTx", s.scope, createdEvent(row), tx));

  /* ---------------- 9.1 the hook: new orders on the order's transaction ---------------- */
  const o1 = await tgOrder(SA);
  const before = Date.now();
  await created(SA, o1);
  const [r1] = await rowsOf(SA, "new_order");
  eq2("telegram hook: a new order queues one new_order item, keyed tg:new:<id>, on chat …1111, not sealed", [r1?.dedupeKey, r1?.targetId, r1?.encrypted], [`tg:new:${o1.id}`, "chat:1111", false]);
  ok("telegram hook: due at the end of the 45 s batch window", !!r1 && r1.nextAt.getTime() >= before + 44_000 && r1.nextAt.getTime() <= Date.now() + 46_000, r1?.nextAt);
  ok("telegram hook: the payload holds the order id only (no phone, name or token)", !!r1 && !r1.payload.includes(PHONE) && !r1.payload.includes(NAME) && !r1.payload.includes(TOKEN_A));
  await created(SA, o1);
  eq2("telegram hook: a retried creation never duplicates the item (dedupe)", (await rowsOf(SA, "new_order")).length, 1);
  await db
    .transaction(async (tx) => {
      const o = await tgOrder(SA);
      await runOrderHooks("created", "inTx", SA.scope, createdEvent(o), tx);
      tx.rollback();
    })
    .catch(() => undefined);
  eq2("telegram hook: a rolled-back order leaves no item (OD6)", (await rowsOf(SA, "new_order")).length, 1);
  const hp = await tgOrder(SA, { flags: ["honeypot"] as never });
  await created(SA, hp);
  const tOff = await tgOrder(SA, { isTest: true });
  await created(SA, tOff);
  eq2("telegram hook: a honeypot row and a test order without the switch queue nothing", (await rowsOf(SA, "new_order")).length, 1);
  await setNotifications(SA, { testOrders: true });
  const tOn = await tgOrder(SA, { isTest: true });
  await created(SA, tOn);
  const testRow = (await rowsOf(SA, "new_order")).find((r) => r.dedupeKey === `tg:new:${tOn.id}`);
  eq2("telegram hook: a test order with the switch queues one item marked test", testRow ? JSON.parse(testRow.payload).test : null, true);
  await setNotifications(SA, { telegram: { newOrders: false } });
  const off = await tgOrder(SA);
  await created(SA, off);
  eq2("telegram hook: new orders switched off queue nothing", (await rowsOf(SA, "new_order")).some((r) => r.dedupeKey === `tg:new:${off.id}`), false);
  await setNotifications(SA, {});

  /* ---------------- 9.2 the handler: merge, pacing, answers ---------------- */
  const realFetch = globalThis.fetch;
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  let answer: () => Response = () => new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
    return answer();
  }) as typeof fetch;
  let clock = Date.now();
  const opts = { now: () => clock, sleep: async (ms: number) => void (clock += ms) };
  const sendNow = (items: ClaimedItem[]) => handler.sendTelegramItems(items, opts);
  const notesOf = async (s: typeof SA, kind: string) => (await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.storeId, s.id), eq(notifications.kind, kind)))).length;
  const statusOf = async (s: typeof SA) => (await db.select().from(integrationStatus).where(and(eq(integrationStatus.storeId, s.id), eq(integrationStatus.kind, "telegram"))))[0];
  try {
    ok("telegram handler: registered for kind telegram (perStorePerTick 10, timeoutMs 6000, batch ≤ 10)", (() => {
      const h = outboxHandler("telegram");
      return !!h && h.perStorePerTick === 10 && h.timeoutMs === 6000 && h.batch?.max === 10;
    })());

    // three new orders of one window, claimed together → one message
    for (const o of [await tgOrder(SA), await tgOrder(SA)]) await created(SA, o);
    const batchRows = (await rowsOf(SA, "new_order")).filter((r) => !JSON.parse(r.payload).test);
    eq2("telegram handler: the drainer's key merges the real new orders, test orders apart", [...new Set(batchRows.map((r) => queue.telegramBatchKey(claimed(r))))], ["new_order"]);
    calls.length = 0;
    const merged = await sendNow(batchRows.map((r) => claimed(r)));
    const text = String(calls[0]?.body.text ?? "");
    eq2(
      "telegram handler: three orders → one sendMessage to A's chat with A's token",
      [merged.ok, calls.length, calls[0]?.url.includes(`/bot${TOKEN_A}/sendMessage`), calls[0]?.body.chat_id, calls[0]?.body.disable_web_page_preview],
      [true, 1, true, CHAT_A, true],
    );
    ok(
      "telegram handler: the message names the three orders under one header, masked phone, no full phone or address",
      text.startsWith("3 nouvelles commandes") && batchRows.every((r) => text.includes(r.dedupeKey.slice(7))) && text.includes("06 •• •• 00 01") && !text.includes(PHONE) && !text.includes("12 rue"),
      text,
    );
    eq2("telegram handler: integration_status telegram is ok", (await statusOf(SA))?.state, "ok");

    // ≤ 1 message per second per chat: the second send waits for the gap
    const t0 = clock;
    await sendNow([claimed(batchRows[0]!)]);
    ok("telegram handler: a second message to the chat waits ≥ 1 s", clock - t0 >= 1_000, clock - t0);

    // 429 retry_after honoured
    handler.clearTelegramPacing();
    answer = () => new Response(JSON.stringify({ ok: false, error_code: 429, description: "Too Many Requests: retry after 7", parameters: { retry_after: 7 } }), { status: 429 });
    calls.length = 0;
    const r429 = await sendNow([claimed(batchRows[0]!)]);
    eq2("telegram handler: a 429 → retry with retryAfterMs = retry_after", [r429.ok, !r429.ok && r429.retry, r429.retryAfterMs], [false, true, 7_000]);
    const again = await sendNow([claimed(batchRows[0]!)]);
    ok("telegram handler: nothing is sent to the chat before retry_after", calls.length === 1 && !again.ok && again.retry && (again.retryAfterMs ?? 0) > 0 && (again.retryAfterMs ?? 0) <= 7_000, { calls: calls.length, again });
    eq2("telegram handler: a 429 turns the row warn", (await statusOf(SA))?.state, "warn");
    clock += 7_001;
    answer = () => new Response(JSON.stringify({ ok: true, result: { message_id: 2 } }), { status: 200 });
    eq2("telegram handler: after retry_after the message goes", (await sendNow([claimed(batchRows[0]!)])).ok, true);

    // a revoked token: final, failing within one send, notified once
    clock += 2_000;
    status.clearStatusCache();
    const failingBefore = await notesOf(SA, "int.telegram_failing");
    const deadBefore = await notesOf(SA, "int.delivery_dead");
    answer = () => new Response(JSON.stringify({ ok: false, error_code: 401, description: "Unauthorized" }), { status: 401 });
    const r401 = await sendNow([claimed(batchRows[1]!)]);
    eq2("telegram handler: a revoked token → final (dead), cause bot_token_revoked", [r401.ok, !r401.ok && r401.retry, !r401.ok && r401.error], [false, false, "bot_token_revoked"]);
    const failingRow = await statusOf(SA);
    eq2("telegram handler: the telegram row is failing at once, its cause named", [failingRow?.state, failingRow?.lastErrorCode], ["failing", "bot_token_revoked"]);
    clock += 2_000;
    await sendNow([claimed(batchRows[2]!)]);
    eq2("telegram handler: int.telegram_failing reaches the owners once for the incident", (await notesOf(SA, "int.telegram_failing")) - failingBefore, 1);
    ok("telegram handler: int.delivery_dead at the dead transition", (await notesOf(SA, "int.delivery_dead")) > deadBefore);
    eq2("telegram handler: Telegram's own failure is never sent to Telegram", (await rowsOf(SA, "incident")).length, 0);
    answer = () => new Response(JSON.stringify({ ok: true, result: { message_id: 3 } }), { status: 200 });
    clock += 2_000;
    await sendNow([claimed(batchRows[0]!)]);
    eq2("telegram handler: a success brings the row back to ok", (await statusOf(SA))?.state, "ok");

    // a test order: [TEST] with the switch, nothing without it
    await setNotifications(SA, { testOrders: true });
    clock += 2_000;
    calls.length = 0;
    const testSent = await sendNow([claimed(testRow!)]);
    ok("telegram handler: a test order with the switch → one message prefixed [TEST]", testSent.ok && calls.length === 1 && String(calls[0]!.body.text).startsWith("[TEST] Nouvelle commande"), calls[0]?.body.text);
    await setNotifications(SA, { testOrders: false });
    clock += 2_000;
    calls.length = 0;
    const testOff = await sendNow([claimed(testRow!)]);
    eq2("telegram handler: the switch turned off meanwhile → cancelled, nothing sent", [!testOff.ok && testOff.error, calls.length], ["cancelled:test_off", 0]);
    await setNotifications(SA, {});

    // Send again on done rows: one message marked (renvoi)
    await db.update(outbox).set({ state: "done", doneAt: new Date(), attempts: 1 }).where(inArray(outbox.id, batchRows.map((r) => r.id)));
    clock += 2_000;
    calls.length = 0;
    const resend = await sendNow(batchRows.map((r) => claimed(r, 1)));
    const resentText = String(calls[0]?.body.text ?? "");
    ok("telegram handler: Send again on done rows → one message marked (renvoi)", resend.ok && calls.length === 1 && (resentText.match(/\(renvoi\)/g) ?? []).length === 1, resentText.split("\n")[0]);

    // B's item naming A's order: nothing of A is read or sent
    clock += 2_000;
    calls.length = 0;
    const cross = await sendNow([{ ...claimed(batchRows[0]!), id: newId(), storeId: SB.id }]);
    eq2("telegram handler: B's item naming A's order reads nothing of A and sends nothing", [!cross.ok && cross.error, calls.length], ["cancelled:order_gone", 0]);
    await updateStoreSetting(SB.scope, "telegram", { enabled: false }, SYS);
    const offB = await sendNow([{ ...claimed(batchRows[0]!), storeId: SB.id }]);
    eq2("telegram handler: Telegram turned off meanwhile → cancelled", !offB.ok && offB.error, "cancelled:not_configured");
    await updateStoreSetting(SB.scope, "telegram", { enabled: true }, SYS);
    eq2("telegram handler: a tampered payload is refused", (await sendNow([{ ...claimed(batchRows[0]!), payload: { m: "new_order", orderId: "x" } }])).ok, false);

    // a group upgraded to a supergroup: saved and sent there once
    clock += 2_000;
    let first = true;
    answer = () => {
      if (first) {
        first = false;
        return new Response(JSON.stringify({ ok: false, error_code: 400, description: "Bad Request: group chat was upgraded to a supergroup chat", parameters: { migrate_to_chat_id: -1009999999999 } }), { status: 400 });
      }
      return new Response(JSON.stringify({ ok: true, result: { message_id: 4 } }), { status: 200 });
    };
    calls.length = 0;
    const migrated = await sendNow([claimed(batchRows[0]!)]);
    eq2("telegram handler: a migrated group → the new chat id saved and the message sent there", [migrated.ok, calls[1]?.body.chat_id, (await getStoreSetting(SA.scope, "telegram")).chatId], [true, "-1009999999999", "-1009999999999"]);
    await updateStoreSetting(SA.scope, "telegram", { chatId: CHAT_A }, SYS);
    answer = () => new Response(JSON.stringify({ ok: true, result: { message_id: 5 } }), { status: 200 });

    /* ---------------- 9.3 incidents, the daily summary ---------------- */
    status.clearStatusCache();
    const T = Date.now();
    for (let i = 0; i < 3; i++) await status.recordIntegrationStatus(SA.scope, { kind: "sheets", outcome: "failed", code: "sheet_not_shared" }, { now: T + i * 60_000 });
    const [inc] = await rowsOf(SA, "incident");
    ok("telegram incident: Sheets failing queues one message due 15 min after the first failure", !!inc && Math.abs(inc.nextAt.getTime() - (T + 15 * 60_000)) < 2 * 60_000, inc?.nextAt);
    clock = T + 16 * 60_000;
    calls.length = 0;
    const incSent = await sendNow([claimed(inc!)]);
    ok("telegram incident: still failing at its time → sent, with the minutes", incSent.ok && /Google Sheets : les commandes n'arrivent plus dans votre feuille depuis 1[5-9] min/.test(String(calls[0]?.body.text)), calls[0]?.body.text);
    await status.recordIntegrationStatus(SA.scope, { kind: "sheets", outcome: "ok" }, { now: T + 17 * 60_000 });
    eq2("telegram incident: Sheets recovered meanwhile → cancelled", (await sendNow([claimed(inc!)])).ok ? "sent" : "cancelled", "cancelled");

    const dailyJob = JOBS.find((j) => j.name === "int.telegram_daily");
    eq2("telegram daily: the job is registered hourly with 2 s", [dailyJob?.every, dailyJob?.budgetMs], ["hourly", 2_000]);
    const at21 = new Date("2026-10-24T20:05:00Z"); // 21:05 in Casablanca (UTC+1)
    const jobCtx = () => ({ ...systemCtx("int.telegram_daily"), deadline: Date.now() + 2_000, tickId: "qa", cursor: "", setCursor: async () => undefined, yield: async () => new Promise<void>((r) => setImmediate(r)), lagMs: () => 0 });
    const noKpis = await daily.runTelegramDailyTick(jobCtx(), { budgetMs: 2_000, now: at21 });
    const dailyRows0 = await rowsOf(SA, "daily_summary");
    ok(
      "telegram daily: with P4's orderKpis still a stub, only the figures read are queued (no estimate)",
      noKpis.due >= 2 && dailyRows0.length === 1 && JSON.parse(dailyRows0[0]!.payload).figures.placed === undefined && JSON.parse(dailyRows0[0]!.payload).figures.callbacksDue === 6,
      { noKpis, payload: dailyRows0[0]?.payload },
    );
    await db.delete(outbox).where(and(eq(outbox.storeId, SA.id), eq(outbox.topic, "daily_summary")));
    kpis = {
      window: "today",
      placed: 42,
      confirmed: 31,
      delivered: 18,
      decided: 40,
      confirmationRate: { value: 0.775, n: 40, min: 30 },
      deliveryRate: { n: 0, min: 30, insufficient: true },
      firstTouchP50Min: { n: 0, min: 20, insufficient: true },
      unreachableRate: { n: 0, min: 30, insufficient: true },
      riskyShare: { n: 0, min: 30, insufficient: true },
      lastOrderAt: null,
      computedAt: new Date().toISOString(),
    };
    await daily.runTelegramDailyTick(jobCtx(), { budgetMs: 2_000, now: at21 });
    await daily.runTelegramDailyTick(jobCtx(), { budgetMs: 2_000, now: new Date(at21.getTime() + 20 * 60_000) });
    const dailyRows = await rowsOf(SA, "daily_summary");
    eq2("telegram daily: one summary per store and day (dedupe), keyed tg:daily:<store>:<day>", dailyRows.map((r) => r.dedupeKey), [`tg:daily:${SA.id}:2026-10-24`]);
    eq2("telegram daily: not at another hour", (await daily.runTelegramDailyTick(jobCtx(), { budgetMs: 2_000, now: new Date("2026-10-25T10:00:00Z") })).due, 0);
    clock += 2_000;
    calls.length = 0;
    await sendNow([claimed(dailyRows[0]!)]);
    ok(
      "telegram daily: the summary text, each figure on its own, the rate with its n",
      String(calls[0]?.body.text).replace(/[\u00a0\u202f]/g, " ").startsWith("Résumé du 24 oct. : 42 commandes · 31 confirmées (78 %, n = 40) · 18 livrées · 6 rappels en attente · 2 colis"),
      calls[0]?.body.text,
    );

    /* ---------------- 9.4 setup ---------------- */
    let api: (method: string) => Response = () => new Response("{}", { status: 500 });
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
      return api(String(url).split("/").pop()!);
    }) as typeof fetch;
    api = (m) =>
      m === "getMe"
        ? new Response(JSON.stringify({ ok: true, result: { id: 555555555, username: "boutique_a_bot", first_name: "Boutique A" } }))
        : m === "getUpdates"
          ? new Response(JSON.stringify({ ok: true, result: [{ update_id: 1, message: { chat: { id: -100777, type: "supergroup", title: "Équipe" }, text: "hello" } }] }))
          : m === "getChat"
            ? new Response(JSON.stringify({ ok: true, result: { id: -100777, type: "supergroup", title: "Équipe" } }))
            : new Response(JSON.stringify({ ok: true, result: { message_id: 9 } }));
    eq2("telegram setup: a malformed token is refused before any call", await setup.saveBotToken(SA.scope, actor, "not-a-token", { stepUp: "totp" }), { ok: false, error: "token_format" });
    const saved = await setup.saveBotToken(SA.scope, actor, NEW_TOKEN, { stepUp: "totp" });
    const afterSave = await getStoreSetting(SA.scope, "telegram");
    eq2("telegram setup: a token getMe accepts is saved; the chat is reset and Telegram is off", [saved, afterSave.botToken === NEW_TOKEN, afterSave.chatId, afterSave.enabled], [{ ok: true, botUsername: "boutique_a_bot" }, true, null, false]);
    const view = await setup.telegramView(SA.scope);
    eq2("telegram setup: the view says set / not set, never the token", [view.tokenSet, view.botUsername, JSON.stringify(view).includes(NEW_TOKEN)], [true, "boutique_a_bot", false]);
    eq2("telegram setup: Find my chat lists titles and types", await setup.findChats(SA.scope, actor), { ok: true, chats: [{ id: "-100777", title: "Équipe", type: "supergroup" }] });
    eq2("telegram setup: selecting a chat checks it and keeps Telegram off", [await setup.selectChat(SA.scope, actor, "-100777"), (await getStoreSetting(SA.scope, "telegram")).enabled], [{ ok: true, chat: { title: "Équipe", type: "supergroup" } }, false]);
    eq2("telegram setup: the test message turns Telegram on", [await setup.sendTestMessage(SA.scope, actor), (await getStoreSetting(SA.scope, "telegram")).enabled], [{ ok: true, enabled: true }, true]);
    eq2("telegram setup: full details need the explicit confirmation", [await setup.setPii(SA.scope, actor, "full"), await setup.setPii(SA.scope, actor, "full", { confirmed: true })], [{ ok: false, error: "confirm_required" }, { ok: true, pii: "full" }]);
    let limited = 0;
    for (let i = 0; i < 10; i++) if (!(await setup.findChats(SA.scope, actor)).ok) limited++;
    ok("telegram setup: Find my chat is limited to 10 per hour per store", limited >= 1, limited);
    const bFind = await setup.findChats(SB.scope, actor);
    eq2("telegram setup: B's Find uses B's own token, never A's", [bFind.ok, calls.at(-1)?.url.includes(TOKEN_B), calls.at(-1)?.url.includes(NEW_TOKEN)], [true, true, false]);
    api = (m) => (m === "getMe" ? new Response(JSON.stringify({ ok: false, error_code: 401, description: "Unauthorized" }), { status: 401 }) : new Response("{}", { status: 500 }));
    eq2("telegram setup: a token getMe refuses is not saved", [await setup.saveBotToken(SA.scope, actor, TOKEN_B, { stepUp: "password" }), (await getStoreSetting(SA.scope, "telegram")).botToken === NEW_TOKEN], [{ ok: false, error: "token_invalid" }, true]);
    eq2(
      "telegram setup: disable turns it off and keeps the token; forget removes it",
      [await setup.disableTelegram(SA.scope, actor), (await getStoreSetting(SA.scope, "telegram")).botToken === NEW_TOKEN, await setup.disableTelegram(SA.scope, actor, { forget: true }), (await getStoreSetting(SA.scope, "telegram")).botToken],
      [{ ok: true, enabled: false }, true, { ok: true, enabled: false }, null],
    );
    const audits = await db.select().from(auditLog).where(and(eq(auditLog.storeId, SA.id), eq(auditLog.action, "integrations.telegram.changed")));
    ok("telegram setup: every change audited integrations.telegram.changed", audits.length >= 5, audits.length);

    /* ---------------- 9.5 the token canary ---------------- */
    const allOutbox = await db.select().from(outbox);
    const allAudit = await db.select().from(auditLog);
    const leaks = [TOKEN_A, TOKEN_B, NEW_TOKEN].filter(
      (tk) => allOutbox.some((r) => [r.payload, r.dedupeKey, r.targetId, r.lastError].some((v) => (v ?? "").includes(tk))) || allAudit.some((r) => JSON.stringify(r).includes(tk)) || logs.some((l) => l.includes(tk)),
    );
    eq2("telegram canary: no token in any outbox row, audit row or log line", leaks, []);
  } finally {
    globalThis.fetch = realFetch;
    queue.setTelegramDoubleForTests(null);
    Object.assign(console, real);
  }
}

/* ================================================================== */
/* 10. the store-side replay (OPE-§28.1, OPE-§L, §Q.26)                */
/* ================================================================== */

async function replaySuite(): Promise<void> {
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const { auditLog, outbox, stores } = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { newId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const { systemCtx, systemScope } = load<typeof import("@/lib/jobs/scope")>("@/lib/jobs/scope");
  const replay = load<typeof import("@/lib/integrations/replay")>("@/lib/integrations/replay");
  const ctx = systemCtx("qa.integrations_db");

  async function rpStore(handle: string) {
    const id = newId();
    await db.insert(stores).values({ id, handle, name: `Boutique ${handle}`, status: "active", brandSeed: "0123456789abcdef", defaultLocale: "fr" });
    return { id, scope: systemScope(ctx, id) };
  }
  const SA = await rpStore("rp-a");
  const SB = await rpStore("rp-b");
  type Kind = "capi" | "telegram";
  type State = "pending" | "running" | "done" | "dead" | "cancelled";
  async function row(s: typeof SA, kind: Kind, state: State): Promise<string> {
    const id = newId();
    await db.insert(outbox).values({
      id,
      storeId: s.id,
      kind,
      topic: kind === "capi" ? "Purchase" : "new_order",
      targetId: kind === "capi" ? "meta:1234567890" : "chat:4444",
      dedupeKey: `qa:rp:${id}`,
      payload: "{}",
      state,
      attempts: state === "dead" ? 7 : 1,
      ...(state === "done" ? { doneAt: new Date() } : {}),
    });
    return id;
  }
  // P8's replay as a faithful double: dead → pending, done → pending (the re-send), nothing else
  const calledWith: string[] = [];
  replay.setReplayDoubleForTests({
    replay: async (c, id) => {
      calledWith.push(id);
      await db.update(outbox).set({ state: "pending", nextAt: new Date() }).where(and(eq(outbox.id, id), eq(outbox.storeId, c.scope.storeId), inArray(outbox.state, ["dead", "done"])));
    },
  });
  const member = (s: typeof SA, userId = newId()) => ({ scope: s.scope, actor: { kind: "system" as const, userId: null, impersonatorId: null, ip: null }, user: { id: userId } }) as never;
  const audits = async (s: typeof SA) =>
    (await db.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.storeId, s.id), eq(auditLog.action, "integrations.outbox.replayed")))).length;
  const attempt = <T>(p: Promise<T>) => p.then((v) => v, (err: unknown) => `${(err as { name?: string }).name}:${(err as { code?: string }).code ?? "?"}`);
  const stateOf = async (id: string) => (await db.select({ state: outbox.state }).from(outbox).where(eq(outbox.id, id)))[0]?.state;

  try {
    const m = member(SA);
    /* ---------------- one row ---------------- */
    const dead = await row(SA, "capi", "dead");
    const r1 = await replay.replayDelivery(m, dead);
    eq2("replay: a dead capi row → replayed, pending, one audit row", [r1, await stateOf(dead), await audits(SA)], [{ outcome: "replayed", kind: "capi", topic: "Purchase" }, "pending", 1]);
    const again = await replay.replayDelivery(m, dead);
    eq2("replay: a second click while pending → no-op, the same audit count, nothing called", [again.outcome, await audits(SA), calledWith.filter((x) => x === dead).length], ["noop", 1, 1]);
    const doneTg = await row(SA, "telegram", "done");
    const r2 = await replay.replayDelivery(m, doneTg);
    eq2("replay: Send again on a done telegram row → resent", [r2.outcome, await stateOf(doneTg), await audits(SA)], ["resent", "pending", 2]);
    const doneCapi = await row(SA, "capi", "done");
    eq2("replay: Send again refused for a done capi row (counted twice by the ad platform)", [await attempt(replay.replayDelivery(m, doneCapi)), await stateOf(doneCapi)], ["ReplayRefused:not_resendable", "done"]);
    const cancelled = await row(SA, "capi", "cancelled");
    eq2("replay: a cancelled capi row is refused", [await attempt(replay.replayDelivery(m, cancelled)), await stateOf(cancelled)], ["ReplayRefused:cancelled", "cancelled"]);
    const meta = (await db.select({ meta: auditLog.meta }).from(auditLog).where(and(eq(auditLog.storeId, SA.id), eq(auditLog.action, "integrations.outbox.replayed"))))[0]?.meta;
    ok("replay: the audit row names { kind, topic, outboxId }", JSON.stringify(meta ?? "").includes(dead) && JSON.stringify(meta ?? "").includes("Purchase"), meta);

    /* ---------------- B never replays A's row ---------------- */
    const deadA = await row(SA, "capi", "dead");
    const before = calledWith.length;
    eq2("replay: B replaying A's dead row → not_found, nothing called, A's row stays dead", [await attempt(replay.replayDelivery(member(SB), deadA)), calledWith.length - before, await stateOf(deadA)], ["SeamError:not_found", 0, "dead"]);
    eq2("replay: B's Replay all never touches A's rows", [(await replay.replayDeadOfKind(member(SB), "capi")).replayed, await stateOf(deadA)], [0, "dead"]);
    eq2("replay: an unknown id → not_found", await attempt(replay.replayDelivery(m, newId())), "SeamError:not_found");

    /* ---------------- the bucket: 30 per member per hour ---------------- */
    const busy = member(SA);
    const pend = await row(SA, "capi", "pending");
    const answers: unknown[] = [];
    for (let i = 0; i < 31; i++) answers.push(await attempt(replay.replayDelivery(busy, pend).then((r) => r.outcome)));
    eq2("replay: 30 calls in an hour pass, the 31st is refused", [answers.slice(0, 30).every((a) => a === "noop"), answers[30]], [true, "SeamError:rate_limited"]);
    ok("replay: another member's bucket is their own", (await replay.replayDelivery(member(SA), pend)).outcome === "noop");

    /* ---------------- Replay all: ≤ 50 rows, one call ---------------- */
    for (let i = 0; i < 55; i++) await row(SA, "telegram", "dead");
    const all = member(SA);
    const auditsBefore = await audits(SA);
    const first = await replay.replayDeadOfKind(all, "telegram");
    eq2("replay all: 50 rows per call, more left", first, { replayed: 50, more: true });
    eq2("replay all: one audit row per replayed row", (await audits(SA)) - auditsBefore, 50);
    const second = await replay.replayDeadOfKind(all, "telegram");
    eq2("replay all: the next call takes the rest", second, { replayed: 5, more: false });
    // each Replay all counted one call of the bucket: 28 more single calls pass, the next is refused
    const tail: unknown[] = [];
    for (let i = 0; i < 29; i++) tail.push(await attempt(replay.replayDelivery(all, pend).then((r) => r.outcome)));
    eq2("replay all: counts as one call of the bucket", [tail.slice(0, 28).every((a) => a === "noop"), tail[28]], [true, "SeamError:rate_limited"]);
  } finally {
    replay.setReplayDoubleForTests(null);
  }
}

/* ================================================================== */
/* 10. Server events card and Anti-spam reads (OPE-§20.7, §24, IN-06)  */
/* ================================================================== */

async function serverEventsSuite(): Promise<void> {
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const { exportsTable, orders, outbox, pages, storeSettings, stores } = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { newId, newOrderId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const { systemCtx, systemScope } = load<typeof import("@/lib/jobs/scope")>("@/lib/jobs/scope");
  const ts = load<typeof import("@/lib/integrations/turnstile-stats")>("@/lib/integrations/turnstile-stats");
  const se = load<typeof import("@/lib/pixels/server-events")>("@/lib/pixels/server-events");
  const ctx = systemCtx("qa.integrations_db");

  async function seStore(handle: string) {
    const id = newId();
    await db.insert(stores).values({ id, handle, name: `Boutique ${handle}`, status: "active", brandSeed: "0123456789abcdef", defaultLocale: "fr" });
    return { id, scope: systemScope(ctx, id) };
  }
  const SA = await seStore("se-a");
  const SB = await seStore("se-b");
  const now = Date.now();
  async function order(s: typeof SA, flags: string[], over: Partial<typeof orders.$inferInsert> = {}) {
    await db.insert(orders).values({
      id: newOrderId(),
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
      flags,
      createdAt: new Date(now - 60 * 60_000),
      ...over,
    });
  }

  // the Turnstile share (IN-06): 19 real orders withhold it; the 20th shows it; test, honeypot and older orders never count
  for (let i = 0; i < 14; i++) await order(SA, []);
  for (let i = 0; i < 5; i++) await order(SA, ["captcha_missing"]);
  await order(SA, [], { isTest: true });
  await order(SA, ["honeypot"]);
  await order(SA, [], { createdAt: new Date(now - 30 * 60 * 60_000) });
  for (let i = 0; i < 25; i++) await order(SB, ["captcha_unverified"]);
  const at19 = await ts.turnstileStats(SA.scope, new Date(now));
  eq2("turnstile share: 19 orders withhold the share", [at19.n, at19.share, at19.failing], [19, null, false]);
  await order(SA, ["captcha_unverified"]);
  const at20 = await ts.turnstileStats(SA.scope, new Date(now));
  eq2("turnstile share: 20 orders show it (14 of 20) and the failure share is above 20 %", [at20.n, at20.verified, at20.share, at20.failing], [20, 14, 0.7, true]);
  eq2("turnstile share: 4 of 20 failed is not above 20 %", ts.turnstileShareOf(20, 4).failing, false);
  eq2("turnstile share: B never counts A's orders", (await ts.turnstileStats(SB.scope, new Date(now))).n, 25);

  // this week's outbox counts per pixel: sent (2xx), refused (with the platform's code), stale; A's rows only
  const pixel = "1234567890123";
  const target = `meta:${pixel}`;
  async function ob(s: typeof SA, state: "done" | "dead" | "cancelled" | "pending", over: Partial<typeof outbox.$inferInsert> = {}) {
    const id = newId();
    await db.insert(outbox).values({ id, storeId: s.id, kind: "capi", topic: "Purchase", targetId: target, dedupeKey: `qa:se:${id}`, payload: "{}", state, ...over });
  }
  await ob(SA, "done", { lastStatus: 200 });
  await ob(SA, "done", { lastStatus: 200 });
  await ob(SA, "done"); // a token removed meanwhile: done with nothing sent
  await ob(SA, "dead", { lastStatus: 400, lastError: "token_invalid: HTTP 400 code 190/463: Error validating access token" });
  await ob(SA, "dead", { lastStatus: 400, lastError: "token_invalid: HTTP 400 code 190/463: Error validating access token" });
  await ob(SA, "cancelled", { lastError: "cancelled:stale_event" });
  await ob(SA, "done", { lastStatus: 200, createdAt: new Date(now - 8 * 86_400_000) });
  for (let i = 0; i < 4; i++) await ob(SB, "done", { lastStatus: 200 });
  const lib = [{ platform: "meta", id: pixel, label: "Main", addedAt: new Date(now).toISOString(), server: true, testCode: false, activeTests: [], health: null, usage: { pages: 0, live: 0, exports: 0, drafts: 0 } }] as never;
  const viewA = await se.serverEventsView(SA.scope, lib, now);
  const wk = viewA.pixels[0]?.week;
  ok(
    "server events: sent 2, refused 2 with code 190/463 and HTTP 400, stale 1 (A's rows of the week only)",
    !!wk && wk !== "error" && wk.sent === 2 && wk.refused === 2 && wk.stale === 1 && wk.reasons[0]?.platformCode === "190/463" && wk.reasons[0]?.status === 400,
    wk,
  );
  const wkB = (await se.serverEventsView(SB.scope, lib, now)).pixels[0]?.week;
  ok("server events: B counts its own 4 sends", !!wkB && wkB !== "error" && wkB.sent === 4 && wkB.refused === 0, wkB);
  eq2("server events: a library without a server token lists no pixel", (await se.serverEventsView(SA.scope, [{ ...(lib as unknown as object[])[0], server: false }] as never, now)).pixels.length, 0);

  // Re-export to apply: A's exports built before the trigger change, for pages off `order`; B's never listed
  const pg = newId();
  await db.insert(pages).values({ id: pg, storeId: SA.id, slug: "argan", name: "Argan", publicKey: `pk_${newId()}`, draft: {} as never });
  const changedAt = new Date(now - 2 * 86_400_000);
  await db.insert(storeSettings).values({ storeId: SA.id, key: "conversions", value: { purchaseTrigger: "confirmed", pageOverrides: {}, customEvents: true, manualOrders: false } as never, updatedAt: changedAt });
  const exp = async (s: typeof SA, mode: "connected" | "php", at: number, revoked = false) =>
    db.insert(exportsTable).values({ id: newId(), storeId: s.id, pageId: pg, versionId: newId(), mode, publicKey: `pk_${newId()}`, allowedOrigins: [], createdAt: new Date(at), ...(revoked ? { revokedAt: new Date(now) } : {}) });
  await exp(SA, "connected", now - 5 * 86_400_000);
  await exp(SA, "php", now - 4 * 86_400_000);
  await exp(SA, "connected", now - 4 * 86_400_000, true);
  await exp(SA, "connected", now - 60_000);
  await exp(SB, "php", now - 5 * 86_400_000);
  const rx = (await se.serverEventsView(SA.scope, lib, now)).reexport;
  ok("re-export: the two live exports built before the change, with the page's name", rx !== "error" && rx.length === 2 && rx.every((r) => r.pageName === "Argan"), rx);
  eq2("re-export: none for B (no trigger change)", (await se.serverEventsView(SB.scope, lib, now)).reexport, []);
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

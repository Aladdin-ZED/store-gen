// proves: OP-03, OP-04, SF-07
/**
 * `test:queue` (P4 CALL CENTER; operations.md OPE-§O.2, §O.4, §5.2 "the concurrency proof"; docs/STORE-SAAS.md §J.2,
 * §K.2 R1 exit 12 "two agents never claim the same order", DB half): the claim queue against a real MariaDB. Creates
 * a throwaway `cod_test_p4_queue_*` database on XAMPP's MariaDB (root, no password, 127.0.0.1:3306), runs the app's
 * migrator, gives every scenario a store of its own and drops the database at the end (unless --keep).
 *   npm run test:queue [-- --db cod_test_p4_queue_x] [--keep]
 *
 * A fake clock drives leases, callbacks, heartbeats, skips and caps: `Date.now` (which the queue reads through
 * `opsNow()`, and every statement receives as a parameter) starts 10 minutes ahead of the real clock and only moves
 * forward, so a row the database or a library stamps with the real time is always in the fake past.
 *
 *   race        200 parallel Next on 50 orders: 50 distinct winners, 150 `empty`, one `claimed` per order
 *   one claim   a second Next resumes; two tabs at once resume one claim; Take releases the held order first
 *   presence    the first Next of an offline agent sets online and claims (OD60); break releases and answers
 *               `on_break`; a skipped order stays away from that agent for 10 minutes
 *   lease       the heartbeat renews a held lease and never an expired one; a 15-minute lease expires 15 minutes after
 *               the last heartbeat; the next claim writes `released` (lease_expired) for the previous holder at the old
 *               lease_until (OD46) and notifies the managers once (ops.abandoned_claims)
 *   callback    a due callback reaches its owner first (even before a pinned order) and the pool after the grace
 *   manual      only assigned orders; assignOrders: per-order results, ≤ 200 ids, managers only, unassign releases
 *   round robin 1,000 orders over weights 1 / 2 / 3 within ±5 %; a capped agent is skipped; the lock held elsewhere
 *               or nobody live → the pool; pull mode assigns nothing
 *   window      a closed day answers `outside_window` with nextCallableAt; "Open calls now" opens it
 *   daily cap   decided orders today ≥ daily_cap → `cap_reached`, for that agent only
 *   transient   errno 1205 / 1213 retried once, then `busy` (Next's `empty`); a real lock wait on the claim statement
 *   idempotency the same Idempotency-Key twice (in a row and at once) claims once; an outcome replays
 *   lifecycle   releaseAllLeases releases every claim of one store and none of another (`released` store_state)
 *   lanes       an attempt_failed order is claimed after a pinned order and before a callback, only while due; a
 *               postponed or exhausted parcel never; recordOutcome refuses a confirm outcome on it (OD48)
 *   explain     EXPLAIN of the claim statement reads orders_queue_idx for both lane ranges (OPE-§M.4)
 *   inbound     the inbound take of a callback owned by an idle agent; a held order is refused (OD53)
 *   pulse       queueNow, dueCallbacks per viewer, newOrders from the viewer's cursor (OPE-§27.3)
 */
import Module from "node:module";
import { randomBytes, randomUUID } from "node:crypto";

// the modules under test are marked `import "server-only"`; outside Next that import throws
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = require.resolve("drizzle-orm"); // any resolvable module: server-only exports nothing used
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    return req === "server-only" ? stub : orig.call(this, req, ...rest);
  };
}

const flag = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const dbName = flag("db") ?? `cod_test_p4_queue_${randomBytes(3).toString("hex")}`;
const KEEP = process.argv.includes("--keep");
if (!/^cod_test_p4_[a-z0-9_]{1,40}$/.test(dbName)) {
  console.error(`✗ refusing to run on database "${dbName}": use a throwaway cod_test_p4_* name`);
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
  env.DB_POOL_SIZE = "12";
}

/* ---------------- the fake clock ---------------- */
const MIN = 60_000;
const realNow = Date.now.bind(Date);
let fake = Math.floor(realNow() / 1000) * 1000 + 10 * MIN;
Date.now = () => fake;
const advance = (ms: number) => {
  fake += ms;
};
const at = (offsetMs = 0) => new Date(fake + offsetMs);

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
let section = "";
const ok = (label: string, cond: boolean, info?: unknown) => {
  if (cond) pass++;
  else failures.push(`[${section}] ${label}${info === undefined ? "" : `\n    ${JSON.stringify(info)}`}`);
};
const eq = (label: string, got: unknown, want: unknown) => ok(label, JSON.stringify(got) === JSON.stringify(want), { got, want });
const timings: string[] = [];

/** CommonJS `require`, so the server-only stub above sees every load. */
const load = <T>(id: string): T => Module.createRequire(__filename)(id) as T;

async function main(): Promise<number> {
  await rootQuery(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await rootQuery(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const { runMigrations } = load<typeof import("@/lib/db/migrate")>("@/lib/db/migrate");
  await runMigrations();

  const { and, eq: deq, isNotNull, gt } = load<typeof import("drizzle-orm")>("drizzle-orm");
  const { drizzle } = load<typeof import("drizzle-orm/mysql2")>("drizzle-orm/mysql2");
  const { db, pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const S = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { newId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const { storeLock } = load<typeof import("@/lib/db/locks")>("@/lib/db/locks");
  const { can } = load<typeof import("@/lib/auth/permissions")>("@/lib/auth/permissions");
  const { mintScope } = load<typeof import("@/lib/tenancy/seam")>("@/lib/tenancy/seam");
  const { getStoreById } = load<typeof import("@/lib/tenancy/public")>("@/lib/tenancy/public");
  const { setStoreSetting, getStoreSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
  const { createOrderRow } = load<typeof import("@/lib/orders/create")>("@/lib/orders/create");
  const { projectStatus } = load<typeof import("@/lib/orders/state")>("@/lib/orders/state");
  const Q = load<typeof import("@/lib/orders/queue")>("@/lib/orders/queue");
  const P = load<typeof import("@/lib/callcenter/presence")>("@/lib/callcenter/presence");
  const O = load<typeof import("@/lib/callcenter/outcomes")>("@/lib/callcenter/outcomes");
  const W = load<typeof import("@/lib/callcenter/window")>("@/lib/callcenter/window");
  const { callingWindowFor } = load<typeof import("@/lib/callcenter/window.server")>("@/lib/callcenter/window.server");
  const { rememberInbound } = load<typeof import("@/lib/callcenter/visibility")>("@/lib/callcenter/visibility");
  type StoreRole = import("@/lib/auth/permissions").StoreRole;
  type WriteCtx = import("@/lib/tenancy/types").WriteCtx;
  type WriteScope = import("@/lib/tenancy/types").WriteScope;
  type StoreRow = NonNullable<Awaited<ReturnType<typeof getStoreById>>>;
  type NextResult = import("@/lib/orders/queue").NextResult;
  type Won = Extract<NextResult, { ok: true }>;
  type OrderStates = import("@/lib/orders/state").OrderStates;

  /* ---------------- people: an owner, a manager and 200 agents, members of the stores they work in ---------------- */
  const person = (label: string) => ({ id: newId(), email: `${label.toLowerCase()}@queue.test`, name: label.replace(/-/g, " "), passwordHash: "x" });
  const OWNER = person("Owner-Q");
  const MANAGER = person("Manager-Q");
  const AGENTS = Array.from({ length: 200 }, (_, i) => person(`Agent-${i + 1}`));
  for (let i = 0; i < AGENTS.length + 2; i += 100) await db.insert(S.users).values([OWNER, MANAGER, ...AGENTS].slice(i, i + 100));

  const ctxOf = (row: StoreRow, scope: WriteScope, user: { id: string; email: string; name: string }, role: StoreRole): WriteCtx =>
    ({
      user: { id: user.id, email: user.email, name: user.name, totpEnabled: false, sessionId: "s", platformRole: "none", locale: null, lastStoreId: null },
      store: row,
      membership: { role, status: "active" },
      scope,
      actor: { kind: "user", userId: user.id, impersonatorId: null, ip: null },
      impersonation: null,
      stepUpUntil: null,
      can: (p) => can(role, p),
    }) as WriteCtx;

  interface Sc {
    id: string;
    scope: WriteScope;
    row: StoreRow;
    owner: WriteCtx;
    manager: WriteCtx;
    agents: WriteCtx[];
  }
  let storeSeq = 0;
  /** A store of its own for one scenario: its members, and "Open calls now" for a day unless the scenario says otherwise. */
  async function store(label: string, nAgents: number, ops: Record<string, unknown> = {}): Promise<Sc> {
    const id = `0P4Q${String(++storeSeq).padStart(22, "0")}`;
    await db.insert(S.stores).values({ id, handle: `q-${label}`, name: `Q ${label}`, status: "active", brandSeed: randomBytes(8).toString("hex") });
    const members = [
      { storeId: id, userId: OWNER.id, role: "owner" as const },
      { storeId: id, userId: MANAGER.id, role: "manager" as const },
      ...AGENTS.slice(0, nAgents).map((a) => ({ storeId: id, userId: a.id, role: "agent" as const })),
    ];
    for (let i = 0; i < members.length; i += 100) await db.insert(S.storeMembers).values(members.slice(i, i + 100));
    const scope = mintScope("member", id) as WriteScope;
    const row = (await getStoreById(id))!;
    const current = await getStoreSetting(scope, "ops");
    await setStoreSetting(scope, "ops", { ...current, openOverrideUntil: at(24 * 60 * MIN).toISOString(), ...ops }, { id: OWNER.id });
    return { id, scope, row, owner: ctxOf(row, scope, OWNER, "owner"), manager: ctxOf(row, scope, MANAGER, "manager"), agents: AGENTS.slice(0, nAgents).map((a) => ctxOf(row, scope, a, "agent")) };
  }

  /* ---------------- orders: one through the real insert (D72), the rest cloned from it ---------------- */
  const tpl = await store("tpl", 0);
  const TEMPLATE = (
    await createOrderRow(
      {
        pageId: newId(),
        versionId: null,
        exportId: null,
        source: "live",
        status: "new",
        name: "Salma Bennani",
        phone: "+212612340000",
        phoneRaw: null,
        city: "Fès",
        address: "Hay Salam 12",
        note: null,
        email: null,
        productName: "Argan",
        items: { bundleId: "b1", bundleLabel: "1 flacon", qty: 1, unitPrice: 100, variants: [{}] },
        qty: 1,
        subtotal: 249.9,
        shipping: 0,
        total: 249.9,
        currency: "MAD",
        locale: "fr",
        utm: null,
        ref: null,
        ipHash: null,
        ua: null,
        eventId: null,
        idem: randomUUID(),
        riskScore: 10,
        flags: null,
        sheetStatus: "pending",
      },
      { scope: tpl.scope, test: false, upsell: false, actor: { kind: "api", userId: null, impersonatorId: null, ip: null }, conversion: null },
    )
  ).orderId;
  const [colRows] = (await pool().query("SHOW COLUMNS FROM orders")) as unknown as [{ Field: string }[]];
  const COLS = colRows.map((r) => r.Field);
  const statusOf = (s: Partial<OrderStates>) => projectStatus({ confirm: s.confirm ?? "new", ship: s.ship ?? "none" });
  /**
   * `n` copies of the template order in `storeId` (fresh ids and idem, no customer, no claim), with `over` (SQL
   * column names) on top. Created at the template's instant + 1 ms per copy, so the claim's age order is the list's.
   */
  async function cloneOrders(storeId: string, n: number, over: Record<string, unknown> = {}): Promise<string[]> {
    const fixed: Record<string, unknown> = { store_id: storeId, customer_id: null, assignee_id: null, claim_token: null, lease_until: null, due_at: null, attempts: 0, rev: 0, first_touch_at: null, confirmed_by: null, ...over };
    const ids = Array.from({ length: n }, () => `QT-${randomBytes(5).toString("hex").toUpperCase()}`);
    const exprs: string[] = [];
    const params: unknown[] = [];
    for (const c of COLS) {
      if (c === "id") exprs.push("n.nid");
      else if (c === "idem") exprs.push("UUID()");
      else if (c in fixed) {
        exprs.push("?");
        params.push(fixed[c]);
      } else if (c === "created_at") exprs.push("TIMESTAMPADD(MICROSECOND, n.seq * 1000, t.created_at)");
      else exprs.push(`t.\`${c}\``);
    }
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const union = chunk.map((_, k) => `SELECT ? AS nid, ${i + k} AS seq`).join(" UNION ALL ");
      await pool().query(`INSERT INTO orders (${COLS.map((c) => `\`${c}\``).join(", ")}) SELECT ${exprs.join(", ")} FROM orders t JOIN (${union}) n WHERE t.id = ?`, [...params, ...chunk, TEMPLATE]);
    }
    return ids;
  }
  const rowOf = async (id: string) => (await db.select().from(S.orders).where(deq(S.orders.id, id)).limit(1))[0]!;
  const eventsOf = (id: string, type?: string) =>
    db
      .select()
      .from(S.orderEvents)
      .where(type ? and(deq(S.orderEvents.orderId, id), deq(S.orderEvents.type, type)) : deq(S.orderEvents.orderId, id))
      .orderBy(S.orderEvents.id);
  const next = (ctx: WriteCtx) => Q.nextOrder(ctx, { idem: randomUUID() });
  const won = (r: NextResult): r is Won => r.ok;
  const idOf = (r: NextResult) => (r.ok ? r.order.id : r.reason);
  const outcome = (ctx: WriteCtx, r: Won | { order: { id: string; rev: number } }, o: Partial<import("@/lib/callcenter/outcomes").OutcomeInput> & { outcome: import("@/lib/callcenter/outcomes").OutcomeInput["outcome"] }) =>
    O.recordOutcome(ctx, { orderId: r.order.id, expectRev: r.order.rev, channel: "call", idem: randomUUID(), ...o });
  const activeClaims = async (sc: Sc, userId: string) =>
    (
      await db
        .select({ id: S.orders.id })
        .from(S.orders)
        .where(and(deq(S.orders.storeId, sc.id), deq(S.orders.assigneeId, userId), isNotNull(S.orders.claimToken), gt(S.orders.leaseUntil, at())))
    ).map((r) => r.id);
  const setProfile = (sc: Sc, userId: string, set: Partial<typeof S.agentProfiles.$inferInsert>) =>
    db
      .update(S.agentProfiles)
      .set(set)
      .where(and(deq(S.agentProfiles.storeId, sc.id), deq(S.agentProfiles.userId, userId)));

  /* ================================================================ */
  section = "race";
  {
    const sc = await store("race", 200);
    const ids = await cloneOrders(sc.id, 50);
    const t = realNow();
    const results = await Promise.all(sc.agents.map((a) => next(a)));
    timings.push(`race ${realNow() - t} ms`);
    const winners = results.map((r, i) => ({ r, agent: sc.agents[i]!.user.id })).filter((x) => won(x.r));
    eq("200 parallel Next on 50 orders: 50 winners", winners.length, 50);
    eq("… 150 empty", results.filter((r) => !r.ok && r.reason === "empty").length, 150);
    eq("… each winner a distinct order, together every order", [...new Set(winners.map((w) => idOf(w.r)))].sort(), [...ids].sort());
    const claimed = await db.select().from(S.orderEvents).where(and(deq(S.orderEvents.storeId, sc.id), deq(S.orderEvents.type, "claimed")));
    eq("one claimed event per order", claimed.length, 50);
    const rows = await db.select().from(S.orders).where(deq(S.orders.storeId, sc.id));
    const holder = new Map(rows.map((r) => [r.id, r.assigneeId]));
    ok(
      "every order is held by the agent who got its card, with a claim token",
      winners.every((w) => holder.get(idOf(w.r)) === w.agent) && rows.every((r) => !!r.claimToken),
      winners.filter((w) => holder.get(idOf(w.r)) !== w.agent).length,
    );
    ok("every claimed event is the holder's", claimed.every((e) => holder.get(e.orderId) === e.actorId));
    // one agent's Next on 200 open orders, server side (printed: the p75 budget is measured on the production build, OPE-§O.3)
    const solo = await store("solo", 1);
    await cloneOrders(solo.id, 200);
    const times: number[] = [];
    const cards = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const t1 = realNow();
      const r = await next(solo.agents[0]!);
      times.push(realNow() - t1);
      cards.add(idOf(r));
      if (won(r)) await Q.releaseOrder(solo.agents[0]!, r.order.id, "skip");
    }
    eq("20 Next + Skip in a row on 200 open orders: 20 distinct cards (the skip list)", cards.size, 20);
    timings.push(`Next p75 ${[...times].sort((a, b) => a - b)[14]} ms (200 open orders, local DB)`);
  }

  /* ================================================================ */
  section = "one claim";
  {
    const sc = await store("one", 2);
    const [x, y] = await cloneOrders(sc.id, 2);
    const [a1, a2] = sc.agents as [WriteCtx, WriteCtx];
    const r1 = await next(a1);
    ok("the first Next claims the oldest order", won(r1) && !r1.resumed && r1.order.id === x, r1);
    const r2 = await next(a1);
    ok("a second Next resumes it (resumed: true)", won(r2) && r2.resumed && r2.order.id === x, r2);
    const tabs = await Promise.all([next(a1), next(a1)]);
    eq("two tabs pressing Next at once resume the one claim", tabs.map(idOf), [x, x]);
    eq("one active claim", await activeClaims(sc, a1.user.id), [x]);
    eq("Take of an order the agent cannot see: not_found", await Q.takeOrder(a1, y!, { inbound: true }), { ok: false, error: "not_found" });
    rememberInbound(sc.scope, a1.user.id, [y!]);
    const take = await Q.takeOrder(a1, y!, { inbound: true });
    ok("Take while holding another order", take.ok && take.order.id === y, take);
    eq("… still one active claim (the held order was released first)", await activeClaims(sc, a1.user.id), [y]);
    eq("… the released order's event says skip", (await eventsOf(x!, "released")).map((e) => [e.actorId, e.reasonCode]), [[a1.user.id, "skip"]]);
    eq("the released order goes to the next agent", idOf(await next(a2)), x);
  }

  /* ================================================================ */
  section = "presence";
  {
    const sc = await store("presence", 1);
    const [x] = await cloneOrders(sc.id, 1);
    const a = sc.agents[0]!;
    ok("Offline (agents.self)", (await P.setPresence(a, "offline")).ok);
    eq("the profile is created lazily, offline", (await P.profileOf(sc.scope, a.user.id))?.presence, "offline");
    const r = await next(a);
    ok("the first Next of an offline agent claims", won(r) && r.order.id === x, r);
    const prof = await P.profileOf(sc.scope, a.user.id);
    eq("… and sets them online with a heartbeat (OD60)", [prof?.presence, prof?.lastSeenAt?.getTime(), prof && P.isLive(prof, at())], ["online", fake, true]);
    ok("Break", (await P.setPresence(a, "break")).ok);
    const rx = await rowOf(x!);
    eq("a break releases the held claim", [rx.claimToken, rx.leaseUntil, rx.assigneeId], [null, null, a.user.id]);
    eq("… written as released, why break", (await eventsOf(x!, "released")).map((e) => (e.meta as { why: string }).why), ["break"]);
    eq("a break agent gets on_break", await next(a), { ok: false, reason: "on_break" });
    eq("presence must be online, break or offline", await P.setPresence(a, "away" as never), { ok: false, error: "invalid" });
    await P.setPresence(a, "online");
    const back = await next(a);
    ok("Online again: Next claims", won(back) && back.order.id === x, back);
    ok("Skip", (await Q.releaseOrder(a, x!, "skip")).ok);
    eq("a skipped order is not handed back to the same agent", idOf(await next(a)), "empty");
    advance(9 * MIN);
    eq("… still away after 9 minutes", idOf(await next(a)), "empty");
    advance(2 * MIN);
    eq("… back after 10 minutes", idOf(await next(a)), x);
    eq("releaseOrder of an order the agent does not hold: not_found", await Q.releaseOrder(a, "QT-0000GHOST0", "skip"), { ok: false, error: "not_found" });
    eq("a viewer has no presence", await P.setPresence({ ...a, can: (p) => can("viewer", p) } as WriteCtx, "online"), { ok: false, error: "forbidden" });
  }

  /* ================================================================ */
  section = "lease";
  {
    const sc = await store("lease", 2);
    const [x] = await cloneOrders(sc.id, 1);
    const [a1, a2] = sc.agents as [WriteCtx, WriteCtx];
    const t0 = fake;
    const r1 = await next(a1);
    ok("a1 claims", won(r1) && r1.order.id === x && r1.leaseUntil === new Date(t0 + 15 * MIN).toISOString(), r1);
    advance(10 * MIN);
    await P.touchAgent(sc.scope, a1.user.id);
    eq("the heartbeat renews the held lease to now + 15 min (OD60)", (await rowOf(x!)).leaseUntil?.getTime(), t0 + 25 * MIN);
    const rev = (await rowOf(x!)).rev;
    await P.touchAgent(sc.scope, a1.user.id);
    eq("… at most one write per 60 s, and a renewal never bumps rev", [(await rowOf(x!)).leaseUntil?.getTime(), (await rowOf(x!)).rev], [t0 + 25 * MIN, rev]);
    advance(15 * MIN - 1000);
    eq("a held lease keeps the order from a colleague", idOf(await next(a2)), "empty");
    advance(2000);
    const r2 = await next(a2);
    ok("a 15-minute lease expires 15 minutes after the last heartbeat", won(r2) && r2.order.id === x, r2);
    const evs = (await eventsOf(x!)).filter((e) => ["claimed", "released", "assigned"].includes(e.type));
    eq(
      "the next claim writes released (lease_expired) for the previous holder at the old lease_until, then claimed (OD46)",
      evs.map((e) => [e.type, e.actorId === a1.user.id ? "a1" : e.actorId === a2.user.id ? "a2" : e.actorId, e.reasonCode, e.at.getTime() - t0]),
      [
        ["claimed", "a1", null, 0],
        ["assigned", "a1", null, 0],
        ["released", "a1", "lease_expired", 25 * MIN],
        ["claimed", "a2", null, 25 * MIN + 1000],
        ["assigned", "a2", null, 25 * MIN + 1000],
      ],
    );
    const notes = await db.select().from(S.notifications).where(and(deq(S.notifications.storeId, sc.id), deq(S.notifications.kind, "ops.abandoned_claims")));
    eq("the managers hear of it once (ops.abandoned_claims, batched)", notes.map((n) => [(n.vars as { count: number }).count, n.link]), [[1, "/app/q-lease/queue/board"]]);
    const again = await next(a2);
    ok("a resumed claim never triggers the attribution", won(again) && again.resumed && (await eventsOf(x!, "released")).length === 1, again);
    advance(16 * MIN);
    const before = (await rowOf(x!)).leaseUntil?.getTime();
    await P.touchAgent(sc.scope, a2.user.id);
    eq("the heartbeat never resurrects an expired lease", (await rowOf(x!)).leaseUntil?.getTime(), before);
    await Q.renewLease(sc.scope, x!, a2.user.id);
    eq("… neither does an action's renewal", (await rowOf(x!)).leaseUntil?.getTime(), before);
  }

  /* ================================================================ */
  section = "callback";
  {
    const sc = await store("callback", 2);
    const [x] = await cloneOrders(sc.id, 1);
    const [a1, a2] = sc.agents as [WriteCtx, WriteCtx];
    const t0 = fake;
    const r = await next(a1);
    if (!won(r)) throw new Error("callback: a1 claimed nothing");
    const cb = await outcome(a1, r, { outcome: "callback", dueAt: at(30 * MIN).toISOString() });
    ok("a1 promises a callback in 30 minutes", cb.ok && cb.data.ok && cb.data.states.confirm === "callback", cb);
    const rx = await rowOf(x!);
    eq("the callback keeps its owner until due + grace, with no claim", [rx.assigneeId, rx.dueAt?.getTime(), rx.leaseUntil?.getTime(), rx.claimToken], [a1.user.id, t0 + 30 * MIN, t0 + 45 * MIN, null]);
    const [pin] = await cloneOrders(sc.id, 1, { priority: 1500 });
    advance(31 * MIN);
    const own = await next(a1);
    ok("a due callback reaches its owner first, even before a pinned order", won(own) && own.order.id === x && !own.resumed, own);
    eq("a colleague gets the pinned order meanwhile", idOf(await next(a2)), pin);
    if (won(own)) await outcome(a1, own, { outcome: "confirmed" });
    const pinRow = await rowOf(pin!);
    await outcome(a2, { order: { id: pin!, rev: pinRow.rev } }, { outcome: "confirmed" });
    // a second callback of a1, seen by a2 during and after the grace
    const [y] = await cloneOrders(sc.id, 1);
    const ry = await next(a1);
    if (!won(ry) || ry.order.id !== y) throw new Error(`callback: a1 did not get the second order (${idOf(ry)})`);
    await outcome(a1, ry, { outcome: "callback", dueAt: at(10 * MIN).toISOString() });
    advance(11 * MIN);
    eq("during the grace a colleague does not get another agent's callback", idOf(await next(a2)), "empty");
    advance(15 * MIN);
    const pool = await next(a2);
    ok("after the grace the callback is in the pool", won(pool) && pool.order.id === y, pool);
    eq("… the new holder is assigned by the claim, no lease was abandoned", (await eventsOf(y!)).filter((e) => ["assigned", "released"].includes(e.type)).map((e) => [e.type, (e.meta as { by?: string; to?: string }).by ?? null, e.actorId === a2.user.id]), [
      ["assigned", "claim", false],
      ["assigned", "claim", true],
    ]);
  }

  /* ================================================================ */
  section = "manual";
  {
    const sc = await store("manual", 2, { assignment: "manual" });
    const [x, y] = await cloneOrders(sc.id, 2);
    const [a1, a2] = sc.agents as [WriteCtx, WriteCtx];
    await P.setPresence(a1, "online");
    eq("manual mode: nothing assigned, nothing to claim", idOf(await next(a1)), "empty");
    eq("an agent cannot assign", await Q.assignOrders(a1, [x!], a1.user.id), { ok: false, error: "forbidden" });
    eq("more than 200 ids", await Q.assignOrders(sc.manager, Array.from({ length: 201 }, (_, i) => `QT-${String(i).padStart(10, "0")}`), a1.user.id), { ok: false, error: "invalid" });
    eq("to someone who takes no calls here", await Q.assignOrders(sc.manager, [x!], AGENTS[150]!.id), { ok: false, error: "not_found" });
    const res = await Q.assignOrders(sc.manager, [x!, "QT-0000GHOST0"], a1.user.id);
    eq("a manager assigns, per-order results", res, { ok: true, data: { results: [{ id: x, ok: true }, { id: "QT-0000GHOST0", ok: false, error: "not_found" }] } });
    const rx = await rowOf(x!);
    eq("a live agent's assignment leases rebalanceMinutes", [rx.assigneeId, rx.leaseUntil?.getTime(), rx.claimToken], [a1.user.id, fake + 20 * MIN, null]);
    eq("… event assigned by manual", (await eventsOf(x!, "assigned")).map((e) => e.meta), [{ to: a1.user.id, by: "manual" }]);
    eq("only the assignee claims it", [idOf(await next(a2)), idOf(await next(a1))], ["empty", x]);
    const back = await Q.assignOrders(sc.manager, [x!], null);
    ok("back to the pool", back.ok);
    const rb = await rowOf(x!);
    eq("… the claim ended, released by the manager, then unassigned", [rb.assigneeId, rb.claimToken, (await eventsOf(x!)).slice(-2).map((e) => [e.type, e.reasonCode, (e.meta as { by?: string }).by ?? null])], [
      null,
      null,
      [
        ["released", "manager", null],
        ["unassigned", null, "manual"],
      ],
    ]);
    await P.setPresence(a2, "offline");
    eq("an offline agent's assignment carries no lease", await Q.assignOrders(sc.manager, [y!], a2.user.id).then(async () => (await rowOf(y!)).leaseUntil), null);
    const [closed] = await cloneOrders(sc.id, 1, { confirm_state: "cancelled", status: statusOf({ confirm: "cancelled" }) });
    eq("a decided order cannot be assigned", await Q.assignOrders(sc.manager, [closed!], a1.user.id), { ok: true, data: { results: [{ id: closed, ok: false, error: "illegal" }] } });
  }

  /* ================================================================ */
  section = "round robin";
  {
    const sc = await store("rr", 4, { assignment: "round_robin" });
    const [w1, w2, w3, idle] = sc.agents as [WriteCtx, WriteCtx, WriteCtx, WriteCtx];
    for (const [a, w] of [
      [w1, 1],
      [w2, 2],
      [w3, 3],
    ] as const) {
      await P.setPresence(a, "online");
      await setProfile(sc, a.user.id, { weight: w });
    }
    await P.setPresence(idle, "offline");
    const ids = await cloneOrders(sc.id, 1000);
    const t = realNow();
    const got = new Map<string, number>();
    for (const id of ids) {
      const r = await Q.assignOnCreate(sc.scope, { id, isTest: false });
      got.set(r.assigned ?? "pool", (got.get(r.assigned ?? "pool") ?? 0) + 1);
    }
    timings.push(`round robin 1,000 ${realNow() - t} ms`);
    const share = (a: WriteCtx) => (got.get(a.user.id) ?? 0) / 1000;
    for (const [a, w] of [
      [w1, 1],
      [w2, 2],
      [w3, 3],
    ] as const) {
      ok(`weight ${w}: ${(share(a) * 100).toFixed(1)} % of 1,000 orders, within ±5 % of ${((w / 6) * 100).toFixed(1)} %`, Math.abs(share(a) - w / 6) <= 0.05 * (w / 6), Object.fromEntries(got));
    }
    eq("nobody offline is picked, nothing left in the pool", [got.get(idle.user.id) ?? 0, got.get("pool") ?? 0], [0, 0]);
    const sample = await rowOf(ids[0]!);
    eq("an assigned order: the agent and a lease of rebalanceMinutes, no claim", [sample.assigneeId !== null, sample.leaseUntil?.getTime(), sample.claimToken], [true, fake + 20 * MIN, null]);
    const rrEvents = await db.select().from(S.orderEvents).where(and(deq(S.orderEvents.storeId, sc.id), deq(S.orderEvents.type, "assigned")));
    ok("one assigned event (by rr) per order", rrEvents.length === 1000 && rrEvents.every((e) => (e.meta as { by: string }).by === "rr" && e.actorKind === "system"), rrEvents.length);
    eq("an assigned order reaches its agent first", idOf(await next(w1)), (await db.select({ id: S.orders.id }).from(S.orders).where(and(deq(S.orders.storeId, sc.id), deq(S.orders.assigneeId, w1.user.id))).orderBy(S.orders.createdAt).limit(1))[0]?.id);
    // an agent at their cap is skipped
    await setProfile(sc, w3.user.id, { dailyCap: 0 });
    const capped = await cloneOrders(sc.id, 12);
    const after: (string | null)[] = [];
    for (const id of capped) after.push((await Q.assignOnCreate(sc.scope, { id, isTest: false })).assigned);
    ok("an agent at their daily cap is skipped", after.every((a) => a === w1.user.id || a === w2.user.id), after);
    await setProfile(sc, w3.user.id, { dailyCap: null });
    // the lock held elsewhere → the pool, after the 1 s wait
    const mysql = (await import("mysql2/promise")).default;
    const rival = await mysql.createConnection({ uri: `${DB_SERVER}/${dbName}` });
    await rival.query("SELECT GET_LOCK(?, 0)", [storeLock(sc.id, "rr")]);
    const [locked] = await cloneOrders(sc.id, 1);
    const t1 = realNow();
    eq("the round-robin lock held elsewhere: the order stays in the pool", await Q.assignOnCreate(sc.scope, { id: locked!, isTest: false }), { assigned: null });
    ok("… after at most the 1 s wait", realNow() - t1 < 3000, realNow() - t1);
    await rival.end();
    eq("… unassigned", (await rowOf(locked!)).assigneeId, null);
    advance(4 * MIN);
    const [quiet] = await cloneOrders(sc.id, 1);
    eq("nobody live (no heartbeat for 3 minutes): the pool", await Q.assignOnCreate(sc.scope, { id: quiet!, isTest: false }), { assigned: null });
    const pullStore = await store("rr-pull", 1);
    const [pulled] = await cloneOrders(pullStore.id, 1);
    await P.setPresence(pullStore.agents[0]!, "online");
    eq("pull mode assigns nothing", await Q.assignOnCreate(pullStore.scope, { id: pulled!, isTest: false }), { assigned: null });
  }

  /* ================================================================ */
  section = "window";
  {
    const tz = "Africa/Casablanca";
    const today = W.storeYmd(at(), tz);
    const base = await getStoreSetting(tpl.scope, "ops");
    const sc = await store("window", 1, { openOverrideUntil: null, callingWindow: { ...base.callingWindow, closedDates: [today] } });
    const [x] = await cloneOrders(sc.id, 1);
    const a = sc.agents[0]!;
    const w = await callingWindowFor(sc.scope);
    eq("callingWindowFor: the ops setting in the store's time zone, configured once saved", [w.tz, w.closedDates, w.openOverrideUntil, w.configured], [tz, [today], null, false]);
    const r = await next(a);
    eq("a closed day answers outside_window with the next opening", r, { ok: false, reason: "outside_window", opensAt: W.nextCallableAt(at(), w).toISOString() });
    ok("… a later day", !r.ok && r.reason === "outside_window" && !!r.opensAt && W.storeYmd(new Date(r.opensAt), tz) > today, r);
    await setStoreSetting(sc.scope, "ops", { ...(await getStoreSetting(sc.scope, "ops")), openOverrideUntil: at(2 * 60 * MIN).toISOString() }, { id: OWNER.id });
    eq("Open calls now (2 h): Next claims", idOf(await next(a)), x);
    const saved = await store("window-saved", 0, { callingWindow: { ...base.callingWindow, savedAt: at().toISOString() } });
    eq("a saved window is configured (OD63)", (await callingWindowFor(saved.scope)).configured, true);
  }

  /* ================================================================ */
  section = "daily cap";
  {
    const sc = await store("cap", 2);
    await cloneOrders(sc.id, 3);
    const [a1, a2] = sc.agents as [WriteCtx, WriteCtx];
    const r = await next(a1);
    if (!won(r)) throw new Error("cap: nothing claimed");
    await setProfile(sc, a1.user.id, { dailyCap: 1 });
    const done = await outcome(a1, r, { outcome: "confirmed" });
    ok("a1 decides one order", done.ok && done.data.ok, done);
    eq("at the cap: cap_reached", await next(a1), { ok: false, reason: "cap_reached" });
    ok("another agent still claims", won(await next(a2)));
    await setProfile(sc, a1.user.id, { dailyCap: 2 });
    advance(61_000);
    ok("a higher cap lets a1 claim again", won(await next(a1)));
  }

  /* ================================================================ */
  section = "transient";
  {
    const err = (errno: number, code: string) => Object.assign(new Error(code), { errno, code });
    let calls = 0;
    const once = await Q.retryTransientOnce(async () => {
      if (calls++ === 0) throw err(1205, "ER_LOCK_WAIT_TIMEOUT");
      return "won";
    }, "busy");
    eq("a lock-wait timeout is retried once, then the claim runs", [once, calls], ["won", 2]);
    calls = 0;
    const twice = await Q.retryTransientOnce(async () => {
      calls++;
      throw new Error("Failed query", { cause: err(1213, "ER_LOCK_DEADLOCK") });
    }, "busy");
    eq("a deadlock twice (wrapped as the query builder wraps it): busy, which Next answers as empty", [twice, calls], ["busy", 2]);
    calls = 0;
    const other = await Q.retryTransientOnce(async () => {
      calls++;
      throw new Error("ER_BAD_FIELD");
    }, "busy").then(
      () => "resolved",
      (e: Error) => e.message,
    );
    eq("any other error is not retried", [other, calls], ["ER_BAD_FIELD", 1]);
    // a real lock wait on the claim statement: a 1 s session timeout, the rows held by another transaction
    const sc = await store("lockwait", 1);
    await cloneOrders(sc.id, 3);
    const mysql = (await import("mysql2/promise")).default;
    const holder = await mysql.createConnection({ uri: `${DB_SERVER}/${dbName}`, timezone: "Z" });
    const claimer = await mysql.createConnection({ uri: `${DB_SERVER}/${dbName}`, timezone: "Z" });
    try {
      await holder.query("SET SESSION innodb_lock_wait_timeout = 1");
      await claimer.query("SET SESSION innodb_lock_wait_timeout = 1");
      await holder.query("START TRANSACTION");
      await holder.query("SELECT id FROM orders WHERE store_id = ? FOR UPDATE", [sc.id]);
      const cdb = drizzle(claimer, { schema: S, mode: "default" }) as unknown as typeof db;
      const args = { uid: sc.agents[0]!.user.id, tok: newId(), now: at(), until: at(15 * MIN), manual: false, skipped: [] };
      let tries = 0;
      const t = realNow();
      const res = await Q.retryTransientOnce(async () => {
        tries++;
        return Q.claimStatement(cdb, sc.scope, args);
      }, "busy" as const);
      eq("a real lock wait on the claim statement (errno 1205): retried once, then busy", [res, tries], ["busy", 2]);
      ok("… within two lock waits", realNow() - t < 6000, realNow() - t);
      await holder.query("ROLLBACK");
      eq("the rows were never claimed", (await db.select({ c: S.orders.claimToken }).from(S.orders).where(deq(S.orders.storeId, sc.id))).filter((r) => r.c !== null).length, 0);
    } finally {
      await holder.end();
      await claimer.end();
    }
  }

  /* ================================================================ */
  section = "idempotency";
  {
    const sc = await store("idem", 2);
    await cloneOrders(sc.id, 3);
    const [a1, a2] = sc.agents as [WriteCtx, WriteCtx];
    const key = randomUUID();
    const first = await Q.nextOrder(a1, { idem: key });
    const second = await Q.nextOrder(a1, { idem: key });
    ok("the same Idempotency-Key twice: the first card, replayed: true", won(first) && won(second) && second.replayed === true && second.order.id === first.order.id && !("replayed" in first), [first, second]);
    const claimedBy = async (u: string) => (await db.select().from(S.orderEvents).where(and(deq(S.orderEvents.storeId, sc.id), deq(S.orderEvents.type, "claimed"), deq(S.orderEvents.actorId, u)))).length;
    eq("… claims once", await claimedBy(a1.user.id), 1);
    const k2 = randomUUID();
    const tap = await Promise.all([Q.nextOrder(a2, { idem: k2 }), Q.nextOrder(a2, { idem: k2 })]);
    ok("a double tap (the same key at once): one card, one of them replayed", tap.every(won) && idOf(tap[0]) === idOf(tap[1]) && tap.filter((r) => won(r) && r.replayed).length === 1, tap);
    eq("… claims once", await claimedBy(a2.user.id), 1);
    eq("another agent's key is never a replay", won(await Q.nextOrder(a2, { idem: key })) ? "own card" : "x", "own card");
    if (!won(first)) throw new Error("idem: nothing claimed");
    const k3 = randomUUID();
    const o1 = await O.recordOutcome(a1, { orderId: first.order.id, expectRev: first.order.rev, channel: "call", outcome: "no_answer", idem: k3 });
    const o2 = await O.recordOutcome(a1, { orderId: first.order.id, expectRev: first.order.rev, channel: "call", outcome: "no_answer", idem: k3 });
    ok("an outcome sent twice: the first result, replayed", o1.ok && o2.ok && o2.data.replayed === true && o1.data.ok && o2.data.ok && o2.data.rev === o1.data.rev, [o1, o2]);
    eq("… one attempt written", (await eventsOf(first.order.id, "call_attempt")).length, 1);
    const stale = await O.recordOutcome(a1, { orderId: first.order.id, expectRev: first.order.rev, channel: "call", outcome: "no_answer", idem: randomUUID() });
    ok("a new key with the old rev: conflict with the fresh state", stale.ok && !stale.data.ok && stale.data.error === "conflict" && stale.data.current?.rev === (o1.ok && o1.data.ok ? o1.data.rev : -1), stale);
  }

  /* ================================================================ */
  section = "lifecycle";
  {
    const s1 = await store("life-a", 2);
    const s2 = await store("life-b", 1);
    await cloneOrders(s1.id, 3);
    const [other] = await cloneOrders(s2.id, 1);
    await next(s1.agents[0]!);
    await next(s1.agents[1]!);
    const inB = await next(s2.agents[0]!);
    ok("the same person holds one claim in each store", won(inB) && inB.order.id === other && (await activeClaims(s1, s1.agents[0]!.user.id)).length === 1, inB);
    eq("releaseAllLeases: every claim of the store", await Q.releaseAllLeases(s1.scope), { released: 2 });
    const rows = await db.select().from(S.orders).where(deq(S.orders.storeId, s1.id));
    ok("… no claim or lease left", rows.every((r) => r.claimToken === null && r.leaseUntil === null), rows.map((r) => [r.claimToken, r.leaseUntil]));
    const rel = await db.select().from(S.orderEvents).where(and(deq(S.orderEvents.storeId, s1.id), deq(S.orderEvents.type, "released")));
    eq("… one released (store_state) per order, by the system", rel.map((e) => [e.actorKind, e.actorId, e.reasonCode]), [
      ["system", null, "store_state"],
      ["system", null, "store_state"],
    ]);
    const kept = await rowOf(other!);
    ok("… and none of another store", !!kept.claimToken && kept.assigneeId === s2.agents[0]!.user.id);
    eq("a second call releases nothing", await Q.releaseAllLeases(s1.scope), { released: 0 });
    ok("the agents re-claim on their next N", won(await next(s1.agents[0]!)));
  }

  /* ================================================================ */
  section = "lanes";
  {
    const sc = await store("lanes", 1);
    const a = sc.agents[0]!;
    const delivery = (dueAt: Date | null, ship: "attempt_failed" | "postponed" = "attempt_failed") => ({
      confirm_state: "confirmed",
      ship_state: ship,
      status: statusOf({ confirm: "confirmed", ship }),
      due_at: dueAt,
      delivery_attempts: 1,
      priority: 650,
      confirmed_at: at(-60 * MIN),
    });
    const [pin] = await cloneOrders(sc.id, 1, { priority: 1500 });
    const [failed] = await cloneOrders(sc.id, 1, delivery(at(-MIN)));
    const [cb] = await cloneOrders(sc.id, 1, { confirm_state: "callback", status: statusOf({ confirm: "callback" }), due_at: at(-2 * MIN), priority: 600 });
    const [fresh] = await cloneOrders(sc.id, 1);
    const [later] = await cloneOrders(sc.id, 1, delivery(at(60 * MIN)));
    await cloneOrders(sc.id, 1, { ...delivery(null, "postponed"), ship_after: at(3 * 24 * 60 * MIN) });
    await cloneOrders(sc.id, 1, delivery(null));
    const seen: string[] = [];
    const n1 = await next(a);
    seen.push(idOf(n1));
    if (won(n1)) await outcome(a, n1, { outcome: "confirmed" });
    const n2 = await next(a);
    seen.push(idOf(n2));
    ok("the delivery card: lane, attempts, rescue calls left", won(n2) && n2.order.lane === "delivery" && n2.order.delivery?.attempts === 1 && n2.order.delivery.rescueCallsLeft === 3, won(n2) ? n2.order : n2);
    if (won(n2)) {
      for (const o of ["confirmed", "callback", "cancelled"] as const) {
        const r = await outcome(a, n2, { outcome: o, dueAt: at(60 * MIN).toISOString(), reason: "price" });
        ok(`recordOutcome refuses the confirm outcome ${o} on a delivery-lane order`, r.ok && !r.data.ok && r.data.error === "illegal", r);
      }
      const inf = await outcome(a, n2, { outcome: "customer_informed" });
      ok("customer_informed leaves the lane", inf.ok && inf.data.ok && (await rowOf(failed!)).dueAt === null, inf);
    }
    const n3 = await next(a);
    seen.push(idOf(n3));
    if (won(n3)) {
      const bad = await outcome(a, n3, { outcome: "customer_informed" });
      ok("… and the reverse: a delivery outcome on a confirm-lane order is illegal", bad.ok && !bad.data.ok && bad.data.error === "illegal", bad);
      await outcome(a, n3, { outcome: "confirmed" });
    }
    const n4 = await next(a);
    seen.push(idOf(n4));
    if (won(n4)) await outcome(a, n4, { outcome: "confirmed" });
    eq("the claim order: pinned, then the failed delivery (650), then the callback (600), then the new order", seen, [pin, failed, cb, fresh]);
    const n5 = await next(a);
    eq("a parcel not due yet, a postponed one and an exhausted one are never claimed; the next due time is said", n5, { ok: false, reason: "empty", nextDueAt: (await rowOf(later!)).dueAt!.toISOString() });
  }

  /* ================================================================ */
  section = "explain";
  {
    const sc = await store("explain", 1);
    await cloneOrders(sc.id, 40);
    await cloneOrders(sc.id, 10, { confirm_state: "confirmed", ship_state: "attempt_failed", status: statusOf({ confirm: "confirmed", ship: "attempt_failed" }), due_at: at(-MIN), priority: 650 });
    await cloneOrders(sc.id, 3000, { confirm_state: "confirmed", ship_state: "delivered", money_state: "remitted", status: statusOf({ confirm: "confirmed", ship: "delivered", money: "remitted" }) });
    await cloneOrders(sc.id, 1000, { confirm_state: "cancelled", status: statusOf({ confirm: "cancelled" }) });
    await pool().query("ANALYZE TABLE orders");
    const args = { uid: sc.agents[0]!.user.id, tok: newId(), now: at(), until: at(15 * MIN), manual: false, skipped: ["QT-0000GHOST0"] };
    const q = Q.claimStatement(db, sc.scope, args).toSQL();
    const [plan] = (await pool().query(`EXPLAIN ${q.sql}`, q.params)) as unknown as [{ type: string; key: string | null; key_len: string | null; rows: number; Extra: string }[]];
    const [json] = (await pool().query(`EXPLAIN FORMAT=JSON ${q.sql}`, q.params)) as unknown as [{ EXPLAIN: string }[]];
    const tree = String(json[0]?.EXPLAIN ?? "");
    const row = plan[0];
    ok("EXPLAIN: the claim reads orders_queue_idx as a range (no full scan)", row?.key === "orders_queue_idx" && (row.type === "range" || row.type === "index_merge"), plan);
    // the key length of all three parts, measured on a plain range read of the same index
    const [full] = (await pool().query("EXPLAIN SELECT id FROM orders FORCE INDEX (orders_queue_idx) WHERE store_id = ? AND confirm_state = 'confirmed' AND due_at <= ?", [sc.id, at()])) as unknown as [{ key_len: string | null }[]];
    eq("… on store_id, confirm_state and due_at: both lane ranges use the whole key", row?.key_len, full[0]?.key_len);
    ok("… (the JSON plan agrees)", tree.includes("orders_queue_idx") && !/"access_type":\s*"ALL"/.test(tree), tree.slice(0, 800));
    ok("… a bounded filesort, not the table", (row?.rows ?? Infinity) < 500, row);
    timings.push(`explain: ${row?.type} ${row?.key} key_len ${row?.key_len} rows ${row?.rows}`);
  }

  /* ================================================================ */
  section = "inbound";
  {
    const sc = await store("inbound", 3);
    const [x, z] = await cloneOrders(sc.id, 2);
    const [a1, a2, a3] = sc.agents as [WriteCtx, WriteCtx, WriteCtx];
    const r = await next(a1);
    if (!won(r) || r.order.id !== x) throw new Error("inbound: a1 did not get x");
    await outcome(a1, r, { outcome: "callback", dueAt: at(60 * MIN).toISOString() });
    eq("a2 without a lookup: not_found", await Q.takeOrder(a2, x!, { inbound: true }), { ok: false, error: "not_found" });
    rememberInbound(sc.scope, a2.user.id, [x!]);
    const take = await Q.takeOrder(a2, x!, { inbound: true });
    ok("the inbound take of a callback owned by an idle agent (OD53)", take.ok && take.order.id === x && take.order.inbound === true && take.order.mine, take);
    const rx = await rowOf(x!);
    eq("… the taker holds it now", [rx.assigneeId, !!rx.claimToken, rx.leaseUntil?.getTime()], [a2.user.id, true, fake + 15 * MIN]);
    eq("… assigned by inbound", (await eventsOf(x!, "assigned")).at(-1)?.meta, { to: a2.user.id, by: "inbound" });
    const rz = await next(a1);
    if (!won(rz) || rz.order.id !== z) throw new Error("inbound: a1 did not get z");
    rememberInbound(sc.scope, a3.user.id, [z!]);
    eq("an order a colleague holds right now: held", await Q.takeOrder(a3, z!, { inbound: true }), { ok: false, error: "held" });
    const [done] = await cloneOrders(sc.id, 1, { confirm_state: "cancelled", status: statusOf({ confirm: "cancelled" }) });
    eq("a manager's take of a decided order: not_callable", await Q.takeOrder(sc.manager, done!, { inbound: false }), { ok: false, error: "not_callable" });
    eq("another store's id: not_found", await Q.takeOrder(sc.manager, TEMPLATE, { inbound: false }), { ok: false, error: "not_found" });
  }

  /* ================================================================ */
  section = "pulse";
  {
    const sc = await store("pulse", 2);
    const [a1, a2] = sc.agents as [WriteCtx, WriteCtx];
    const dueCb = (owner: string) => ({ confirm_state: "callback", status: statusOf({ confirm: "callback" }), due_at: at(-MIN), assignee_id: owner, lease_until: at(14 * MIN), priority: 600 });
    const today = { created_at: at(-1000) };
    await cloneOrders(sc.id, 2, today);
    await cloneOrders(sc.id, 1, { ...today, is_test: 1 });
    await cloneOrders(sc.id, 1, { ...today, ...dueCb(a1.user.id) });
    await cloneOrders(sc.id, 2, { ...today, ...dueCb(a2.user.id) });
    const asAgent = await Q.opsPulse(sc.scope, { userId: a1.user.id, role: "agent" });
    const asManager = await Q.opsPulse(sc.scope, { userId: MANAGER.id, role: "manager" });
    eq("an agent: their callbacks; the queue now (test orders in, owned callbacks out); new real orders today", asAgent, { newOrders: 5, dueCallbacks: 1, queueNow: 3, syncFailed: 0 });
    eq("a manager: every due callback", asManager.dueCallbacks, 3);
    Q.markOrdersSeen(sc.scope, a1.user.id);
    advance(1000);
    await cloneOrders(sc.id, 1, { created_at: at() });
    eq("newOrders counts from the viewer's cursor", (await Q.opsPulse(sc.scope, { userId: a1.user.id, role: "agent" })).newOrders, 1);
    eq("… another viewer's cursor is their own", (await Q.opsPulse(sc.scope, { userId: MANAGER.id, role: "manager" })).newOrders, 6);
    const other = await Q.opsPulse(tpl.scope, { userId: MANAGER.id, role: "manager" });
    eq("another store's pulse counts its own orders only", [other.queueNow, other.dueCallbacks], [1, 0]);
  }

  for (const f of failures) console.log(`✗ ${f}`);
  console.log(`  ${timings.join(" · ")}`);
  console.log(failures.length ? `✗ test:queue: ${failures.length} failure(s), ${pass} passed` : `✓ test:queue: ${pass} assertions passed (${dbName})`);
  return failures.length ? 1 : 0;
}

async function cleanup(): Promise<void> {
  try {
    const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
    await pool().end();
  } catch {
    // the pool was never opened
  }
  if (KEEP) console.log(`… kept ${dbName}`);
  else await rootQuery(`DROP DATABASE IF EXISTS \`${dbName}\``).catch((e: unknown) => console.error(`✗ could not drop ${dbName}:`, e instanceof Error ? e.message : e));
}

main()
  .then(async (code) => {
    await cleanup();
    process.exit(code);
  })
  .catch(async (e) => {
    console.error(e);
    await cleanup();
    process.exit(1);
  });

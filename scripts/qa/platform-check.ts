/**
 * Platform DB checks (platform.md PLA-§O.2, P1 CONSOLE): `npm run test:platform-db`, in `test:db` from the P1 merge.
 *
 *   npx tsx scripts/qa/platform-check.ts [--case 6,15] [--db cod_test_p1_platform] [--keep] [--verbose]
 *   npx tsx scripts/qa/platform-check.ts --perf     (qa:platform-perf, manual: the 2,000-store fixture, step 6)
 *   npx tsx scripts/qa/platform-check.ts --e2e      (reserved for the console e2e seed, step 13)
 *
 * A throwaway database (`cod_test_*` only, refused otherwise) on the local MariaDB as root without a password
 * (127.0.0.1:3306, or SG_TEST_SERVER): created, migrated with the app's migrator, seeded, then every registered case
 * of PLA-§O.2 (numbered like the spec; `--case` picks some), and dropped at the end whatever happened (`--keep` keeps
 * it for a look). No network.
 *
 * The seed (`seed()`): three stores and their people.
 *   - A "Atlas Argan" (`active`): owner (the seller e-mail canary `canary.seller@example.test`), admin, manager, agent
 *     and viewer, and one order carrying the customer canaries of PLA-§O.3 (phone +212600000777, name
 *     "Canaryname Zzz", address "Rue Canary 77", note "canary-note-77");
 *   - B "Baraka Home" (`pending`): an owner; C "Corail Deco" (`suspended`): an owner; D (`purged`, its handle still on
 *     the row): no member;
 *   - staff: one of each platform role with TOTP on, and an admin invited without TOTP yet; an outsider seller.
 * Cases filled so far: 5 (the health job), 6 (notifications) and 15 (brand guard, reports, the health-run half); the
 * others print "pending" with the step that fills them.
 */
import Module from "node:module";
import mysql from "mysql2/promise";

// the modules under test are marked `import "server-only"`; outside Next that import throws (as in selftest-team)
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

const DB = arg("db") ?? process.env.SG_TEST_DB ?? "cod_test_p1_platform";
const SERVER = process.env.SG_TEST_SERVER ?? "mysql://root@127.0.0.1:3306/";
if (!/^cod_test_[a-z0-9_]{1,40}$/.test(DB)) {
  console.error(`platform-check: the database must be a cod_test_* name, got "${DB.slice(0, 60)}"`);
  process.exit(2);
}
const KEEP = flag("keep");
const VERBOSE = flag("verbose");

const env = process.env as Record<string, string | undefined>;
env.DATABASE_URL = SERVER + DB;
env.APP_SECRET = "platform-check-secret-5d0c19e7a4b2f86e3c71";
env.SG_TEST_CONTEXT = "1";
env.PLATFORM_URL = "http://localhost:3461";
for (const k of ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "SMTP_URL", "MAIL_FROM", "STORE_ROOT_DOMAIN", "EDGE_KEY", "ADMIN_IP_ALLOWLIST", "ADMIN_HOST", "PUBLIC_URL"]) delete env[k];
if (env.NODE_ENV === "production") throw new Error("platform-check never runs with NODE_ENV=production");

/* ------------------------------------------------------------------ */
/* results                                                             */
/* ------------------------------------------------------------------ */

let passed = 0;
const failures: string[] = [];
let current = "";
function ok(label: string, cond: unknown, info?: unknown): void {
  if (cond) {
    passed++;
    if (VERBOSE) console.log(`    ✓ ${label}`);
  } else failures.push(`case ${current}: ${label}${info === undefined ? "" : `\n      ${JSON.stringify(info)}`}`);
}

/* ------------------------------------------------------------------ */
/* seed                                                                */
/* ------------------------------------------------------------------ */

export const CANARY = {
  phone: "+212600000777",
  name: "Canaryname Zzz",
  address: "Rue Canary 77",
  note: "canary-note-77",
  sellerEmail: "canary.seller@example.test",
} as const;

type SellerRole = "owner" | "admin" | "manager" | "agent" | "viewer";
type StaffRole = "super_admin" | "admin" | "support" | "analyst";

export interface StoreFx {
  id: string;
  handle: string;
  name: string;
  status: string;
}

export interface Fixtures {
  conn: mysql.Connection;
  stores: { A: StoreFx; B: StoreFx; C: StoreFx; D: StoreFx };
  /** store A's members by role */
  a: Record<SellerRole, string>;
  owners: { B: string; C: string };
  staff: Record<StaffRole, string> & { adminNoTotp: string };
  outsider: string;
  order: string;
  newId: () => string;
}

async function seed(conn: mysql.Connection): Promise<Fixtures> {
  const { newId } = await import("@/lib/db/ids");
  const user = async (email: string, name: string, opts: { platformRole?: string; totp?: boolean; locale?: string } = {}) => {
    const id = newId();
    // never signs in: the console and tenant cases call the functions with ids, the e2e step (13) adds sessions
    await conn.query("INSERT INTO users (id, email, name, password_hash, platform_role, totp_enabled, locale) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      id,
      email,
      name,
      "platform-check:no-password",
      opts.platformRole ?? "none",
      opts.totp ? 1 : 0,
      opts.locale ?? null,
    ]);
    return id;
  };
  const store = async (handle: string, name: string, status: string, createdBy: string | null): Promise<StoreFx> => {
    const id = newId();
    await conn.query("INSERT INTO stores (id, handle, name, status, brand_seed, created_by) VALUES (?, ?, ?, ?, ?, ?)", [id, handle, name, status, id.slice(-16).toLowerCase(), createdBy]);
    return { id, handle, name, status };
  };
  const member = (storeId: string, userId: string, role: string) => conn.query("INSERT INTO store_members (store_id, user_id, role) VALUES (?, ?, ?)", [storeId, userId, role]);

  const a: Record<SellerRole, string> = {
    owner: await user(CANARY.sellerEmail, "Salma Benali", { locale: "en" }),
    admin: await user("youssef@atlas-argan.test", "Youssef Amrani", { locale: "ar" }),
    manager: await user("hajar@atlas-argan.test", "Hajar Idrissi", { locale: "fr" }),
    agent: await user("omar@atlas-argan.test", "Omar Tazi"),
    viewer: await user("nadia@atlas-argan.test", "Nadia Alaoui"),
  };
  const owners = { B: await user("karim@baraka-home.test", "Karim Tazi", { locale: "fr" }), C: await user("leila@corail-deco.test", "Leila Fassi") };
  const staff = {
    super_admin: await user("root@store-gen.test", "Platform Root", { platformRole: "super_admin", totp: true }),
    admin: await user("ops@store-gen.test", "Platform Ops", { platformRole: "admin", totp: true }),
    support: await user("help@store-gen.test", "Platform Help", { platformRole: "support", totp: true }),
    analyst: await user("data@store-gen.test", "Platform Data", { platformRole: "analyst", totp: true }),
    adminNoTotp: await user("new.ops@store-gen.test", "New Ops", { platformRole: "admin", totp: false }),
  };
  const outsider = await user("visitor@example.test", "Visitor");

  const A = await store("atlas-argan", "Atlas Argan", "active", a.owner);
  const B = await store("baraka-home", "Baraka Home", "pending", owners.B);
  const C = await store("corail-deco", "Corail Deco", "suspended", owners.C);
  const D = await store("dune-gone", "Dune Gone", "purged", null);
  for (const role of ["owner", "admin", "manager", "agent", "viewer"] as const) await member(A.id, a[role], role);
  await member(B.id, owners.B, "owner");
  await member(C.id, owners.C, "owner");

  const order = `CMD-${newId().slice(-6)}`;
  await conn.query(
    "INSERT INTO orders (id, store_id, page_id, name, phone, city, address, note, product_name, items, qty, subtotal, shipping, total, currency, idem) VALUES (?, ?, ?, ?, ?, 'Casablanca', ?, ?, 'Huile d''argan', ?, 1, 19900, 0, 19900, 'MAD', ?)",
    [order, A.id, newId(), CANARY.name, CANARY.phone, CANARY.address, CANARY.note, JSON.stringify([{ name: "Huile d'argan", qty: 1, unit: 19900 }]), newId().slice(0, 36)],
  );
  return { conn, stores: { A, B, C, D }, a, owners, staff, outsider, order, newId };
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

async function rows<T = Record<string, unknown>>(conn: mysql.Connection, sql: string, args: unknown[] = []): Promise<T[]> {
  return ((await conn.query(sql, args)) as unknown as [T[]])[0];
}

/** The statements the app's pool sends while `fn` runs (drizzle calls `query` / `execute` on the pool). */
async function countQueries<T>(fn: () => Promise<T>): Promise<{ value: T; queries: number }> {
  const { pool } = await import("@/lib/db/client");
  const p = pool() as unknown as Record<"query" | "execute", (...a: unknown[]) => unknown>;
  const { query, execute } = p;
  let n = 0;
  p.query = function (this: unknown, ...a: unknown[]) {
    n++;
    return query.apply(this, a);
  };
  p.execute = function (this: unknown, ...a: unknown[]) {
    n++;
    return execute.apply(this, a);
  };
  try {
    return { value: await fn(), queries: n };
  } finally {
    p.query = query;
    p.execute = execute;
  }
}

/** Waits out the last seconds of an hour window, so a batch of parallel inserts lands in one window. */
async function awayFromHourEdge(): Promise<void> {
  const left = 3_600_000 - (Date.now() % 3_600_000);
  if (left < 15_000) await new Promise((r) => setTimeout(r, left + 500));
}

/* ------------------------------------------------------------------ */
/* case 6: notifications (PL-13)                                       */
/* ------------------------------------------------------------------ */

async function case6(fx: Fixtures): Promise<void> {
  const { notify, notifyLatest, listNotifications, unreadCount, markRead } = await import("@/lib/platform/notify");
  type Reader = import("@/lib/platform/notify").Reader;
  const { A, B } = fx.stores;
  const member = (userId: string, role: Reader["role"], storeId = A.id): Reader => ({ userId, storeId, role, platformRole: "none" });
  const consoleOf = (userId: string, platformRole: Reader["platformRole"]): Reader => ({ userId, storeId: null, role: null, platformRole });
  const ids = async (r: Reader, limit = 50) => (await listNotifications(r, { limit })).map((n) => n.id);
  const idOf = (res: { id: number } | { deduped: true }) => ("id" in res ? res.id : -1);

  // an agent never reads a store_role row addressed to owners (PL-13)
  const toOwners = idOf(await notify({ audience: "store_role", storeId: A.id, roles: ["owner"] }, "store.restricted", { reason: "fake_orders" }, { link: `/app/${A.handle}` }));
  const toOwnersAdmins = idOf(await notify({ audience: "store_role", storeId: A.id, roles: ["owner", "admin"] }, "store.restored", { reason: "issue_resolved" }));
  const toStore = idOf(await notify({ audience: "store", storeId: A.id }, "signup.approved", {}));
  const toAgent = idOf(await notify({ audience: "user", userId: fx.a.agent, storeId: A.id }, "member.role_changed", { role: "agent" }));
  ok("the four rows were stored", [toOwners, toOwnersAdmins, toStore, toAgent].every((id) => id > 0));
  const agentSees = await ids(member(fx.a.agent, "agent"));
  ok("an agent never reads an owners-only store_role row", !agentSees.includes(toOwners) && !agentSees.includes(toOwnersAdmins), agentSees);
  ok("an agent reads the store row and its own row", agentSees.includes(toStore) && agentSees.includes(toAgent), agentSees);
  const adminSees = await ids(member(fx.a.admin, "admin"));
  ok("an admin reads the owner+admin row, not the owners-only one", adminSees.includes(toOwnersAdmins) && !adminSees.includes(toOwners), adminSees);
  const ownerSees = await ids(member(fx.a.owner, "owner"));
  ok("the owner reads both store_role rows and the store row, not the agent's own row", [toOwners, toOwnersAdmins, toStore].every((id) => ownerSees.includes(id)) && !ownerSees.includes(toAgent));
  ok("store B's owner reads none of A's rows", !(await ids(member(fx.owners.B, "owner", B.id))).some((id) => [toOwners, toOwnersAdmins, toStore, toAgent].includes(id)));
  ok("staff viewing A (role null) reads none of A's member rows", (await ids(member(fx.staff.support, null))).length === 0);

  // the over-fetch: 50 owners-only rows newer than a store row still leave the agent's page with that row
  const older = idOf(await notify({ audience: "store", storeId: A.id }, "signup.received", {}));
  for (let i = 0; i < 50; i++) await notify({ audience: "store_role", storeId: A.id, roles: ["owner"] }, "quota.80", { metric: "pages", used: 8, limit: 10, percent: 80 });
  const agentPage = await listNotifications(member(fx.a.agent, "agent"), { limit: 5 });
  ok("behind 50 owners-only rows the agent's page still reaches the older store row", agentPage.some((n) => n.id === older), agentPage.map((n) => n.kind));
  ok("and holds no owners-only row", agentPage.every((n) => n.kind !== "quota.80"));

  // staff minRole filtering (rank super_admin > admin > support > analyst)
  const forAdmins = idOf(await notify({ audience: "platform_staff", minRole: "admin" }, "staff.kill_changed", { key: "publishing_enabled", to: false }));
  const forAll = idOf(await notify({ audience: "platform_staff" }, "staff.alarm", { alarm: "no_tick", value: 11 }));
  const forSuper = idOf(await notify({ audience: "platform_staff", minRole: "super_admin" }, "staff.super_admin_requested", { by: fx.staff.admin }));
  const seen = {
    super_admin: await ids(consoleOf(fx.staff.super_admin, "super_admin")),
    admin: await ids(consoleOf(fx.staff.admin, "admin")),
    support: await ids(consoleOf(fx.staff.support, "support")),
    analyst: await ids(consoleOf(fx.staff.analyst, "analyst")),
  };
  ok("super_admin reads every staff row", [forAdmins, forAll, forSuper].every((id) => seen.super_admin.includes(id)));
  ok("admin reads the admin and all-staff rows, not the super_admin one", seen.admin.includes(forAdmins) && seen.admin.includes(forAll) && !seen.admin.includes(forSuper));
  ok("support and analyst read only the all-staff row", [seen.support, seen.analyst].every((s) => s.includes(forAll) && !s.includes(forAdmins) && !s.includes(forSuper)));
  ok("a seller never reads the staff feed", !(await ids(consoleOf(fx.outsider, "none"))).some((id) => [forAdmins, forAll, forSuper].includes(id)));
  ok("staff reading a store's centre never get the staff feed there", !(await ids(member(fx.staff.admin, null))).includes(forAdmins));

  // 50 parallel batched inserts → one row with count 50 (the kind's batch, and a caller's batch on a store row)
  await awayFromHourEdge();
  await Promise.all(Array.from({ length: 50 }, () => notify({ audience: "platform_staff", minRole: "admin" }, "staff.signup_new", { store: B.handle })));
  const batched = await rows<{ vars: string }>(fx.conn, "SELECT vars FROM notifications WHERE kind = 'staff.signup_new'");
  ok("50 parallel staff.signup_new → one row", batched.length === 1, batched.length);
  ok("with count 50", JSON.parse(batched[0]?.vars ?? "{}").count === 50, batched[0]?.vars);
  await Promise.all(Array.from({ length: 50 }, () => notify({ audience: "store_role", storeId: A.id, roles: ["owner"] }, "ops.new_orders", {}, { batch: { windowMin: 60 } })));
  const storeBatched = await rows<{ vars: string }>(fx.conn, "SELECT vars FROM notifications WHERE kind = 'ops.new_orders' AND store_id = ?", [A.id]);
  ok("50 parallel store-row batch inserts → one row with count 50", storeBatched.length === 1 && JSON.parse(storeBatched[0]!.vars).count === 50, storeBatched.map((r) => r.vars));

  // notifyLatest: a repeat replaces the vars
  await notifyLatest({ audience: "platform_staff", minRole: "admin" }, "staff.abuse_report", { store: A.handle, reason: "scam", count24h: 1, storeId: A.id }, { dedupeKey: "c6:latest" });
  await notifyLatest({ audience: "platform_staff", minRole: "admin" }, "staff.abuse_report", { store: A.handle, reason: "phishing", count24h: 2, storeId: A.id }, { dedupeKey: "c6:latest" });
  const latest = await rows<{ vars: string; link: string | null }>(fx.conn, "SELECT vars, link FROM notifications WHERE dedupe_key = 'c6:latest'");
  ok("notifyLatest: one row, the newest vars", latest.length === 1 && JSON.parse(latest[0]!.vars).count24h === 2 && JSON.parse(latest[0]!.vars).reason === "phishing", latest);
  ok("the kind's link builder names the store's console profile", latest[0]?.link === `/admin/stores/${A.id}`, latest[0]?.link);

  // links: the rule at insert time (PLA-§18.1, attack case 20) and the kind's builder
  const evil: string[] = ["https://evil.example/x", "//evil.example", "/app/../admin", "javascript:alert(1)", `/app/${A.handle}/../../admin`, `/app/${A.handle}/%2e%2e/admin`];
  for (const link of evil) {
    const id = idOf(await notify({ audience: "store", storeId: A.id }, "signup.received", {}, { link }));
    const [row] = await rows<{ link: string | null }>(fx.conn, "SELECT link FROM notifications WHERE id = ?", [id]);
    ok(`a link "${link}" is stored NULL`, id > 0 && row?.link === null, row);
  }
  const built = idOf(await notify({ audience: "store", storeId: A.id }, "signup.approved", {}));
  const [builtRow] = await rows<{ link: string | null }>(fx.conn, "SELECT link FROM notifications WHERE id = ?", [built]);
  ok("without a link the kind builds /app/<h>/pages from the store's handle", builtRow?.link === `/app/${A.handle}/pages`, builtRow);

  // vars: the kind's schema drops unknown and customer keys; the reader sees labels in their locale
  const masked = idOf(await notify({ audience: "store_role", storeId: A.id, roles: ["owner", "admin"] }, "store.suspended", { reason: "fake_orders", phone: CANARY.phone, note: CANARY.note, extra: "x" } as Record<string, string>));
  const [maskedRow] = await rows<{ vars: string }>(fx.conn, "SELECT vars FROM notifications WHERE id = ?", [masked]);
  ok("a customer key never reaches notifications.vars", maskedRow?.vars === JSON.stringify({ reason: "fake_orders" }), maskedRow?.vars);
  const enItem = (await listNotifications(member(fx.a.owner, "owner"), { limit: 50 })).find((n) => n.id === masked);
  const arItem = (await listNotifications(member(fx.a.admin, "admin"), { limit: 50 })).find((n) => n.id === masked);
  ok("rendered in English with the reason's label", enItem?.title === "Your store is suspended" && enItem.body?.startsWith("Reason: Fake orders.") === true, enItem);
  ok("rendered in Arabic for an ar reader", arItem?.title === "تم إيقاف متجرك" && arItem.body?.includes("طلبات وهمية") === true, arItem);
  const visit = idOf(await notify({ audience: "store_role", storeId: A.id, roles: ["owner"] }, "store.impersonation_started", { reason: "ticket", from: "2026-10-28T09:00:00.000Z", to: "2026-10-28T09:30:00.000Z" }));
  const visitItem = (await listNotifications(member(fx.a.owner, "owner"), { limit: 50 })).find((n) => n.id === visit);
  ok("impersonation body: label, dates in the store's time zone, and the masking sentence", !!visitItem?.body && visitItem.body.includes("Your support request") && visitItem.body.includes("10:00") && visitItem.body.endsWith("Customer details were hidden."), visitItem?.body);

  // expired rows are hidden
  const expiring = idOf(await notify({ audience: "store", storeId: A.id }, "signup.received", {}, { expiresInDays: 1 }));
  await fx.conn.query("UPDATE notifications SET expires_at = NOW(3) - INTERVAL 1 MINUTE WHERE id = ?", [expiring]);
  ok("an expired row is hidden", !(await ids(member(fx.a.owner, "owner"))).includes(expiring));

  // reading 50 notifications costs two queries
  for (let i = 0; i < 20; i++) await notify({ audience: "user", userId: fx.a.owner, storeId: null }, "user.password_reset", {});
  const cost = await countQueries(() => listNotifications(member(fx.a.owner, "owner"), { limit: 50 }));
  ok("reading 50 costs two queries", cost.value.length === 50 && cost.queries === 2, { items: cost.value.length, queries: cost.queries });
  const page2 = await listNotifications(member(fx.a.owner, "owner"), { limit: 50, beforeId: cost.value[cost.value.length - 1]!.id });
  ok("keyset paging continues below the last id", page2.length > 0 && page2.every((n) => n.id < cost.value[cost.value.length - 1]!.id));

  // unread count and mark-all-read
  const owner = member(fx.a.owner, "owner");
  const before = await unreadCount(owner);
  const adminBefore = await unreadCount(member(fx.a.admin, "admin"));
  ok("the owner has unread rows", before > 0, before);
  await markRead(owner, "all");
  const after = await unreadCount(owner);
  ok("mark-all-read: 200 at most marked per call, then the next call clears the rest", after <= Math.max(0, before - 200), { before, after });
  while ((await unreadCount(owner)) > 0) await markRead(owner, "all");
  ok("the owner's count reaches 0", (await unreadCount(owner)) === 0);
  ok("the owner's page reads as read", (await listNotifications(owner, { limit: 20 })).every((n) => n.read));
  ok("the admin's unread count is untouched", (await unreadCount(member(fx.a.admin, "admin"))) === adminBefore, { adminBefore });
  await markRead(member(fx.a.agent, "agent"), [toOwners]);
  const [agentRead] = await rows<{ n: number }>(fx.conn, "SELECT COUNT(*) AS n FROM notification_reads WHERE user_id = ? AND notification_id = ?", [fx.a.agent, toOwners]);
  ok("markRead ignores an id the reader may not read", Number(agentRead?.n) === 0);
  const staffReader = consoleOf(fx.staff.admin, "admin");
  const staffUnread = await unreadCount(staffReader);
  await markRead(staffReader, "all");
  ok("staff: console-unread counts the feed and clears on mark-all-read", staffUnread > 0 && (await unreadCount(staffReader)) === 0, staffUnread);
}

/* ------------------------------------------------------------------ */
/* case 15: brand guard, reports and the live brand scan (PD70)        */
/* ------------------------------------------------------------------ */

async function case15(fx: Fixtures): Promise<void> {
  const { checkBrandTerms, brandMatches, invalidateProtectedTerms } = await import("@/lib/platform/brand-check");
  const { recordAbuseReport, recordAbuseReportOutcome } = await import("@/lib/platform/abuse-report");
  const { AuthRefusal } = await import("@/lib/auth/errors");
  const { open } = await import("@/lib/security/crypto");
  const { A, B, C, D } = fx.stores;

  // the terms (the boot seed is not run here: the rows the cases need, one of them disabled)
  const term = (t: string, kind: string, match: string, active = 1) =>
    fx.conn.query("INSERT INTO protected_brands (id, term, kind, `match`, active) VALUES (?, ?, ?, ?, ?)", [fx.newId(), t, kind, match, active]);
  await term("facebook", "brand", "substring");
  await term("cih", "bank", "exact");
  await term("bank", "bank", "substring");
  await term("اتصالات", "brand", "exact");
  await term("badword", "offensive", "substring");
  await term("jumia", "brand", "substring", 0);
  invalidateProtectedTerms();

  const verdicts: [string, string, "ok" | "near" | "exact"][] = [
    ["store_name", "CIH Bank · Vérification", "exact"],
    ["store_name", "face-b00k-shop", "exact"],
    ["legal_name", "mybankshop", "near"],
    ["whatsapp_name", "اتـصـالات المغرب", "exact"],
    ["store_name", "Nour Argan", "ok"],
    ["store_name", "Jumia Deals", "ok"],
    ["store_name", "The badword shop", "exact"],
  ];
  for (const [field, value, want] of verdicts) {
    const got = await checkBrandTerms(field as "store_name", value);
    ok(`checkBrandTerms(${field}, "${value}") = ${want}`, got === want, got);
  }
  const verdictOnly = await checkBrandTerms("store_name", "CIH Bank");
  ok("checkBrandTerms answers a bare verdict, never the term", typeof verdictOnly === "string" && !verdictOnly.includes("cih"));
  const m = await brandMatches("store_name", "mybankshop");
  ok("brandMatches names the term and its kind", m.verdict === "near" && m.term === "bank" && m.termKind === "bank", m);
  const off = await brandMatches("store_name", "The badword shop");
  ok("an offensive term is never named", off.verdict === "exact" && off.term === undefined && off.termKind === "offensive", off);
  await term("argan", "brand", "exact");
  ok("a new term waits for the 5-minute cache", (await checkBrandTerms("store_name", "Nour Argan")) === "ok");
  invalidateProtectedTerms();
  ok("invalidateProtectedTerms picks it up", (await checkBrandTerms("store_name", "Nour Argan")) === "exact");

  // reports
  const report = (handle: string, ip: string, extra: Partial<import("@/lib/platform/abuse-report").AbuseReportInput> = {}) =>
    recordAbuseReport({ handle, reason: "scam", details: null, pagePath: null, contact: null, ip, ...extra });
  const refusal = async (p: Promise<unknown>): Promise<string> => {
    try {
      await p;
      return "ok";
    } catch (e) {
      return e instanceof AuthRefusal ? e.code : `other:${(e as Error).name}`;
    }
  };
  const countRows = async (storeId: string) => Number((await rows<{ n: number }>(fx.conn, "SELECT COUNT(*) AS n FROM abuse_reports WHERE store_id = ?", [storeId]))[0]?.n);

  // 6 reports from one IP in an hour → 5 rows and one rate_limited (core bucket p:report:ip 5/h)
  const outcomes: string[] = [];
  for (let i = 0; i < 6; i++) {
    outcomes.push(
      await refusal(
        report(A.handle, "196.200.12.7", i === 0 ? { details: `I paid and got nothing. Customer ${CANARY.name} ${CANARY.phone}`, contact: "reporter@example.test", pagePath: `/s/${A.handle}/argan-oil?utm_source=fb#form` } : {}),
      ),
    );
  }
  ok("6 reports from one IP: five pass, the sixth is rate_limited", outcomes.slice(0, 5).every((o) => o === "ok") && outcomes[5] === "rate_limited", outcomes);
  ok("… and five rows", (await countRows(A.id)) === 5);
  const [first] = await rows<{ page_url: string | null; reporter_contact_enc: string | null; status: string; ip_hash: string; details: string }>(
    fx.conn,
    "SELECT page_url, reporter_contact_enc, status, ip_hash, details FROM abuse_reports WHERE store_id = ? AND reporter_contact_enc IS NOT NULL",
    [A.id],
  );
  ok("the row: status new, the path without its query, the IP only hashed", first?.status === "new" && first.page_url === `/s/${A.handle}/argan-oil` && /^[0-9a-f]{64}$/.test(first.ip_hash), first && { ...first, details: "…" });
  ok("the contact is sealed for the platform (abuse:contact)", !!first?.reporter_contact_enc && first.reporter_contact_enc.startsWith("v2.") && open(first.reporter_contact_enc, "platform", "abuse:contact") === "reporter@example.test");

  // the store bucket: the 21st report on one store in a day (20 IPs) → rate_limited
  const storeOutcomes: string[] = [];
  for (let i = 1; i <= 21; i++) storeOutcomes.push(await refusal(report(B.handle, `198.51.100.${i}`)));
  ok("the 21st report on one store in a day is rate_limited", storeOutcomes.slice(0, 20).every((o) => o === "ok") && storeOutcomes[20] === "rate_limited", storeOutcomes.slice(18));
  ok("… with 20 rows", (await countRows(B.id)) === 20);

  // two reports on one store in a day → one staff.abuse_report with count24h 2
  await report(C.handle, "203.0.113.1", { reason: "counterfeit" });
  await report(C.handle, "203.0.113.2", { reason: "phishing" });
  const staffRows = await rows<{ vars: string; link: string | null; platform_min_role: string | null; store_id: string | null }>(
    fx.conn,
    "SELECT vars, link, platform_min_role, store_id FROM notifications WHERE kind = 'staff.abuse_report' AND dedupe_key LIKE ?",
    [`abuse:${C.id}:%`],
  );
  const cVars = staffRows[0] ? (JSON.parse(staffRows[0].vars) as Record<string, unknown>) : {};
  ok("two reports on one store → one staff.abuse_report row", staffRows.length === 1, staffRows.length);
  ok("… with count24h 2 and the newest reason, for admins, platform-wide, linked to the profile", cVars.count24h === 2 && cVars.reason === "phishing" && cVars.store === C.handle && staffRows[0]?.platform_min_role === "admin" && staffRows[0]?.store_id === null && staffRows[0]?.link === `/admin/stores/${C.id}`, staffRows[0]);

  // no oracle: an unknown, a malformed or a purged handle stores nothing and ends like a report
  const before = Number((await rows<{ n: number }>(fx.conn, "SELECT COUNT(*) AS n FROM abuse_reports"))[0]?.n);
  ok("an unknown handle: the same outcome, no row", (await refusal(report("no-such-store", "192.0.2.10"))) === "ok");
  ok("a purged handle: the same outcome, no row", (await refusal(report(D.handle, "192.0.2.11"))) === "ok");
  ok("a malformed handle: the same outcome, no row", (await refusal(report("../../etc", "192.0.2.12"))) === "ok");
  ok("… no row for any of them", Number((await rows<{ n: number }>(fx.conn, "SELECT COUNT(*) AS n FROM abuse_reports"))[0]?.n) === before);
  ok("recordAbuseReportOutcome tells the two apart internally", (await recordAbuseReportOutcome({ handle: "no-such-store", reason: "other", details: null, pagePath: null, contact: null, ip: "192.0.2.13" })) === "discarded");

  // invalid input is refused before any bucket
  let invalid = "ok";
  try {
    await recordAbuseReport({ handle: A.handle, reason: "spam" as "scam", details: null, pagePath: null, contact: null, ip: "192.0.2.20" });
  } catch (e) {
    invalid = (e as Error).name;
  }
  ok("a reason outside the enum → ZodError", invalid === "ZodError", invalid);

  // the alarms: once per store and day (≥ 3 in 24 h) and once per hour platform-wide (≥ 5 in the hour's window)
  const alarms = await rows<{ dedupe_key: string; vars: string }>(fx.conn, "SELECT dedupe_key, vars FROM notifications WHERE kind = 'staff.alarm' AND dedupe_key LIKE 'alarm:abuse_reports_spike:%'");
  ok("abuse_reports_spike for store A once (5 reports in 24 h)", alarms.filter((r) => r.dedupe_key.includes(A.id)).length === 1, alarms.map((r) => r.dedupe_key));
  ok("abuse_reports_spike platform-wide once in the hour", alarms.filter((r) => /^alarm:abuse_reports_spike:\d{4}-\d{2}-\d{2}T\d{2}$/.test(r.dedupe_key)).length === 1);

  // details and contact never leave abuse_reports (attack case 17's second half)
  const leaks = await rows<{ n: number }>(
    fx.conn,
    "SELECT COUNT(*) AS n FROM notifications WHERE vars LIKE ? OR vars LIKE ? OR text LIKE ? OR vars LIKE '%reporter@%' OR vars LIKE '%paid and got%'",
    [`%${CANARY.phone}%`, `%${CANARY.name}%`, `%${CANARY.name}%`],
  );
  ok("no notification carries a report's details or contact", Number(leaks[0]?.n) === 0);
  const audits = await rows<{ n: number }>(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE meta LIKE '%paid and got%' OR meta LIKE '%reporter@%'");
  ok("no audit row carries them", Number(audits[0]?.n) === 0);

  // the health-run half (PLA-§13.3 item 2): a near term → brand_near_live on the next run; an exact term in a live SEO
  // title → brand_term_live and one staff.alarm over three runs in a week; the term never in a tenant-visible column
  const { markHealthDirty } = await import("@/lib/platform/health-snapshot");
  const { invalidateStore } = await import("@/lib/tenancy/cache");
  const flagsOf = async (storeId: string) => JSON.parse((await rows<{ flags: string }>(fx.conn, "SELECT flags FROM store_health WHERE store_id = ?", [storeId]))[0]?.flags ?? "[]") as { code: string; detail?: string }[];
  await fx.conn.query("UPDATE stores SET name = 'Atlas Bankshop' WHERE id = ?", [A.id]);
  invalidateStore(A.id);
  await markHealthDirty(A.id);
  await healthTick(fx);
  const near = await flagsOf(A.id);
  ok("a near term in the store name → brand_near_live on the next run", near.some((f) => f.code === "brand_near_live") && !near.some((f) => f.code === "brand_term_live"), near.map((f) => f.code));
  await seedLivePage(fx, A.id, "paiement", "Paiement", "CIH Bank paiement sécurisé");
  for (let i = 0; i < 3; i++) {
    await markHealthDirty(A.id);
    await healthTick(fx);
  }
  const live = await flagsOf(A.id);
  const liveFlag = live.find((f) => f.code === "brand_term_live");
  ok("an exact term in a live SEO title → brand_term_live with { term, field, pageId }", liveFlag && /"term":"cih"/.test(liveFlag.detail ?? "") && /"field":"seo_title"/.test(liveFlag.detail ?? "") && /"pageId":"/.test(liveFlag.detail ?? ""), liveFlag);
  const brandAlarms = await rows<{ dedupe_key: string; vars: string; platform_min_role: string }>(fx.conn, "SELECT dedupe_key, vars, platform_min_role FROM notifications WHERE kind = 'staff.alarm' AND dedupe_key LIKE ?", [`alarm:brand_term_live:${A.id}:%`]);
  ok("… and exactly one staff.alarm over three runs in a week (admins)", brandAlarms.length === 1 && brandAlarms[0]!.platform_min_role === "admin" && JSON.parse(brandAlarms[0]!.vars).term === "cih", brandAlarms);
  const tenantSide = (await rows<{ b: string }>(fx.conn, "SELECT CONCAT(issues, metrics) AS b FROM store_health WHERE store_id = ?", [A.id]))[0]?.b ?? "";
  ok("the term never appears in a tenant-visible column (issues, metrics)", !/cih/i.test(tenantSide));
  await fx.conn.query("UPDATE stores SET name = ? WHERE id = ?", [A.name, A.id]);
  invalidateStore(A.id);
}

/* ------------------------------------------------------------------ */
/* case 5: the health job (PL-18; PLA-§6.3.4)                          */
/* ------------------------------------------------------------------ */

/** One `platform.health` run with a test JobCtx (P8's runner is a stub on r1/p1), store A's pages quota at 85 %. */
async function healthTick(fx: Fixtures, budgetMs = 60_000): Promise<{ order: string[]; summary: Record<string, unknown>; done: boolean }> {
  const { runHealthTick } = await import("@/lib/health/run");
  const { DEFAULT_SOURCES } = await import("@/lib/health/inputs");
  const { systemCtx } = await import("@/lib/jobs/scope");
  const A = fx.stores.A.id;
  const order: string[] = [];
  const res = await runHealthTick(
    { ...systemCtx("platform.health"), deadline: Date.now() + budgetMs, tickId: "platform-check", cursor: "", setCursor: async () => undefined, yield: () => new Promise((r) => setImmediate(r)), lagMs: () => 0 },
    {
      sources: { ...DEFAULT_SOURCES, usage: async (scope, store, now) => (store.id === A ? [{ metric: "pages", period: "total", used: 17, limit: 20 }] : DEFAULT_SOURCES.usage(scope, store, now)) },
      onStore: (r) => order.push(r.storeId),
    },
  );
  return { order, summary: res.summary, done: res.done };
}

async function seedLivePage(fx: Fixtures, storeId: string, slug: string, name: string, seoTitle: string): Promise<string> {
  const pageId = fx.newId();
  const versionId = fx.newId();
  await fx.conn.query("INSERT INTO page_versions (id, store_id, page_id, kind, doc, checksum) VALUES (?, ?, ?, 'publish', ?, ?)", [versionId, storeId, pageId, JSON.stringify({ seo: { title: seoTitle } }), "0".repeat(64)]);
  await fx.conn.query("INSERT INTO pages (id, store_id, slug, name, status, public_key, draft, published_version_id) VALUES (?, ?, ?, ?, 'published', ?, '{}', ?)", [pageId, storeId, slug, name, fx.newId().toLowerCase(), versionId]);
  return pageId;
}

async function case5(fx: Fixtures): Promise<void> {
  const { markHealthDirty } = await import("@/lib/platform/health-snapshot");
  const { A, B, C, D } = fx.stores;
  const healthRow = async (storeId: string) => (await rows<{ score: number; attention: number; flags: string; dirty_at: Date | null }>(fx.conn, "SELECT score, attention, flags, dirty_at FROM store_health WHERE store_id = ?", [storeId]))[0];
  const codes = async (storeId: string) => (JSON.parse((await healthRow(storeId))?.flags ?? "[]") as { code: string }[]).map((f) => f.code);

  await markHealthDirty(C.id);
  await new Promise((r) => setTimeout(r, 15));
  await markHealthDirty(B.id);
  const first = await healthTick(fx);
  ok("dirty stores first (oldest mark first), then the store without a snapshot; the purged store never", first.order.slice(0, 3).join() === [C.id, B.id, A.id].join() && !first.order.includes(D.id), first.order);
  ok("every visited row is written with dirty_at NULL", (await Promise.all([A, B, C].map((s) => healthRow(s.id)))).every((r) => r && r.dirty_at === null));
  ok("A: quota_high from the pages quota at 85 %", (await codes(A.id)).includes("quota_high") && (await healthRow(A.id))!.score === 97, { codes: await codes(A.id), score: (await healthRow(A.id))?.score });
  ok("C (suspended): flag suspended, attention 3, no point change", (await codes(C.id)).includes("suspended") && (await healthRow(C.id))!.attention === 3 && (await healthRow(C.id))!.score === 100);
  ok("B (pending): no flag of an active store", !(await codes(B.id)).some((c) => c === "inactive_14d" || c === "setup_incomplete"));
  const milestones = () => rows<{ n: number }>(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'store.milestone.reached' AND store_id = ?", [A.id]).then((r) => Number(r[0]?.n));
  const quota80 = () => rows<{ n: number }>(fx.conn, "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'quota.80' AND store_id = ? AND dedupe_key = ?", [A.id, `quota80:${A.id}:pages:total`]).then((r) => Number(r[0]?.n));
  const m1 = await milestones();
  ok("A: first_member (five members) reached and audited by the system", m1 >= 1, m1);
  ok("quota.80 sent once for pages", (await quota80()) === 1);
  for (const s of [A, B, C]) await markHealthDirty(s.id);
  await healthTick(fx);
  ok("milestones written once over two runs", (await milestones()) === m1);
  ok("quota.80 deduplicated per metric and period", (await quota80()) === 1);
}

/* ------------------------------------------------------------------ */
/* the registry (PLA-§O.2)                                             */
/* ------------------------------------------------------------------ */

type CaseFn = (fx: Fixtures) => Promise<void>;
const CASES: Record<number, { run?: CaseFn; pending?: string }> = {
  1: { pending: "step 4 (queue)" },
  2: { pending: "step 4 (store requests)" },
  3: { pending: "step 4 (platform requests)" },
  4: { pending: "step 5 (plans)" },
  5: { run: case5 },
  6: { run: case6 },
  7: { pending: "step 5 (staff)" },
  8: { pending: "step 5 (legal)" },
  9: { pending: "step 7 (impersonation from the console)" },
  10: { pending: "step 6 (query plans; --perf)" },
  11: { pending: "step 4 (lifecycle safety)" },
  12: { pending: "step 6 (console pulse)" },
  13: { pending: "step 4 (sandbox ceilings)" },
  14: { pending: "step 7 (masking at the repository)" },
  15: { run: case15 },
  16: { pending: "step 7 (account deletion)" },
  17: { pending: "step 7 (tenant step-up ladder)" },
  18: { pending: "step 4 (refund paths)" },
  19: { pending: "step 12 (machinery screens)" },
  20: { pending: "step 5 (invite consumption)" },
};

async function main(): Promise<number> {
  if (flag("perf")) {
    console.log("platform-check --perf: the 2,000-store / 1,000,000-order fixture and the §M.4 timings arrive in step 6 (pending)");
    return 0;
  }
  if (flag("e2e")) {
    console.log("platform-check --e2e: reserved for the console e2e seed (step 13, pending)");
    return 0;
  }
  const { PLATFORM_DB_CASES } = await import("@/lib/platform/selftest");
  const picked = arg("case")
    ?.split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n));
  const wanted = picked?.length ? picked : Object.keys(CASES).map(Number);
  const unknown = wanted.filter((n) => !CASES[n]);
  if (unknown.length) {
    console.error(`platform-check: no case ${unknown.join(", ")} (PLA-§O.2 has 1-20)`);
    return 2;
  }

  const root = await mysql.createConnection({ uri: SERVER });
  await root.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await root.query(`CREATE DATABASE \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.end();
  let conn: mysql.Connection | null = null;
  const t0 = Date.now();
  try {
    const { runMigrations } = await import("@/lib/db/migrate");
    const migrated = await runMigrations();
    current = "setup";
    ok("migrations applied", migrated.status === "applied", migrated.status);
    conn = await mysql.createConnection({ uri: SERVER + DB, timezone: "Z", charset: "utf8mb4_unicode_ci" });
    const fx = await seed(conn);
    for (const n of wanted) {
      const c = CASES[n]!;
      const title = PLATFORM_DB_CASES[n] ?? "";
      if (!c.run) {
        console.log(`  case ${n} (${title}): pending, ${c.pending}`);
        continue;
      }
      current = String(n);
      const before = passed + failures.length;
      const started = Date.now();
      try {
        await c.run(fx);
      } catch (err) {
        failures.push(`case ${n}: threw ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`);
      }
      console.log(`  case ${n} (${title}): ${passed + failures.length - before} checks, ${Date.now() - started} ms${c.pending ? ` (pending: ${c.pending})` : ""}`);
    }
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
    console.error(`✗ platform-check: ${failures.length} failed, ${passed} passed (${ms} ms)`);
    return 1;
  }
  console.log(`✓ platform-check: ${passed} checks passed (${ms} ms)`);
  return 0;
}

if (/[\\/]scripts[\\/]qa[\\/]platform-check\.ts$/.test(process.argv[1] ?? "")) {
  main().then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error("✗ platform-check crashed:", err instanceof Error ? `${err.name}: ${err.message}` : err);
      process.exit(1);
    },
  );
}

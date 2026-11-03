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
 * Cases filled so far: 1 (the approval queue), 2 (store requests), 3 (platform requests), 4 (plans and entitlements, with
 * the server side of the kill switches and flags), 5 (the health job), 6 (notifications), 7 (staff), 8 (legal), 9
 * (impersonation from the console), 11 (lifecycle safety), 12 (its pulse half), 16 (its staff half), 13 (its console part: the sandbox meters, invite codes, the waitlist), 15 (brand guard, reports,
 * the health-run half), 19 (the Domains half) and 20 (the staff-invite half); the others print "pending" with the step
 * that fills them.
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
  const batched = await rows<{ vars: string }>(fx.conn, "SELECT vars FROM notifications WHERE kind = 'staff.signup_new' AND dedupe_key LIKE 'staff.signup_new:%'");
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
/* step 4 helpers: staff and owner contexts, extra stores, review rows */
/* ------------------------------------------------------------------ */

type PlatformCtxT = import("@/lib/tenancy/types").PlatformCtx;
type StoreCtxT = import("@/lib/tenancy/types").StoreCtx;
type StoreStatusT = import("@/lib/tenancy/types").StoreStatus;

const staffNames: Record<string, string> = {};

/** A staff member's console context (as `platformAction` builds it), with or without a fresh step-up. */
async function staffCtx(fx: Fixtures, role: StaffRole, opts: { userId?: string; stepUp?: boolean } = {}): Promise<PlatformCtxT> {
  const { canPlatform } = await import("@/lib/auth/permissions");
  const id = opts.userId ?? fx.staff[role];
  return {
    user: { id, email: `${role}@store-gen.test`, name: staffNames[id] ?? role, totpEnabled: true, sessionId: `sess-${id}`, platformRole: role, locale: null, lastStoreId: null },
    role,
    actor: { kind: "platform", userId: id, impersonatorId: null, ip: "203.0.113.7" },
    can: (p) => canPlatform(role, p),
    stepUpFresh: opts.stepUp === true,
    stepUpUntil: opts.stepUp ? new Date(Date.now() + 5 * 60_000) : null,
  };
}

/** A member's store context (as `storeAction` builds it) for the tenant-callable review functions. */
async function memberCtx(fx: Fixtures, store: StoreFx & { defaultLocale?: string }, userId: string, role: SellerRole = "owner"): Promise<StoreCtxT> {
  const { can } = await import("@/lib/auth/permissions");
  const { mintScope } = await import("@/lib/tenancy/seam");
  const [u] = await rows<{ email: string; name: string }>(fx.conn, "SELECT email, name FROM users WHERE id = ?", [userId]);
  const [s] = await rows<{ status: string; default_locale: string }>(fx.conn, "SELECT status, default_locale FROM stores WHERE id = ?", [store.id]);
  return {
    user: { id: userId, email: u!.email, name: u!.name, totpEnabled: false, sessionId: `sess-${userId}`, platformRole: "none", locale: null, lastStoreId: store.id },
    store: { id: store.id, handle: store.handle, name: store.name, mode: "landing", status: s!.status, planId: "beta", market: "MA", currency: "MAD", timezone: "Africa/Casablanca", defaultLocale: s!.default_locale, homePageId: null, brandSeed: "0".repeat(16), catalogVersion: 0, addressVersion: 0, requireMember2fa: false, primaryDomain: null },
    membership: { role, status: "active" },
    scope: mintScope("member", store.id),
    actor: { kind: "user", userId, impersonatorId: null, ip: "198.51.100.4" },
    impersonation: null,
    stepUpUntil: null,
    can: (p: Parameters<typeof can>[1]) => can(role, p),
  } as unknown as StoreCtxT;
}

/** A store with its owner (a fresh seller account), for the cases that change a store's state. */
async function extraStore(fx: Fixtures, handle: string, status: StoreStatusT, opts: { locale?: "ar" | "fr" | "en"; closedFrom?: StoreStatusT } = {}): Promise<StoreFx & { owner: string }> {
  const owner = fx.newId();
  await fx.conn.query("INSERT INTO users (id, email, name, password_hash, platform_role, totp_enabled) VALUES (?, ?, ?, 'platform-check:no-password', 'none', 0)", [owner, `${handle}@sellers.test`, `Owner ${handle}`]);
  const id = fx.newId();
  const closed = status === "closed" || status === "scheduled_deletion";
  await fx.conn.query(
    "INSERT INTO stores (id, handle, name, status, brand_seed, created_by, default_locale, status_changed_at, closed_at, purge_after) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3) - INTERVAL 1 DAY, ?, ?)",
    [id, handle, `Store ${handle}`, status, id.slice(-16).toLowerCase(), owner, opts.locale ?? "ar", closed ? new Date(Date.now() - 2 * 86_400_000) : null, closed ? new Date(Date.now() + (status === "closed" ? 28 : 1) * 86_400_000) : null],
  );
  await fx.conn.query("INSERT INTO store_members (store_id, user_id, role) VALUES (?, ?, 'owner')", [id, owner]);
  if (opts.closedFrom) {
    await fx.conn.query("INSERT INTO audit_log (user_id, action, target, meta, store_id, actor_kind) VALUES (NULL, 'platform.store.closed', ?, ?, ?, 'platform')", [id, JSON.stringify({ from: opts.closedFrom, to: "closed", reason: "owner_request" }), id]);
  }
  return { id, handle, name: `Store ${handle}`, status, owner };
}

type FlagSeed = { code: string; points: number };
/** One signup_reviews row as the signup writes it (signals without any raw e-mail, phone, IP or UA). */
async function reviewRow(fx: Fixtures, storeId: string, userId: string, p: { kind?: string; status?: string; band?: string; score?: number; flags?: FlagSeed[]; request?: unknown; ageMin?: number; decidedAt?: Date | null } = {}): Promise<string> {
  const id = fx.newId();
  const band = p.band ?? "fast";
  const signals = {
    v: 1,
    flags: p.flags ?? [],
    band,
    inputs: { emailDomain: "sellers.test", phoneCountry: "MA", market: "MA", mode: "landing", locale: "fr", uaLabel: "Chrome on Android", turnstile: "ok", formMs: 41_000, via: "signup" },
    cluster: { users: (p.flags ?? []).some((f) => f.code === "linked_banned") ? 1 : 0, banned: (p.flags ?? []).some((f) => f.code === "linked_banned") ? 1 : 0, kinds: [] },
    partial: false,
    ms: 140,
  };
  await fx.conn.query(
    "INSERT INTO signup_reviews (id, store_id, user_id, kind, score, band, status, signals, request, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3) - INTERVAL ? MINUTE, ?)",
    [id, storeId, userId, p.kind ?? "signup", p.score ?? (band === "fast" ? 8 : band === "hold" ? 64 : 30), band, p.status ?? "pending", JSON.stringify(signals), p.request ? JSON.stringify(p.request) : null, p.ageMin ?? 30, p.decidedAt ?? null],
  );
  return id;
}

async function count(conn: mysql.Connection, sql: string, args: unknown[] = []): Promise<number> {
  const [r] = await rows<{ n: number }>(conn, sql, args);
  return Number(r?.n ?? 0);
}

/** The refusal code a call throws (AuthRefusal / SeamError / LifecycleError / FieldsError / zod), or "ok". */
async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (err) {
    const e = err as { code?: unknown; fields?: Record<string, string>; name?: string };
    if (e?.fields) return `fields:${Object.keys(e.fields).join(",")}`;
    if (typeof e?.code === "string") return e.code;
    if (e?.name === "ZodError") return "zod";
    return `threw:${err instanceof Error ? err.message : String(err)}`;
  }
}

const statusOfStore = async (fx: Fixtures, storeId: string) => (await rows<{ status: string }>(fx.conn, "SELECT status FROM stores WHERE id = ?", [storeId]))[0]?.status;
const reviewOf = async (fx: Fixtures, id: string) =>
  (await rows<{ status: string; decided_by: string | null; staff_question: string | null; answered_at: Date | null; snooze_until: Date | null; submitted_at: Date | null; business_context: string | null; appeals: number; signals: string; blocked: number }>(fx.conn, "SELECT * FROM signup_reviews WHERE id = ?", [id]))[0];

/* ------------------------------------------------------------------ */
/* case 1: the approval queue (PL-04, PL-02; PLA-§3.5)                 */
/* ------------------------------------------------------------------ */

async function case1(fx: Fixtures): Promise<void> {
  const queue = await import("@/lib/platform/queue");
  const requests = await import("@/lib/platform/requests");
  // its own pending store: the seeded B stays pending for the other cases
  const B = await extraStore(fx, "qamar-review", "pending", { locale: "fr" });
  const ownerOfB = B.owner;
  for (const [role, name] of [["super_admin", "Platform Root"], ["admin", "Platform Ops"], ["support", "Platform Help"]] as const) staffNames[fx.staff[role]] = name;
  const root = await staffCtx(fx, "super_admin");
  const ops = await staffCtx(fx, "admin");
  const help = await staffCtx(fx, "support");

  // the tenant side first: "Submit for review" (owner only), then the row is in Review within the pulse
  const bReview = await reviewRow(fx, B.id, ownerOfB, { band: "fast", ageMin: 90 });
  const ownerB = await memberCtx(fx, B, ownerOfB);
  ok("an admin member can't submit the store for review (owner only)", (await codeOf(requests.submitForReview({ ...ownerB, membership: { role: "admin", status: "active" } } as StoreCtxT, { sells: "x", link: null, whatsapp: null }))) === "forbidden");
  const submitted = await requests.submitForReview(ownerB, { sells: "Argan oil and soap", link: "instagram.com/baraka.home", whatsapp: "+212 661 23 45 67" });
  const again = await requests.submitForReview(ownerB, { sells: "Argan oil, soap and candles", link: null, whatsapp: "+212661234567" });
  const bRow = await reviewOf(fx, bReview);
  ok("submit writes business_context and submitted_at; a second press updates the fields (a cleared one goes) and keeps the time", !!bRow?.submitted_at && submitted.submittedAt === again.submittedAt && JSON.parse(bRow.business_context ?? "{}").sells === "Argan oil, soap and candles" && !("link" in JSON.parse(bRow.business_context ?? "{}")), bRow);
  ok("submit: one staff.signup_new for the first press only (batched per hour)", (await count(fx.conn, "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'staff.signup_new' AND dedupe_key LIKE 'signup_new:%'")) === 1);
  const card = await requests.getReviewCard(ownerB.scope);
  ok("the review card reads the submitted row", card.submittedAt === submitted.submittedAt && card.question === null, card);
  const reviewTab = await queue.listQueue(help, "review");
  ok("the submitted store is in Review for every staff role, with a masked e-mail", reviewTab.rows.some((r) => r.id === bReview && String(r.applicant.email).includes("•")), reviewTab.rows.map((r) => r.applicant.email));
  ok("the list row's readiness is Submitted", reviewTab.rows.find((r) => r.id === bReview)?.readiness === "submitted");

  // the detail pane: e-mail per role (PD35), the counterfactual line, "No page yet" and never a number for an absent check
  const detailSupport = await queue.getReviewDetail(help, bReview);
  const detailAdmin = await queue.getReviewDetail(ops, bReview);
  ok("detail: support reads a masked e-mail, an admin the full one", String(detailSupport.applicant.email).includes("•") && detailAdmin.applicant.email === "qamar-review@sellers.test", { s: detailSupport.applicant.email, a: detailAdmin.applicant.email });
  ok("detail: the WhatsApp number is masked for every role", !!detailAdmin.context?.whatsapp && String(detailAdmin.context.whatsapp).includes("•") && !JSON.stringify(detailAdmin).includes("661234567"), detailAdmin.context);
  ok("detail: the band explanation and the thresholds", !!detailAdmin.scoreCard.explanation && detailAdmin.scoreCard.thresholds.fastLaneMax < detailAdmin.scoreCard.thresholds.holdMin);
  ok("detail: no page yet → readiness from the submit, no design chip, no preview", detailAdmin.evidence.pageId === null && detailAdmin.evidence.design === null && detailAdmin.evidence.preview === null && detailAdmin.evidence.honesty === null, detailAdmin.evidence);

  // two parallel approvals of one row → exactly one approved, the other already_decided with the decider's name
  const auditBefore = await count(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'platform.signup.approved' AND store_id = ?", [B.id]);
  const [r1, r2] = await Promise.all([queue.approveReview(root, { reviewId: bReview }), queue.approveReview(ops, { reviewId: bReview })]);
  const winners = [r1, r2].filter((r) => r.ok);
  const loser = [r1, r2].find((r) => !r.ok) as import("@/lib/platform/queue").AlreadyDecided | undefined;
  ok("two parallel approvals: exactly one approved", winners.length === 1 && (await reviewOf(fx, bReview))?.status === "approved", [r1, r2]);
  ok("the other answers already_decided with the decider's name", loser?.error === "already_decided" && !!loser.by && ["Platform Root", "Platform Ops"].includes(loser.by.name), loser);
  ok("the store is active", (await statusOfStore(fx, B.id)) === "active");
  ok("one approval: one audit row platform.signup.approved", (await count(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'platform.signup.approved' AND store_id = ?", [B.id])) === auditBefore + 1);
  ok("one approval: one store notification signup.approved", (await count(fx.conn, "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'signup.approved' AND store_id = ?", [B.id])) === 1);
  ok("a third approval later answers already_decided too", !(await queue.approveReview(ops, { reviewId: bReview })).ok);

  // bulk approve: only rows still waiting in the fast lane
  const E = await extraStore(fx, "eko-fast", "pending", { locale: "fr" });
  const F = await extraStore(fx, "foum-hold", "pending");
  const G = await extraStore(fx, "ghar-linked", "pending");
  const eRow = await reviewRow(fx, E.id, E.owner, { band: "fast" });
  const fRow = await reviewRow(fx, F.id, F.owner, { band: "hold", flags: [{ code: "disposable_email", points: 35 }, { code: "dup_phone", points: 30 }] });
  const gRow = await reviewRow(fx, G.id, G.owner, { band: "fast", score: 0, flags: [{ code: "linked_banned", points: 0 }] });
  const bulk = await queue.approveBulk(ops, { reviewIds: [eRow, fRow, gRow, bReview] });
  ok("bulk approve: the fast-lane row approved, the hold row, the hold-class flag and the decided row skipped", bulk.approved.join() === eRow && bulk.skipped.length === 3 && bulk.skipped.find((s) => s.id === fRow)?.why === "not_fast_lane" && bulk.skipped.find((s) => s.id === gRow)?.why === "not_fast_lane", bulk);
  ok("bulk approve: one platform.signup.bulk_approved row and one approval row per store", (await count(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'platform.signup.bulk_approved'")) === 1 && (await count(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'platform.signup.approved' AND store_id = ?", [E.id])) === 1);
  ok("bulk approve: the hold store is still pending", (await statusOfStore(fx, F.id)) === "pending" && (await statusOfStore(fx, E.id)) === "active");
  ok("bulk approve: more than 50 ids refused", (await codeOf(queue.approveBulk(ops, { reviewIds: Array.from({ length: 51 }, () => fx.newId()) }))) === "zod");
  ok("approve a hold row without a note → note required", (await codeOf(queue.approveReview(ops, { reviewId: fRow }))) === "fields:note");
  // a store with a draft: Draft ready, a 10-minute staff preview, and no number for a Design check that hasn't run
  const draftPage = fx.newId();
  await fx.conn.query("INSERT INTO pages (id, store_id, slug, name, status, public_key, draft) VALUES (?, ?, 'savon', 'Savon noir', 'draft', ?, '{}')", [draftPage, G.id, fx.newId().toLowerCase()]);
  const gDetail = await queue.getReviewDetail(ops, gRow);
  const previewIn = gDetail.evidence.preview ? new Date(gDetail.evidence.preview.expiresAt).getTime() - Date.now() : 0;
  ok("draft evidence: Draft ready, the newest page, a staff preview link living 10 minutes", gDetail.evidence.readiness === "draft" && gDetail.evidence.pageId === draftPage && previewIn > 9 * 60_000 && previewIn <= 10 * 60_000, gDetail.evidence);
  ok("draft evidence: no Design check yet → no design chip; AI use with no invented limit, untinted", gDetail.evidence.design === null && gDetail.evidence.genomeBand === null && gDetail.evidence.ai?.creditsLimit === null && gDetail.evidence.ai.tint === false, gDetail.evidence);
  ok("the hold-class flag is explained, and the list row says Draft ready", gDetail.scoreCard.flags.some((f) => f.code === "linked_banned" && f.text.length > 0) && (await queue.listQueue(ops, "review")).rows.find((r) => r.id === gRow)?.readiness === "draft");
  ok("support can't decide (signups.decide is admin+)", (await codeOf(queue.approveReview(help, { reviewId: fRow }))) === "forbidden");

  // needs_info → the seller's answer → back in Review
  await queue.askInfo(ops, { reviewId: fRow, question: "Which brand do you sell, and where do you buy it?" });
  ok("ask: needs_info with the staff question", (await reviewOf(fx, fRow))?.status === "needs_info" && (await reviewOf(fx, fRow))?.staff_question?.startsWith("Which brand") === true);
  const [askNote] = await rows<{ text: string | null; roles: string }>(fx.conn, "SELECT text, roles FROM notifications WHERE kind = 'signup.info_requested' AND store_id = ?", [F.id]);
  ok("ask: the owner hears signup.info_requested with the question as its text", askNote?.text?.startsWith("Which brand") === true && /owner/.test(askNote.roles), askNote);
  ok("ask: the row is in Needs info, not in Review", (await queue.listQueue(ops, "needs_info")).rows.some((r) => r.id === fRow) && !(await queue.listQueue(ops, "review")).rows.some((r) => r.id === fRow));
  const ownerF = await memberCtx(fx, F, F.owner);
  await requests.answerReviewQuestion(ownerF, "Our own soap, made in Fès. We buy the oil from a cooperative.");
  const answered = await reviewOf(fx, fRow);
  ok("answer: the row is pending again with answered_at", answered?.status === "pending" && !!answered.answered_at, answered);
  ok("answer: back in Review and in Hold", (await queue.listQueue(ops, "review")).rows.some((r) => r.id === fRow) && (await queue.listQueue(ops, "hold")).rows.some((r) => r.id === fRow));
  ok("answer: staff hear staff.info_answered", (await count(fx.conn, "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'staff.info_answered'")) === 1);
  ok("a second answer finds no question (not_found)", (await codeOf(requests.answerReviewQuestion(ownerF, "again"))) === "not_found");

  // snooze re-entry by time (query time, no job)
  const now = new Date();
  const snoozed = await queue.snoozeReview(ops, { reviewId: fRow, until: "1h" }, now);
  ok("snooze: snoozed until now + 1 h", snoozed.ok && (await reviewOf(fx, fRow))?.status === "snoozed");
  ok("snooze: in Snoozed now, not in Review", (await queue.listQueue(ops, "snoozed", {}, null, now)).rows.some((r) => r.id === fRow) && !(await queue.listQueue(ops, "review", {}, null, now)).rows.some((r) => r.id === fRow));
  const later = new Date(now.getTime() + 61 * 60_000);
  ok("snooze: back in Review 61 minutes later, counted there", (await queue.listQueue(ops, "review", {}, null, later)).rows.some((r) => r.id === fRow) && (await queue.listQueue(ops, "snoozed", {}, null, later)).counts.snoozed === 0);
  ok("an approve of a snoozed hold row with a note works", (await queue.approveReview(ops, { reviewId: fRow, note: "Checked the cooperative's page." })).ok && (await statusOfStore(fx, F.id)) === "active");

  // reject with block, then one appeal only, reopen and approve
  const H = await extraStore(fx, "hamra-appeal", "pending");
  const hRow = await reviewRow(fx, H.id, H.owner, { band: "review", score: 40 });
  ok("reject with block needs a fresh step-up", (await codeOf(queue.rejectReview(ops, { reviewId: hRow, reason: "incomplete", block: true }))) === "step_up");
  ok("reject with reason other needs a note", (await codeOf(queue.rejectReview(ops, { reviewId: hRow, reason: "other" }))) === "fields:note");
  const rej = await queue.rejectReview(ops, { reviewId: hRow, reason: "incomplete" });
  ok("reject: the row rejected, the store rejected, signup.rejected sent once", rej.ok && (await statusOfStore(fx, H.id)) === "rejected" && (await count(fx.conn, "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'signup.rejected' AND store_id = ?", [H.id])) === 1);
  const ownerH = await memberCtx(fx, { ...H }, H.owner);
  const appeal = await requests.submitAppeal(ownerH, "We sell our own soap; here is our cooperative's registration.");
  ok("appeal: a reopen row, pending, signals copied with appeal: true", (await reviewOf(fx, appeal.id))?.status === "pending" && JSON.parse((await reviewOf(fx, appeal.id))!.signals).appeal === true);
  ok("appeal: appeals + 1 on the original", (await reviewOf(fx, hRow))?.appeals === 1);
  ok("one appeal only: a second is refused", (await codeOf(requests.submitAppeal(ownerH, "again"))) === "invalid");
  const twice = await Promise.all([requests.submitAppeal(ownerH, "x"), requests.submitAppeal(ownerH, "y")].map((p) => codeOf(p)));
  ok("one appeal only: two parallel presses make none more", twice.every((c) => c === "invalid") && (await count(fx.conn, "SELECT COUNT(*) AS n FROM signup_reviews WHERE store_id = ? AND kind = 'reopen'", [H.id])) === 1, twice);
  ok("appeal: staff hear staff.appeal", (await count(fx.conn, "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'staff.appeal'")) === 1);
  ok("an appeal row can't be approved before it is reopened", (await codeOf(queue.approveReview(ops, { reviewId: appeal.id }))) === "invalid");
  await queue.reopenReview(ops, { reviewId: appeal.id });
  ok("reopen: the store is pending again (platform.signup.reopened, signup.reopened)", (await statusOfStore(fx, H.id)) === "pending" && (await count(fx.conn, "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'signup.reopened' AND store_id = ?", [H.id])) === 1);
  ok("reopen → approve: the store is active", (await queue.approveReview(ops, { reviewId: appeal.id })).ok && (await statusOfStore(fx, H.id)) === "active");

  // the counts the console pulse reads
  const snap = await queue.queueSnapshot();
  ok("the queue snapshot counts (decided rows of this case)", snap.counts.decided >= 5 && snap.sla.n >= 4, snap);
}

/* ------------------------------------------------------------------ */
/* case 2: store requests (PLA-§3.7)                                   */
/* ------------------------------------------------------------------ */

async function case2(fx: Fixtures): Promise<void> {
  const queue = await import("@/lib/platform/queue");
  const requests = await import("@/lib/platform/requests");
  const { A } = fx.stores;
  const ownerA = await memberCtx(fx, A, fx.a.owner);
  const viewerA = await memberCtx(fx, A, fx.a.viewer, "viewer");
  const root = await staffCtx(fx, "super_admin");
  const ops = await staffCtx(fx, "admin");
  const help = await staffCtx(fx, "support");

  ok("a viewer can't file a request (billing.manage)", (await codeOf(requests.createStoreRequest(viewerA, { kind: "go_live", message: null }))) === "forbidden");
  const raise = await requests.createStoreRequest(ownerA, { kind: "limit_raise", key: "media_bytes", used: 1_000_000, limit: 2_000_000, asked: 4_000_000, message: "Photos for the Ramadan range" });
  ok("a limit request is filed", "id" in raise);
  ok("one open request per kind and store: the second answers already", "already" in (await requests.createStoreRequest(ownerA, { kind: "limit_raise", key: "pages_max", used: 9, limit: 10, asked: 20, message: null })));
  const parallel = await Promise.all([requests.createStoreRequest(ownerA, { kind: "plan_change", planId: "pro", message: null }), requests.createStoreRequest(ownerA, { kind: "plan_change", planId: "pro", message: null })]);
  ok("two parallel requests of one kind: one stands", parallel.filter((r) => "id" in r).length === 1 && (await count(fx.conn, "SELECT COUNT(*) AS n FROM signup_reviews WHERE store_id = ? AND kind = 'plan_change' AND status = 'pending'", [A.id])) === 1, parallel);
  const planReq = parallel.find((r) => "id" in r) as { id: string };
  const [row] = await rows<{ score: number; band: string; signals: string; user_id: string }>(fx.conn, "SELECT score, band, signals, user_id FROM signup_reviews WHERE id = ?", [planReq.id]);
  ok("a request row: score 0, band review, no flags, the store's facts", row?.score === 0 && row.band === "review" && JSON.parse(row.signals).flags.length === 0 && JSON.parse(row.signals).inputs.emailDomain === "example.test", row);
  ok("staff hear staff.request", (await count(fx.conn, "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'staff.request'")) >= 2);
  ok("requests are listed in the Requests tab", (await queue.listQueue(help, "requests")).rows.filter((r) => r.storeId === A.id).length === 2);

  // the s:<sid>:request bucket: 5 a day (a request found open first costs nothing; a lost parallel race cost its slot)
  await requests.withdrawStoreRequest(ownerA, planReq.id);
  ok("withdraw: the row is withdrawn", (await reviewOf(fx, planReq.id))?.status === "withdrawn");
  ok("withdraw again: not_found", (await codeOf(requests.withdrawStoreRequest(ownerA, planReq.id))) === "not_found");
  const bucket = async () => Number((await rows<{ count: number }>(fx.conn, "SELECT count FROM rate_limits WHERE bucket = ?", [`s:${A.id}:request`]))[0]?.count ?? 0);
  const charged = await bucket();
  let filed = 0;
  let refused = "";
  for (let i = 0; i < 8 && !refused; i++) {
    const r = await requests.createStoreRequest(ownerA, { kind: "go_live", message: null }).then(
      (v) => v,
      (err: { code?: string }) => {
        refused = err.code ?? "error";
        return null;
      },
    );
    if (r && "id" in r) {
      filed++;
      await requests.withdrawStoreRequest(ownerA, r.id);
    }
  }
  ok("the bucket allows 5 a day, then rate_limited", refused === "rate_limited" && charged + filed === 5 && (await bucket()) === 6, { charged, filed, refused });
  ok("a refused request wrote no row", (await count(fx.conn, "SELECT COUNT(*) AS n FROM signup_reviews WHERE store_id = ? AND kind = 'go_live'", [A.id])) === filed);

  // resolve: grant applies the boost / the plan, decline needs a note; one store notification each
  const raiseId = (raise as { id: string }).id;
  ok("support can't resolve a limit request (entitlements.override)", (await codeOf(queue.resolveRequest(help, { reviewId: raiseId, outcome: "grant" }))) === "forbidden");
  const until = new Date(Date.now() + 14 * 86_400_000).toISOString();
  const granted = await queue.resolveRequest(ops, { reviewId: raiseId, outcome: "grant", grant: { kind: "boost", key: "media_bytes", value: 4_000_000, expiresAt: until }, note: "Ramadan range" });
  const [boost] = await rows<{ value: string; expires_at: Date | null; source: string }>(fx.conn, "SELECT value, expires_at, source FROM store_entitlements WHERE store_id = ? AND `key` = 'media_bytes'", [A.id]);
  ok("grant: the boost row with its expiry", granted.ok && boost?.source === "boost" && JSON.parse(boost.value) === 4_000_000 && !!boost.expires_at, boost);
  ok("grant: one request.answered (granted), no second plan notification", (await count(fx.conn, "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'request.answered' AND store_id = ?", [A.id])) === 1 && (await count(fx.conn, "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'plan.boost_granted' AND store_id = ?", [A.id])) === 0);
  ok("grant: audit platform.request.resolved and platform.entitlement.set", (await count(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'platform.request.resolved' AND store_id = ?", [A.id])) === 1 && (await count(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'platform.entitlement.set' AND store_id = ?", [A.id])) === 1);
  ok("a resolved request answers already_decided", !(await queue.resolveRequest(root, { reviewId: raiseId, outcome: "decline", note: "x" })).ok);
  const plan2 = await requests.createStoreRequest(ownerA, { kind: "plan_change", planId: "pro", message: null }).catch(() => null);
  // the bucket is full today: the plan grant is proven on a request row written as the store would have
  const planRow = plan2 && "id" in plan2 ? plan2.id : await reviewRow(fx, A.id, fx.a.owner, { kind: "plan_change", band: "review", score: 0, request: { kind: "plan_change", planId: "pro", message: null } });
  ok("decline needs a note", (await codeOf(queue.resolveRequest(ops, { reviewId: planRow, outcome: "decline" }))) === "fields:note");
  const planGrant = await queue.resolveRequest(ops, { reviewId: planRow, outcome: "grant" });
  const [plan] = await rows<{ plan_id: string }>(fx.conn, "SELECT plan_id FROM stores WHERE id = ?", [A.id]);
  const subs = await rows<{ plan_id: string; status: string; provider: string }>(fx.conn, "SELECT plan_id, status, provider FROM store_subscriptions WHERE store_id = ? ORDER BY created_at", [A.id]);
  ok("grant a plan request: the store moves to the plan asked for, a manual subscription starts", planGrant.ok && plan?.plan_id === "pro" && subs.some((s) => s.plan_id === "pro" && s.status === "active" && s.provider === "manual"), { plan, subs });
  ok("grant a plan: request.answered, never plan.changed beside it", (await count(fx.conn, "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'plan.changed' AND store_id = ?", [A.id])) === 0 && (await count(fx.conn, "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'request.answered' AND store_id = ?", [A.id])) === 2);
  // take_orders false is refused in overrides (PD8)
  const plans = await import("@/lib/platform/plans");
  ok("an override of take_orders to false → take_orders_locked", (await codeOf(plans.setEntitlement(ops, { storeId: A.id, key: "take_orders", source: "override", value: false, reason: "test" }))) === "take_orders_locked");
  ok("a boost without an expiry is refused", (await codeOf(plans.setEntitlement(ops, { storeId: A.id, key: "pages_max", source: "boost", value: 50, reason: "test" }))) === "fields:expiresAt");
  ok("clearing the boost removes the row", (await plans.clearEntitlement(ops, { storeId: A.id, key: "media_bytes", source: "boost" })).cleared && (await count(fx.conn, "SELECT COUNT(*) AS n FROM store_entitlements WHERE store_id = ?", [A.id])) === 0);
  // put store A back on its plan for the other cases
  await plans.assignPlan(root, { storeId: A.id, planId: "beta", note: "platform-check reset" }, { notify: false });
}

/* ------------------------------------------------------------------ */
/* case 3: platform requests (PD7, PLA-§2.2)                           */
/* ------------------------------------------------------------------ */

async function case3(fx: Fixtures): Promise<void> {
  const preq = await import("@/lib/platform/platform-requests");
  const { A } = fx.stores;
  const second = fx.newId();
  await fx.conn.query("INSERT INTO users (id, email, name, password_hash, platform_role, totp_enabled) VALUES (?, 'root2@store-gen.test', 'Second Root', 'platform-check:no-password', 'super_admin', 1)", [second]);
  staffNames[second] = "Second Root";
  const rootUp = await staffCtx(fx, "super_admin", { stepUp: true });
  const root2Up = await staffCtx(fx, "super_admin", { userId: second, stepUp: true });
  const opsUp = await staffCtx(fx, "admin", { stepUp: true });
  const K = await extraStore(fx, "kasbah-closed", "closed");
  const purge = (store: StoreFx, mode: "four_eyes" | "delayed", ctx = rootUp, now?: Date) => preq.requestPurge(ctx, { storeId: store.id, mode, reason: "legal_request", typedHandle: store.handle, typedWord: "purge" }, now);

  ok("a purge request on an active store is refused (purge_not_closed)", (await codeOf(purge(A, "four_eyes"))) === "purge_not_closed");
  ok("an admin can't request a purge (stores.purge)", (await codeOf(purge(K, "four_eyes", opsUp))) === "forbidden");
  ok("a purge without a fresh step-up → step_up", (await codeOf(purge(K, "four_eyes", await staffCtx(fx, "super_admin")))) === "step_up");
  ok("a mistyped handle is refused", (await codeOf(preq.requestPurge(rootUp, { storeId: K.id, mode: "four_eyes", reason: "legal_request", typedHandle: "kasbah", typedWord: "purge" }))) === "fields:typed");
  const req = await purge(K, "four_eyes");
  ok("a four-eyes purge request is pending, the store unchanged", req.mode === "four_eyes" && (await statusOfStore(fx, K.id)) === "closed");
  ok("one pending request per store and kind (already_requested)", (await codeOf(purge(K, "delayed", root2Up))) === "already_requested");
  ok("every other super_admin hears staff.purge_requested, the requester doesn't", (await count(fx.conn, "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'staff.purge_requested' AND user_id = ?", [second])) === 1 && (await count(fx.conn, "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'staff.purge_requested' AND user_id = ?", [fx.staff.super_admin])) === 0);
  ok("the requester can't confirm their own request", (await codeOf(preq.confirmPlatformRequest(rootUp, { requestId: req.id, typedHandle: K.handle }))) === "forbidden");
  // the SQL half: the table's CHECK refuses confirmed_by = requested_by whatever the code does
  const sqlSelf = await fx.conn.query("UPDATE platform_requests SET status = 'confirmed', confirmed_by = requested_by WHERE id = ?", [req.id]).then(
    () => "ok",
    (err: { code?: string }) => err.code ?? "error",
  );
  ok("SQL: a self-confirmation violates preq_four_eyes_ck", sqlSelf !== "ok" && (await rows<{ status: string }>(fx.conn, "SELECT status FROM platform_requests WHERE id = ?", [req.id]))[0]?.status === "pending", sqlSelf);
  const confirmed = await preq.confirmPlatformRequest(root2Up, { requestId: req.id, typedHandle: K.handle });
  ok("the second super_admin confirms", confirmed.status === "confirmed");
  ok("a second confirm answers already_decided", (await codeOf(preq.confirmPlatformRequest(root2Up, { requestId: req.id, typedHandle: K.handle }))) === "already_decided");
  const ran = await preq.runDueRequests(new Date());
  const [kRow] = await rows<{ status: string; purge_after: Date }>(fx.conn, "SELECT status, purge_after FROM stores WHERE id = ?", [K.id]);
  ok("the job executes it: scheduled_deletion with purge_after now", ran.executed === 1 && kRow?.status === "scheduled_deletion" && Math.abs(kRow.purge_after.getTime() - Date.now()) < 60_000, { ran, kRow });
  ok("the store heard store.deletion_scheduled once", (await count(fx.conn, "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'store.deletion_scheduled' AND store_id = ?", [K.id])) === 1);
  ok("a second run executes nothing more", (await preq.runDueRequests(new Date())).executed === 0);

  // delayed: executes after 24 h on a fake clock, not before
  const L = await extraStore(fx, "lalla-delayed", "closed");
  const t0 = new Date();
  const delayed = await purge(L, "delayed", rootUp, t0);
  ok("a delayed request executes 24 h after it was made", delayed.mode === "delayed" && delayed.executeAfter === new Date(t0.getTime() + 24 * 3_600_000).toISOString());
  ok("23 h later: nothing", (await preq.runDueRequests(new Date(t0.getTime() + 23 * 3_600_000))).executed === 0 && (await statusOfStore(fx, L.id)) === "closed");
  ok("25 h later: executed", (await preq.runDueRequests(new Date(t0.getTime() + 25 * 3_600_000))).executed === 1 && (await statusOfStore(fx, L.id)) === "scheduled_deletion");

  // expiry after 7 days unconfirmed; cancel by the requester or any super_admin
  const M = await extraStore(fx, "medina-expire", "closed");
  const old = await purge(M, "four_eyes", rootUp, new Date(Date.now() - 8 * 86_400_000));
  const exp = await preq.runDueRequests(new Date());
  ok("a four-eyes request unconfirmed for 7 days expires", exp.expired === 1 && (await rows<{ status: string }>(fx.conn, "SELECT status FROM platform_requests WHERE id = ?", [old.id]))[0]?.status === "expired" && (await statusOfStore(fx, M.id)) === "closed");
  const again = await purge(M, "four_eyes");
  ok("an admin can't cancel a super_admin's purge request", (await codeOf(preq.cancelPlatformRequest(opsUp, { requestId: again.id }))) === "forbidden");
  await preq.cancelPlatformRequest(root2Up, { requestId: again.id });
  ok("another super_admin cancels it; the job leaves it", (await rows<{ status: string }>(fx.conn, "SELECT status FROM platform_requests WHERE id = ?", [again.id]))[0]?.status === "cancelled" && (await preq.runDueRequests(new Date())).executed === 0);
  ok("a cancelled request can't be confirmed", (await codeOf(preq.confirmPlatformRequest(rootUp, { requestId: again.id, typedHandle: M.handle }))) === "already_decided" || (await codeOf(preq.confirmPlatformRequest(rootUp, { requestId: again.id, typedHandle: M.handle }))) === "forbidden");
  // a store that left `closed` before execution: the request is cancelled with its reason
  const N = await extraStore(fx, "nador-reopened", "closed", { closedFrom: "active" });
  const late = await purge(N, "delayed", rootUp, new Date(Date.now() - 25 * 3_600_000));
  await fx.conn.query("UPDATE stores SET status = 'active' WHERE id = ?", [N.id]);
  const lateRun = await preq.runDueRequests(new Date());
  ok("a due request on a store no longer closed is cancelled with store_not_closed", lateRun.failed === 1 && (await rows<{ status: string; error: string }>(fx.conn, "SELECT status, error FROM platform_requests WHERE id = ?", [late.id]))[0]?.error === "store_not_closed");
  ok("audit: purge_requested and purge_confirmed rows", (await count(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'platform.store.purge_requested'")) >= 4 && (await count(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'platform.store.purge_confirmed'")) === 1);
}

/* ------------------------------------------------------------------ */
/* case 11: lifecycle safety (PD54, PLA-§8.0-§8.2)                     */
/* ------------------------------------------------------------------ */

async function case11(fx: Fixtures): Promise<void> {
  const preview = await import("@/lib/platform/lifecycle-preview");
  const actions = await import("@/lib/platform/lifecycle-actions");
  const rules = await import("@/lib/platform/lifecycle-rules");
  const { kindText, labelsOf } = await import("@/lib/platform/notify-kinds");
  const { notificationKind } = await import("@/lib/notify/registry");
  const root = await staffCtx(fx, "super_admin", { stepUp: true });
  const opsNoUp = await staffCtx(fx, "admin");
  const help = await staffCtx(fx, "support", { stepUp: true });
  // three stores, one per locale: active (with two agents holding a lease), pending (with an open review), suspended
  const S1 = await extraStore(fx, "sahel-active", "active", { locale: "fr" });
  const S2 = await extraStore(fx, "souss-pending", "pending", { locale: "ar" });
  const S3 = await extraStore(fx, "saidia-suspended", "suspended", { locale: "en" });
  const s2Review = await reviewRow(fx, S2.id, S2.owner, { band: "fast" });
  for (const [i, agent] of [fx.a.agent, fx.a.manager].entries()) {
    await fx.conn.query(
      "INSERT INTO orders (id, store_id, page_id, name, phone, city, address, product_name, items, qty, subtotal, shipping, total, currency, idem, assignee_id, lease_until, claim_token) VALUES (?, ?, ?, 'Client', '+212600000001', 'Rabat', 'Rue 1', 'Savon', '[]', 1, 5000, 0, 5000, 'MAD', ?, ?, NOW(3) + INTERVAL 10 MINUTE, ?)",
      [`CMD-L${i}${fx.newId().slice(-5)}`, S1.id, fx.newId(), fx.newId().slice(0, 36), agent, fx.newId()],
    );
  }
  const counts = async (storeId: string) => ({
    audit: await count(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE store_id = ?", [storeId]),
    notes: await count(fx.conn, "SELECT COUNT(*) AS n FROM notifications WHERE store_id = ?", [storeId]),
  });

  // the preview writes nothing (the sheet's Cancel during the arm window writes nothing because nothing was written)
  const before = await counts(S1.id);
  const p = await preview.lifecyclePreview(help, S1.id, "restricted", { reason: "fake_orders" });
  ok("preview: support may read it, but can't take the edge (permission)", p.allowed === false && p.blockedBy === "permission" && p.requires?.permission === "stores.lifecycle");
  ok("preview: the agents holding a lease (2) and leasesReleased", p.affects.agentsWithLease === 2 && p.willWrite.leasesReleased === true, p.affects);
  ok("preview: unavailable sources are named, never a guessed 0 (P4 / P5 / P8 stubs)", p.affects.openOrders === null && p.affects.unavailable.includes("queue") && p.affects.unavailable.includes("integrations") && p.affects.unavailable.includes("renders"), p.affects.unavailable);
  ok("preview: nothing written (no audit row, no notification)", JSON.stringify(await counts(S1.id)) === JSON.stringify(before));
  ok("preview: a queue edge is blocked with use_queue", (await preview.lifecyclePreview(root, S2.id, "active")).blockedKey === "console.lifecycle.use_queue");

  // every console edge on the three stores: preview = effect, one notification and one audit row per transition
  type Step = { store: StoreFx & { owner: string }; to: StoreStatusT; reason: string; notice?: boolean };
  const steps: Step[] = [
    { store: S1, to: "restricted", reason: "fake_orders" },
    { store: S1, to: "suspended", reason: "phishing", notice: true },
    { store: S1, to: "restricted", reason: "issue_resolved" },
    { store: S1, to: "active", reason: "mistake" },
    { store: S1, to: "suspended", reason: "scam_suspected" },
    { store: S1, to: "active", reason: "appeal_accepted" },
    { store: S1, to: "closed", reason: "owner_request" },
    { store: S1, to: "active", reason: "issue_resolved" },
    { store: S1, to: "closed", reason: "abandoned" },
    { store: S1, to: "scheduled_deletion", reason: "retention" },
    { store: S1, to: "closed", reason: "mistake" },
    { store: S2, to: "closed", reason: "owner_request" },
    { store: S2, to: "pending", reason: "mistake" },
    { store: S3, to: "restricted", reason: "issue_resolved" },
    { store: S3, to: "suspended", reason: "counterfeit" },
    { store: S3, to: "closed", reason: "terms_violation" },
  ];
  let walked = 0;
  for (const s of steps) {
    const from = (await statusOfStore(fx, s.store.id)) as StoreStatusT;
    const pv = await preview.lifecyclePreview(root, s.store.id, s.to, { reason: s.reason, ...(s.notice ? { suspendNotice: true } : {}) });
    const label = `${s.store.handle} ${from} → ${s.to}`;
    ok(`${label}: allowed, with the reason it was asked for`, pv.allowed && pv.reason === s.reason && pv.action === rules.lifecycleActionOf(from, s.to), { allowed: pv.allowed, blockedBy: pv.blockedBy, key: pv.blockedKey });
    const c0 = await counts(s.store.id);
    await actions.runLifecycleAction(root, s.store.id, s.to, { reason: s.reason, expectedFrom: from, typedHandle: s.store.handle, ...(s.notice ? { suspendNotice: true } : {}) });
    walked++;
    const c1 = await counts(s.store.id);
    const [after] = await rows<{ status: StoreStatusT; status_reason: string; closed_at: Date | null; purge_after: Date | null; suspend_notice: number; default_locale: string; timezone: string }>(fx.conn, "SELECT status, status_reason, closed_at, purge_after, suspend_notice, default_locale, timezone FROM stores WHERE id = ?", [s.store.id]);
    const [note] = await rows<{ kind: string; vars: string | null; text: string | null }>(fx.conn, "SELECT kind, vars, text FROM notifications WHERE store_id = ? ORDER BY id DESC LIMIT 1", [s.store.id]);
    const [audit] = await rows<{ action: string }>(fx.conn, "SELECT action FROM audit_log WHERE store_id = ? ORDER BY id DESC LIMIT 1", [s.store.id]);
    const locale = rules.storeLocaleOf(after!.default_locale);
    const rendered = note ? kindText(note.kind, labelsOf(notificationKind(note.kind)), note.vars ? JSON.parse(note.vars) : null, locale, after!.timezone, note.text) : null;
    const actual = rules.storeSeesFor({ from, status: after!.status, reason: after!.status_reason, closedAt: after!.closed_at, purgeAfter: after!.purge_after, suspendNotice: !!after!.suspend_notice, locale, timeZone: after!.timezone, notification: rendered });
    ok(`${label}: the status written`, after!.status === s.to, after);
    ok(`${label}: exactly one store notification, of the previewed kind`, c1.notes === c0.notes + 1 && note?.kind === pv.willWrite.notification, { c0, c1, kind: note?.kind, want: pv.willWrite.notification });
    ok(`${label}: exactly one audit row, the previewed action`, c1.audit === c0.audit + 1 && audit?.action === pv.willWrite.audit, { audit: audit?.action, want: pv.willWrite.audit });
    ok(`${label}: storeSees = the words and the banner the store gets`, actual.title === pv.storeSees.title && actual.body === pv.storeSees.body && actual.banner === pv.storeSees.banner && actual.publicPages === pv.storeSees.publicPages && actual.publicOrders === pv.storeSees.publicOrders, { preview: pv.storeSees, actual });
  }
  ok("every console edge was walked (16 transitions over 3 stores)", walked === steps.length && walked === 16);
  ok("closing the pending store withdrew its open review", (await reviewOf(fx, s2Review))?.status === "withdrawn");
  console.log("    note: affects.agentsWithLease is counted from the store's live leases; the release itself (P4 releaseAllLeases, called by transitionStore) is proven at the R1 integration");

  // the cooldown, server-side: S3 just changed, so even restore-class actions need the typed handle
  const c0 = await counts(S3.id);
  const cool = await preview.lifecyclePreview(root, S3.id, "active", { reason: "issue_resolved" });
  ok("preview inside the cooldown: typedHandleRequired with who and when", cool.cooldown.typedHandleRequired && cool.cooldown.lastChangeBy === "Platform Root" && cool.cooldown.minutesAgo === 0 && cool.cooldown.lastReason === "terms_violation", cool.cooldown);
  ok("a reopen inside the cooldown without the handle → cooldown_handle_required", (await codeOf(actions.runLifecycleAction(root, S3.id, "active", { reason: "issue_resolved", expectedFrom: "closed" }))) === "cooldown_handle_required");
  ok("…and nothing was written", JSON.stringify(await counts(S3.id)) === JSON.stringify(c0) && (await statusOfStore(fx, S3.id)) === "closed");
  ok("a stale from → status_changed, nothing written", (await codeOf(actions.runLifecycleAction(root, S3.id, "active", { reason: "issue_resolved", expectedFrom: "suspended", typedHandle: S3.handle }))) === "status_changed" && JSON.stringify(await counts(S3.id)) === JSON.stringify(c0));
  ok("a reopen to another state than the one closed from is refused by the edge", (await preview.lifecyclePreview(root, S3.id, "active")).blockedKey === "console.lifecycle.reopen_to_previous" || (await codeOf(actions.runLifecycleAction(root, S3.id, "active", { reason: "issue_resolved", expectedFrom: "closed", typedHandle: S3.handle }))) === "invalid");
  // outside the cooldown the restore needs no handle
  await fx.conn.query("UPDATE stores SET status_changed_at = NOW(3) - INTERVAL 11 MINUTE WHERE id = ?", [S3.id]);
  const s3From = (await rows<{ meta: string }>(fx.conn, "SELECT meta FROM audit_log WHERE store_id = ? AND action IN ('store.closed', 'platform.store.closed') ORDER BY id DESC LIMIT 1", [S3.id]))[0];
  const reopenTo = (JSON.parse(s3From?.meta ?? "{}").from ?? "suspended") as StoreStatusT;
  ok("outside the cooldown a reopen needs no typed handle", (await codeOf(actions.runLifecycleAction(root, S3.id, reopenTo, { reason: "issue_resolved", expectedFrom: "closed" }))) === "ok" && (await statusOfStore(fx, S3.id)) === reopenTo);
  // the requirements, server-side
  await fx.conn.query("UPDATE stores SET status_changed_at = NOW(3) - INTERVAL 1 HOUR WHERE id = ?", [S2.id]);
  ok("a queue edge through the lifecycle action → invalid", (await codeOf(actions.runLifecycleAction(root, S2.id, "active", { reason: "issue_resolved", expectedFrom: "pending" }))) === "invalid");
  const A = fx.stores.A;
  await fx.conn.query("UPDATE stores SET status_changed_at = NOW(3) - INTERVAL 1 HOUR WHERE id = ?", [A.id]);
  ok("restrict by support → forbidden", (await codeOf(actions.runLifecycleAction(help, A.id, "restricted", { reason: "fake_orders", expectedFrom: "active" }))) === "forbidden");
  ok("suspend without a fresh step-up → step_up", (await codeOf(actions.runLifecycleAction(opsNoUp, A.id, "suspended", { reason: "phishing", expectedFrom: "active", typedHandle: A.handle }))) === "step_up");
  ok("suspend without the typed handle → typed mismatch", (await codeOf(actions.runLifecycleAction(root, A.id, "suspended", { reason: "phishing", expectedFrom: "active" }))) === "fields:typedHandle");
  ok("a reason of another action → refused", (await codeOf(actions.runLifecycleAction(root, A.id, "restricted", { reason: "retention", expectedFrom: "active" }))) === "fields:reason");
  ok("reason other without a note → refused", (await codeOf(actions.runLifecycleAction(root, A.id, "restricted", { reason: "other", expectedFrom: "active" }))) === "fields:note");
  ok("store A is still active after the refusals", (await statusOfStore(fx, A.id)) === "active");
  // two staff restricting at once: one wins, the other sees status_changed
  const restrictedBefore = await count(fx.conn, "SELECT COUNT(*) AS n FROM notifications WHERE store_id = ? AND kind = 'store.restricted'", [A.id]);
  const race = await Promise.all([root, await staffCtx(fx, "admin", { stepUp: true })].map((ctx) => codeOf(actions.runLifecycleAction(ctx, A.id, "restricted", { reason: "fake_orders", expectedFrom: "active" }))));
  ok("two staff restricting at once: one ok, the other status_changed", race.filter((c) => c === "ok").length === 1 && race.filter((c) => c === "status_changed").length === 1, race);
  ok("one notification for the one transition", (await count(fx.conn, "SELECT COUNT(*) AS n FROM notifications WHERE store_id = ? AND kind = 'store.restricted'", [A.id])) === restrictedBefore + 1);
  // store A back to active for the other cases (outside the cooldown)
  await fx.conn.query("UPDATE stores SET status = 'active', status_changed_at = NOW(3) - INTERVAL 1 HOUR WHERE id = ?", [A.id]);
}

/* ------------------------------------------------------------------ */
/* case 13 (console part): sandbox meters, invite codes and the waitlist */
/* ------------------------------------------------------------------ */

async function case13(fx: Fixtures): Promise<void> {
  const admin = await import("@/lib/platform/signup-admin");
  const { periodOf } = await import("@/lib/tenancy/entitlement-keys");
  const { PLATFORM_TIMEZONE } = await import("@/lib/auth/config");
  const ops = await staffCtx(fx, "admin");
  const help = await staffCtx(fx, "support");
  const day = periodOf("day", new Date(), PLATFORM_TIMEZONE);
  const MiB = 1024 * 1024;

  // the two D69 meters read the seeded counters
  await fx.conn.query("INSERT INTO platform_usage (metric, period, value) VALUES ('pending_stores', ?, 3) ON DUPLICATE KEY UPDATE value = 3", [day]);
  await fx.conn.query("INSERT INTO platform_usage (metric, period, value) VALUES ('pending_media_bytes', 'total', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [120 * MiB]);
  const P1 = await extraStore(fx, "pending-big", "pending");
  const P2 = await extraStore(fx, "pending-small", "pending");
  await fx.conn.query("INSERT INTO store_usage (store_id, metric, period, value) VALUES (?, 'media_bytes', 'total', ?), (?, 'media_bytes', 'total', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [P1.id, 90 * MiB, P2.id, 30 * MiB]);
  await fx.conn.query("INSERT INTO store_usage (store_id, metric, period, value) VALUES (?, 'media_bytes', 'total', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [fx.stores.A.id, 900 * MiB]);
  const today = await admin.todaysSandboxes();
  ok("todaysSandboxes: the platform day's pending_stores against pendingStoresPerDay (50)", today.day === day && today.used === 3 && today.limit === 50 && !today.full, today);
  const media = await admin.pendingMediaBudget();
  const pendingNow = await count(fx.conn, "SELECT COUNT(*) AS n FROM stores WHERE status = 'pending'");
  ok("pendingMediaBudget: the shared counter against 5,000 MiB, the pending-store count", media.usedBytes === 120 * MiB && media.limitBytes === 5_000 * MiB && media.pendingStores === pendingNow, media);
  ok("pendingMediaBudget: the largest pending stores first, an active store never listed", media.largest[0]?.storeId === P1.id && media.largest[1]?.storeId === P2.id && !media.largest.some((r) => r.storeId === fx.stores.A.id), media.largest);

  // invite codes through T2's functions
  ok("support can't manage codes (signups.decide)", (await codeOf(admin.createInviteCode(help, { label: "Beta sellers" }))) === "forbidden");
  const code = await admin.createInviteCode(ops, { label: "Beta sellers Casablanca", usesMax: 10, expiresInDays: 30, autoApprove: false });
  ok("a new code is shown once (SG-…) and stored as a hash", /^SG-[0-9A-Z]{12}$/.test(code.code) && (await count(fx.conn, "SELECT COUNT(*) AS n FROM platform_invites WHERE code_hash LIKE ?", [`%${code.code.slice(3)}%`])) === 0);
  let listed = await admin.listInviteCodes(ops);
  ok("the list shows it Active with 0 / 10 and its creator", listed.rows[0]?.id === code.id && listed.rows[0].state === "active" && listed.rows[0].usesMax === 10 && listed.rows[0].createdBy.name === "Platform Ops", listed.rows[0]);
  await admin.revokeInviteCode(ops, code.id);
  listed = await admin.listInviteCodes(ops);
  ok("revoke: the chip reads Revoked", listed.rows.find((r) => r.id === code.id)?.state === "revoked");

  // the waitlist: masked rows, the daily-cap chip, invite selected, drop
  const wl = async (email: string, source: string | null) => {
    const id = fx.newId();
    await fx.conn.query("INSERT INTO waitlist (id, email_norm, phone, market, mode_interest, source) VALUES (?, ?, '+212612345678', 'MA', 'landing', ?)", [id, email, source]);
    return id;
  };
  const w1 = await wl("ilyas@gmail.com", `cap:${day}`);
  const w2 = await wl("meryem@outlook.com", "utm:instagram");
  const w3 = await wl("anas@yahoo.fr", null);
  const page = await admin.listWaitlist(ops, { status: "waiting" });
  ok("listWaitlist: e-mails masked, phone country, the daily-cap chip", page.rows.length === 3 && page.rows.every((r) => String(r.email).includes("•") && r.phoneCountry === "MA") && page.rows.find((r) => r.id === w1)?.source?.kind === "daily_cap" && !JSON.stringify(page).includes("ilyas@"), page.rows);
  ok("listWaitlist: the cap filter", (await admin.listWaitlist(ops, { source: "cap" })).rows.map((r) => r.id).join() === w1);
  const sent = await admin.inviteWaitlist(ops, { ids: [w1, w2] });
  ok("invite selected: one single-use 30-day code per row, the contact for the staff to send it", sent.invited.length === 2 && sent.invited.every((i) => /^SG-/.test(i.code) && !!i.expiresAt) && sent.invited.find((i) => i.id === w1)?.email === "ilyas@gmail.com", sent);
  const invitedRows = await rows<{ status: string; invite_id: string | null }>(fx.conn, "SELECT status, invite_id FROM waitlist WHERE id IN (?, ?)", [w1, w2]);
  const codes = await rows<{ label: string; uses_max: number; expires_at: Date }>(fx.conn, "SELECT label, uses_max, expires_at FROM platform_invites WHERE id IN (?)", [invitedRows.map((r) => r.invite_id)]);
  ok("…the rows invited with their code, labelled 'Waitlist <day>', 1 use, 30 days", invitedRows.every((r) => r.status === "invited" && !!r.invite_id) && codes.length === 2 && codes.every((c) => c.label === `Waitlist ${day}` && c.uses_max === 1 && Math.abs(c.expires_at.getTime() - Date.now() - 30 * 86_400_000) < 120_000), { invitedRows, codes });
  ok("invite selected again: the invited row is skipped", (await admin.inviteWaitlist(ops, { ids: [w1] })).skipped.join() === w1);
  ok("invite selected: at most 100 rows per call", (await codeOf(admin.inviteWaitlist(ops, { ids: Array.from({ length: 101 }, () => fx.newId()) }))) === "zod");
  ok("drop: the row is dropped", (await admin.dropWaitlist(ops, { ids: [w3] })).dropped === 1 && (await rows<{ status: string }>(fx.conn, "SELECT status FROM waitlist WHERE id = ?", [w3]))[0]?.status === "dropped");
  ok("audit: platform.waitlist.invited and .dropped", (await count(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'platform.waitlist.invited'")) === 1 && (await count(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'platform.waitlist.dropped'")) === 1);
}

/** The refusal a call throws as "code:messageKey" (the key says which of several `invalid` refusals it was), or "ok". */
async function refusalOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (err) {
    const e = err as { code?: unknown; messageKey?: unknown; fields?: Record<string, string> };
    if (e?.fields) return `fields:${Object.entries(e.fields).map(([k, v]) => `${k}=${v}`).join(",")}`;
    return `${typeof e?.code === "string" ? e.code : "threw"}:${typeof e?.messageKey === "string" ? e.messageKey : ""}`;
  }
}

/** A fresh account (no store, no platform role unless given), for the staff and legal cases. */
async function account(fx: Fixtures, email: string, opts: { platformRole?: StaffRole | "none"; totp?: boolean; locale?: string } = {}): Promise<string> {
  const id = fx.newId();
  await fx.conn.query("INSERT INTO users (id, email, name, password_hash, platform_role, totp_enabled, locale) VALUES (?, ?, ?, 'platform-check:no-password', ?, ?, ?)", [
    id,
    email,
    `Person ${email.split("@")[0]}`,
    opts.platformRole ?? "none",
    opts.totp ? 1 : 0,
    opts.locale ?? null,
  ]);
  staffNames[id] = `Person ${email.split("@")[0]}`;
  return id;
}

/* ------------------------------------------------------------------ */
/* case 4: plans and entitlements (PL-11), kill switches and flags      */
/* (PL-12, the server side)                                            */
/* ------------------------------------------------------------------ */

async function case4(fx: Fixtures): Promise<void> {
  const plans = await import("@/lib/platform/plans");
  const flags = await import("@/lib/platform/flags");
  const { entitlement, invalidateEntitlements, activeKillSwitches } = await import("@/lib/tenancy/entitlements");
  const { systemCtx, systemScope } = await import("@/lib/jobs/scope");
  const { MiB, GiB, ENTITLEMENT_KEYS } = await import("@/lib/tenancy/entitlement-keys");
  const { seedFlags } = await import("@/lib/db/boot-tasks");
  const root = await staffCtx(fx, "super_admin");
  const rootUp = await staffCtx(fx, "super_admin", { stepUp: true });
  const ops = await staffCtx(fx, "admin");
  const analyst = await staffCtx(fx, "analyst");
  const sys = systemCtx("platform-check");
  const media = (storeId: string) => entitlement(systemScope(sys, storeId), "media_bytes");

  // the list and the editor (PLA-§9.1, §9.2)
  const list = await plans.listPlans(analyst);
  ok("listPlans: Beta is listed as the default for new stores", list.some((p) => p.id === "beta" && p.isDefault && p.status === "active"), list);
  const editor = await plans.getPlanEditor(analyst, "beta");
  ok("getPlanEditor: every registry key, take_orders locked, a sentence each", editor.rows.length === ENTITLEMENT_KEYS.length && editor.rows.find((r) => r.key === "take_orders")?.locked === "take_orders" && editor.rows.every((r) => r.sentence.length > 10));
  ok("plans.manage is super_admin only: an admin's preview is refused", (await codeOf(plans.previewPlanChange(ops, "beta", { media_bytes: 500 * MiB }))) === "forbidden");
  ok("createPlan: the id rule (^[a-z][a-z0-9_]{1,31}$)", (await codeOf(plans.createPlan(root, { id: "Case4", name: "Case four" }))) === "fields:id");
  const created = await plans.createPlan(root, { id: "case4_plan", name: "Case four", copyFrom: "beta" });
  ok("createPlan: copied from Beta, audited", created.id === "case4_plan" && (await count(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'platform.plan.created' AND target = 'case4_plan'")) === 1);
  ok("createPlan: an id that exists is refused", (await codeOf(plans.createPlan(root, { id: "case4_plan", name: "Again" }))) === "fields:id");
  ok("setPlanStatus: Beta can't be hidden (the default of new stores)", (await refusalOf(plans.setPlanStatus(root, { planId: "beta", status: "hidden" }))) === "invalid:console.plans.default_plan_locked");

  // six stores on the plan: three above 500 MiB, two below, one shielded by an override of media_bytes
  const used = [Math.round(1.9 * GiB), 812 * MiB, 640 * MiB, 100 * MiB, 0, 2 * GiB];
  const onPlan: (StoreFx & { owner: string })[] = [];
  for (let i = 0; i < used.length; i++) {
    const s = await extraStore(fx, `plan-four-${i}`, "active");
    await fx.conn.query("UPDATE stores SET plan_id = 'case4_plan' WHERE id = ?", [s.id]);
    if (used[i]) await fx.conn.query("INSERT INTO store_usage (store_id, metric, period, value) VALUES (?, 'media_bytes', 'total', ?)", [s.id, used[i]]);
    onPlan.push(s);
  }
  const shielded = onPlan[5]!;
  await fx.conn.query("INSERT INTO store_entitlements (store_id, `key`, source, value, expires_at, set_by, reason) VALUES (?, 'media_bytes', 'override', ?, NULL, ?, 'case 4 override')", [shielded.id, JSON.stringify(3 * GiB), fx.staff.super_admin]);
  await fx.conn.query("INSERT IGNORE INTO sheet_bindings (spreadsheet_id, store_id, method, verified_at) VALUES (?, ?, 'code', NOW(3))", [`case4-sheet-${onPlan[0]!.id}`, onPlan[0]!.id]);

  const impact = await plans.previewPlanChange(root, "case4_plan", { media_bytes: 500 * MiB, sheets: false });
  const lowered = impact.lowered.find((l) => l.key === "media_bytes");
  ok("previewPlanChange: the stores on the plan, the shielded one out of the count", impact.stores === 6 && lowered?.stores === 5, impact);
  ok("previewPlanChange: exactly the 3 stores seeded above 500 MiB", lowered?.storesAbove === 3 && lowered.measured, lowered);
  ok(
    "previewPlanChange: examples by usage, highest first, handles and bytes",
    JSON.stringify(lowered?.examples) === JSON.stringify([0, 1, 2].map((i) => ({ handle: onPlan[i]!.handle, used: used[i] }))),
    lowered?.examples,
  );
  const sheetsOff = impact.featuresOff.find((f) => f.key === "sheets");
  ok("previewPlanChange: Sheets switched off counts the one store with a binding", sheetsOff?.stores === 1 && sheetsOff.measured && sheetsOff.examples[0]?.handle === onPlan[0]!.handle, sheetsOff);
  ok("previewPlanChange: unaffected = the stores whose effective values do not change", impact.unaffected === 3, impact.unaffected);
  const cached = await countQueries(() => plans.previewPlanChange(root, "case4_plan", { sheets: false, media_bytes: 500 * MiB }));
  ok("previewPlanChange: the same patch (keys in any order) comes from the plan-impact cache", cached.queries <= 1 && JSON.stringify(cached.value) === JSON.stringify(impact), cached.queries);

  // take_orders stays on (PD8), in a plan and in an override
  ok("take_orders false: refused in a plan's preview", (await codeOf(plans.previewPlanChange(root, "case4_plan", { take_orders: false }))) === "take_orders_locked");
  ok("take_orders false: refused in a plan save", (await codeOf(plans.savePlan(root, "case4_plan", { take_orders: false }, fx.newId()))) === "take_orders_locked");
  ok("take_orders false: refused in an override", (await codeOf(plans.setEntitlement(root, { storeId: onPlan[0]!.id, key: "take_orders", source: "override", value: false, reason: "test" }))) === "take_orders_locked");
  ok("savePlan: an unknown key and a later-release key are refused", (await codeOf(plans.savePlan(root, "case4_plan", { nope: 1 } as never, fx.newId()))) === "fields:nope" && (await codeOf(plans.savePlan(root, "case4_plan", { products_max: 10 }, fx.newId()))) === "fields:products_max");
  ok("savePlan: a negative or fractional limit is refused", (await codeOf(plans.savePlan(root, "case4_plan", { pages_max: -1 }, fx.newId()))) === "fields:pages_max" && (await codeOf(plans.savePlan(root, "case4_plan", { pages_max: 2.5 }, fx.newId()))) === "fields:pages_max");

  // saving invalidates the entitlements of every store on the plan (warm T1's 30 s cache first)
  const before = await Promise.all(onPlan.map((s) => media(s.id)));
  ok("before the save: Beta's 1 GiB, the override's 3 GiB", before.slice(0, 5).every((v) => v === 1 * GiB) && before[5] === 3 * GiB, before);
  const opId = fx.newId();
  const saved = await plans.savePlan(root, "case4_plan", { media_bytes: 500 * MiB }, opId);
  ok("savePlan: saved, every store on the plan invalidated", saved.saved && saved.stores === 6, saved);
  const after = await Promise.all(onPlan.map((s) => media(s.id)));
  ok("after the save: every store reads 500 MiB at once (no stale cache), the override still wins", after.slice(0, 5).every((v) => v === 500 * MiB) && after[5] === 3 * GiB, after);
  const [planAudit] = await rows<{ meta: string }>(fx.conn, "SELECT meta FROM audit_log WHERE action = 'platform.plan.updated' AND target = 'case4_plan' ORDER BY id DESC LIMIT 1");
  ok("audit platform.plan.updated { diff } with from / to", JSON.stringify(JSON.parse(planAudit?.meta ?? "{}").diff?.media_bytes) === JSON.stringify({ from: "default", to: 500 * MiB }), planAudit);
  ok("savePlan: the same operation id again saves nothing", (await plans.savePlan(root, "case4_plan", { media_bytes: 400 * MiB }, opId)).saved === false && (await media(onPlan[0]!.id)) === 500 * MiB);
  ok("savePlan: a changed plan clears the impact cache", (await plans.previewPlanChange(root, "case4_plan", { media_bytes: 500 * MiB, sheets: false })).lowered.length === 0);

  // overrides and boosts (PLA-§9.4): expiry rules
  const day = 86_400_000;
  ok("a boost needs an expiry", (await codeOf(plans.setEntitlement(root, { storeId: onPlan[1]!.id, key: "media_bytes", source: "boost", value: 2 * GiB, reason: "launch" }))) === "fields:expiresAt");
  ok("a boost lasts 90 days at most", (await codeOf(plans.setEntitlement(root, { storeId: onPlan[1]!.id, key: "media_bytes", source: "boost", value: 2 * GiB, expiresAt: new Date(Date.now() + 91 * day), reason: "launch" }))) === "fields:expiresAt");
  ok("entitlements.override: an analyst can't set one", (await codeOf(plans.setEntitlement(analyst, { storeId: onPlan[1]!.id, key: "media_bytes", source: "boost", value: 2 * GiB, expiresAt: new Date(Date.now() + day), reason: "x" }))) === "forbidden");

  // a boost past its expiry is ignored by entitlement() and deleted by the job after 30 days
  const [recent, old, ending] = [onPlan[2]!, onPlan[3]!, onPlan[4]!];
  const boost = (storeId: string, expires: Date) =>
    fx.conn.query("INSERT INTO store_entitlements (store_id, `key`, source, value, expires_at, set_by, reason) VALUES (?, 'media_bytes', 'boost', ?, ?, ?, 'case 4 boost')", [storeId, JSON.stringify(5 * GiB), expires, fx.staff.super_admin]);
  await boost(recent.id, new Date(Date.now() - day));
  await boost(old.id, new Date(Date.now() - 31 * day));
  await boost(ending.id, new Date(Date.now() + 2 * day));
  for (const s of [recent, old, ending]) invalidateEntitlements(s.id);
  ok("an expired boost is ignored by entitlement() (T1)", (await media(recent.id)) === 500 * MiB && (await media(old.id)) === 500 * MiB);
  ok("a live boost applies", (await media(ending.id)) === 5 * GiB);
  const job1 = await plans.runEntitlementsJob(new Date());
  const left = await rows<{ store_id: string }>(fx.conn, "SELECT store_id FROM store_entitlements WHERE source = 'boost' AND store_id IN (?, ?, ?)", [recent.id, old.id, ending.id]);
  ok("the job deletes the row expired for more than 30 days, keeps the recent one", job1.deleted >= 1 && left.length === 2 && !left.some((r) => r.store_id === old.id), { job1, left });
  ok("the job sends plan.boost_ending to the store ending within 3 days", job1.boostsEnding >= 1 && job1.notified >= 1 && (await count(fx.conn, "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'plan.boost_ending' AND store_id = ?", [ending.id])) === 1, job1);
  const job2 = await plans.runEntitlementsJob(new Date());
  ok("a second run sends nothing again (deduplicated per row and expiry)", job2.notified === 0 && (await count(fx.conn, "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'plan.boost_ending' AND store_id = ?", [ending.id])) === 1, job2);

  // a retired plan takes nobody new; stores keep it
  await plans.setPlanStatus(root, { planId: "case4_plan", status: "retired" });
  ok("assignPlan: nobody moves onto a retired plan", (await refusalOf(plans.assignPlan(ops, { storeId: fx.stores.A.id, planId: "case4_plan" }))) === "invalid:console.plans.retired");
  ok("…the stores on it keep it", (await count(fx.conn, "SELECT COUNT(*) AS n FROM stores WHERE plan_id = 'case4_plan'")) === 6);
  await plans.setPlanStatus(root, { planId: "case4_plan", status: "active" });

  /* PL-12, the server side: kill switches and flags (PLA-§12.1, §12.2) */
  const seeded = await seedFlags();
  ok("the boot seeds the declared flags", seeded.inserted >= 2, seeded);
  ok("setKillSwitch: kill.manage is super_admin only", (await codeOf(flags.setKillSwitch(await staffCtx(fx, "admin", { stepUp: true }), { key: "uploads_enabled", value: false, reason: "test", opId: fx.newId() }))) === "forbidden");
  ok("setKillSwitch: a fresh step-up first", (await codeOf(flags.setKillSwitch(root, { key: "uploads_enabled", value: false, reason: "test", opId: fx.newId() }))) === "step_up");
  ok("setKillSwitch: a reason is required", (await codeOf(flags.setKillSwitch(rootUp, { key: "uploads_enabled", value: false, reason: "  ", opId: fx.newId() }))) === "fields:reason");
  ok("setKillSwitch: read-only needs its typed word", (await codeOf(flags.setKillSwitch(rootUp, { key: "platform_read_only", value: true, reason: "maintenance", opId: fx.newId() }))) === "fields:typed");
  const preview = await flags.killSwitchPreview(rootUp, "platform_read_only");
  const live = await count(fx.conn, "SELECT COUNT(*) AS n FROM stores WHERE status IN ('pending', 'active', 'restricted')");
  ok("killSwitchPreview: tripping read-only, the live stores counted, the banner in ar / fr / en", preview.tripping && preview.affectedStores === live && preview.typed === "read-only" && ["ar", "fr", "en"].every((l) => (preview.banner as Record<string, string>)[l]!.length > 10), preview);
  ok("killSwitchPreview: sign-ups affect no store; Sheets counts the stores with a binding", (await flags.killSwitchPreview(rootUp, "signups_enabled")).affectedStores === null && (await flags.killSwitchPreview(rootUp, "sheets_sync_enabled")).affectedStores === (await count(fx.conn, "SELECT COUNT(DISTINCT store_id) AS n FROM sheet_bindings")));
  const killOp = fx.newId();
  await activeKillSwitches();
  const tripped = await flags.setKillSwitch(rootUp, { key: "platform_read_only", value: true, reason: "maintenance window", typed: "Read-Only", opId: killOp });
  ok("setKillSwitch: read-only on, applied in this process at once (invalidateFlags)", tripped.changed && (await activeKillSwitches()).includes("platform_read_only"), tripped);
  const [killAudit] = await rows<{ meta: string }>(fx.conn, "SELECT meta FROM audit_log WHERE action = 'platform.kill.changed' ORDER BY id DESC LIMIT 1");
  const killMeta = JSON.parse(killAudit?.meta ?? "{}") as Record<string, unknown>;
  ok("audit platform.kill.changed { key, from, to, reason }", killMeta.key === "platform_read_only" && killMeta.from === false && killMeta.to === true && killMeta.reason === "maintenance window", killAudit);
  const killNotes = await rows<{ audience: string; vars: string; platform_min_role: string | null }>(fx.conn, "SELECT audience, vars, platform_min_role FROM notifications WHERE kind = 'staff.kill_changed' AND vars LIKE '%platform_read_only%'"); // case 6 leaves one of its own
  ok("every staff member hears staff.kill_changed", killNotes.length === 1 && killNotes[0]?.audience === "platform_staff", killNotes);
  ok("setKillSwitch: the same operation id again changes nothing", (await flags.setKillSwitch(rootUp, { key: "platform_read_only", value: false, reason: "done", opId: killOp })).changed === false);
  const back = await flags.setKillSwitch(rootUp, { key: "platform_read_only", value: false, reason: "done", opId: fx.newId() });
  ok("read-only switches off without a typed word, at once", back.changed && !(await activeKillSwitches()).includes("platform_read_only"));
  const cards = await flags.listKillSwitches(analyst);
  const roCard = cards.find((c) => c.key === "platform_read_only");
  ok("listKillSwitches: seven cards; read-only Off with its last change and history, newest first", cards.length === 7 && roCard?.state === "off" && roCard.history.length === 2 && roCard.history[0]?.to === false && roCard.last?.reason === "done", roCard);

  await fx.conn.query("INSERT IGNORE INTO flags (`key`, kind, description, default_value, type, owner_track) VALUES ('case4_retired_flag', 'release', 'Gone from code', 'true', 'boolean', 'platform')");
  await fx.conn.query("UPDATE flags SET archived = 1 WHERE `key` = 'case4_retired_flag'");
  const tabs = await flags.listFlags(analyst);
  const all = [...tabs.release, ...tabs.ops, ...tabs.experiment];
  ok("listFlags: no kill-switch row in the tabs; a flag gone from code reads archived", !all.some((f) => f.key === "platform_read_only") && all.find((f) => f.key === "case4_retired_flag")?.archived === true && all.find((f) => f.key === "console_perf_panel")?.ownerTrack === "platform", all.map((f) => f.key));
  ok("saveFlag: an archived flag is read-only", (await refusalOf(flags.saveFlag(ops, { key: "case4_retired_flag", default: false, rules: [], opId: fx.newId() }))) === "invalid:console.flag.archived");
  ok("saveFlag: a kill switch isn't a flag", (await codeOf(flags.saveFlag(ops, { key: "platform_read_only", default: true, rules: [], opId: fx.newId() }))) === "not_found");
  ok("saveFlag: the value's type is checked", (await codeOf(flags.saveFlag(ops, { key: "console_perf_panel", default: "yes", rules: [], opId: fx.newId() }))) === "fields:default");
  const ctxA = { storeId: fx.stores.A.id, planId: "beta", storeStatus: "active" as const };
  ok("flagValue: the declaration's default before any edit", (await flags.flagValue<boolean>("console_perf_panel", ctxA)) === false);
  await flags.saveFlag(ops, { key: "console_perf_panel", default: false, rules: [{ when: { plans: ["beta"] }, value: true }], opId: fx.newId() });
  ok("saveFlag: a rule applies at once in this process", (await flags.flagValue<boolean>("console_perf_panel", ctxA)) === true && (await flags.flagValue<boolean>("console_perf_panel", { ...ctxA, planId: "case4_plan" })) === false);
  ok("setFlagOverride: an expiry in the past is refused", (await codeOf(flags.setFlagOverride(ops, { key: "console_perf_panel", scope: "store", scopeId: fx.stores.A.id, value: false, expiresAt: new Date(Date.now() - 60_000) }))) === "fields:expiresAt");
  ok("setFlagOverride: a store that doesn't exist is refused", (await codeOf(flags.setFlagOverride(ops, { key: "console_perf_panel", scope: "store", scopeId: fx.newId(), value: false }))) === "fields:scopeId");
  await flags.setFlagOverride(ops, { key: "console_perf_panel", scope: "store", scopeId: fx.stores.A.id, value: false, note: "case 4" });
  ok("a store override wins over the rule", (await flags.flagValue<boolean>("console_perf_panel", ctxA)) === false);
  await fx.conn.query("UPDATE flag_overrides SET expires_at = NOW(3) - INTERVAL 1 MINUTE WHERE flag_key = 'console_perf_panel' AND scope = 'store'");
  flags.invalidateFlags();
  ok("an expired override is ignored (PL-12 acceptance)", (await flags.flagValue<boolean>("console_perf_panel", ctxA)) === true);
  ok("clearFlagOverride removes it, audited", (await flags.clearFlagOverride(ops, { key: "console_perf_panel", scope: "store", scopeId: fx.stores.A.id })).cleared && (await count(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'platform.flag.changed'")) === 3);
  await flags.saveFlag(ops, { key: "console_perf_panel", default: false, rules: [], opId: fx.newId() });
}

/* ------------------------------------------------------------------ */
/* case 7: staff (SE-01; PLA-§14.1, PD7, PD13)                         */
/* ------------------------------------------------------------------ */

async function case7(fx: Fixtures): Promise<void> {
  const staff = await import("@/lib/platform/staff");
  const preq = await import("@/lib/platform/platform-requests");
  const { requirePlatform } = await import("@/lib/platform/seam");
  const { runAsIdentity } = await import("@/lib/tenancy/context");
  const { createSession } = await import("@/lib/auth/session");
  const { CONSOLE_2FA_ENROL_PATH } = await import("@/lib/auth/paths");
  const root = await staffCtx(fx, "super_admin");
  const rootUp = await staffCtx(fx, "super_admin", { stepUp: true });
  const gate = (userId: string) => refusalOf(runAsIdentity({ userId, path: "/admin" }, () => requirePlatform({ throwOnFail: true })));
  const roleOf = async (id: string) => (await rows<{ platform_role: string }>(fx.conn, "SELECT platform_role FROM users WHERE id = ?", [id]))[0]?.platform_role;
  const meta = { ipHash: null, uaLabel: "Edge on Windows" };

  // the console gate (core §B.7): a staff role is inert until TOTP
  ok("requirePlatform: a staff member with TOTP passes", (await gate(fx.staff.admin)) === "ok");
  ok("requirePlatform: an invited admin without TOTP is refused (enrol first)", (await gate(fx.staff.adminNoTotp)) === "forbidden:error.platform_2fa_required");
  ok("requirePlatform: a seller is not_found", (await gate(fx.outsider)).startsWith("not_found"));

  // invites (PLA-§14.1)
  ok("inviteStaff: a fresh step-up first", (await codeOf(staff.inviteStaff(root, { email: "new.help@gmail.com", role: "support" }))) === "step_up");
  ok("inviteStaff: staff.manage is super_admin only", (await codeOf(staff.inviteStaff(await staffCtx(fx, "admin", { stepUp: true }), { email: "new.help@gmail.com", role: "support" }))) === "forbidden");
  ok("inviteStaff: never super_admin directly (PD7)", (await codeOf(staff.inviteStaff(rootUp, { email: "new.help@gmail.com", role: "super_admin" }))) === "fields:role");
  ok("inviteStaff: someone already on the staff", (await refusalOf(staff.inviteStaff(rootUp, { email: "ops@store-gen.test", role: "support" }))) === "invalid:console.staff.already_staff");
  const invite = await staff.inviteStaff(rootUp, { email: "  New.Help@Gmail.com ", role: "support", note: "night shift" });
  const token = invite.url.split("/invite/staff/")[1] ?? "";
  ok("inviteStaff: a link on the platform origin with a 32-byte token, 72 h", invite.url.startsWith("http://localhost:3461/invite/staff/") && /^[A-Za-z0-9_-]{43}$/.test(token) && Math.abs(new Date(invite.expiresAt).getTime() - Date.now() - 72 * 3_600_000) < 60_000, invite);
  const [stored] = await rows<{ email_norm: string; token_hash: string }>(fx.conn, "SELECT email_norm, token_hash FROM staff_invites WHERE id = ?", [invite.inviteId]);
  ok("only the token's sha256 is stored, the e-mail normalised", stored?.token_hash === staff.hashStaffToken(token) && !JSON.stringify(stored).includes(token) && stored?.email_norm === "new.help@gmail.com", stored);
  ok("inviteStaff: the same e-mail twice (revoke first)", (await refusalOf(staff.inviteStaff(rootUp, { email: "new.help@gmail.com", role: "analyst" }))) === "invalid:console.staff.already_invited");
  const [invAudit] = await rows<{ meta: string }>(fx.conn, "SELECT meta FROM audit_log WHERE action = 'platform.staff.invited' ORDER BY id DESC LIMIT 1");
  ok("audit platform.staff.invited carries the masked e-mail only", !!invAudit && !invAudit.meta.includes("new.help@") && JSON.parse(invAudit.meta).role === "support", invAudit);
  const view = await staff.getStaffInviteState(token);
  ok("the public page: valid, the e-mail masked, a new account signs up", view.state === "valid" && "way" in view && view.way === "sign_up" && !JSON.stringify(view).includes("new.help@"), view);
  ok("the public page: an unknown token reads invalid", (await staff.getStaffInviteState("x".repeat(43))).state === "invalid");

  // accepting with a new account: no store, the role inert until TOTP
  const accepted = await staff.acceptStaffInvite(token, { name: "New Help", password: "Platform-Check-Staff-9q!", locale: "en" }, meta);
  ok("acceptStaffInvite: a new account with the role, sent to the 2FA enrolment", accepted.createdAccount && accepted.role === "support" && accepted.next === CONSOLE_2FA_ENROL_PATH && (await roleOf(accepted.userId)) === "support", accepted);
  ok("…no store and no membership is created (PD13)", (await count(fx.conn, "SELECT COUNT(*) AS n FROM store_members WHERE user_id = ?", [accepted.userId])) === 0 && (await count(fx.conn, "SELECT COUNT(*) AS n FROM stores WHERE created_by = ?", [accepted.userId])) === 0);
  ok("…and the console stays closed until TOTP", (await gate(accepted.userId)) === "forbidden:error.platform_2fa_required");
  const listed = await staff.listStaff(root);
  const row = listed.staff.find((s) => s.userId === accepted.userId);
  ok("listStaff: Waiting for 2FA, added by the inviter", row?.state === "waiting_2fa" && row.addedBy?.id === fx.staff.super_admin && listed.invites.some((i) => i.id === invite.inviteId && i.state === "used"), row);
  ok("the used link reads used, and refuses a second accept", (await staff.getStaffInviteState(token)).state === "used" && (await refusalOf(staff.acceptStaffInvite(token, { userId: accepted.userId }, meta))) === "invalid:console.staff.invite_invalid");

  // the pending cap: 10 at most
  const pending: string[] = [];
  for (let i = 0; (await staff.pendingStaffInvites(root)) < 10 && i < 12; i++) pending.push((await staff.inviteStaff(rootUp, { email: `pending.${i}@gmail.com`, role: "analyst" })).inviteId);
  ok("inviteStaff: the 11th pending invite is refused", (await codeOf(staff.inviteStaff(rootUp, { email: "eleventh@gmail.com", role: "analyst" }))) === "quota");
  for (const id of pending) await staff.revokeStaffInvite(rootUp, { inviteId: id });
  ok("revokeStaffInvite: revoked ones no longer count", (await staff.pendingStaffInvites(root)) === 0 && (await staff.revokeStaffInvite(rootUp, { inviteId: pending[0] })).revoked === false);

  // a role change revokes the person's sessions
  const s1 = await createSession(fx.staff.support, { mfaPassed: true, ip: "203.0.113.9", ua: "Edge" });
  const changed = await staff.setStaffRole(rootUp, { userId: fx.staff.support, role: "analyst", reason: "moves to reporting" });
  ok("setStaffRole: support → analyst, the session revoked", "changed" in changed && changed.changed && (await roleOf(fx.staff.support)) === "analyst" && (await count(fx.conn, "SELECT COUNT(*) AS n FROM sessions WHERE id = ?", [s1.id])) === 0, changed);
  const [roleAudit] = await rows<{ meta: string }>(fx.conn, "SELECT meta FROM audit_log WHERE action = 'platform.staff.changed' AND target = ? ORDER BY id DESC LIMIT 1", [fx.staff.support]);
  ok("audit platform.staff.changed { userId, from, to, reason }", (() => {
    const m = JSON.parse(roleAudit?.meta ?? "{}");
    return m.userId === fx.staff.support && m.from === "support" && m.to === "analyst" && m.reason === "moves to reporting";
  })(), roleAudit);
  ok("setStaffRole: a reason is required", (await codeOf(staff.setStaffRole(rootUp, { userId: fx.staff.support, role: "support", reason: "" }))).startsWith("fields"));
  ok("setStaffRole: nobody changes their own role", (await refusalOf(staff.setStaffRole(rootUp, { userId: fx.staff.super_admin, role: "admin", reason: "testing" }))) === "forbidden:auth.staff.not_yourself");
  await fx.conn.query("UPDATE users SET platform_role = 'support' WHERE id = ?", [fx.staff.support]);

  // the invariant: at least one active super_admin with TOTP (other cases' extra super_admins step aside meanwhile)
  const extraSupers = (await rows<{ id: string }>(fx.conn, "SELECT id FROM users WHERE platform_role = 'super_admin' AND id <> ?", [fx.staff.super_admin])).map((r) => r.id);
  if (extraSupers.length) await fx.conn.query("UPDATE users SET platform_role = 'admin' WHERE id IN (?)", [extraSupers]);
  const second = await account(fx, "root.two@store-gen.test", { platformRole: "super_admin", totp: true });
  const secondUp = await staffCtx(fx, "super_admin", { userId: second, stepUp: true });
  const both = await Promise.allSettled([
    staff.setStaffRole(rootUp, { userId: second, role: "admin", reason: "rotation one" }),
    staff.setStaffRole(secondUp, { userId: fx.staff.super_admin, role: "admin", reason: "rotation two" }),
  ]);
  const refusedLast = both.filter((r) => r.status === "rejected" && (r.reason as { code?: string }).code === "last_super_admin").length;
  const supersLeft = await count(fx.conn, "SELECT COUNT(*) AS n FROM users WHERE platform_role = 'super_admin' AND totp_enabled = 1 AND disabled = 0");
  ok("two super_admins demoting each other at once: one change, one last_super_admin", both.filter((r) => r.status === "fulfilled").length === 1 && refusedLast === 1 && supersLeft === 1, both.map((r) => r.status));
  await fx.conn.query("UPDATE users SET platform_role = 'super_admin' WHERE id IN (?, ?)", [fx.staff.super_admin, second]);
  await fx.conn.query("UPDATE users SET totp_enabled = 0 WHERE id = ?", [second]);
  ok("the last super_admin with TOTP can't be demoted (one without TOTP doesn't count)", (await codeOf(staff.setStaffRole(secondUp, { userId: fx.staff.super_admin, role: "admin", reason: "testing" }))) === "last_super_admin" && (await roleOf(fx.staff.super_admin)) === "super_admin");
  ok("…nor removed", (await codeOf(staff.removeStaff(secondUp, { userId: fx.staff.super_admin, reason: "testing" }))) === "last_super_admin");
  await fx.conn.query("UPDATE users SET totp_enabled = 1 WHERE id = ?", [second]);

  // a promotion with two super_admins needs the other one's confirmation (PD7)
  const promo = await staff.setStaffRole(rootUp, { userId: fx.staff.admin, role: "super_admin", reason: "second on-call" });
  const reqId = "requested" in promo ? promo.requested.id : "";
  ok("setStaffRole → super_admin: a four-eyes platform request, the role unchanged", "requested" in promo && promo.requested.mode === "four_eyes" && (await roleOf(fx.staff.admin)) === "admin", promo);
  ok("…the other super_admin is told", (await count(fx.conn, "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'staff.super_admin_requested' AND user_id = ?", [second])) === 1);
  ok("…the requester can't confirm it", (await refusalOf(preq.confirmPlatformRequest(rootUp, { requestId: reqId }))) === "forbidden:console.request.self_confirm");
  ok("…the job doesn't execute an unconfirmed request", (await preq.runDueRequests(new Date())).executed === 0 && (await roleOf(fx.staff.admin)) === "admin");
  await preq.confirmPlatformRequest(secondUp, { requestId: reqId });
  const ran = await preq.runDueRequests(new Date());
  ok("…confirmed by the other super_admin, executed by the job", ran.executed === 1 && (await roleOf(fx.staff.admin)) === "super_admin", ran);
  await fx.conn.query("UPDATE users SET platform_role = 'admin' WHERE id = ?", [fx.staff.admin]);
  // with one super_admin left, a promotion waits 24 h (cancelled here)
  await fx.conn.query("UPDATE users SET platform_role = 'none' WHERE id = ?", [second]);
  const delayed = await staff.setStaffRole(rootUp, { userId: fx.staff.analyst, role: "super_admin", reason: "only one root" });
  ok("one super_admin: the promotion is delayed 24 h", "requested" in delayed && delayed.requested.mode === "delayed" && !!delayed.requested.executeAfter, delayed);
  if ("requested" in delayed) await preq.cancelPlatformRequest(rootUp, { requestId: delayed.requested.id });

  // remove and sign out everyone
  const removed = await staff.removeStaff(rootUp, { userId: accepted.userId, reason: "left the team" });
  ok("removeStaff: role none", removed.removed && (await roleOf(accepted.userId)) === "none");
  const mine = await createSession(fx.staff.super_admin, { mfaPassed: true, ip: "203.0.113.7", ua: "Edge" });
  const mineOther = await createSession(fx.staff.super_admin, { mfaPassed: true, ip: "203.0.113.8", ua: "Edge" });
  const theirs = await createSession(fx.staff.analyst, { mfaPassed: true, ip: "203.0.113.10", ua: "Edge" });
  const me = { ...rootUp, user: { ...rootUp.user, sessionId: mine.id } };
  const out = await staff.signOutAllStaffExcept(me);
  const alive = await rows<{ id: string }>(fx.conn, "SELECT id FROM sessions WHERE id IN (?, ?, ?)", [mine.id, mineOther.id, theirs.id]);
  ok("signOutAllStaffExcept: every staff session ends but the caller's current one", out.sessions >= 2 && alive.length === 1 && alive[0]?.id === mine.id, { out, alive });
  ok("audit platform.staff.signed_out_all", (await count(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'platform.staff.signed_out_all'")) === 1);
  if (extraSupers.length) await fx.conn.query("UPDATE users SET platform_role = 'super_admin' WHERE id IN (?)", [extraSupers]);
}

/* ------------------------------------------------------------------ */
/* case 8: legal documents (PL-14; PLA-§13.4, PD17, PD49)              */
/* ------------------------------------------------------------------ */

async function case8(fx: Fixtures): Promise<void> {
  const legal = await import("@/lib/platform/legal");
  const { seedLegalTemplates } = await import("@/lib/db/boot-tasks");
  const { signupAccount } = await import("@/lib/auth/signup");
  const root = await staffCtx(fx, "super_admin");
  const docOf = async (kind: string, locale: string, version: number) =>
    (await rows<{ id: string; status: string; needs_legal_review: number; ack_unreviewed_by: string | null; ack_unreviewed_at: Date | null; requires_reacceptance: number }>(fx.conn, "SELECT * FROM legal_documents WHERE kind = ? AND locale = ? AND version = ?", [kind, locale, version]))[0];

  // the seed (PD49): every R1 kind × locale as a draft needing legal review, no DPA
  const seeded = await seedLegalTemplates();
  ok("the boot seeds 24 drafts once (8 kinds × 3 locales)", seeded.inserted === 24 && (await seedLegalTemplates()).skipped, seeded);
  ok("…every one a draft flagged Needs legal review, no DPA", (await count(fx.conn, "SELECT COUNT(*) AS n FROM legal_documents WHERE status = 'draft' AND needs_legal_review = 1")) === 24 && (await count(fx.conn, "SELECT COUNT(*) AS n FROM legal_documents WHERE kind = 'dpa'")) === 0);
  const list0 = await legal.listLegal(root);
  ok("listLegal: kind × locale, and the red lines: sign-up runs without ToS, Privacy, AUP", list0.groups.length === 24 && JSON.stringify(list0.missing) === JSON.stringify(["tos", "privacy", "aup"]), list0.missing);
  ok("legal.manage is super_admin only", (await codeOf(legal.listLegal(await staffCtx(fx, "admin")))) === "forbidden");

  // the editor's refusals
  ok("saveLegalDraft: DPA arrives in R2", (await refusalOf(legal.saveLegalDraft(root, { kind: "dpa", locale: "en", title: "DPA", body: "Text" }))) === "invalid:console.legal.dpa_later");
  ok("saveLegalDraft: a platform document holds no placeholder", (await codeOf(legal.saveLegalDraft(root, { kind: "tos", locale: "en", title: "Terms", body: "Hello {{contact.phone}}" }))) === "fields:body");
  ok("saveLegalDraft: a store template refuses a field P3 doesn't export", (await refusalOf(legal.saveLegalDraft(root, { kind: "store_returns", locale: "en", title: "Returns", body: "Within {{returns.days}} days" }))) === "fields:body=console.legal.unknown_placeholder");
  ok("saveLegalDraft: a stale editor answers conflict", (await refusalOf(legal.saveLegalDraft(root, { kind: "privacy", locale: "fr", title: "Confidentialité", body: "Texte", baseVersion: 0 }))) === "conflict:console.legal.changed");
  const edited = await legal.saveLegalDraft(root, { kind: "privacy", locale: "fr", title: "Politique de confidentialité", body: "# Politique\n\nNous traitons vos données pour faire fonctionner le service.", baseVersion: 1 });
  ok("saveLegalDraft: the seeded draft is edited in place (version 1)", !edited.created && edited.version === 1, edited);

  // an unreviewed publish needs both confirmations, recorded (PD17)
  const privacyFr = (await docOf("privacy", "fr", 1))!;
  ok("publishLegal: unreviewed without the acknowledgement", (await codeOf(legal.publishLegal(root, { id: privacyFr.id }))) === "fields:acknowledge");
  ok("publishLegal: unreviewed with a wrong typed text", (await codeOf(legal.publishLegal(root, { id: privacyFr.id, acknowledge: true, typed: "publish" }))) === "fields:typed");
  ok("…nothing published", (await docOf("privacy", "fr", 1))?.status === "draft");
  const pub = await legal.publishLegal(root, { id: privacyFr.id, acknowledge: true, typed: "Publish Unreviewed" });
  const pubRow = await docOf("privacy", "fr", 1);
  ok("publishLegal: published with ack_unreviewed_by / _at", pub.unreviewed && pubRow?.status === "published" && pubRow.ack_unreviewed_by === fx.staff.super_admin && !!pubRow.ack_unreviewed_at, pubRow);
  const published1 = await rows<{ meta: string }>(fx.conn, "SELECT meta FROM audit_log WHERE action = 'platform.legal.published'");
  ok("audit platform.legal.published { unreviewed: true }", published1.length === 1 && JSON.parse(published1[0]!.meta).unreviewed === true, published1);
  ok("listLegal: Privacy no longer missing", JSON.stringify((await legal.listLegal(root)).missing) === JSON.stringify(["tos", "aup"]));

  // a signup while no ToS is published records acceptances for the published kinds only (T2's signup)
  const approval = { killed: false, mode: { mode: "approval" as const, stored: "approval" as const, unguarded: false, turnstile: null }, chargeSlot: async () => false, refundSlot: async () => undefined } as never;
  const signupCtx = (n: number) => ({ ip: `198.51.100.${80 + n}`, ua: "Mozilla/5.0 (platform-check)", deviceId: null, turnstile: async () => "ok" as const }) as never;
  const form = (n: string) => ({ name: `Legal Seller ${n}`, email: `legal.seller.${n}@gmail.com`, password: `Platform-Check-${n}-Legal-9q!`, phone: "+212612345678", storeName: `Legal ${n}`, handle: `legal-case-${n}`, market: "MA", acceptLegal: true, formMs: 42_000, locale: "fr" as const });
  const u1 = (await signupAccount(form("one"), signupCtx(1), approval)) as { kind: string; userId: string; storeId: string };
  const acc1 = await rows<{ document_id: string; context: string; store_id: string | null }>(fx.conn, "SELECT document_id, context, store_id FROM legal_acceptances WHERE user_id = ?", [u1.userId]);
  ok("signup without a published ToS succeeds and accepts only the published Privacy", u1.kind === "created" && acc1.length === 1 && acc1[0]?.document_id === privacyFr.id && acc1[0].context === "signup" && acc1[0].store_id === u1.storeId, { u1: u1.kind, acc1 });

  // re-acceptance, per user: a new Privacy version that asks people to accept again
  const v2 = await legal.saveLegalDraft(root, { kind: "privacy", locale: "fr", title: "Politique de confidentialité", body: "# Politique\n\nVersion deux : nous traitons vos données pour faire fonctionner le service.", summary: "Une section réécrite.", requiresReacceptance: true, baseVersion: 1 });
  ok("saveLegalDraft on a published version starts version 2", v2.created && v2.version === 2, v2);
  ok("markLegalReviewed needs the typed word", (await codeOf(legal.markLegalReviewed(root, { id: v2.id, typed: "ok" }))) === "fields:typed");
  ok("markLegalReviewed clears Needs legal review", (await legal.markLegalReviewed(root, { id: v2.id, typed: "reviewed" })).changed && (await docOf("privacy", "fr", 2))?.needs_legal_review === 0);
  const detail = await legal.getLegalVersion(root, v2.id);
  ok("getLegalVersion: the line diff against version 1", detail.previous?.version === 1 && detail.diffStats.added >= 1 && detail.diffStats.removed >= 1, detail.diffStats);
  const u2 = await account(fx, "legal.reader@gmail.com", { locale: "en" });
  ok("before the publish: nobody is asked again", (await legal.pendingReacceptance(u1.userId)) === null && (await legal.pendingReacceptance(u2)) === null);
  const pub2 = await legal.publishLegal(root, { id: v2.id });
  ok("a reviewed version publishes without the acknowledgement; version 1 retires", !pub2.unreviewed && pub2.retired === 1 && (await docOf("privacy", "fr", 1))?.status === "retired");
  ok("retireLegal: the only published version can't retire", (await refusalOf(legal.retireLegal(root, { id: v2.id }))) === "invalid:console.legal.retire_last_published");
  const p1 = await legal.pendingReacceptance(u1.userId);
  ok("the earlier signup is asked to accept version 2 (title and What changed)", p1?.docs.length === 1 && p1.docs[0]?.id === v2.id && p1.docs[0].summary === "Une section réécrite.", p1);
  ok("a person in en is asked for the fr version (locale → fr → en → ar)", (await legal.pendingReacceptance(u2))?.docs[0]?.id === v2.id);
  const u3 = (await signupAccount(form("three"), signupCtx(3), approval)) as { kind: string; userId: string };
  ok("a signup after the publish accepted version 2: not asked", u3.kind === "created" && (await legal.pendingReacceptance(u3.userId)) === null);
  const userCtx = (id: string) => ({ user: { id, email: "", name: "", totpEnabled: false, sessionId: `sess-${id}`, platformRole: "none", locale: null, lastStoreId: null }, actor: { kind: "user", userId: id, impersonatorId: null, ip: null } }) as never;
  ok("recordReacceptance: a document the person isn't asked for → conflict", (await codeOf(legal.recordReacceptance(userCtx(u1.userId), [privacyFr.id], { ipHash: null, uaLabel: "Chrome" }))) === "conflict");
  await legal.recordReacceptance(userCtx(u1.userId), [v2.id], { ipHash: null, uaLabel: "Chrome on Android" });
  ok("recordReacceptance: one reaccept row, outside any store; this person is no longer asked", (await count(fx.conn, "SELECT COUNT(*) AS n FROM legal_acceptances WHERE user_id = ? AND document_id = ? AND context = 'reaccept' AND store_id IS NULL", [u1.userId, v2.id])) === 1 && (await legal.pendingReacceptance(u1.userId)) === null);
  ok("…the other person still is (per user)", (await legal.pendingReacceptance(u2))?.docs[0]?.id === v2.id);
  ok("listLegal: acceptance counts per platform version", (await legal.listLegal(root)).groups.find((g) => g.kind === "privacy" && g.locale === "fr")?.published?.acceptances === 2);

  // PL-14 acceptance (PLA-§13.6): a new brand name is the TOTP issuer of new enrolments only; existing codes keep
  // verifying (the HKDF salt and the purpose totp:<userId> never change). The console save is step 7's action; this is
  // the setting it writes and T2's enrolment that reads it.
  const mfa = await import("@/lib/auth/mfa");
  const { totpCode, totpStep } = await import("@/lib/auth/totp");
  const { prepareAccount, insertAccount } = await import("@/lib/auth/users");
  const { getPlatformSetting, setPlatformSetting } = await import("@/lib/settings");
  const password = "Platform-Check-Issuer-9q!";
  const person = async (email: string) => {
    const a = await prepareAccount({ email, name: "Issuer Person", password, locale: "en" });
    await insertAccount(a);
    return a.id!;
  };
  const issuerOf = (uri: string) => new URL(uri).searchParams.get("issuer");
  const before = await person("issuer.before@gmail.com");
  const enrolBefore = await mfa.beginTotpEnrollment(before);
  const secret = new URL(enrolBefore.otpauthUri).searchParams.get("secret") ?? "";
  await mfa.confirmTotpEnrollment(before, { code: totpCode(secret), password });
  const platform = await getPlatformSetting("platform", { fresh: true });
  const brandBefore = platform.brand.name;
  await setPlatformSetting("platform", { ...platform, brand: { ...platform.brand, name: "Souk Studio" } }, { id: fx.staff.super_admin, ip: "203.0.113.7", kind: "platform" });
  try {
    const after = await person("issuer.after@gmail.com");
    const enrolAfter = await mfa.beginTotpEnrollment(after);
    ok("the brand name is the TOTP issuer of a new enrolment", issuerOf(enrolBefore.otpauthUri) === brandBefore && issuerOf(enrolAfter.otpauthUri) === "Souk Studio", { before: issuerOf(enrolBefore.otpauthUri), after: issuerOf(enrolAfter.otpauthUri) });
    ok("a code of the authenticator enrolled before the rename still verifies", (await mfa.verifySecondFactor(before, { method: "totp", code: totpCode(secret, totpStep() + 1) })).ok);
  } finally {
    await setPlatformSetting("platform", { ...(await getPlatformSetting("platform", { fresh: true })), brand: { ...platform.brand, name: brandBefore } }, { id: fx.staff.super_admin, kind: "platform" });
  }
}

/* ------------------------------------------------------------------ */
/* case 19, the Domains half (OS-06; PLA-§16)                          */
/* ------------------------------------------------------------------ */

async function case19(fx: Fixtures): Promise<void> {
  const dm = await import("@/lib/platform/domain-move");
  const { SKIP_TEXT, DOMAIN_STEPS } = await import("@/lib/platform/domain-move-rules");
  const { getPlatformSetting } = await import("@/lib/settings");
  const root = await staffCtx(fx, "super_admin");
  const rootUp = await staffCtx(fx, "super_admin", { stepUp: true });
  let netCalls = 0;
  const refuse = async (): Promise<never> => {
    netCalls++;
    throw new Error("network call");
  };
  const noNet = { head: refuse, get: refuse, certificate: refuse, turnstile: refuse };

  // on the temporary domain (no STORE_ROOT_DOMAIN, no ADMIN_HOST): answers without any network call
  const v3 = await dm.runDomainCheck(root, { id: "V3" }, { net: noNet });
  ok("V3 on the temporary domain: 'S mode is off', no network call", v3.outcome === "skipped" && v3.message === SKIP_TEXT.sModeOff && v3.network === false && netCalls === 0, v3);
  const v12 = await dm.runDomainCheck(root, { id: "V12", requestHost: { cls: "platform", host: "localhost:3461" } as never }, { net: noNet });
  ok("V12: 'ADMIN_HOST not set (expected before the move)', no network call", v12.outcome === "skipped" && v12.message === SKIP_TEXT.adminHostUnset && v12.network === false && netCalls === 0, v12);
  for (const id of ["V7", "V8", "V10", "V13"]) {
    const r = await dm.runDomainCheck(root, { id, token: "x" }, { net: noNet });
    ok(`${id} on the temporary domain: skipped without a network call`, r.outcome === "skipped" && netCalls === 0, r);
  }
  ok("a skipped check is not recorded as passed", (await dm.getDomainMove(root)).checks.every((c) => c.passed === null));
  ok("a manual check has no Run", (await refusalOf(dm.runDomainCheck(root, { id: "V1" }, { net: noNet }))) === "invalid:console.domains.check_manual");
  ok("a runnable check can't be marked passed by hand", (await refusalOf(dm.markDomainCheck(root, { id: "V3", passed: true }))) === "invalid:console.domains.check_run_it");
  ok("domains.manage: an analyst can't mark a step", (await codeOf(dm.markDomainStep(await staffCtx(fx, "analyst"), { stepId: "buy_domain", done: true }))) === "forbidden");

  // the checklist state lives in the platform setting row: what a restarted process reads
  ok("markDomainStep: marked with date and staff", (await dm.markDomainStep(root, { stepId: "buy_domain", done: true })).changed && !(await dm.markDomainStep(root, { stepId: "buy_domain", done: true })).changed);
  await dm.markDomainCheck(root, { id: "V1", passed: true, note: "npm run test:hosts: 626 checks" });
  await Promise.all([dm.markDomainStep(root, { stepId: "cf_zone", done: true }), dm.markDomainStep(root, { stepId: "apex_a", done: true })]);
  const [settingRow] = await rows<{ value: string }>(fx.conn, "SELECT value FROM settings WHERE `key` = 'platform'");
  const persisted = JSON.parse(settingRow?.value ?? "{}").domainMove ?? {};
  ok("the row holds every mark, two concurrent marks included (the domain-move lock)", ["buy_domain", "cf_zone", "apex_a"].every((s) => persisted.steps?.[s]?.by === fx.staff.super_admin) && persisted.checks?.V1?.note?.startsWith("npm run test:hosts"), persisted);
  const fresh = (await getPlatformSetting("platform", { fresh: true })).domainMove;
  const view = await dm.getDomainMove(root);
  ok("a fresh read (the restart's) gives the same checklist", Object.keys(fresh.steps).sort().join() === "apex_a,buy_domain,cf_zone" && view.steps.filter((s) => s.done).length === 3 && view.checks.find((c) => c.id === "V1")?.passed?.note === "npm run test:hosts: 626 checks" && !view.allPassed);
  await dm.markDomainStep(root, { stepId: "apex_a", done: false });
  ok("a mark can be cleared", !(await dm.getDomainMove(root)).steps.find((s) => s.id === "apex_a")?.done);
  ok("audit platform.domains.step per change", (await count(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'platform.domains.step'")) === 5);
  ok("the env step says restart, never rebuild", /restart/i.test(DOMAIN_STEPS.find((s) => s.id === "env_replace")?.detail ?? "") && !/rebuild/i.test(JSON.stringify(view)));

  // the status card: non-secret values only
  const secret = "case19-edge-key-0f3a9d1c7b5e2a8f4d6c0b9e1a3f5d7c";
  process.env.EDGE_KEY = secret;
  try {
    const status = await dm.domainStatus(await staffCtx(fx, "analyst"));
    ok("domainStatus: EDGE_KEY reads set, its value nowhere; S mode off without the root domain; ADMIN_HOST not yet", status.edgeKey === "set" && status.edgeKeyPrev === "not_set" && !JSON.stringify(status).includes(secret) && !status.sMode && status.adminHostLine === "not_yet" && status.signup.defaultMode === "invite", status);
  } finally {
    delete process.env.EDGE_KEY;
  }

  // re-render all live pages: the request returns at once, the job fans out
  ok("requestRerenderAll: a fresh step-up first", (await codeOf(dm.requestRerenderAll(root, fx.newId()))) === "step_up");
  const started = await dm.requestRerenderAll(rootUp, fx.newId());
  ok("requestRerenderAll: recorded, nothing enqueued in the request", started.started && started.state.stores === 0 && !started.state.done);
  ok("…a second request while it runs starts nothing", (await dm.requestRerenderAll(rootUp, fx.newId())).started === false);
  const job = await dm.runRerenderJob({ deadline: Date.now() + 2_000 });
  const progress = await dm.rerenderProgress(root);
  ok("the platform.rerender job runs the fan-out (P8's queue, or 'unavailable' while it is the stub: never a made-up count)", job.done && !!progress?.done && (progress.unavailable === true ? progress.enqueued === 0 : progress.stores >= 1), { job, progress });
  ok("audit platform.domains.rerender", (await count(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'platform.domains.rerender'")) === 1);
}

/* ------------------------------------------------------------------ */
/* case 9: impersonation from the console (PL-10; PLA-§10.1)           */
/* case 12, the pulse half: ConsolePulse.impersonation (PLA-§4.6)      */
/* ------------------------------------------------------------------ */

async function case9(fx: Fixtures): Promise<void> {
  const imp = await import("@/lib/platform/impersonation");
  const member = await extraStore(fx, "case9-member", "active");
  await fx.conn.query("INSERT INTO store_members (store_id, user_id, role) VALUES (?, ?, 'viewer')", [member.id, fx.staff.support]);
  const sched = await extraStore(fx, "case9-sched", "scheduled_deletion");
  const support = await staffCtx(fx, "support");
  ok("start refused for a staff member who is an active member of the store (they open it as a member)", (await codeOf(imp.startImpersonation(support, { storeId: member.id, reason: "ticket", ticketRef: "T-9" }))) === "impersonation_member");
  const admin = await staffCtx(fx, "admin");
  ok("start refused for a store scheduled for deletion", (await codeOf(imp.startImpersonation(admin, { storeId: sched.id, reason: "bug", note: "case 9" }))) === "impersonation_state");
  const other = await extraStore(fx, "case9-other", "active");
  await imp.startImpersonation(admin, { storeId: fx.stores.A.id, reason: "onboarding" });
  await imp.startImpersonation(admin, { storeId: other.id, reason: "onboarding" });
  const open = await rows<{ store_id: string; ended_reason: string | null }>(fx.conn, "SELECT store_id, ended_reason FROM impersonation_sessions WHERE staff_user_id = ? ORDER BY started_at", [fx.staff.admin]);
  ok("a second start ends the first (one open view-as per session)", open.length === 2 && open[0]?.store_id === fx.stores.A.id && open[0]?.ended_reason === "ended" && open[1]?.store_id === other.id && open[1]?.ended_reason === null, open);
  await imp.endImpersonation(admin, "ended");
}

async function case12(fx: Fixtures): Promise<void> {
  const imp = await import("@/lib/platform/impersonation");
  const { consolePulse, pulseEtag } = await import("@/lib/platform/pulse");
  const ops = await staffCtx(fx, "admin");
  const before = await consolePulse(ops);
  ok("ConsolePulse: v 1, no view-as yet, the queue counts and the audit head are numbers", before.v === 1 && before.impersonation === null && Number.isInteger(before.queue.review) && before.auditHead > 0, before);
  ok("ConsolePulse: P8's render summary is unavailable on this branch, so `renders` is null (never a made-up 0)", before.renders === null);
  const t0 = Date.now();
  await imp.startImpersonation(ops, { storeId: fx.stores.A.id, reason: "ticket", ticketRef: "T-12" });
  const during = await consolePulse(ops);
  ok("ConsolePulse.impersonation is set within 5 s of the start", during.impersonation?.storeId === fx.stores.A.id && during.impersonation.handle === fx.stores.A.handle && Date.now() - t0 < 5_000, during.impersonation);
  ok("the ETag changes with the view-as", pulseEtag(during) !== pulseEtag(before));
  const another = await consolePulse(await staffCtx(fx, "super_admin"));
  ok("another staff member's pulse carries no view-as of this one", another.impersonation === null);
  const t1 = Date.now();
  await imp.endImpersonation(ops, "ended");
  const after = await consolePulse(ops);
  ok("ConsolePulse.impersonation is null within 5 s of the end", after.impersonation === null && Date.now() - t1 < 5_000);
  ok("an analyst's pulse answers too (console.read)", (await consolePulse(await staffCtx(fx, "analyst"))).v === 1);
}

/* ------------------------------------------------------------------ */
/* case 10, the read-model half: every console read runs on the seed,  */
/* masked per role (PLA-§5, §6, §7, §11; §O.3 cases 1-2 data side)     */
/* ------------------------------------------------------------------ */

async function case10(fx: Fixtures): Promise<void> {
  const overview = await import("@/lib/platform/overview");
  const list = await import("@/lib/platform/stores-list");
  const header = await import("@/lib/platform/profile/header");
  const strips = await import("@/lib/platform/profile/overview-strips");
  const usage = await import("@/lib/platform/profile/usage");
  const team = await import("@/lib/platform/profile/team");
  const timeline = await import("@/lib/platform/profile/timeline");
  const activity = await import("@/lib/platform/profile/activity");
  const orders = await import("@/lib/platform/profile/orders");
  const people = await import("@/lib/platform/people");
  const lookup = await import("@/lib/platform/order-lookup");
  const search = await import("@/lib/platform/search");
  const notes = await import("@/lib/platform/notes");
  const create = await import("@/lib/platform/store-create");
  const messages = await import("@/lib/platform/messages");
  const backups = await import("@/lib/platform/backups");
  const system = await import("@/lib/platform/system");
  const A = fx.stores.A;
  const root = await staffCtx(fx, "super_admin");
  const support = await staffCtx(fx, "support");
  const analyst = await staffCtx(fx, "analyst");
  await fx.conn.query("INSERT INTO customers (id, store_id, phone, name, city, orders_count, last_order_at) VALUES (?, ?, ?, ?, 'Casablanca', 1, NOW(3))", [fx.newId(), A.id, CANARY.phone, CANARY.name]);
  await fx.conn.query("INSERT INTO blocklist (id, store_id, kind, value) VALUES (?, ?, 'phone', ?)", [fx.newId(), A.id, CANARY.phone]);
  const leaks = (v: unknown) => {
    const s = JSON.stringify(v);
    return [CANARY.phone, CANARY.name, CANARY.address, CANARY.note, CANARY.sellerEmail].filter((c) => s.includes(c));
  };

  // the overview (PLA-§5): every block answers on its own; an analyst sees the order tiles hidden below k stores
  const tiles = await overview.overviewKpis(root);
  ok("overview tiles: active stores counted, the orders tile reads real rows (the seed's order is placed now)", tiles.activeStores.state === "ok" && tiles.activeStores.data.active >= 1 && tiles.orders.state === "ok" && tiles.orders.data.kind === "ok" && tiles.orders.data.count >= 1, tiles);
  ok("overview tiles: sales per currency, never summed across", tiles.sales.state === "ok" && tiles.sales.data.kind === "ok" && tiles.sales.data.byCurrency.every((c) => c.currency.length === 3 && Number.isInteger(c.cents)), tiles.sales);
  const hidden = await overview.overviewKpis(analyst);
  ok("PD15: with fewer than 5 contributing stores an analyst sees both order tiles hidden", hidden.orders.state === "ok" && hidden.orders.data.kind === "hidden" && hidden.sales.state === "ok" && hidden.sales.data.kind === "hidden", hidden.orders);
  ok("the database and error tiles answer (an empty error table says so, never 0 with an arrow)", tiles.errors.state === "ok" && tiles.errors.data.kind === "empty" && tiles.database.state !== "error", { errors: tiles.errors, db: tiles.database.state });
  const attention = await overview.needsAttention(root);
  ok("Needs attention: at most 20 rows, each with a level, a code and a link", attention.rows.length <= 20 && attention.rows.every((r) => r.code && r.href.startsWith("/admin")), attention.rows.slice(0, 3));
  const feed = await overview.activityFeed(analyst);
  ok("activity feed: FEED_ACTIONS only, no staff name for an analyst", feed.rows.every((r) => (overview.FEED_ACTIONS as readonly string[]).includes(r.action) && (r.actor.kind !== "staff" || r.actor.name === null)) && feed.head > 0, feed.rows.slice(0, 3));
  const snap = await overview.queueSnapshotBlock(root);
  ok("queue snapshot: the counts and at most five oldest reviews", snap.oldest.length <= 5 && Number.isInteger(snap.snapshot.counts.review) && Number.isInteger(snap.snapshot.answered));
  const sys = await overview.systemSummary(root);
  ok("system: P8's machinery is unavailable on this branch, the health engine answers", sys.machine.state === "unavailable" && sys.health.state === "ok", sys);

  // the stores list (PLA-§6.1)
  const created = await list.listStores(root, {});
  ok("stores list: newest first, owners attached, store #1 rule and Internal plan read", created.rows.length >= 4 && created.rows.some((r) => r.id === A.id && r.owner?.firstName === "Salma"), created.rows.length);
  const bySupport = await list.listStores(support, { q: "atlas" });
  ok("stores list: a name prefix finds the store; support sees the owner e-mail masked (PD35)", bySupport.rows.length === 1 && bySupport.rows[0]!.owner?.email !== CANARY.sellerEmail, bySupport.rows[0]?.owner);
  ok("stores list: an exact owner e-mail finds the store", (await list.listStores(root, { q: CANARY.sellerEmail })).rows.some((r) => r.id === A.id));
  for (const sort of list.STORE_SORTS) {
    const page1 = await list.listStores(root, { sort }, null, { pageSize: 2 });
    const page2 = page1.next ? await list.listStores(root, { sort }, page1.next, { pageSize: 2 }) : null;
    ok(`stores list sorted by ${sort}: keyset pages never repeat a row`, !!page1.next && !!page2 && page2.rows.every((r) => !page1.rows.some((p) => p.id === r.id)), { p1: page1.rows.map((r) => r.id), p2: page2?.rows.map((r) => r.id) });
  }
  ok("stores list filters: status, attention, flag and band combine", (await list.listStores(root, { status: ["suspended"] })).rows.every((r) => r.status === "suspended") && Array.isArray((await list.listStores(root, { attention: true, flag: ["quota_high"], band: ["hold"] })).rows));
  ok("stores list: a tampered cursor answers page 1", (await list.listStores(root, {}, "eyJrIjpbMV19.0000000000000000")).rows[0]?.id === created.rows[0]?.id);
  ok("stores CSV: analysts and support are refused (admin+)", (await codeOf(list.storesCsv(support, {}))) === "forbidden" && (await codeOf(list.storesCsv(analyst, {}))) === "forbidden");
  const csv = await list.storesCsv(root, {});
  ok("stores CSV: the ten columns, no @ outside the header, audited platform.stores.exported", csv.csv.split("\r\n")[0] === list.STORES_CSV_COLUMNS.join(",") && !csv.csv.split("\r\n").slice(1).join("\n").includes("@") && (await count(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'platform.stores.exported'")) === 1, csv.csv.slice(0, 200));

  // the profile (PLA-§7): header, strips, tabs; masking per role
  const h = await header.getStoreHeader(support, A.id);
  ok("profile header: fresh row, owners masked for support, live URL for an active store", h?.store.handle === A.handle && h.owners.length === 1 && h.owners[0]!.email !== CANARY.sellerEmail && "url" in h.live, h);
  ok("profile header: an unknown id answers null", (await header.getStoreHeader(root, fx.newId())) === null);
  const all = await strips.loadStrips(support, A.id);
  const states = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.state]));
  ok("the ten strips: each answers ok or unavailable (a later track's stub), none errors", Object.values(all).every((p) => p.state === "ok" || p.state === "unavailable") && all.identity.state === "ok" && all.risk.state === "ok" && all.usage.state === "ok" && all.team.state === "ok" && all.timeline.state === "ok", states);
  ok("the strips carry no customer canary and no full seller e-mail for support", leaks(all).length === 0, leaks(all));
  const kpis = await strips.getStoreOverview(support, A.id, 30);
  ok("the KPI row: stats_daily answers, P4's orders are unavailable here, delivery waits for R2", kpis.stats.state === "ok" && kpis.orders.state === "unavailable" && kpis.deliveryR2 === true && kpis.from < kpis.to, kpis);
  const u = await usage.getStoreUsage(root, A.id);
  ok("usage tab: one line per entitlement key, effective values from T1, the meters", !!u && u.entitlements.length >= 30 && u.meters.length === usage.METERS.length && u.entitlements.some((l) => l.key === "media_bytes" && l.effective !== undefined), u?.meters);
  const t = await team.getStoreTeam(analyst, A.id);
  ok("team tab: the members, 2FA coverage, every e-mail masked for an analyst", (t?.members.length ?? 0) >= 5 && t!.twoFactor.of >= 5 && t!.members.every((m) => m.email.includes("•")), t?.members.map((m) => m.email));
  const tl = await timeline.listStoreTimeline(root, A.id, { limit: 50 });
  ok("timeline: newest first, merged from the four sources", tl.events.every((e, i, a) => i === 0 || a[i - 1]!.at >= e.at), tl.events.slice(0, 3));
  ok("activity tab: audit.platform rows of the store (analysts refused)", (await codeOf(activity.listStoreActivity(analyst, A.id))) === "forbidden" && Array.isArray((await activity.listStoreActivity(root, A.id)).rows));
  ok("orders tab: P4's console read is unavailable here (its stub), never a guess", (await codeOf(orders.listStoreOrders(root, A.id))).startsWith("threw:not implemented"));
  ok("reveal: an analyst is refused; staff without a fresh step-up answer step_up", (await codeOf(orders.revealOrderPii(analyst, { storeId: A.id, orderId: fx.order, reason: "ticket" }))) === "forbidden" && (await codeOf(orders.revealOrderPii(root, { storeId: A.id, orderId: fx.order, reason: "ticket" }))) === "step_up");

  // people (PLA-§11)
  const byEmail = await people.listPeople(analyst, { q: CANARY.sellerEmail });
  ok("people: an exact e-mail finds the person for every role, masked for an analyst", byEmail.search === "email" && byEmail.rows.length === 1 && byEmail.rows[0]!.email !== CANARY.sellerEmail && byEmail.rows[0]!.stores.owner === 1, byEmail.rows);
  ok("people: a name prefix is admin+ only", (await people.listPeople(support, { q: "Salma" })).search === "ignored" && (await people.listPeople(root, { q: "Salma" })).rows.some((r) => r.id === fx.a.owner));
  ok("people: the no-store filter lists the outsider", (await people.listPeople(root, { noStore: true })).rows.some((r) => r.id === fx.outsider));
  const profile = await people.getUserProfile(support, fx.a.owner);
  ok("user profile: the Stores tab, the e-mail masked for support", profile?.stores.some((s) => s.storeId === A.id && s.role === "owner") === true && profile.email !== CANARY.sellerEmail, profile);
  ok("user profile tabs answer", Array.isArray(await people.userSessions(root, fx.a.owner)) && Array.isArray(await people.userSignups(root, fx.a.owner)) && Array.isArray(await people.userLinked(root, fx.a.owner)) && Array.isArray((await people.userActivity(root, fx.a.owner)).rows));

  // the order lookup (PLA-§11.3)
  const card = await lookup.lookupOrderById(analyst, fx.order);
  ok("lookup by id: every role, one card, the customer masked, no address or note", card?.store.id === A.id && leaks(card).length === 0 && card.customer === "Canaryname Z." && card.phone.includes("•"), card);
  ok("lookup by id: an unknown id answers null", (await lookup.lookupOrderById(root, "CMD-ZZZZZZ")) === null);
  ok("lookup by phone: an analyst is refused (orders.lookup)", (await codeOf(lookup.lookupOrdersByPhone(analyst, "0600000777"))) === "forbidden");
  const auditsBefore = await count(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'platform.order.lookup'");
  const byPhone = await lookup.lookupOrdersByPhone(root, "0600000777");
  const lookupRows = await rows<{ meta: string }>(fx.conn, "SELECT meta FROM audit_log WHERE action = 'platform.order.lookup' ORDER BY id DESC LIMIT 1");
  ok("lookup by phone: the store with its count and blocklist state, the phone masked", byPhone.stores.length === 1 && byPhone.stores[0]!.store.id === A.id && byPhone.stores[0]!.blocked && byPhone.phone !== CANARY.phone && leaks(byPhone).length === 0, byPhone);
  ok("lookup by phone: one audit row, without the phone", (await count(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'platform.order.lookup'")) === auditsBefore + 1 && !(lookupRows[0]?.meta ?? "").includes("600000777") && (lookupRows[0]?.meta ?? "").includes("phoneHash"), lookupRows);

  // the console search (PLA-§4.4)
  const s1 = await search.consoleSearch(analyst, "atl");
  ok("search: a name prefix finds the store; an analyst never gets a full e-mail or a person by name", s1.stores.some((s) => s.id === A.id) && s1.people.length === 0 && leaks(s1).length === 0, s1);
  ok("search: an exact e-mail finds the person, masked for an analyst", (await search.consoleSearch(analyst, CANARY.sellerEmail)).people.every((p) => p.email !== CANARY.sellerEmail));
  ok("search: an order id answers the masked card", (await search.consoleSearch(support, fx.order)).order?.id === fx.order);

  // notes (PLA-§7.12)
  ok("notes: an analyst is refused", (await codeOf(notes.listNotes(analyst, { storeId: A.id }))) === "forbidden");
  const n1 = await notes.addNote(root, { storeId: A.id, body: "Checked the **brand** with @Platform", kind: "decision", mentions: [fx.staff.admin] });
  const listed = await notes.listNotes(support, { storeId: A.id });
  ok("notes: added with its mention, listed for staff, editable only by the author", listed.some((n) => n.id === n1.id && n.kind === "decision" && n.mentions.length === 1 && !n.canEdit), listed);
  ok("notes: the mention sent staff.mention", (await count(fx.conn, "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'staff.mention' AND user_id = ?", [fx.staff.admin])) === 1);
  ok("notes: only the author edits", (await codeOf(notes.editNote(support, { id: n1.id, body: "x" }))) === "forbidden");
  await notes.editNote(root, { id: n1.id, body: "Checked the brand again" });
  await notes.pinNote(support, { id: n1.id, pinned: true });
  await notes.deleteNote(root, { id: n1.id });
  ok("notes: edit, pin and soft delete audited, the deleted note gone from the list", (await count(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action LIKE 'platform.note.%'")) >= 4 && !(await notes.listNotes(root, { storeId: A.id })).some((n) => n.id === n1.id));
  const n2 = await notes.addNote(support, { userId: fx.a.owner, body: "Called about the payout" });
  ok("notes on a person (store-less)", (await notes.listNotes(root, { userId: fx.a.owner })).some((n) => n.id === n2.id && n.storeId === null));

  // store creation (PLA-§6.2), messages (PLA-§19.1), backups and system glue
  ok("createStore: stores.create (super_admin) only", (await codeOf(create.createStore(support, { name: "Nope", handle: "nope-store" }))) === "forbidden");
  const made = await create.createStore(root, { name: "Internal Lab", handle: "internal-lab", mode: "both" });
  const [madeRow] = await rows<{ status: string; plan_id: string; approved_by: string }>(fx.conn, "SELECT status, plan_id, approved_by FROM stores WHERE id = ?", [made.storeId]);
  ok("createStore: active, internal plan, approved by the staff member, owner membership and the approved review row, audited via console", madeRow?.status === "active" && madeRow.plan_id === "internal" && madeRow.approved_by === fx.staff.super_admin && (await count(fx.conn, "SELECT COUNT(*) AS n FROM store_members WHERE store_id = ? AND role = 'owner'", [made.storeId])) === 1 && (await count(fx.conn, "SELECT COUNT(*) AS n FROM signup_reviews WHERE store_id = ? AND status = 'approved' AND reason_code = 'console_created'", [made.storeId])) === 1 && (await count(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'store.created' AND store_id = ? AND meta LIKE '%console%'", [made.storeId])) === 1, madeRow);
  ok("createStore: a taken handle is refused on the field", (await codeOf(create.createStore(root, { name: "Again", handle: "internal-lab" }))) === "fields:handle");
  const sent = await messages.messageStores(await staffCtx(fx, "admin"), { storeIds: [A.id, fx.stores.D.id], text: "Maintenance tonight at 23:00.", severity: "warn" });
  ok("messageStores: the live store gets staff.message, the purged one is skipped, one audit row per store", sent.sent.length === 1 && sent.skipped.includes(fx.stores.D.id) && (await count(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'platform.store.messaged' AND store_id = ?", [A.id])) === 1, sent);
  ok("messageStores: support may message one store at a time", (await codeOf(messages.messageStores(support, { storeIds: [A.id, fx.stores.C.id], text: "Hi" }))) === "forbidden");
  const bv = await backups.backupsView(root);
  ok("backups: P8's runs unavailable here, the retention and the reminder read", bv.runs.state === "unavailable" && bv.retention.daily >= 3 && bv.remind === false, bv);
  const sh = await system.systemHealthView(root);
  ok("system health glue: the machine unavailable, the engine and the ceilings answer", sh.machine.state === "unavailable" && sh.engine.state === "ok" && sh.sandboxes.state === "ok" && sh.pendingMedia.state === "ok", { m: sh.machine.state, e: sh.engine.state });
}

/* ------------------------------------------------------------------ */
/* case 16, the staff half: account deletion (PD81; PLA-§11.2)         */
/* ------------------------------------------------------------------ */

async function case16(fx: Fixtures): Promise<void> {
  const people = await import("@/lib/platform/people");
  const root = await staffCtx(fx, "super_admin", { stepUp: true });
  const owner = await extraStore(fx, "case16-owned", "active");
  const before = await count(fx.conn, "SELECT COUNT(*) AS n FROM users WHERE id = ? AND disabled = 0", [owner.owner]);
  const owns = await people.deletePerson(root, { userId: owner.owner, reason: "owner asked by e-mail" });
  ok("deleteUser on the owner of an active store → owns_store with the store listed, nothing changed", !owns.deleted && owns.refusal === "owns_store" && owns.stores.some((s) => s.id === owner.id) && before === 1 && (await count(fx.conn, "SELECT COUNT(*) AS n FROM users WHERE id = ? AND disabled = 0", [owner.owner])) === 1, owns);
  const staff = await people.deletePerson(root, { userId: fx.staff.analyst, reason: "left the team" });
  ok("deleteUser on a staff member → is_staff", !staff.deleted && staff.refusal === "is_staff", staff);
  ok("deleteUser without a fresh step-up → step_up", (await codeOf(people.deletePerson(await staffCtx(fx, "super_admin"), { userId: fx.a.viewer, reason: "test" }))) === "step_up");
  ok("deleteUser on oneself → forbidden", (await codeOf(people.deletePerson(root, { userId: fx.staff.super_admin, reason: "test" }))) === "forbidden");

  // a plain member (a viewer of store A): anonymised, links and sessions gone, the audit kept
  const target = fx.a.viewer;
  await fx.conn.query("INSERT INTO identity_links (user_id, kind, value_hash) VALUES (?, 'email_norm', ?)", [target, "c".repeat(64)]);
  await fx.conn.query("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, NOW(3) + INTERVAL 1 DAY)", ["d".repeat(64), target]);
  const done = await people.deletePerson(root, { userId: target, reason: "asked to be forgotten" });
  const [u] = await rows<{ email: string; phone: string | null; locale: string | null; disabled: number }>(fx.conn, "SELECT email, phone, locale, disabled FROM users WHERE id = ?", [target]);
  ok("a plain member is deleted: deleted+<ulid>@invalid, phone and locale null, disabled", done.deleted && /^deleted\+[0-9a-z]{26}@invalid$/.test(u?.email ?? "") && u?.phone === null && u?.locale === null && u?.disabled === 1, u);
  ok("no identity link or session of the user is left", (await count(fx.conn, "SELECT COUNT(*) AS n FROM identity_links WHERE user_id = ?", [target])) === 0 && (await count(fx.conn, "SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?", [target])) === 0);
  const audits = await rows<{ meta: string | null }>(fx.conn, "SELECT meta FROM audit_log WHERE action = 'platform.user.deleted' AND target = ?", [target]);
  ok("one platform.user.deleted row, without the e-mail", audits.length === 1 && !(audits[0]?.meta ?? "").includes("@"), audits);
  const profile = await people.getUserProfile(root, target);
  ok("the profile reads the account as deleted, and no action is offered", profile?.deleted === true && profile.canManage === false && profile.banned === null, profile);
}

/* ------------------------------------------------------------------ */
/* case 20, the staff half: invite consumption (core §B.5 rev 3)       */
/* ------------------------------------------------------------------ */

async function case20(fx: Fixtures): Promise<void> {
  const staff = await import("@/lib/platform/staff");
  const rootUp = await staffCtx(fx, "super_admin", { stepUp: true });
  const meta = { ipHash: null, uaLabel: "Edge on Windows" };
  const tokenOf = (url: string) => url.split("/invite/staff/")[1] ?? "";

  // 5 parallel accepts of one staff invite by the bound account → one platform_role set
  const person = await account(fx, "five.tabs@gmail.com", { locale: "fr" });
  const inv = await staff.inviteStaff(rootUp, { email: "five.tabs@gmail.com", role: "analyst" });
  const view = await staff.getStaffInviteState(tokenOf(inv.url), { id: person, email: "five.tabs@gmail.com" });
  ok("the page: the bound account accepts; another account reads wrong_account", "way" in view && view.way === "accept" && (await staff.getStaffInviteState(tokenOf(inv.url), { id: fx.outsider, email: "visitor@example.test" }).then((v) => "way" in v && v.way === "wrong_account")));
  ok("acceptStaffInvite as another account: refused", (await refusalOf(staff.acceptStaffInvite(tokenOf(inv.url), { userId: fx.outsider }, meta))) === "forbidden:console.staff.invite_wrong_account");
  const five = await Promise.allSettled(Array.from({ length: 5 }, () => staff.acceptStaffInvite(tokenOf(inv.url), { userId: person }, meta)));
  const [row] = await rows<{ accepted_by: string | null; accepted_at: Date | null }>(fx.conn, "SELECT accepted_by, accepted_at FROM staff_invites WHERE id = ?", [inv.inviteId]);
  ok("5 parallel accepts: one succeeds, four are refused", five.filter((r) => r.status === "fulfilled").length === 1 && five.filter((r) => r.status === "rejected").length === 4, five.map((r) => (r.status === "rejected" ? (r.reason as { messageKey?: string }).messageKey : "ok")));
  ok("…one platform_role set, the invite consumed once", (await rows<{ platform_role: string }>(fx.conn, "SELECT platform_role FROM users WHERE id = ?", [person]))[0]?.platform_role === "analyst" && row?.accepted_by === person && (await count(fx.conn, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'platform.staff.changed' AND target = ? AND JSON_VALUE(meta, '$.via') = 'invite'", [person])) === 1);
  const published = await count(fx.conn, "SELECT COUNT(DISTINCT kind) AS n FROM legal_documents WHERE status = 'published' AND kind IN ('tos', 'privacy', 'aup')");
  ok("…the published platform documents accepted once, context staff", (await count(fx.conn, "SELECT COUNT(*) AS n FROM legal_acceptances WHERE user_id = ? AND context = 'staff' AND store_id IS NULL", [person])) === published);

  // 5 parallel accepts with a new account: one account, one role
  const inv2 = await staff.inviteStaff(rootUp, { email: "new.five@gmail.com", role: "support" });
  const fresh = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => staff.acceptStaffInvite(tokenOf(inv2.url), { name: `Racer ${i}`, password: `Platform-Check-Racer-${i}-9q!`, locale: "en" }, meta)));
  ok("5 parallel sign-ups on one invite: one account with the role", fresh.filter((r) => r.status === "fulfilled").length === 1 && (await count(fx.conn, "SELECT COUNT(*) AS n FROM users WHERE email = 'new.five@gmail.com' AND platform_role = 'support'")) === 1 && (await count(fx.conn, "SELECT COUNT(*) AS n FROM users WHERE email = 'new.five@gmail.com'")) === 1, fresh.map((r) => r.status));

  // a revocation and an accept in the same instant: never both
  let both = 0;
  let neither = 0;
  for (let i = 0; i < 5; i++) {
    const email = `same.instant.${i}@gmail.com`;
    const who = await account(fx, email);
    const x = await staff.inviteStaff(rootUp, { email, role: "analyst" });
    const now = new Date();
    const [rev, acc] = await Promise.allSettled([staff.revokeStaffInvite(rootUp, { inviteId: x.inviteId }, now), staff.acceptStaffInvite(tokenOf(x.url), { userId: who }, meta, now)]);
    const revoked = rev.status === "fulfilled" && rev.value.revoked;
    const joined = acc.status === "fulfilled";
    const role = (await rows<{ platform_role: string }>(fx.conn, "SELECT platform_role FROM users WHERE id = ?", [who]))[0]?.platform_role;
    if (revoked && joined) both++;
    if (!revoked && !joined) neither++;
    if (revoked && role !== "none") both++;
  }
  ok("revoke and accept at the same instant (5 runs): exactly one wins each time, a revoked invite sets no role", both === 0 && neither === 0, { both, neither });

  // expired at the instant of the accept
  const late = await account(fx, "too.late@gmail.com");
  const y = await staff.inviteStaff(rootUp, { email: "too.late@gmail.com", role: "analyst" });
  const expiresAt = new Date((await rows<{ expires_at: Date }>(fx.conn, "SELECT expires_at FROM staff_invites WHERE id = ?", [y.inviteId]))[0]!.expires_at);
  ok("an invite accepted at its expiry instant is refused, nothing written", (await refusalOf(staff.acceptStaffInvite(tokenOf(y.url), { userId: late }, meta, expiresAt))) === "invalid:console.staff.invite_invalid" && (await rows<{ platform_role: string }>(fx.conn, "SELECT platform_role FROM users WHERE id = ?", [late]))[0]?.platform_role === "none");
  ok("…and reads expired on the page", (await staff.getStaffInviteState(tokenOf(y.url), null, expiresAt)).state === "expired");
  await staff.revokeStaffInvite(rootUp, { inviteId: y.inviteId });
  ok("a revoked invite reads revoked and refuses", (await staff.getStaffInviteState(tokenOf(y.url))).state === "revoked" && (await refusalOf(staff.acceptStaffInvite(tokenOf(y.url), { userId: late }, meta))) === "invalid:console.staff.invite_invalid");
}

/* ------------------------------------------------------------------ */
/* the registry (PLA-§O.2)                                             */
/* ------------------------------------------------------------------ */

type CaseFn = (fx: Fixtures) => Promise<void>;
const CASES: Record<number, { run?: CaseFn; pending?: string }> = {
  1: { run: case1 },
  2: { run: case2 },
  3: { run: case3 },
  4: { run: case4 },
  5: { run: case5 },
  6: { run: case6 },
  7: { run: case7 },
  8: { run: case8 },
  9: { run: case9 },
  10: { run: case10, pending: "the EXPLAIN plans on tables over 10,000 rows and the --perf timings need the 2,000-store fixture (qa:platform-perf, manual; not built in speed mode)" },
  11: { run: case11 },
  12: { run: case12, pending: "the addImpersonationNoteAction half (a tenant session → forbidden, row counts) runs with the attack cases of step 7" },
  13: { run: case13, pending: "the signup half (the cap → waitlist, the two-tier upload cap, the Turnstile gate) is T2 / P8 code, run at the R1 integration" },
  14: { pending: "step 7 (masking at the repository)" },
  15: { run: case15 },
  16: { run: case16, pending: "the tenant half (deleteMyAccountAction and its step-up) is T2 / P2 code, run at the R1 integration" },
  17: { pending: "step 7 (tenant step-up ladder)" },
  18: { pending: "the R1 integration (T2 signup refund paths, P7 pending AI slice)" },
  19: { run: case19, pending: "the machinery half (the Cron panel and its alarm, render_stuck, data_dir_85, the backup download, the break-glass links) is step 12" },
  20: { run: case20, pending: "the store-invite half (10 parallel accepts, SEC-24) is T2's: test:tenancy and test:migrate (f)" },
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
  // the step-4 cases add stores and move store states, so they run after the cases that count stores (5's dirty-first
  // order) or read the seeded states (B pending, C suspended); the step-5 cases (plans, staff, legal, domains, staff
  // invites) add stores, signups, super_admins and published documents, so they run after those
  const RUNS_LATER = new Set([1, 2, 3, 11, 13]);
  const RUNS_LAST = new Set([4, 7, 8, 9, 10, 12, 16, 19, 20]);
  const rank = (n: number) => (RUNS_LAST.has(n) ? 2 : RUNS_LATER.has(n) ? 1 : 0);
  const wanted = (picked?.length ? picked : Object.keys(CASES).map(Number)).sort((x, y) => rank(x) - rank(y) || x - y);
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

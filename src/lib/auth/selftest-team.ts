/**
 * Team selftest (docs/STORE-SAAS.md §B.5, §B.8, §I.4; T2 step "invites-team-pages") against a throwaway MariaDB
 * database: store invites with their compare-and-set consumption (SEC-24), the role rules of the team page, "view as
 * store" with the PLA Q.31 rules and the read-only seam, and the minimal `notify()` insert. It creates the database,
 * migrates it, runs every case and drops it again, whatever happens.
 *
 *   SG_TEST_CONTEXT=1 SG_TEST_DB=cod_test_t2_team npx tsx src/lib/auth/selftest-team.ts
 *
 * Needs a local MariaDB / MySQL as root without a password on 127.0.0.1:3306 (XAMPP), or SG_TEST_SERVER. No network.
 */
import { createHash } from "node:crypto";
import Module from "node:module";
import mysql from "mysql2/promise";

// the modules under test are marked `import "server-only"`; outside Next that import throws (as in pixels-publish-check)
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = require.resolve("drizzle-orm");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    return req === "server-only" ? stub : orig.call(this, req, ...rest);
  };
}

const DB = process.env.SG_TEST_DB ?? "cod_test_t2_team";
const SERVER = process.env.SG_TEST_SERVER ?? "mysql://root@127.0.0.1:3306/";
if (!/^cod_test_[a-z0-9_]{1,40}$/.test(DB)) throw new Error(`SG_TEST_DB must be a cod_test_* name, got "${DB}"`);

const env = process.env as Record<string, string | undefined>;
env.DATABASE_URL = SERVER + DB;
env.APP_SECRET = "team-selftest-secret-8b1f4c2a9e7d3065a1c4";
env.SG_TEST_CONTEXT = "1";
env.PLATFORM_URL = "http://localhost:3451";
env.SETUP_TOKEN = "setup-token-for-team-selftest-41aa";
for (const k of ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "SMTP_URL", "MAIL_FROM", "STORE_ROOT_DOMAIN", "EDGE_KEY", "ADMIN_IP_ALLOWLIST", "ADMIN_HOST", "PUBLIC_URL"]) delete env[k];
if (env.NODE_ENV === "production") throw new Error("the team selftest never runs with NODE_ENV=production");

let pass = 0;
const failures: string[] = [];
function ok(label: string, cond: unknown, info?: unknown): void {
  if (cond) pass++;
  else failures.push(info === undefined ? label : `${label}\n      ${JSON.stringify(info)}`);
}

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

async function main(): Promise<void> {
  const root = await mysql.createConnection({ uri: SERVER });
  await root.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await root.query(`CREATE DATABASE \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.end();
  let c: mysql.Connection | null = null;
  try {
    const { runMigrations } = await import("@/lib/db/migrate");
    const migrated = await runMigrations();
    ok("migrations applied", migrated.status === "applied", migrated);
    c = await mysql.createConnection({ uri: SERVER + DB, timezone: "Z" });
    await cases(c);
  } finally {
    await c?.end();
    const { pool } = await import("@/lib/db/client");
    await pool()
      .end()
      .catch(() => undefined);
    await globalThis.__sgLockPool?.pool.end().catch(() => undefined);
    const r = await mysql.createConnection({ uri: SERVER });
    await r.query(`DROP DATABASE IF EXISTS \`${DB}\``);
    await r.end();
  }
}

async function cases(c: mysql.Connection): Promise<void> {
  const q = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => ((await c.query(sql, args)) as unknown as [T[]])[0];
  const one = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await q<T>(sql, args))[0];

  const errors = await import("@/lib/auth/errors");
  const seam = await import("@/lib/tenancy/seam");
  const { runAsIdentity } = await import("@/lib/tenancy/context");
  const invites = await import("@/lib/tenancy/invites");
  const users = await import("@/lib/auth/users");
  const { signupAccount } = await import("@/lib/auth/signup");
  const { createSession } = await import("@/lib/auth/session");
  const { bootstrapSuperAdmin, createSetupStore } = await import("@/lib/auth/bootstrap");
  const { canPlatform } = await import("@/lib/auth/permissions");
  const { PlatformSettingSchema } = await import("@/lib/settings/keys/platform");
  const imp = await import("@/lib/platform/impersonation");
  const { notify, cleanNotifyVars } = await import("@/lib/platform/notify");
  const { safeAppPath, signInUrl } = await import("@/lib/auth/paths");
  const { authT, refusalText } = await import("@/lib/auth/i18n");
  const { localeFromAcceptLanguage } = await import("@/lib/auth/locale");
  const { inputErrorKey } = await import("@/lib/auth/i18n/input-errors");
  const teamActions = await import("@/app/app/[store]/team/actions");
  type PlatformRole = import("@/lib/auth/permissions").PlatformRole;
  type PlatformCtx = import("@/lib/tenancy/types").PlatformCtx;
  type WriteCtx = import("@/lib/tenancy/types").WriteCtx;
  type SessionUser = import("@/lib/auth").SessionUser;
  type PublicActionCtx = import("@/lib/auth/public-action").PublicActionCtx;
  type HumanCheck = import("@/lib/auth/turnstile").HumanCheck;

  const caught = async (p: Promise<unknown>): Promise<string> => {
    try {
      await p;
      return "ok";
    } catch (e) {
      if (e instanceof errors.FieldsError) return `fields:${Object.keys(e.fields).sort().join(",")}`;
      if (e instanceof errors.AuthRefusal) return e.messageKey ? `${e.code}:${e.messageKey}` : e.code;
      if (e instanceof seam.SeamError) return `seam:${e.code}`;
      if (e instanceof Error && e.name === "QuotaError") return "quota";
      return `other:${(e as Error).message}`;
    }
  };

  const PASSWORD = "Argan-Coop-Essaouira-2026";
  const UA = "Mozilla/5.0 (team selftest)";
  const setting = PlatformSettingSchema.parse({});
  let ipN = 1;
  const pub = (): PublicActionCtx => ({ ip: `198.51.100.${ipN++}`, ua: UA, deviceId: null, turnstile: async () => "ok" as HumanCheck });
  const env = { killed: false, mode: { mode: "approval" as const, stored: "approval" as const, unguarded: false, turnstile: null }, setting, chargeSlot: async () => false, refundSlot: async () => undefined };
  const newStore = async (n: string) => {
    const r = await signupAccount({ name: `Owner ${n}`, email: `owner.${n}@example.ma`, password: PASSWORD, storeName: `Atlas ${n}`, handle: `atlas-${n}`, market: "MA", acceptLegal: true, locale: "fr" }, pub(), env);
    if (r.kind !== "created") throw new Error(`signup ${n}: ${r.kind}`);
    return { userId: r.userId, storeId: r.storeId, handle: r.handle };
  };
  const ctxOf = async (userId: string, handle: string, extra: { stepUpAt?: Date } = {}) =>
    (await runAsIdentity({ userId, path: null, ...extra }, () => seam.requireStoreMember({ handle, throwOnFail: true }))) as WriteCtx;
  const addMember = async (storeId: string, role: string, email: string) => {
    const acc = await users.createAccount({ email, name: `${role} ${email.split("@")[0]}`, password: PASSWORD, locale: "en" });
    await c.query("INSERT INTO store_members (store_id, user_id, role, status) VALUES (?, ?, ?, 'active')", [storeId, acc.userId, role]);
    return acc.userId;
  };
  const tokenOf = (url: string) => url.slice(url.lastIndexOf("/") + 1);

  /* ---------------------------------------------------------------- */
  /* pure parts                                                        */
  /* ---------------------------------------------------------------- */
  ok("notify vars: customer-data keys dropped, booleans as 1/0", JSON.stringify(cleanNotifyVars({ name: "Salma", phone: "+212", role: "agent", n: 3, on: true, gone: null })) === JSON.stringify({ role: "agent", n: 3, on: 1 }));
  ok("safeAppPath: an invite return path", safeAppPath(`/invite/${"a".repeat(43)}`) === `/invite/${"a".repeat(43)}` && safeAppPath("/invite/short") === null && safeAppPath("/invite/x/../y") === null);
  ok("signInUrl keeps the invite", signInUrl(`/invite/${"b".repeat(43)}`) === `/login?next=${encodeURIComponent(`/invite/${"b".repeat(43)}`)}`);
  ok("catalog: ar / fr / en with an English fallback", authT("auth.login.title", undefined, "fr") === "Bon retour" && authT("auth.login.title", undefined, "ar") === "مرحبًا بعودتك" && authT("console.badge", undefined, "ar") === "Platform");
  ok("catalog: base keys win, plurals format", authT("error.forbidden", undefined, "en") === "Your role doesn't allow this action." && authT("account.security.codes_left", { count: 1 }, "en") === "1 recovery code left");
  ok("catalog: Arabic dual", authT("account.stores.section", { count: 2 }, "ar") === "متجران");
  ok("refusal text: message key, else the code's, else generic", refusalText({ error: "x", message: "team.invite.invalid" }, "en").startsWith("It may have") && refusalText({ error: "last_owner" }, "fr").startsWith("Une boutique") && refusalText({ error: "weird" }, "en") === authT("error.server"));
  ok("Accept-Language: q-values and fallbacks", localeFromAcceptLanguage("de-DE,fr;q=0.8,ar;q=0.9") === "ar" && localeFromAcceptLanguage("en-GB") === "en" && localeFromAcceptLanguage("de") === null);
  ok("input errors mapped", inputErrorKey("Your password is incorrect.") === "auth.step_up.password_wrong" && inputErrorKey("Use at least 10 characters.") === "auth.password.too_short" && inputErrorKey("?") === "error.invalid");
  const catalogs = await Promise.all([import("@/lib/auth/i18n/en"), import("@/lib/auth/i18n/fr"), import("@/lib/auth/i18n/ar")]);
  const values = catalogs.flatMap((m) => Object.values(m.messages as Record<string, string>));
  ok("catalog: no em-dash, no step label", !values.some((v) => v.includes("—") || /\b(step|étape) \d/i.test(v)));
  const enKeys = Object.keys(catalogs[0].messages);
  ok("catalog: fr and ar cover every tenant key", ["fr", "ar"].every((_, i) => enKeys.filter((k) => !k.startsWith("console.") && !k.startsWith("auth.staff.")).every((k) => k in catalogs[i + 1].messages)));

  /* ---------------------------------------------------------------- */
  /* stores, members                                                   */
  /* ---------------------------------------------------------------- */
  const A = await newStore("aa");
  const B = await newStore("bb");
  // A is approved (the team cases need more than the pending cap of 2 seats, §A.5.2); B stays pending
  await c.query("UPDATE stores SET status = 'active' WHERE id = ?", [A.storeId]);
  {
    // the seat limits read the live, locked membership rows (CCR r1.0-t2-9 item 7): a pending store holds 2 seats
    const P = await newStore("seats");
    const ownerP = await ctxOf(P.userId, P.handle);
    await addMember(P.storeId, "editor", "seat.two@example.ma");
    ok("seats: a pending store's third member → quota (members_max 2 while pending)", (await caught(invites.createInvite(ownerP, { email: "seat.three@example.ma", role: "agent" }))) === "quota");
    ok("seats: nothing written for the refused invite", !(await one("SELECT id FROM store_invites WHERE store_id = ? AND email_norm = 'seat.three@example.ma'", [P.storeId])));
  }
  const ownerA = await ctxOf(A.userId, A.handle);
  const managerId = await addMember(A.storeId, "manager", "manager.a@example.ma");
  const agentId = await addMember(A.storeId, "agent", "agent.a@example.ma");
  const manager = await ctxOf(managerId, A.handle);
  const agent = await ctxOf(agentId, A.handle);

  /* ---------------------------------------------------------------- */
  /* createInvite                                                      */
  /* ---------------------------------------------------------------- */
  const i1 = await invites.createInvite(ownerA, { email: "Salma.B@Gmail.com ", role: "agent", note: "  call center\nmorning " });
  const token1 = tokenOf(i1.url);
  ok("invite: the URL carries a 43-char token on the platform origin", i1.url.startsWith("http://localhost:3451/invite/") && /^[A-Za-z0-9_-]{43}$/.test(token1), i1.url);
  const row1 = await one<{ token_hash: string; email_norm: string; note: string; invited_by: string; expires_at: Date; store_id: string }>("SELECT * FROM store_invites WHERE id = ?", [i1.inviteId]);
  ok("invite: only the hash is stored", row1?.token_hash === sha(token1) && !JSON.stringify(row1).includes(token1), row1);
  ok("invite: e-mail normalised, note cleaned, inviter, store", row1?.email_norm === "salma.b@gmail.com" && row1.note === "call center morning" && row1.invited_by === A.userId && row1.store_id === A.storeId, row1);
  ok("invite: expires in 7 days", Math.abs((row1?.expires_at.getTime() ?? 0) - Date.now() - invites.INVITE_TTL_MS) < 60_000);
  ok("invite: audited with the masked e-mail", (await one<{ meta: string }>("SELECT meta FROM audit_log WHERE action = 'store.member.invited' AND target = ?", [i1.inviteId]))?.meta.includes("s•••@gmail.com"));
  ok("invite: a bad e-mail → fields:email", (await caught(invites.createInvite(ownerA, { email: "nope", role: "agent" }))) === "fields:email");
  ok("invite: a manager invites agents only", (await caught(invites.createInvite(manager, { email: "ed@x.ma", role: "editor" }))) === "fields:role");
  ok("invite: a manager may invite an agent", (await caught(invites.createInvite(manager, { email: "agent2@x.ma", role: "agent" }))) === "ok");
  ok("invite: an agent can't invite", (await caught(invites.createInvite(agent, { email: "x@y.ma", role: "agent" }))) === "seam:forbidden");
  ok("invite: logistics is not granted in R1", (await caught(invites.createInvite(ownerA, { email: "lg@x.ma", role: "logistics" }))) === "fields:role");
  ok("invite: an existing member's e-mail answers the same", (await caught(invites.createInvite(ownerA, { email: "agent.a@example.ma", role: "agent" }))) === "ok");

  const ownerB = await ctxOf(B.userId, B.handle);
  let lastB = "";
  for (let i = 0; i < invites.PENDING_INVITES_MAX; i++) lastB = (await invites.createInvite(ownerB, { email: `cap${i}@example.ma`, role: "viewer" })).url;
  ok("invite: at most 20 pending per store", (await caught(invites.createInvite(ownerB, { email: "cap.over@example.ma", role: "viewer" }))) === "quota:team.invite.pending_cap");
  ok("invite: the cap counts only pending ones (another store unaffected)", (await caught(invites.createInvite(ownerA, { email: "fine@example.ma", role: "viewer" }))) === "ok");

  /* ---------------------------------------------------------------- */
  /* preview, landing, accept                                          */
  /* ---------------------------------------------------------------- */
  const pv = await invites.previewInvite(token1);
  ok("preview: store, role, masked e-mail", pv?.storeName === "Atlas aa" && pv.role === "agent" && pv.emailMasked === "s•••@gmail.com", pv);
  ok("preview: unknown and malformed tokens → null", (await invites.previewInvite("x".repeat(43))) === null && (await invites.previewInvite("../../etc")) === null);
  ok("landing: no viewer, no account → sign_up", (await invites.inviteLanding(token1, null)).state === "sign_up");
  const someone = await users.createAccount({ email: "someone.else@example.ma", name: "Someone", password: PASSWORD, locale: "fr" });
  ok("landing: another signed-in e-mail → wrong_account", (await invites.inviteLanding(token1, { id: someone.userId, email: "someone.else@example.ma" })).state === "wrong_account");
  ok("accept: another account → forbidden (D10)", (await caught(invites.acceptInvite(token1, { userId: someone.userId }))) === "forbidden:team.invite.wrong_account");

  // a new account for the invited e-mail, the form's e-mail ignored
  const acc1 = await invites.acceptInvite(token1, { email: "attacker@evil.example", name: "Salma B", password: PASSWORD, phone: "0612345678", locale: "ar" });
  const salma = await one<{ id: string; email: string; locale: string; phone: string }>("SELECT * FROM users WHERE email = 'salma.b@gmail.com'");
  ok("accept (new account): created with the invited e-mail, not the form's", acc1.createdAccount && acc1.joined && salma?.id === acc1.userId && salma.locale === "ar" && salma.phone === "+212612345678" && !(await one("SELECT id FROM users WHERE email = 'attacker@evil.example'")), { acc1, salma });
  const m1 = await one<{ role: string; status: string; invited_by: string }>("SELECT * FROM store_members WHERE store_id = ? AND user_id = ?", [A.storeId, acc1.userId]);
  ok("accept: the membership with the invited role and inviter", m1?.role === "agent" && m1.status === "active" && m1.invited_by === A.userId && acc1.storeHandle === A.handle, m1);
  ok("accept: the invite consumed", !!(await one<{ accepted_at: Date }>("SELECT accepted_at FROM store_invites WHERE id = ? AND accepted_by = ?", [i1.inviteId, acc1.userId])));
  ok("accept: audited on the store, the inviter notified", !!(await one("SELECT id FROM audit_log WHERE action = 'store.member.accepted' AND store_id = ?", [A.storeId])) && !!(await one("SELECT id FROM notifications WHERE kind = 'invite.accepted' AND user_id = ? AND store_id = ? AND link = ?", [A.userId, A.storeId, `/app/${A.handle}/team`])));
  ok("accept: a used link → invalid (one answer)", (await caught(invites.acceptInvite(token1, { userId: acc1.userId }))) === "invalid:team.invite.invalid" && (await invites.previewInvite(token1)) === null);

  // an e-mail that already has an account must sign in
  const i2 = await invites.createInvite(ownerA, { email: "someone.else@example.ma", role: "editor" });
  ok("landing: an existing account → sign_in", (await invites.inviteLanding(tokenOf(i2.url), null)).state === "sign_in");
  ok("accept (new account) over an existing e-mail → sign_in_first", (await caught(invites.acceptInvite(tokenOf(i2.url), { email: "", name: "X", password: PASSWORD, locale: "en" }))) === "invalid:team.invite.sign_in_first");
  ok("accept: the refused attempt left the invite usable", (await invites.previewInvite(tokenOf(i2.url))) !== null);
  ok("landing: the invited account → accept", (await invites.inviteLanding(tokenOf(i2.url), { id: someone.userId, email: "SOMEONE.ELSE@example.ma" })).state === "accept");
  const acc2 = await invites.acceptInvite(tokenOf(i2.url), { userId: someone.userId });
  ok("accept (signed in): joined as editor", acc2.joined && acc2.role === "editor" && !acc2.createdAccount);

  // idempotent for an existing member
  const i3 = await invites.createInvite(ownerA, { email: "agent.a@example.ma", role: "viewer" });
  ok("landing: already a member", (await invites.inviteLanding(tokenOf(i3.url), { id: agentId, email: "agent.a@example.ma" })).state === "already_member");
  const acc3 = await invites.acceptInvite(tokenOf(i3.url), { userId: agentId });
  const still = await one<{ role: string }>("SELECT role FROM store_members WHERE store_id = ? AND user_id = ?", [A.storeId, agentId]);
  ok("accept: idempotent for a member (no second row, role unchanged)", !acc3.joined && acc3.role === "agent" && still?.role === "agent" && Number((await one<{ n: number }>("SELECT COUNT(*) AS n FROM store_members WHERE store_id = ? AND user_id = ?", [A.storeId, agentId]))?.n) === 1);

  // SEC-24: concurrent accepts
  const i4 = await invites.createInvite(ownerA, { email: "race@example.ma", role: "agent" });
  const raced = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => invites.acceptInvite(tokenOf(i4.url), { email: "", name: `Racer ${i}`, password: PASSWORD, locale: "fr" })));
  const won = raced.filter((r) => r.status === "fulfilled");
  ok("SEC-24: 10 parallel accepts → one account, one membership", won.length === 1 && Number((await one<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE email = 'race@example.ma'"))?.n) === 1 && Number((await one<{ n: number }>("SELECT COUNT(*) AS n FROM store_members m JOIN users u ON u.id = m.user_id WHERE u.email = 'race@example.ma'"))?.n) === 1, raced.map((r) => (r.status === "fulfilled" ? "ok" : String((r.reason as Error).message))));
  const i5 = await invites.createInvite(ownerA, { email: "agent.a@example.ma", role: "agent" });
  const raced2 = await Promise.allSettled(Array.from({ length: 10 }, () => invites.acceptInvite(tokenOf(i5.url), { userId: agentId })));
  ok("SEC-24: 10 parallel accepts by one account → one consumption", raced2.filter((r) => r.status === "fulfilled").length === 1);

  // revoke, expiry, store state
  const i6 = await invites.createInvite(ownerA, { email: "revoke.me@example.ma", role: "editor" });
  ok("revoke: a manager can't revoke an editor invite", (await caught(invites.revokeInvite(manager, i6.inviteId))) === "seam:forbidden");
  ok("revoke: another store's invite → not_found", (await caught(invites.revokeInvite(ownerB, i6.inviteId))) === "seam:not_found");
  await invites.revokeInvite(ownerA, i6.inviteId);
  ok("revoke: the link stops working", (await invites.previewInvite(tokenOf(i6.url))) === null && (await caught(invites.acceptInvite(tokenOf(i6.url), { email: "", name: "R", password: PASSWORD, locale: "en" }))) === "invalid:team.invite.invalid");
  ok("revoke: twice → conflict", (await caught(invites.revokeInvite(ownerA, i6.inviteId))) === "conflict:team.invite.not_pending");
  const i7 = await invites.createInvite(ownerA, { email: "late@example.ma", role: "viewer" });
  await c.query("UPDATE store_invites SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND WHERE id = ?", [i7.inviteId]);
  ok("expiry: an expired link → invalid", (await invites.previewInvite(tokenOf(i7.url))) === null && (await caught(invites.acceptInvite(tokenOf(i7.url), { email: "", name: "L", password: PASSWORD, locale: "en" }))) === "invalid:team.invite.invalid");
  const states = Object.fromEntries((await invites.listInvites(ownerA)).map((i) => [i.id, i.state]));
  ok("list: the states", states[i1.inviteId] === "accepted" && states[i6.inviteId] === "revoked" && states[i7.inviteId] === "expired" && states[i2.inviteId] === "accepted", states);
  ok("a pending store takes members", (await invites.previewInvite(tokenOf(lastB))) !== null);
  await c.query("UPDATE stores SET status = 'closed' WHERE id = ?", [B.storeId]);
  ok("a closed store takes no one", (await invites.previewInvite(tokenOf(lastB))) === null && (await caught(invites.acceptInvite(tokenOf(lastB), { email: "", name: "C", password: PASSWORD, locale: "en" }))) === "invalid:team.invite.invalid");
  await c.query("UPDATE stores SET status = 'pending' WHERE id = ?", [B.storeId]);

  /* §H.8 kill switches over the real flags rows (T1 merged; the integration check of the T2 report) */
  const { invalidateFlags } = await import("@/lib/tenancy/entitlements");
  const setKill = async (key: string, value: boolean) => {
    await c.query("INSERT INTO flags (`key`, kind, default_value) VALUES (?, 'kill', ?) ON DUPLICATE KEY UPDATE default_value = VALUES(default_value)", [key, JSON.stringify(value)]);
    invalidateFlags();
  };
  const paused = await invites.createInvite(ownerA, { email: "paused@example.ma", role: "agent" });
  await setKill("signups_enabled", false);
  ok(
    "kill: signups_enabled off → the accept answers closed and writes nothing",
    (await caught(invites.acceptInvite(tokenOf(paused.url), { email: "", name: "Paused", password: PASSWORD, locale: "fr" }))) === "closed:team.invite.closed" &&
      !(await one("SELECT id FROM users WHERE email = 'paused@example.ma'")) &&
      (await one<{ accepted_at: Date | null }>("SELECT accepted_at FROM store_invites WHERE id = ?", [paused.inviteId]))?.accepted_at === null,
  );
  ok("kill: the paused link still previews (the page shows the paused notice)", (await invites.previewInvite(tokenOf(paused.url))) !== null);
  await setKill("signups_enabled", true);
  ok("kill: switched back on, the same link works", (await invites.acceptInvite(tokenOf(paused.url), { email: "", name: "Paused", password: PASSWORD, locale: "fr" })).joined);
  await setKill("platform_read_only", true);
  const readOnly = await runAsIdentity({ userId: A.userId, path: `/app/${A.handle}/team` }, () => teamActions.createInviteAction({ email: "ro@example.ma", role: "agent" }));
  ok("kill: platform_read_only → a store write answers read_only, nothing written", !readOnly.ok && readOnly.error === "read_only" && !(await one("SELECT id FROM store_invites WHERE email_norm = 'ro@example.ma'")), readOnly);
  await setKill("platform_read_only", false);

  /* the actions through the store seam (the store from the signed path, D2) */
  const viaAction = await runAsIdentity({ userId: A.userId, path: `/app/${A.handle}/team` }, () => teamActions.createInviteAction({ email: "action@example.ma", role: "agent" }));
  ok("createInviteAction: the store from the signed path", viaAction.ok && viaAction.data.url.includes("/invite/"), viaAction);
  const unsigned = await runAsIdentity({ userId: A.userId, path: null }, () => teamActions.createInviteAction({ email: "action2@example.ma", role: "agent" }));
  ok("createInviteAction: an unsigned path → not_found", !unsigned.ok && unsigned.error === "not_found");
  const crossStore = await runAsIdentity({ userId: A.userId, path: `/app/${B.handle}/team` }, () => teamActions.createInviteAction({ email: "x3@example.ma", role: "agent" }));
  ok("createInviteAction: another store's path → not_found", !crossStore.ok && crossStore.error === "not_found");
  const badInput = await runAsIdentity({ userId: A.userId, path: `/app/${A.handle}/team` }, () => teamActions.createInviteAction({ email: "x4@example.ma", role: "sultan" }));
  ok("createInviteAction: bad input → invalid", !badInput.ok && badInput.error === "invalid");

  /* ---------------------------------------------------------------- */
  /* roles, suspension, removal (PLA-§22.4)                            */
  /* ---------------------------------------------------------------- */
  const editorId = someone.userId;
  ok("role: an agent can't manage", (await caught(invites.changeMemberRole(agent, { userId: editorId, role: "viewer" }))) === "seam:forbidden");
  ok("role: a manager has no members.manage", (await caught(invites.changeMemberRole(manager, { userId: agentId, role: "viewer" }))) === "seam:forbidden");
  ok("role: not one's own", (await caught(invites.changeMemberRole(ownerA, { userId: A.userId, role: "admin" }))) === "forbidden:team.member.self");
  ok("role: an unknown member → not_found", (await caught(invites.changeMemberRole(ownerA, { userId: "01J0000000000000000000ZZZZ", role: "viewer" }))) === "seam:not_found");
  ok("role: another store's member → not_found", (await caught(invites.changeMemberRole(ownerB, { userId: agentId, role: "viewer" }))) === "seam:not_found");
  ok("role: an R2 role → invalid", (await caught(invites.changeMemberRole(ownerA, { userId: agentId, role: "accountant" }))) === "fields:role");
  await invites.changeMemberRole(ownerA, { userId: agentId, role: "viewer" });
  ok("role: changed, audited, the member notified", (await one<{ role: string }>("SELECT role FROM store_members WHERE store_id = ? AND user_id = ?", [A.storeId, agentId]))?.role === "viewer" && !!(await one("SELECT id FROM audit_log WHERE action = 'store.member.role_changed' AND target = ?", [agentId])) && !!(await one("SELECT id FROM notifications WHERE kind = 'member.role_changed' AND user_id = ?", [agentId])));
  ok("role: to admin needs a fresh step-up", (await caught(invites.changeMemberRole(ownerA, { userId: editorId, role: "admin" }))) === "seam:step_up");
  const ownerStepped = await ctxOf(A.userId, A.handle, { stepUpAt: new Date() });
  await invites.changeMemberRole(ownerStepped, { userId: editorId, role: "admin" });
  const roleAudit = await one<{ meta: string }>("SELECT meta FROM audit_log WHERE action = 'store.member.role_changed' AND target = ? ORDER BY id DESC LIMIT 1", [editorId]);
  ok("role: the step-up method audited", roleAudit?.meta.includes('"stepUp":"password"') && roleAudit.meta.includes('"to":"admin"'), roleAudit);
  const admin = await ctxOf(editorId, A.handle, { stepUpAt: new Date() });
  ok("role: an admin can't grant admin", (await caught(invites.changeMemberRole(admin, { userId: managerId, role: "admin" }))) === "seam:forbidden");
  ok("role: an admin can't touch an owner", (await caught(invites.changeMemberRole(admin, { userId: A.userId, role: "viewer" }))) === "seam:forbidden");
  ok("role: an admin manages below admin", (await caught(invites.changeMemberRole(admin, { userId: managerId, role: "editor" }))) === "ok");
  ok("role: an admin can't invite an admin", (await caught(invites.createInvite(admin, { email: "adm@x.ma", role: "admin" }))) === "fields:role");
  /* review r1.0-t2 F1: an admin/owner invite asks the same step-up as the role change (a stolen cookie alone mints no owner) */
  ok("invite: admin without a fresh step-up → step_up", (await caught(invites.createInvite(ownerA, { email: "stolen.admin@example.ma", role: "admin" }))) === "seam:step_up");
  ok("invite: owner without a fresh step-up → step_up", (await caught(invites.createInvite(ownerA, { email: "stolen.owner@example.ma", role: "owner" }))) === "seam:step_up");
  ok("invite: the refused invites wrote nothing", !(await one("SELECT id FROM store_invites WHERE store_id = ? AND email_norm IN ('stolen.admin@example.ma', 'stolen.owner@example.ma')", [A.storeId])));
  ok("invite: roles below admin need no step-up", (await caught(invites.createInvite(ownerA, { email: "plain.editor@example.ma", role: "editor" }))) === "ok");
  const steppedInvite = await invites.createInvite(ownerStepped, { email: "real.admin@example.ma", role: "admin" });
  const inviteAudit = await one<{ meta: string }>("SELECT meta FROM audit_log WHERE action = 'store.member.invited' AND target = ?", [steppedInvite.inviteId]);
  ok("invite: admin after a step-up, the method audited", inviteAudit?.meta.includes('"stepUp":"password"') && inviteAudit.meta.includes('"role":"admin"'), inviteAudit);
  {
    const unstepped = await runAsIdentity({ userId: A.userId, path: `/app/${A.handle}/team` }, () => teamActions.createInviteAction({ email: "stolen.owner2@example.ma", role: "owner" }));
    ok("invite: createInviteAction answers step_up for an owner invite", !unstepped.ok && unstepped.error === "step_up", unstepped);
  }

  await invites.setMemberStatus(ownerA, { userId: managerId, status: "suspended" });
  ok("suspend: the next request is refused", (await caught(ctxOf(managerId, A.handle))) === "seam:not_found");
  ok("suspend: audited, notified", !!(await one("SELECT id FROM audit_log WHERE action = 'store.member.suspended' AND target = ?", [managerId])) && !!(await one("SELECT id FROM notifications WHERE kind = 'member.suspended' AND user_id = ?", [managerId])));
  await invites.setMemberStatus(ownerA, { userId: managerId, status: "active" });
  ok("reactivate: back in", (await caught(ctxOf(managerId, A.handle))) === "ok");
  await invites.removeMember(ownerA, { userId: managerId });
  ok("remove: the row gone, audited", !(await one("SELECT user_id FROM store_members WHERE store_id = ? AND user_id = ?", [A.storeId, managerId])) && !!(await one("SELECT id FROM audit_log WHERE action = 'store.member.removed' AND target = ? AND meta LIKE '%\"self\":false%'", [managerId])));
  const coOwner = await addMember(A.storeId, "owner", "co.owner.a@example.ma");
  await invites.setMemberStatus(ownerA, { userId: coOwner, status: "suspended" });
  ok("leave: a suspended co-owner doesn't count", (await caught(invites.leaveStore(ownerA))) === "last_owner:team.leave.last_owner");
  await invites.setMemberStatus(ownerA, { userId: coOwner, status: "active" });

  /* the inviter is re-checked at acceptance: no escalation through a stale link */
  const inviterId = await addMember(A.storeId, "admin", "inviter.a@example.ma");
  const inviterCtx = await ctxOf(inviterId, A.handle);
  const staleManager = await invites.createInvite(inviterCtx, { email: "stale.manager@example.ma", role: "manager" });
  const stillAgent = await invites.createInvite(inviterCtx, { email: "still.agent@example.ma", role: "agent" });
  const goneAgent = await invites.createInvite(inviterCtx, { email: "gone.agent@example.ma", role: "agent" });
  await invites.changeMemberRole(ownerA, { userId: inviterId, role: "manager" }); // a manager invites agents only
  ok(
    "accept: an inviter demoted below the invited role → invalid, nothing written",
    (await caught(invites.acceptInvite(tokenOf(staleManager.url), { email: "", name: "Stale", password: PASSWORD, locale: "fr" }))) === "invalid:team.invite.invalid" &&
      !(await one("SELECT id FROM users WHERE email = 'stale.manager@example.ma'")) &&
      (await one<{ accepted_at: Date | null }>("SELECT accepted_at FROM store_invites WHERE id = ?", [staleManager.inviteId]))?.accepted_at === null,
  );
  ok("accept: a role the demoted inviter still grants works", (await invites.acceptInvite(tokenOf(stillAgent.url), { email: "", name: "Still", password: PASSWORD, locale: "fr" })).role === "agent");
  await invites.removeMember(ownerA, { userId: inviterId });
  ok("accept: a removed inviter's link → invalid", (await caught(invites.acceptInvite(tokenOf(goneAgent.url), { email: "", name: "Gone", password: PASSWORD, locale: "fr" }))) === "invalid:team.invite.invalid");

  /* step-up expiry on a real session row (§B.7: 5 minutes) */
  const ownerSession = await createSession(A.userId, { mfaPassed: true, ip: "203.0.113.20", ua: UA });
  const asOwner = <T>(fn: () => Promise<T>, path: string | null = null) => runAsIdentity({ sessionToken: ownerSession.token, path }, fn);
  const stepTarget = await addMember(A.storeId, "editor", "step.target@example.ma");
  await c.query("UPDATE sessions SET step_up_at = UTC_TIMESTAMP(3) - INTERVAL 301 SECOND WHERE id = ?", [ownerSession.id]);
  const staleCtx = (await asOwner(() => seam.requireStoreMember({ handle: A.handle, throwOnFail: true }))) as WriteCtx;
  ok("step-up: 5 min 1 s old → stepUpUntil in the past", !!staleCtx.stepUpUntil && staleCtx.stepUpUntil.getTime() < Date.now(), staleCtx.stepUpUntil);
  ok("step-up: an expired one refuses a promotion to admin", (await caught(invites.changeMemberRole(staleCtx, { userId: stepTarget, role: "admin" }))) === "seam:step_up");
  const staleAction = await asOwner(() => teamActions.changeMemberRoleAction({ userId: stepTarget, role: "admin" }), `/app/${A.handle}/team`);
  ok("step-up: the action answers step_up and writes nothing", !staleAction.ok && staleAction.error === "step_up" && (await one<{ role: string }>("SELECT role FROM store_members WHERE store_id = ? AND user_id = ?", [A.storeId, stepTarget]))?.role === "editor", staleAction);
  await c.query("UPDATE sessions SET step_up_at = UTC_TIMESTAMP(3) - INTERVAL 240 SECOND WHERE id = ?", [ownerSession.id]);
  const freshAction = await asOwner(() => teamActions.changeMemberRoleAction({ userId: stepTarget, role: "admin" }), `/app/${A.handle}/team`);
  ok("step-up: 4 min old still counts", freshAction.ok && (await one<{ role: string }>("SELECT role FROM store_members WHERE store_id = ? AND user_id = ?", [A.storeId, stepTarget]))?.role === "admin", freshAction);
  await c.query("UPDATE sessions SET step_up_at = NULL WHERE id = ?", [ownerSession.id]);
  const noStep = await asOwner(() => teamActions.changeMemberRoleAction({ userId: stepTarget, role: "owner" }), `/app/${A.handle}/team`);
  ok("step-up: none at all → step_up", !noStep.ok && noStep.error === "step_up", noStep);

  /* the owner's close reads the seam's stepUpUntil (T1 review fix 3 refuses it while null; filled from sessions.step_up_at) */
  const { transitionStore, LifecycleError } = await import("@/lib/tenancy/lifecycle");
  const { HandleError } = await import("@/lib/tenancy/handles");
  const C = await newStore("closer");
  const closerSession = await createSession(C.userId, { mfaPassed: true, ip: "203.0.113.21", ua: UA });
  const asCloser = <T>(fn: () => Promise<T>, path: string | null = null) => runAsIdentity({ sessionToken: closerSession.token, path }, fn);
  const statusOf = async (storeId: string) => (await one<{ status: string }>("SELECT status FROM stores WHERE id = ?", [storeId]))?.status;
  const closeAction = () => seam.storeAction("store.close", (ctx) => transitionStore(ctx, ctx.store.id, "closed", { reason: "owner_request" }));
  const closeFrom = await statusOf(C.storeId);
  const noCloseStep = await asCloser(closeAction, `/app/${C.handle}/settings`);
  ok("owner close: no step-up → step_up, the store unchanged", !noCloseStep.ok && noCloseStep.error === "step_up" && (await statusOf(C.storeId)) === closeFrom, { noCloseStep, closeFrom });
  await c.query("UPDATE sessions SET step_up_at = UTC_TIMESTAMP(3) - INTERVAL 301 SECOND WHERE id = ?", [closerSession.id]);
  const staleCloser = (await asCloser(() => seam.requireStoreMember({ handle: C.handle, throwOnFail: true }))) as WriteCtx;
  const staleClose = await transitionStore(staleCloser, C.storeId, "closed", { reason: "owner_request" }).then(
    () => "ok",
    (e: unknown) => (e instanceof LifecycleError ? e.code : `other:${String(e)}`),
  );
  ok("owner close: a stale stepUpUntil → LifecycleError step_up (the lifecycle's own check)", staleClose === "step_up" && (await statusOf(C.storeId)) === closeFrom, staleClose);
  await c.query("UPDATE sessions SET step_up_at = UTC_TIMESTAMP(3) - INTERVAL 60 SECOND WHERE id = ?", [closerSession.id]);
  const freshCloser = (await asCloser(() => seam.requireStoreMember({ handle: C.handle, throwOnFail: true }))) as WriteCtx;
  ok("owner close: the seam fills stepUpUntil from step_up_at + 5 min", !!freshCloser.stepUpUntil && Math.abs(freshCloser.stepUpUntil.getTime() - (Date.now() + 240_000)) < 5_000, freshCloser.stepUpUntil);
  const freshClose = await asCloser(closeAction, `/app/${C.handle}/settings`);
  ok("owner close: a fresh step-up → closed through storeAction", freshClose.ok && (await statusOf(C.storeId)) === "closed", freshClose);
  ok("owner close: audited with the step-up method", !!(await one("SELECT id FROM audit_log WHERE store_id = ? AND action = 'store.closed'", [C.storeId])));

  /* actionFailure maps T1's typed refusals (CCR r1.0-t1-2) */
  const mapped = (e: unknown) => {
    const r = seam.actionFailure(e, "selftest");
    return r.error;
  };
  ok(
    "actionFailure: LifecycleError codes pass through",
    mapped(new LifecycleError("status_changed", "x")) === "status_changed" && mapped(new LifecycleError("step_up", "x")) === "step_up" && mapped(new LifecycleError("not_found", "x")) === "not_found",
  );
  ok(
    "actionFailure: HandleError → handle_<problem> / handle_<code> / conflict",
    mapped(new HandleError("invalid", "protected")) === "handle_protected" &&
      mapped(new HandleError("invalid", "reserved")) === "handle_reserved" &&
      mapped(new HandleError("invalid")) === "handle_format" &&
      mapped(new HandleError("unavailable")) === "handle_unavailable" &&
      mapped(new HandleError("too_soon", null, new Date())) === "handle_too_soon" &&
      mapped(new HandleError("status_changed")) === "conflict" &&
      mapped(new HandleError("forbidden")) === "forbidden",
  );
  ok("actionFailure: every mapped code has its error.<code> text in ar / fr / en", ["status_changed", "handle_format", "handle_reserved", "handle_protected", "handle_unavailable", "handle_too_soon"].every((code) => (["en", "fr", "ar"] as const).every((l) => authT(`error.${code}`, undefined, l) !== `error.${code}` && (l === "en" || authT(`error.${code}`, undefined, l) !== authT(`error.${code}`, undefined, "en")))));

  /* ---------------------------------------------------------------- */
  /* view as store (§B.8, PLA Q.31)                                    */
  /* ---------------------------------------------------------------- */
  const superUser = await bootstrapSuperAdmin({ name: "Platform Owner", email: "owner@storegen.test", password: PASSWORD }, { ip: null });
  if (!superUser) throw new Error("bootstrap");
  await c.query("UPDATE users SET totp_enabled = 1 WHERE id = ?", [superUser.userId]);
  const setupStore = await createSetupStore(superUser.userId, { storeName: "Maison Mère", handle: "maison-mere" }, { ip: null });
  const staffSession = await createSession(superUser.userId, { mfaPassed: true, ip: "203.0.113.9", ua: UA });
  const staffUser: SessionUser = { id: superUser.userId, email: "owner@storegen.test", name: "Platform Owner", role: "owner", totpEnabled: true, sessionId: staffSession.id, platformRole: "super_admin", locale: null, lastStoreId: null };
  const staffCtx = (role: PlatformRole, user: SessionUser = staffUser): PlatformCtx => ({
    user: { ...user, platformRole: role },
    role,
    actor: { kind: "platform", userId: user.id, impersonatorId: null, ip: "203.0.113.9" },
    can: (p) => canPlatform(role, p),
    stepUpFresh: false,
    stepUpUntil: null,
  });
  const sup = staffCtx("super_admin");
  ok("view as: an analyst may not", (await caught(imp.startImpersonation(staffCtx("analyst"), { storeId: A.storeId, reason: "bug" }))) === "seam:forbidden");
  ok("view as: support needs a ticket reference", (await caught(imp.startImpersonation(staffCtx("support"), { storeId: A.storeId, reason: "ticket" }))) === "fields:ticketRef");
  ok("view as: 'other' needs a note", (await caught(imp.startImpersonation(sup, { storeId: A.storeId, reason: "other" }))) === "fields:note");
  ok("view as: an unknown store → not_found", (await caught(imp.startImpersonation(sup, { storeId: "01J0000000000000000000ZZZZ", reason: "bug" }))) === "seam:not_found");
  ok("view as: a store one is a member of → impersonation_member", (await caught(imp.startImpersonation(sup, { storeId: setupStore.storeId, reason: "bug" }))) === "impersonation_member:console.impersonation.member");
  await c.query("UPDATE stores SET status = 'scheduled_deletion' WHERE id = ?", [B.storeId]);
  ok("view as: scheduled_deletion → impersonation_state", (await caught(imp.startImpersonation(sup, { storeId: B.storeId, reason: "bug" }))) === "impersonation_state:console.impersonation.state");
  await c.query("UPDATE stores SET status = 'pending' WHERE id = ?", [B.storeId]);

  const started = await imp.startImpersonation(sup, { storeId: A.storeId, reason: "onboarding", note: "first setup", ticketRef: "WA 24/10", minutes: 15 });
  ok("view as: started → the store's dashboard", started.url === `/app/${A.handle}`, started);
  const ses = await one<{ impersonation_id: string }>("SELECT impersonation_id FROM sessions WHERE id = ?", [staffSession.id]);
  const row = await one<{ id: string; store_id: string; staff_user_id: string; session_id: string; reason: string; ticket_ref: string; expires_at: Date; started_at: Date }>("SELECT * FROM impersonation_sessions WHERE id = ?", [ses?.impersonation_id]);
  ok("view as: the row and the session pointer", row?.store_id === A.storeId && row.staff_user_id === superUser.userId && row.session_id === staffSession.id && row.reason === "onboarding" && row.ticket_ref === "WA 24/10", row);
  ok("view as: 15 minutes", Math.abs((row?.expires_at.getTime() ?? 0) - (row?.started_at.getTime() ?? 0) - 15 * 60_000) < 2_000);
  ok("view as: the store's owners and admins notified, the staff feed too", !!(await one("SELECT id FROM notifications WHERE kind = 'store.impersonation_started' AND store_id = ? AND audience = 'store_role' AND JSON_CONTAINS(roles, '\"owner\"')", [A.storeId])) && !!(await one("SELECT id FROM notifications WHERE kind = 'staff.impersonation_started' AND audience = 'platform_staff'")));
  ok("view as: audited on the store", !!(await one("SELECT id FROM audit_log WHERE action = 'platform.impersonation.started' AND store_id = ? AND actor_kind = 'platform'", [A.storeId])));
  const active = await imp.activeImpersonation(sup);
  ok("view as: the console sees its own view", active?.storeId === A.storeId && active.handle === A.handle, active);

  const asStaff = <T>(fn: () => Promise<T>, path: string | null = null) => runAsIdentity({ sessionToken: staffSession.token, path }, fn);
  const viewCtx = await asStaff(() => seam.requireStoreMember({ handle: A.handle, throwOnFail: true, permission: "members.read" }));
  ok("seam: the synthetic read-only membership, scope kind impersonation", viewCtx.scope.kind === "impersonation" && viewCtx.membership.synthetic === "impersonation" && viewCtx.actor.kind === "impersonation" && viewCtx.impersonation?.id === row?.id, { kind: viewCtx.scope.kind, m: viewCtx.membership });
  ok("seam: only for that store", (await caught(asStaff(() => seam.requireStoreMember({ handle: B.handle, throwOnFail: true })))) === "seam:not_found");
  ok("view as: team reads work", (await invites.listInvites(viewCtx)).length > 0);
  {
    // review r1.0-t2 F6 (PD35): staff see members' e-mails masked under "view as store"; the owner sees them in full
    const viewed = await invites.listMembersByScope(viewCtx.scope);
    const own = await invites.listMembersByScope((await ctxOf(A.userId, A.handle)).scope);
    ok("view as: member e-mails masked", viewed.length > 0 && viewed.every((m) => m.email.includes("•••")) && !viewed.some((m) => m.email === "owner.aa@example.ma"), viewed.map((m) => m.email));
    ok("view as: the store's own members still see full e-mails", own.some((m) => m.email === "owner.aa@example.ma"));
  }
  ok("view as: team writes refused", (await caught(invites.createInvite(viewCtx, { email: "imp@x.ma", role: "viewer" }))) === "seam:impersonation_read_only" && (await caught(invites.leaveStore(viewCtx))) === "seam:impersonation_read_only");
  const refused = await asStaff(() => teamActions.createInviteAction({ email: "imp2@x.ma", role: "agent" }), `/app/${A.handle}/team`);
  ok("storeAction under impersonation → impersonation_read_only", !refused.ok && refused.error === "impersonation_read_only", refused);
  ok("the refusal is audited with both identities", !!(await one("SELECT id FROM audit_log WHERE action = 'platform.impersonation.write_refused' AND store_id = ? AND actor_kind = 'impersonation' AND user_id = ? AND impersonator_id = ?", [A.storeId, superUser.userId, superUser.userId])));

  const again = await imp.startImpersonation(sup, { storeId: B.storeId, reason: "bug" });
  const first = await one<{ ended_at: Date | null; ended_reason: string | null }>("SELECT ended_at, ended_reason FROM impersonation_sessions WHERE id = ?", [row?.id]);
  ok("view as: a second start ends the first", again.url === `/app/${B.handle}` && first?.ended_at instanceof Date && first.ended_reason === "ended", first);
  ok("view as: the ending notified with the window", !!(await one("SELECT id FROM notifications WHERE kind = 'store.impersonation_ended' AND store_id = ?", [A.storeId])));
  ok("seam: the old store is closed again", (await caught(asStaff(() => seam.requireStoreMember({ handle: A.handle, throwOnFail: true })))) === "seam:not_found");
  await imp.endImpersonation(sup, "ended");
  ok("end: the pointer cleared", (await one<{ impersonation_id: string | null }>("SELECT impersonation_id FROM sessions WHERE id = ?", [staffSession.id]))?.impersonation_id === null);
  const ends = Number((await one<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'platform.impersonation.ended'"))?.n);
  await imp.endImpersonation(sup, "ended");
  ok("end: twice writes one ending", Number((await one<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'platform.impersonation.ended'"))?.n) === ends && ends === 2, ends);

  await imp.startImpersonation(sup, { storeId: A.storeId, reason: "bug", minutes: 15 });
  const third = (await one<{ impersonation_id: string }>("SELECT impersonation_id FROM sessions WHERE id = ?", [staffSession.id]))!.impersonation_id;
  await c.query("UPDATE impersonation_sessions SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND WHERE id = ?", [third]);
  ok("expiry: an expired view is refused", (await caught(asStaff(() => seam.requireStoreMember({ handle: A.handle, throwOnFail: true })))) === "seam:not_found");
  const expired = await one<{ ended_reason: string | null }>("SELECT ended_reason FROM impersonation_sessions WHERE id = ?", [third]);
  ok("expiry: the row ends itself (expired)", expired?.ended_reason === "expired", expired);
  ok("expiry: audited as the system", !!(await one("SELECT id FROM audit_log WHERE action = 'platform.impersonation.ended' AND target = ? AND actor_kind = 'system'", [third])));

  /* ---------------------------------------------------------------- */
  /* notify (the minimal R1.0 insert)                                  */
  /* ---------------------------------------------------------------- */
  const n1 = await notify({ audience: "user", userId: A.userId, storeId: A.storeId }, "member.role_changed", { role: "admin", name: "Salma" }, { link: "https://evil.example/x" });
  const nr1 = await one<{ link: string | null; vars: string; severity: string }>("SELECT * FROM notifications WHERE id = ?", [(n1 as { id: number }).id]);
  ok("notify: a foreign link stored NULL, customer keys dropped", "id" in n1 && nr1?.link === null && !nr1.vars.includes("Salma") && nr1.vars.includes("admin") && nr1.severity === "info", nr1);
  const n2 = await notify({ audience: "store", storeId: A.storeId }, "health.issue_new", { n: 1 }, { link: "/app/ab", dedupeKey: "dedupe:one" });
  const n3 = await notify({ audience: "store", storeId: A.storeId }, "health.issue_new", { n: 2 }, { dedupeKey: "dedupe:one" });
  ok("notify: dedupe key → one row", "id" in n2 && "deduped" in n3 && Number((await one<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE dedupe_key = 'dedupe:one'"))?.n) === 1);
  ok("notify: a too-short handle link refused", (await one<{ link: string | null }>("SELECT link FROM notifications WHERE dedupe_key = 'dedupe:one'"))?.link === null);
  await notify({ audience: "store_role", storeId: A.storeId, roles: ["owner"] }, "ops.new_orders", {}, { batch: { windowMin: 60 }, link: `/app/${A.handle}/orders` });
  await notify({ audience: "store_role", storeId: A.storeId, roles: ["owner"] }, "ops.new_orders", {}, { batch: { windowMin: 60 }, link: `/app/${A.handle}/orders` });
  const batched = await q<{ vars: string; link: string }>("SELECT vars, link FROM notifications WHERE kind = 'ops.new_orders'");
  ok("notify: batched kinds count in one row", batched.length === 1 && JSON.parse(batched[0]!.vars).count === 2 && batched[0]!.link === `/app/${A.handle}/orders`, batched);
  ok("notify: a malformed target never throws", JSON.stringify(await notify({ audience: "store", storeId: "nope" }, "x.y", {})) === JSON.stringify({ deduped: true }));
  const staffRow = await notify({ audience: "platform_staff", minRole: "admin" }, "staff.alarm", { alarm: "test" }, { text: "line\u0007one", expiresInDays: 2, link: "/admin/health" });
  const sr = await one<{ platform_min_role: string; text: string; expires_at: Date; store_id: string | null; link: string }>("SELECT * FROM notifications WHERE id = ?", [(staffRow as { id: number }).id]);
  ok("notify: the staff feed with min role, text cleaned, expiry", sr?.platform_min_role === "admin" && sr.text === "lineone" && sr.store_id === null && sr.link === "/admin/health" && sr.expires_at.getTime() > Date.now() + 86_400_000, sr);
}

main()
  .catch((err: unknown) => {
    failures.push(`crashed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  })
  .finally(() => {
    for (const f of failures) console.error(`  ✗ ${f}`);
    console.log(failures.length ? `team selftest: ${pass} passed, ${failures.length} failed` : `✓ team selftest: all ${pass} checks passed`);
    process.exit(failures.length ? 1 : 0);
  });

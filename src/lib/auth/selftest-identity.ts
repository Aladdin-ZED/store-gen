/**
 * Identity selftest (docs/STORE-SAAS.md §B, PLA Q.19; T2 step "identity") against a throwaway MariaDB database: it
 * creates the database, migrates it, runs every case and drops it again, whatever happens.
 *
 *   SG_TEST_CONTEXT=1 SG_TEST_DB=cod_test_identity npx tsx src/lib/auth/selftest-identity.ts
 *
 * Needs a local MariaDB / MySQL as root without a password on 127.0.0.1:3306 (XAMPP), or SG_TEST_SERVER. The database
 * name must start with `cod_test_`. No network: Turnstile is exercised on its "missing" path only, mail goes to a
 * loopback SMTP stub, T1's platform counters are injected.
 */
import { createHash, randomBytes } from "node:crypto";
import Module from "node:module";
import net from "node:net";
import mysql from "mysql2/promise";

// the modules under test are marked `import "server-only"`; outside Next that import throws (as in pixels-publish-check)
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = require.resolve("drizzle-orm"); // any resolvable module: server-only exports nothing used
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    return req === "server-only" ? stub : orig.call(this, req, ...rest);
  };
}

const DB = process.env.SG_TEST_DB ?? "cod_test_identity";
const SERVER = process.env.SG_TEST_SERVER ?? "mysql://root@127.0.0.1:3306/";
if (!/^cod_test_[a-z0-9_]{1,40}$/.test(DB)) throw new Error(`SG_TEST_DB must be a cod_test_* name, got "${DB}"`);

const env = process.env as Record<string, string | undefined>;
env.DATABASE_URL = SERVER + DB;
env.APP_SECRET = "identity-selftest-secret-4f9a1c7e2b8d6035f1d2";
env.SG_TEST_CONTEXT = "1";
env.PLATFORM_URL = "http://localhost:3451";
env.SETUP_TOKEN = "setup-token-for-selftest-9c2e";
for (const k of ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "SMTP_URL", "MAIL_FROM", "STORE_ROOT_DOMAIN", "EDGE_KEY", "ADMIN_IP_ALLOWLIST", "ADMIN_HOST", "PUBLIC_URL"]) delete env[k];
if (env.NODE_ENV === "production") throw new Error("the identity selftest never runs with NODE_ENV=production");

let pass = 0;
const failures: string[] = [];
function ok(label: string, cond: unknown, info?: unknown): void {
  if (cond) pass++;
  else failures.push(info === undefined ? label : `${label}\n      ${JSON.stringify(info)}`);
}

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const marker = () => randomBytes(16).toString("base64url");

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
  const auth = await import("@/lib/auth");
  const { landingPathFor, isUsableMembership, listMemberships, rememberLastStore, switcherData } = await import("@/lib/auth/landing");
  const { loginAccount, completeSecondFactor } = await import("@/lib/auth/login");
  const { withScryptSlot, scryptSlotState } = await import("@/lib/auth/password");
  const { normalizeEmailForIdentity } = await import("@/lib/auth/identity");
  const { normalizeInviteCode, generateInviteCode, createPlatformInvite, revokePlatformInvite } = await import("@/lib/auth/platform-invites");
  const { signupAccount, createAdditionalStore, platformDay } = await import("@/lib/auth/signup");
  const { createSession } = await import("@/lib/auth/session");
  const users = await import("@/lib/auth/users");
  const { previewPasswordReset, consumePasswordReset } = await import("@/lib/auth/reset");
  const { setupOpen, bootstrapSuperAdmin, createSetupStore } = await import("@/lib/auth/bootstrap");
  const { setRequireMember2fa } = await import("@/lib/auth/store-security");
  const { publicAction } = await import("@/lib/auth/public-action");
  const { beginTotpEnrollment, confirmTotpEnrollment } = await import("@/lib/auth/mfa");
  const { totpCode, totpStep } = await import("@/lib/auth/totp");
  const { safeAppPath, safeAdminPath } = await import("@/lib/auth/paths");
  const { peekBucket, buckets } = await import("@/lib/auth/attempts");
  const invites = await import("@/lib/tenancy/invites");
  const { canPlatform } = await import("@/lib/auth/permissions");
  const { PlatformSettingSchema } = await import("@/lib/settings/keys/platform");
  const { QuotaError } = await import("@/lib/tenancy/usage");
  const mail = await import("@/lib/mail");
  const { renderMail } = await import("@/lib/mail/templates");
  const { buildMessage, smtpConfigFromEnv } = await import("@/lib/mail/smtp");
  type PlatformRole = import("@/lib/auth/permissions").PlatformRole;
  type PlatformCtx = import("@/lib/tenancy/types").PlatformCtx;
  type UserCtx = import("@/lib/tenancy/types").UserCtx;
  type StoreCtx = import("@/lib/tenancy/types").StoreCtx;
  type WriteCtx = import("@/lib/tenancy/types").WriteCtx;
  type SessionUser = import("@/lib/auth").SessionUser;
  type PublicActionCtx = import("@/lib/auth/public-action").PublicActionCtx;
  type HumanCheck = import("@/lib/auth/turnstile").HumanCheck;
  type SignupEnv = import("@/lib/auth/signup").SignupEnv;

  const caught = async (p: Promise<unknown>): Promise<string> => {
    try {
      await p;
      return "ok";
    } catch (e) {
      if (e instanceof errors.FieldsError) return `fields:${Object.keys(e.fields).sort().join(",")}`;
      if (e instanceof errors.AuthRefusal) return e.messageKey ? `${e.code}:${e.messageKey}` : e.code;
      if (e instanceof seam.SeamError) return `seam:${e.code}`;
      if (e instanceof errors.AuthBusyError) return "busy";
      if (e instanceof errors.AuthError) return `auth:${e.code}`;
      return `other:${(e as Error).message}`;
    }
  };
  const fieldsOf = async (p: Promise<unknown>): Promise<Record<string, string>> => {
    try {
      await p;
      return {};
    } catch (e) {
      return e instanceof errors.FieldsError ? { ...e.fields } : { error: String((e as Error).message) };
    }
  };

  const UA = "Mozilla/5.0 (identity selftest)";
  const PASSWORD = "Argan-Coop-Essaouira-2026";
  const setting = PlatformSettingSchema.parse({});
  const mode = (m: "closed" | "invite" | "approval" | "waitlist" | "open") => ({ mode: m, stored: m, unguarded: false, turnstile: null });
  let slots = 0;
  const counter: Pick<SignupEnv, "chargeSlot" | "refundSlot"> = {
    chargeSlot: async () => {
      slots++;
      return true;
    },
    refundSlot: async () => {
      slots--;
    },
  };
  const pub = (n: number, over: Partial<PublicActionCtx> = {}): PublicActionCtx => ({ ip: `198.51.100.${n}`, ua: UA, deviceId: marker(), turnstile: async () => "off" as HumanCheck, ...over });
  const form = (n: string, over: Record<string, unknown> = {}) => ({
    name: `Salma Seller ${n}`,
    email: `salma.${n}@gmail.com`,
    password: PASSWORD,
    phone: "+212612345678",
    storeName: `Atlas Argan ${n}`,
    handle: `atlas-${n}`,
    market: "MA",
    acceptLegal: true,
    formMs: 42_000,
    locale: "fr" as const,
    ...over,
  });
  const sessionUser = (u: { id: string; email: string; name: string; platform_role?: string; totp_enabled?: number }, sessionId?: string): SessionUser => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: "owner",
    totpEnabled: !!u.totp_enabled,
    sessionId: sessionId ?? `ctx:${u.id}`,
    platformRole: (u.platform_role ?? "none") as PlatformRole | "none",
    locale: null,
    lastStoreId: null,
  });
  const staff = (user: SessionUser, role: PlatformRole, fresh = true): PlatformCtx => ({
    user: { ...user, platformRole: role },
    role,
    actor: { kind: "platform", userId: user.id, impersonatorId: null, ip: "203.0.113.9" },
    can: (p) => canPlatform(role, p),
    stepUpFresh: fresh,
    stepUpUntil: fresh ? new Date(Date.now() + 240_000) : null,
  });
  const userCtx = (user: SessionUser): UserCtx => ({ user, actor: { kind: "user", userId: user.id, impersonatorId: null, ip: "198.51.100.200" } });
  const userRow = async (email: string) => one<{ id: string; email: string; name: string; platform_role: string; totp_enabled: number; disabled: number }>("SELECT * FROM users WHERE email = ?", [email]);

  /* ---------------------------------------------------------------- */
  /* pure parts                                                        */
  /* ---------------------------------------------------------------- */
  const M = (handle: string, over: Record<string, unknown> = {}) => ({ storeId: `S${handle}`, handle, name: handle, role: "owner" as const, status: "active" as const, storeStatus: "active" as const, mode: "landing" as const, ...over });
  ok("landing: no store → /app/new", landingPathFor([], null, "none") === "/app/new");
  ok("landing: staff without store → /admin", landingPathFor([], null, "support") === "/admin");
  ok("landing: one store → /app/<h>", landingPathFor([M("atlas")], null, "none") === "/app/atlas");
  ok("landing: agent → queue", landingPathFor([M("atlas", { role: "agent" })], null, "none") === "/app/atlas/queue");
  ok("landing: several → picker", landingPathFor([M("aa1"), M("bb2")], null, "none") === "/app");
  ok("landing: several + last usable → last", landingPathFor([M("aa1"), M("bb2")], "Sbb2", "none") === "/app/bb2");
  ok("landing: last unusable → picker", landingPathFor([M("aa1"), M("bb2", { status: "suspended" })], "Sbb2", "none") === "/app/aa1");
  ok("usable: closed for owner, not for agent", isUsableMembership(M("x1", { storeStatus: "closed" })) && !isUsableMembership(M("x1", { storeStatus: "closed", role: "agent" })));
  ok("safeAppPath accepts /app and /admin", safeAppPath("/app/atlas/orders?x=1") === "/app/atlas/orders?x=1" && safeAppPath("/admin/stores") === "/admin/stores");
  ok("safeAppPath refuses others", !safeAppPath("//evil.example") && !safeAppPath("/login") && !safeAppPath("/app/%2e%2e/x") && !safeAppPath("https://x.y/app"));
  ok("safeAdminPath unchanged", safeAdminPath("/admin/pages") === "/admin/pages" && safeAdminPath("/app/x") === null);
  ok("email identity: gmail dots and tags", normalizeEmailForIdentity("S.Alma+shop@GoogleMail.com") === "salma@gmail.com" && normalizeEmailForIdentity("a.b+x@outlook.com") === "a.b@outlook.com");
  const code0 = generateInviteCode();
  ok("invite code format", /^SG-[0-9A-HJKMNP-TV-Z]{12}$/.test(code0), code0);
  ok("invite code normalisation", normalizeInviteCode(code0.toLowerCase().replace("-", " - ")) === code0.slice(3) && normalizeInviteCode("SG-123") === null);
  ok("invite code look-alikes", normalizeInviteCode("sg-oi1l-0000-0000") === "0111" + "00000000");
  ok("maskEmail", invites.maskEmail("salma.b@gmail.com") === "s•••@gmail.com");
  const mailText = renderMail("invite", "ar", { inviterName: "Salma", storeName: "Atlas", role: "agent", url: "https://x/i/1", expiresAt: "31/10", brand: "Store Gen" });
  ok("mail template fills vars (ar)", mailText.subject.includes("Salma") && mailText.text.includes("https://x/i/1") && !mailText.text.includes("{"));
  ok("mail template keeps unknown placeholders", renderMail("digest", "en", { storeName: "A" }).text.includes("{summary}"));
  const built = buildMessage({ host: "h", port: 25, secure: false, user: null, pass: null, from: { address: "no-reply@storegen.test", name: "Store Gen" } }, { to: "a@b.ma", subject: "Bienvenue à Atlas\r\nBcc: x@y.z", text: "Bonjour" });
  ok("mail headers: encoded subject, no injection", built.data.includes("Subject: =?UTF-8?B?") && !/\r\nBcc:/i.test(built.data));
  ok("smtp config needs both variables", smtpConfigFromEnv({ SMTP_URL: "smtps://u:p@smtp.example.ma:465" }).config === null && smtpConfigFromEnv({}).problem === null);

  /* ---------------------------------------------------------------- */
  /* the scrypt semaphore (§B.3)                                       */
  /* ---------------------------------------------------------------- */
  {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const holders = [withScryptSlot(() => gate), withScryptSlot(() => gate)];
    const waiters = Array.from({ length: 16 }, (_, i) => withScryptSlot(async () => i));
    const state = scryptSlotState();
    ok("semaphore: 2 running, 16 waiting", state.active === 2 && state.waiting === 16, state);
    ok("semaphore: the 17th waiter is refused at once", (await caught(withScryptSlot(async () => 0))) === "busy");
    release();
    await Promise.all(holders);
    const got = await Promise.all(waiters);
    ok("semaphore: waiters run after release", got.length === 16 && scryptSlotState().active === 0 && scryptSlotState().waiting === 0, scryptSlotState());
    let release2!: () => void;
    const gate2 = new Promise<void>((r) => (release2 = r));
    const busy = [withScryptSlot(() => gate2), withScryptSlot(() => gate2)];
    const t0 = Date.now();
    const late = await caught(withScryptSlot(async () => 1));
    ok("semaphore: a wait past 4 s → busy", late === "busy" && Date.now() - t0 >= 3_900, { late, ms: Date.now() - t0 });
    release2();
    await Promise.all(busy);
  }

  /* ---------------------------------------------------------------- */
  /* bootstrap (§B.11), before any other super_admin exists             */
  /* ---------------------------------------------------------------- */
  ok("setup open on an empty platform", await setupOpen());
  const boots = await Promise.allSettled(
    [1, 2, 3].map((i) => bootstrapSuperAdmin({ name: `Owner ${i}`, email: `owner${i}@storegen.test`, password: PASSWORD }, { ip: "203.0.113.1" })),
  );
  const winners = boots.filter((b) => b.status === "fulfilled" && b.value !== null);
  const supers = await q("SELECT id FROM users WHERE platform_role = 'super_admin'");
  ok("bootstrap: three at once → one super_admin", winners.length === 1 && supers.length === 1, { boots: boots.map((b) => (b.status === "fulfilled" ? b.value : String(b.reason))), supers });
  ok("setup closed afterwards", !(await setupOpen()));
  const superId = (supers[0] as { id: string }).id;
  ok("bootstrap again → null", (await bootstrapSuperAdmin({ name: "Late", email: "late@storegen.test", password: PASSWORD }, { ip: null })) === null);
  ok("setup store needs TOTP", (await caught(createSetupStore(superId, { storeName: "Maison Mère", handle: "maison-mere" }, { ip: null }))).startsWith("forbidden"));
  await c.query("UPDATE users SET totp_enabled = 1 WHERE id = ?", [superId]);
  const setupStore = await createSetupStore(superId, { storeName: "Maison Mère", handle: "maison-mere" }, { ip: null });
  const setupRow = await one<{ status: string; plan_id: string; market: string; currency: string; timezone: string }>("SELECT * FROM stores WHERE id = ?", [setupStore.storeId]);
  ok("setup store: active, internal, MA / MAD / Casablanca", setupRow?.status === "active" && setupRow.plan_id === "internal" && setupRow.market === "MA" && setupRow.currency === "MAD" && setupRow.timezone === "Africa/Casablanca", setupRow);
  ok("setup store twice → conflict", (await caught(createSetupStore(superId, { storeName: "Deux", handle: "deux-store" }, { ip: null }))) === "conflict");

  /* staff accounts for the console functions */
  const adminAcc = await users.createAccount({ email: "admin@storegen.test", name: "Ops Admin", password: PASSWORD, locale: "fr" });
  await c.query("UPDATE users SET platform_role = 'admin', totp_enabled = 1 WHERE id = ?", [adminAcc.userId]);
  const adminUser = sessionUser({ ...(await userRow("admin@storegen.test"))!, totp_enabled: 1 });
  const adminCtx = staff(adminUser, "admin");
  const analystCtx = staff(adminUser, "analyst");

  /* ---------------------------------------------------------------- */
  /* accounts and sign-in (§B.3)                                       */
  /* ---------------------------------------------------------------- */
  ok("createAccount: field problems at once", JSON.stringify(Object.keys(await fieldsOf(users.createAccount({ email: "nope", name: "", password: "short", locale: "fr" }))).sort()) === JSON.stringify(["email", "name", "password"]));
  const lt = await users.createAccount({ email: "Login.Test@Example.ma", name: "Login Test", password: PASSWORD, phone: "0612345678", locale: "ar" });
  const ltRow = await one<{ email: string; phone: string; locale: string; platform_role: string }>("SELECT * FROM users WHERE id = ?", [lt.userId]);
  ok("createAccount: normalised e-mail, E.164 phone, locale, no role", ltRow?.email === "login.test@example.ma" && ltRow.phone === "+212612345678" && ltRow.locale === "ar" && ltRow.platform_role === "none", ltRow);
  ok("createAccount: duplicate → the generic refusal", (await caught(users.createAccount({ email: "login.test@example.ma", name: "Again", password: PASSWORD, locale: "fr" }))) === `invalid:${users.ACCOUNT_REFUSED}`);

  const dev1 = marker();
  const login1 = await loginAccount({ email: "LOGIN.test@example.ma", password: PASSWORD }, { ip: "192.0.2.1", ua: UA, deviceId: dev1 });
  ok("login: success, no MFA, memberships, platform role", login1.ok && !login1.mfaRequired && login1.memberships.length === 0 && login1.platformRole === "none", login1.ok ? { ...login1, session: "…" } : login1);
  // ORDER BY on an enum sorts by its index: sort the names here
  const links = (await q<{ kind: string; source: string }>("SELECT kind, source FROM identity_links WHERE user_id = ?", [lt.userId])).sort((x, y) => x.kind.localeCompare(y.kind));
  ok("login: device and net links (source login)", JSON.stringify(links) === JSON.stringify([{ kind: "device", source: "login" }, { kind: "net", source: "login" }]), links);
  for (let i = 0; i < 22; i++) await loginAccount({ email: "login.test@example.ma", password: PASSWORD }, { ip: `192.0.2.${100 + (i % 9)}`, ua: UA, deviceId: marker() });
  const devices = await one<{ n: number }>("SELECT COUNT(*) AS n FROM identity_links WHERE user_id = ? AND kind = 'device'", [lt.userId]);
  ok("login: at most 20 device links per user", Number(devices?.n) === 20, devices);

  ok("login: unknown e-mail → invalid", (await loginAccount({ email: "ghost@example.ma", password: PASSWORD }, { ip: "192.0.2.2", ua: UA })).ok === false);
  for (let i = 0; i < 5; i++) await loginAccount({ email: "login.test@example.ma", password: "wrong-password-123" }, { ip: "192.0.2.3", ua: UA });
  const blocked = await loginAccount({ email: "login.test@example.ma", password: PASSWORD }, { ip: "192.0.2.3", ua: UA });
  ok("login: past the account-network limit → rate_limited on that network", !blocked.ok && blocked.error === "rate_limited", blocked);
  const otherNet = await loginAccount({ email: "login.test@example.ma", password: PASSWORD }, { ip: "192.0.2.4", ua: UA });
  ok("login: another network still signs in", otherNet.ok, otherNet);
  for (let net4 = 10; net4 < 15; net4++) for (let i = 0; i < 5; i++) await loginAccount({ email: "login.test@example.ma", password: "wrong-password-123" }, { ip: `192.0.2.${net4}`, ua: UA });
  ok("login: 25 failures from 5 networks passed the account bucket", (await peekBucket(buckets.loginAcct("login.test@example.ma"))) >= 21);
  const afterMany = await loginAccount({ email: "login.test@example.ma", password: PASSWORD }, { ip: "192.0.2.20", ua: UA });
  ok("login: the account-wide bucket never refuses (no lock-out across networks)", afterMany.ok, afterMany);
  env.TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
  env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
  // T1's platform settings cache 30 s: the env defaults of platform_turnstile are read again after a change
  (await import("@/lib/settings")).invalidatePlatformSettings("platform_turnstile");
  for (let i = 0; i < 3; i++) await loginAccount({ email: "login.test@example.ma", password: "wrong-password-123" }, { ip: "192.0.2.30", ua: UA });
  const challenged = await loginAccount({ email: "login.test@example.ma", password: PASSWORD }, { ip: "192.0.2.30", ua: UA });
  ok("login: past 3 failures with a widget → challenge", !challenged.ok && challenged.error === "challenge", challenged);
  ok("login: the challenge consumed no account budget", (await peekBucket(buckets.loginAcctNet("login.test@example.ma", "192.0.2.30"))) === 3);
  {
    // review r1.0-t2 F3: parallel guesses from 4 networks can't all read the old count; at most 3 skip the challenge
    await users.createAccount({ email: "race.test@example.ma", name: "Race Test", password: PASSWORD, locale: "fr" });
    const burst = await Promise.all(
      Array.from({ length: 16 }, (_, i) => loginAccount({ email: "race.test@example.ma", password: "wrong-password-123" }, { ip: `192.0.2.${50 + (i % 4)}`, ua: UA })),
    );
    const unchallenged = burst.filter((r) => !r.ok && r.error !== "challenge").length;
    const acctAfter = await peekBucket(buckets.loginAcct("race.test@example.ma"));
    ok("login: 16 parallel guesses from 4 networks → at most 3 unchallenged", unchallenged <= 3 && burst.every((r) => !r.ok) && burst.filter((r) => !r.ok && r.error === "challenge").length === 16 - unchallenged, burst.map((r) => (r.ok ? "ok" : r.error)));
    ok("login: the challenged ones gave their charge back", acctAfter === unchallenged, { acctAfter, unchallenged });
    const next = await loginAccount({ email: "race.test@example.ma", password: "wrong-password-123" }, { ip: "192.0.2.54", ua: UA });
    ok("login: after the burst a fresh network is challenged too (3 failures on the account)", acctAfter < 3 || (!next.ok && next.error === "challenge"), next);
  }
  delete env.TURNSTILE_SITE_KEY;
  delete env.TURNSTILE_SECRET_KEY;
  (await import("@/lib/settings")).invalidatePlatformSettings("platform_turnstile");
  for (let i = 0; i < 11; i++) await loginAccount({ email: `ip${i}@example.ma`, password: PASSWORD }, { ip: "192.0.2.40", ua: UA });
  const ipBlocked = await loginAccount({ email: "login.test@example.ma", password: PASSWORD }, { ip: "192.0.2.40", ua: UA });
  ok("login: past 10 per IP → rate_limited", !ipBlocked.ok && ipBlocked.error === "rate_limited");

  /* ---------------------------------------------------------------- */
  /* signup (§B.2)                                                     */
  /* ---------------------------------------------------------------- */
  const inviteEnv = { mode: mode("invite"), setting, ...counter };
  const missing = await fieldsOf(signupAccount(form("a0", { inviteCode: undefined }), pub(1), inviteEnv));
  ok("signup (invite mode): a code is required", missing.inviteCode === "auth.signup.invite_invalid", missing);
  const many = await fieldsOf(signupAccount(form("a1", { email: "x", handle: "ad", storeName: "", inviteCode: "SG-0000" }), pub(1), inviteEnv));
  ok("signup: every field problem at once", ["email", "handle", "inviteCode", "storeName"].every((k) => k in many), many);
  const reserved = await fieldsOf(signupAccount(form("a2", { handle: "admin", inviteCode: code0 }), pub(1), inviteEnv));
  ok("signup: a reserved handle is unavailable", reserved.handle === "auth.signup.handle_unavailable", reserved);

  const one1 = await createPlatformInvite(adminCtx, { label: "Beta Casablanca", usesMax: 1, expiresInDays: 30 });
  ok("platform invite: analyst refused", (await caught(createPlatformInvite(analystCtx, { label: "x2" }))) === "forbidden");
  const devA = marker();
  const a = await signupAccount(form("aa", { inviteCode: one1.code }), pub(2, { deviceId: devA }), inviteEnv);
  ok("signup: created, pending", a.kind === "created" && a.storeStatus === "pending" && a.handle === "atlas-aa", a.kind === "created" ? { ...a, session: "…" } : a);
  if (a.kind !== "created") throw new Error("signup A failed; the remaining cases depend on it");
  const aUser = await one<{ email: string; phone: string; locale: string }>("SELECT * FROM users WHERE id = ?", [a.userId]);
  ok("signup: the user row", aUser?.email === "salma.aa@gmail.com" && aUser.phone === "+212612345678" && aUser.locale === "fr", aUser);
  const aStore = await one<{ status: string; plan_id: string; created_by: string; brand_seed: string; mode: string; locales: string }>("SELECT * FROM stores WHERE id = ?", [a.storeId]);
  ok("signup: the store row", aStore?.status === "pending" && aStore.plan_id === "beta" && aStore.created_by === a.userId && /^[0-9a-f]{16}$/.test(aStore.brand_seed) && aStore.mode === "landing", aStore);
  const aMember = await one<{ role: string; status: string }>("SELECT * FROM store_members WHERE store_id = ? AND user_id = ?", [a.storeId, a.userId]);
  ok("signup: the owner membership", aMember?.role === "owner" && aMember.status === "active", aMember);
  const aReview = await one<{ status: string; band: string; kind: string; score: number; signals: string }>("SELECT * FROM signup_reviews WHERE store_id = ?", [a.storeId]);
  const signals = JSON.parse(aReview?.signals ?? "{}") as { inputs?: { via?: string; formMs?: number; turnstile?: string } };
  ok("signup: the review row (pending, review band, via invite_code)", aReview?.status === "pending" && aReview.band === "review" && aReview.kind === "signup" && signals.inputs?.via === "invite_code" && signals.inputs.formMs === 42_000, aReview);
  ok("signup: no raw e-mail or IP in the signals", !aReview?.signals.includes("salma.aa") && !aReview?.signals.includes("198.51.100"));
  const aLinks = (await q<{ kind: string; value_hash: string; source: string }>("SELECT kind, value_hash, source FROM identity_links WHERE user_id = ?", [a.userId])).sort((x, y) => x.kind.localeCompare(y.kind));
  ok("signup: four identity links, hashed", aLinks.map((l) => l.kind).join(",") === "device,email_norm,net,phone" && aLinks.every((l) => l.source === "signup" && /^[0-9a-f]{64}$/.test(l.value_hash) && l.value_hash !== sha(devA)), aLinks);
  const aInvite = await one<{ uses: number }>("SELECT uses FROM platform_invites WHERE id = ?", [one1.id]);
  ok("signup: the code consumed", aInvite?.uses === 1, aInvite);
  const aSession = await one<{ last_store_id: string; mfa_passed: number }>("SELECT * FROM sessions WHERE id = ?", [a.session.id]);
  ok("signup: a full session on the new store", aSession?.last_store_id === a.storeId && aSession.mfa_passed === 1, aSession);
  const aAudit = await one<{ store_id: string; actor_kind: string; user_id: string }>("SELECT * FROM audit_log WHERE action = 'store.created' AND target = ?", [a.storeId]);
  ok("signup: store.created in the store's audit", aAudit?.store_id === a.storeId && aAudit.actor_kind === "user" && aAudit.user_id === a.userId, aAudit);
  ok("signup: slot charged once", slots === 1, slots);

  ok("signup: a used-up code", (await fieldsOf(signupAccount(form("ab", { inviteCode: one1.code }), pub(3), inviteEnv))).inviteCode === "auth.signup.invite_invalid");
  const five = await createPlatformInvite(adminCtx, { label: "Five uses", usesMax: 5 });
  const dupMail = await caught(signupAccount(form("ac", { email: "Salma.AA@gmail.com", inviteCode: five.code }), pub(4), inviteEnv));
  ok("signup: duplicate e-mail → the generic sentence", dupMail === `invalid:${users.ACCOUNT_REFUSED}`, dupMail);
  ok("signup: the rollback kept the code and refunded the slot", (await one<{ uses: number }>("SELECT uses FROM platform_invites WHERE id = ?", [five.id]))?.uses === 0 && slots === 1, slots);
  ok("signup: the rollback left no store", !(await one("SELECT id FROM stores WHERE handle = 'atlas-ac'")));
  const dupHandle = await caught(signupAccount(form("ad", { handle: "atlas-aa", inviteCode: five.code }), pub(5), inviteEnv));
  // with T1 merged, checkHandleAvailable answers before the transaction ("Not available", never why: §C.7); a handle
  // taken between that check and the insert still gets the one sentence through the unique index
  ok("signup: a taken handle → handle not available before any charge", dupHandle === "fields:handle" && slots === 1, { dupHandle, slots });
  ok("signup: the rollback left no user", !(await userRow("salma.ad@gmail.com")));

  const single = await createPlatformInvite(adminCtx, { label: "Race", usesMax: 1 });
  const race = await Promise.allSettled([1, 2, 3, 4, 5, 6].map((i) => signupAccount(form(`r${i}`, { inviteCode: single.code }), pub(10 + i), inviteEnv)));
  const raceOk = race.filter((r) => r.status === "fulfilled" && r.value.kind === "created").length;
  const raceUses = await one<{ uses: number }>("SELECT uses FROM platform_invites WHERE id = ?", [single.id]);
  ok("signup: six parallel signups on a one-use code → one account (SEC-24)", raceOk === 1 && raceUses?.uses === 1, { raceOk, raceUses, reasons: race.map((r) => (r.status === "rejected" ? String(r.reason) : r.value.kind)) });
  ok("signup: the losers' slots were refunded", slots === 2, slots);
  ok("signup: the losers left no rows", Number((await one<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE email LIKE 'salma.r%@gmail.com'"))?.n) === 1);

  const auto = await createPlatformInvite(adminCtx, { label: "Partners", usesMax: 2, autoApprove: true });
  const before = slots;
  const b = await signupAccount(form("bb", { inviteCode: auto.code }), pub(20), inviteEnv);
  const bReview = b.kind === "created" ? await one<{ status: string; reason_code: string }>("SELECT * FROM signup_reviews WHERE store_id = ?", [b.storeId]) : null;
  ok("signup: an auto-approve code → active, review approved (auto_invite), no slot", b.kind === "created" && b.storeStatus === "active" && bReview?.status === "approved" && bReview.reason_code === "auto_invite" && slots === before, { b: b.kind, bReview, slots });

  const capped = await signupAccount(form("cc", { inviteCode: five.code }), pub(21), {
    ...inviteEnv,
    chargeSlot: async () => {
      throw new QuotaError({ metric: "pending_stores", period: platformDay() }, 50, 50);
    },
  });
  const capRow = await one<{ source: string; email_norm: string }>("SELECT * FROM waitlist WHERE email_norm = 'salma.cc@gmail.com'");
  ok("signup: a full day → the waitlist (cap:<day>), no account", capped.kind === "waitlisted" && capped.reason === "capped" && capRow?.source === `cap:${platformDay()}` && !(await userRow("salma.cc@gmail.com")), { capped, capRow });

  const approvalEnv = { mode: mode("approval"), setting, ...counter };
  ok("signup (approval): a missing token is refused", (await caught(signupAccount(form("dd"), pub(22, { turnstile: async () => "missing" }), approvalEnv))) === "challenge:auth.signup.challenge");
  ok("signup (approval): no widget is refused too", (await caught(signupAccount(form("dd"), pub(22, { turnstile: async () => "off" }), approvalEnv))) === "challenge:auth.signup.challenge");
  const d = await signupAccount(form("dd"), pub(22, { turnstile: async () => "ok" }), approvalEnv);
  ok("signup (approval): a verified token, no code → pending", d.kind === "created" && d.storeStatus === "pending");
  const wl = await signupAccount(form("ee", { note: "Huile d'argan" }), pub(23), { mode: mode("waitlist"), setting, ...counter });
  const wl2 = await signupAccount(form("ee"), pub(23), { mode: mode("waitlist"), setting, ...counter });
  const wlRows = await q<{ note: string; phone: string }>("SELECT note, phone FROM waitlist WHERE email_norm = 'salma.ee@gmail.com'");
  ok("signup (waitlist): one row, twice the same answer", wl.kind === "waitlisted" && wl2.kind === "waitlisted" && wlRows.length === 1 && wlRows[0]?.note === "Huile d'argan" && wlRows[0].phone === "+212612345678", wlRows);
  ok("signup (closed) → closed", (await signupAccount(form("ff"), pub(24), { mode: mode("closed"), setting, ...counter })).kind === "closed");
  ok("signup: signups_enabled off → closed", (await signupAccount(form("ff"), pub(24), { ...inviteEnv, killed: true })).kind === "closed");

  await c.query("INSERT INTO legal_documents (id, kind, locale, version, title, body, status) VALUES ('01JTOS00000000000000000001', 'tos', 'fr', 1, 'Conditions', 'Texte', 'published')");
  ok("signup: a published ToS must be accepted", (await fieldsOf(signupAccount(form("gg", { inviteCode: five.code, acceptLegal: false }), pub(25), inviteEnv))).acceptLegal === "auth.signup.legal_required");
  const g = await signupAccount(form("gg", { inviteCode: five.code }), pub(25), inviteEnv);
  const gLegal = g.kind === "created" ? await one<{ store_id: string; context: string; document_id: string }>("SELECT * FROM legal_acceptances WHERE user_id = ?", [g.userId]) : null;
  ok("signup: the acceptance row", gLegal?.context === "signup" && gLegal.document_id === "01JTOS00000000000000000001" && g.kind === "created" && gLegal.store_id === g.storeId, gLegal);
  await revokePlatformInvite(adminCtx, five.id);
  ok("platform invite: a revoked code stops working", (await fieldsOf(signupAccount(form("hh", { inviteCode: five.code }), pub(26), inviteEnv))).inviteCode === "auth.signup.invite_invalid");

  /* /app/new */
  const aSessionUser = sessionUser({ id: a.userId, email: "salma.aa@gmail.com", name: "Salma Seller aa" }, a.session.id);
  const second = await createAdditionalStore(userCtx(aSessionUser), { storeName: "Atlas Deux", handle: "atlas-deux" }, { ua: UA, deviceId: null }, inviteEnv);
  ok("/app/new: another pending store", second.kind === "created" && second.storeStatus === "pending");
  const mships = await listMemberships(a.userId);
  ok("memberships: two stores", mships.length === 2 && mships.every((m) => m.role === "owner"), mships);
  ok("landing for two stores without a hint → picker", landingPathFor(mships, null, "none") === "/app");
  ok("remember the last store (a usable membership only)", second.kind === "created" && (await rememberLastStore(userCtx(aSessionUser), second.storeId)) && !(await rememberLastStore(userCtx(aSessionUser), setupStore.storeId)));
  ok("the session holds the hint", second.kind === "created" && (await one<{ last_store_id: string }>("SELECT last_store_id FROM sessions WHERE id = ?", [a.session.id]))?.last_store_id === second.storeId);
  const relog = await loginAccount({ email: "salma.aa@gmail.com", password: PASSWORD }, { ip: "192.0.2.50", ua: UA });
  ok("a fresh sign-in lands on the last store", relog.ok && second.kind === "created" && landingPathFor(relog.memberships, relog.lastStoreId, relog.platformRole) === "/app/atlas-deux", relog.ok ? relog.lastStoreId : relog);
  const sw = await switcherData(aSessionUser);
  ok("switcher: two stores, create, no console", sw.stores.length === 2 && sw.canCreate && !sw.console);
  await createAdditionalStore(userCtx(aSessionUser), { storeName: "Atlas Trois", handle: "atlas-trois" }, { ua: UA, deviceId: null }, inviteEnv);
  await createAdditionalStore(userCtx(aSessionUser), { storeName: "Atlas Quatre", handle: "atlas-quatre" }, { ua: UA, deviceId: null }, inviteEnv);
  ok("/app/new: 3 per day", (await caught(createAdditionalStore(userCtx(aSessionUser), { storeName: "Atlas Cinq", handle: "atlas-cinq" }, { ua: UA, deviceId: null }, inviteEnv))) === "rate_limited");
  {
    // review r1.0-t2 F4: /app/new follows the PLA-§3.1 mode table
    const noStore = await users.createAccount({ email: "no.store@example.ma", name: "No Store", password: PASSWORD, locale: "fr" });
    const noStoreSession = await createSession(noStore.userId, { mfaPassed: true, ip: "192.0.2.61", ua: UA });
    const noStoreCtx = userCtx(sessionUser({ id: noStore.userId, email: "no.store@example.ma", name: "No Store" }, noStoreSession.id));
    const pendingBefore = Number((await one<{ n: number }>("SELECT COUNT(*) AS n FROM stores"))?.n);
    const closedNew = await createAdditionalStore(noStoreCtx, { storeName: "Closed Mode", handle: "closed-mode-store" }, { ua: UA, deviceId: null }, { mode: mode("closed"), setting, ...counter });
    const waitNew = await createAdditionalStore(noStoreCtx, { storeName: "Waitlist Mode", handle: "waitlist-mode" }, { ua: UA, deviceId: null }, { mode: mode("waitlist"), setting, ...counter });
    const inviteNew = await createAdditionalStore(noStoreCtx, { storeName: "Invite Mode", handle: "invite-mode-store" }, { ua: UA, deviceId: null }, inviteEnv);
    ok("/app/new: closed and waitlist modes → closed", closedNew.kind === "closed" && waitNew.kind === "closed", { closedNew, waitNew });
    ok("/app/new: invite mode, an account owning no store → closed", inviteNew.kind === "closed", inviteNew);
    ok("/app/new: the refused ones created nothing and charged no daily bucket", Number((await one<{ n: number }>("SELECT COUNT(*) AS n FROM stores"))?.n) === pendingBefore && (await peekBucket(buckets.storeCreate(noStore.userId))) === 0);
    const approvalNew = await createAdditionalStore(noStoreCtx, { storeName: "Approval Mode", handle: "approval-mode-store" }, { ua: UA, deviceId: null }, approvalEnv);
    ok("/app/new: approval mode still opens a store for any account", approvalNew.kind === "created", approvalNew);
  }

  /* ---------------------------------------------------------------- */
  /* the console's user functions (PLA Q.19, PLA-§11.2)                */
  /* ---------------------------------------------------------------- */
  const target = await users.createAccount({ email: "reset.me@example.ma", name: "Reset Me", password: PASSWORD, locale: "fr" });
  const tSession = await createSession(target.userId, { mfaPassed: true, ip: "192.0.2.60", ua: UA });
  ok("reset link: a stale step-up → step_up", (await caught(users.createPasswordResetLink(staff(adminUser, "admin", false), target.userId, "lost access"))) === "step_up");
  ok("reset link: never oneself", (await caught(users.createPasswordResetLink(adminCtx, adminUser.id, "lost access"))).startsWith("forbidden"));
  ok("reset link: never a staff account", (await caught(users.createPasswordResetLink(adminCtx, superId, "lost access"))) === "is_staff");
  ok("reset link: analysts can't", (await caught(users.createPasswordResetLink(analystCtx, target.userId, "lost access"))) === "forbidden");
  ok("reset link: a reason is required", (await caught(users.createPasswordResetLink(adminCtx, target.userId, "x"))) === "fields:reason");
  const link1 = await users.createPasswordResetLink(adminCtx, target.userId, "lost access");
  const link2 = await users.createPasswordResetLink(adminCtx, target.userId, "lost access again");
  const tok1 = link1.url.split("/reset/")[1]!;
  const tok2 = link2.url.split("/reset/")[1]!;
  ok("reset link: an absolute single-use URL, 60 minutes", link2.url.startsWith("http://localhost:3451/reset/") && /^[A-Za-z0-9_-]{43}$/.test(tok2) && Math.abs(link2.expiresAt.getTime() - Date.now() - 3_600_000) < 60_000);
  ok("reset link: a newer link voids the older one", !(await previewPasswordReset(tok1)).valid && (await previewPasswordReset(tok2)).valid);
  ok("reset: the policy applies", (await caught(consumePasswordReset(tok2, "short", { ip: null }))) === "fields:password");
  const NEWPW = "Nouveau-Mot-De-Passe-77";
  const consumes = await Promise.all([1, 2, 3, 4, 5].map(() => caught(consumePasswordReset(tok2, NEWPW, { ip: "192.0.2.61" }))));
  ok("reset: five parallel submits → one change (SEC-24)", consumes.filter((r) => r === "ok").length === 1 && consumes.filter((r) => r === "invalid:auth.reset.invalid").length === 4, consumes);
  ok("reset: every session of the user ended", !(await one("SELECT id FROM sessions WHERE id = ?", [tSession.id])));
  ok("reset: the new password works, the old one not", (await loginAccount({ email: "reset.me@example.ma", password: NEWPW }, { ip: "192.0.2.62", ua: UA })).ok && !(await loginAccount({ email: "reset.me@example.ma", password: PASSWORD }, { ip: "192.0.2.63", ua: UA })).ok);
  const resetAudit = await one<{ actor_kind: string }>("SELECT actor_kind FROM audit_log WHERE action = 'auth.password.reset' AND target = ?", [target.userId]);
  ok("reset: audit auth.password.reset by the platform", resetAudit?.actor_kind === "platform", resetAudit);

  const banSession = await createSession(target.userId, { mfaPassed: true, ip: "192.0.2.64", ua: UA });
  ok("ban: a reason is required", (await caught(users.banUser(adminCtx, target.userId, { reason: "" }))) === "fields:reason");
  await users.banUser(adminCtx, target.userId, { reason: "Fraud reports", note: "three stores" });
  const banned = await one<{ disabled: number; disabled_reason: string }>("SELECT * FROM users WHERE id = ?", [target.userId]);
  ok("ban: disabled with the reason, sessions revoked", banned?.disabled === 1 && banned.disabled_reason === "Fraud reports" && !(await one("SELECT id FROM sessions WHERE id = ?", [banSession.id])), banned);
  const bannedLogin = await loginAccount({ email: "reset.me@example.ma", password: NEWPW }, { ip: "192.0.2.65", ua: UA });
  ok("ban: the sign-in answers generically", !bannedLogin.ok && bannedLogin.error === "invalid");
  await users.unbanUser(adminCtx, target.userId, "appeal accepted");
  ok("unban: signs in again", (await loginAccount({ email: "reset.me@example.ma", password: NEWPW }, { ip: "192.0.2.66", ua: UA })).ok);
  ok("platform audit rows", (await q("SELECT action FROM audit_log WHERE action IN ('platform.user.banned','platform.user.unbanned','platform.user.reset_link') AND actor_kind = 'platform'")).length === 4);

  /* TOTP, the second factor, the platform 2FA reset */
  const enrol = await beginTotpEnrollment(target.userId);
  const secret = enrol.secretDisplay.replace(/\s+/g, "");
  await confirmTotpEnrollment(target.userId, { code: totpCode(secret), password: NEWPW });
  const pending = await loginAccount({ email: "reset.me@example.ma", password: NEWPW }, { ip: "192.0.2.67", ua: UA });
  ok("login with TOTP → the pending session", pending.ok && pending.mfaRequired);
  if (pending.ok) {
    const done = await completeSecondFactor({ sessionId: pending.session.id, userId: target.userId }, { method: "totp", code: totpCode(secret, totpStep() + 1) }, { ip: "192.0.2.67", ua: UA });
    ok("second factor → a full session with the landing data", done.ok && done.memberships.length === 0 && done.platformRole === "none", done.ok ? "ok" : done);
  }
  await users.resetUserTwoFactor(adminCtx, target.userId, "lost phone");
  const reset2fa = await one<{ totp_enabled: number; totp_secret_enc: string | null; recovery_codes: string | null }>("SELECT * FROM users WHERE id = ?", [target.userId]);
  ok("2FA reset: TOTP and recovery codes cleared", reset2fa?.totp_enabled === 0 && reset2fa.totp_secret_enc === null && reset2fa.recovery_codes === null, reset2fa);
  ok("2FA reset: nothing to reset → invalid", (await caught(users.resetUserTwoFactor(adminCtx, target.userId, "lost phone"))) === "invalid:auth.staff.no_2fa");

  /* ---------------------------------------------------------------- */
  /* step-up (§B.7)                                                    */
  /* ---------------------------------------------------------------- */
  const ownerSession = await createSession(a.userId, { mfaPassed: true, ip: "192.0.2.70", ua: UA });
  const asToken = <T>(token: string, fn: () => Promise<T>, headers?: HeadersInit) => runAsIdentity({ sessionToken: token, path: null, headers }, fn);
  const wrong = await asToken(ownerSession.token, () => auth.stepUpWithPasswordAction("not-the-password"));
  ok("password step-up: a wrong password → invalid on the field", !wrong.ok && wrong.error === "invalid" && wrong.items?.[0]?.field === "password", wrong);
  const stepped = await asToken(ownerSession.token, () => auth.stepUpWithPasswordAction(PASSWORD));
  ok("password step-up: until ≈ 5 minutes", stepped.ok && Math.abs(new Date(stepped.data.until).getTime() - Date.now() - 300_000) < 10_000, stepped);
  ok("password step-up: step_up_at written", (await one<{ step_up_at: Date | null }>("SELECT step_up_at FROM sessions WHERE id = ?", [ownerSession.id]))?.step_up_at instanceof Date);
  const stepAudit = await one<{ meta: string }>("SELECT meta FROM audit_log WHERE action = 'auth.step_up' AND user_id = ? ORDER BY id DESC LIMIT 1", [a.userId]);
  ok("password step-up: audit with the method", stepAudit?.meta.includes('"password"'), stepAudit);
  const ctxStepped = (await runAsIdentity({ sessionToken: ownerSession.token, path: null }, () => seam.requireStoreMember({ handle: "atlas-aa", throwOnFail: true }))) as StoreCtx;
  ok("the store context carries stepUpUntil", ctxStepped.stepUpUntil instanceof Date && ctxStepped.stepUpUntil.getTime() > Date.now());
  const impSession = await createSession(a.userId, { mfaPassed: true, ip: "192.0.2.71", ua: UA });
  await c.query("UPDATE sessions SET impersonation_id = '01JIMP00000000000000000001' WHERE id = ?", [impSession.id]);
  const impStep = await asToken(impSession.token, () => auth.stepUpWithPasswordAction(PASSWORD));
  ok("password step-up under impersonation → impersonation_read_only", !impStep.ok && impStep.error === "impersonation_read_only", impStep);
  const totpSession = await createSession(target.userId, { mfaPassed: true, ip: "192.0.2.72", ua: UA });
  const enrol2 = await beginTotpEnrollment(target.userId);
  const secret2 = enrol2.secretDisplay.replace(/\s+/g, "");
  await confirmTotpEnrollment(target.userId, { code: totpCode(secret2), password: NEWPW });
  const pwOnTotp = await asToken(totpSession.token, () => auth.stepUpWithPasswordAction(NEWPW));
  ok("password step-up with TOTP on → totp_required", !pwOnTotp.ok && pwOnTotp.error === "totp_required", pwOnTotp);
  const totpStepped = await asToken(totpSession.token, () => auth.stepUpAction(totpCode(secret2, totpStep() + 1)));
  ok("TOTP step-up", totpStepped.ok, totpStepped);
  const replay = await asToken(totpSession.token, () => auth.stepUpAction(totpCode(secret2, totpStep() + 1)));
  ok("TOTP step-up: a used code is refused", !replay.ok && replay.error === "invalid", replay);
  const noTotp = await asToken(ownerSession.token, () => auth.stepUpAction("123456"));
  ok("TOTP step-up without TOTP → invalid", !noTotp.ok && noTotp.message === "auth.step_up.totp_off", noTotp);

  /* userAction, requireUser (account mode) */
  const ua1 = await asToken(ownerSession.token, () => auth.userAction(async (ctx) => `${ctx.user.id}:${ctx.actor.kind}`));
  ok("userAction: the account context", ua1.ok && ua1.data === `${a.userId}:user`, ua1);
  const ua2 = await asToken("x".repeat(43), () => auth.userAction(async () => 1));
  ok("userAction: signed out → forbidden (session ended)", !ua2.ok && ua2.error === "forbidden" && ua2.message === "error.session_ended", ua2);
  const ua3 = await asToken(ownerSession.token, () => auth.userAction(async () => 1), { host: "localhost:3451", "sec-fetch-site": "same-origin" });
  ok("userAction: no Origin → forbidden before anything runs", !ua3.ok && ua3.error === "forbidden", ua3);
  const ru = await asToken(ownerSession.token, () => auth.requireUser({ throwOnFail: true }));
  ok("requireUser (account) inside the test context", ru.id === a.userId);

  /* publicAction */
  const anyone = { userId: a.userId, path: null } as const;
  const pa: string[] = [];
  for (let i = 0; i < 6; i++) {
    const r = await runAsIdentity(anyone, () => publicAction("signup", async (ctx) => ctx.ip, { turnstile: "when-configured", burst: "signup" }));
    pa.push(r.ok ? "ok" : r.error);
  }
  ok("publicAction: the form bucket (signup 5 per hour per IP)", pa.join(",") === "ok,ok,ok,ok,ok,rate_limited", pa);
  const req = await runAsIdentity(anyone, () => publicAction("reset", async () => 1, { turnstile: "required", burst: "reset" }));
  ok("publicAction: required Turnstile without a widget → challenge", !req.ok && req.error === "challenge", req);
  const fe = await runAsIdentity(anyone, () => publicAction("reset", async () => Promise.reject(new errors.FieldsError({ password: "auth.password.too_short" })), { turnstile: "when-configured", burst: "reset" }));
  ok("publicAction: field errors → invalid with items", !fe.ok && fe.error === "invalid" && fe.items?.[0]?.field === "password" && fe.message === "auth.password.too_short", fe);
  const busyR = await runAsIdentity(anyone, () => publicAction("reset", async () => Promise.reject(new errors.AuthBusyError()), { turnstile: "when-configured", burst: "reset" }));
  ok("publicAction: a full semaphore → busy", !busyR.ok && busyR.error === "busy");
  const dm = marker();
  const dev = await runAsIdentity({ ...anyone, headers: { cookie: `other=1; sgd=${dm}`, origin: "http://localhost:3451", host: "localhost:3451", "sec-fetch-site": "same-origin" } }, () =>
    publicAction("report", async (ctx) => ctx.deviceId, { turnstile: "when-configured", burst: "report" }),
  );
  ok("publicAction: the device marker from the cookie", dev.ok && dev.data === dm, dev);
  const noOrigin = await runAsIdentity({ ...anyone, headers: { host: "localhost:3451" } }, () => publicAction("report", async () => 1, { turnstile: "when-configured", burst: "report" }));
  ok("publicAction: no Origin → forbidden", !noOrigin.ok && noOrigin.error === "forbidden");
  {
    // review r1.0-t2 F8: with ADMIN_HOST set, the platform host's own actions still pass the origin check
    env.ADMIN_HOST = "studio.storegen.test";
    const post = (hdrs: Record<string, string>) => seam.isSameOriginMutation(new Request("http://localhost/", { method: "POST", headers: hdrs }));
    const platformOk = post({ origin: "http://localhost:3451", host: "localhost:3451", "sec-fetch-site": "same-origin" });
    const adminOk = post({ origin: "http://studio.storegen.test", host: "studio.storegen.test", "sec-fetch-site": "same-origin" });
    const crossSite = post({ origin: "http://localhost:3451", host: "localhost:3451", "sec-fetch-site": "same-site" });
    const foreign = post({ origin: "http://shop.storegen.test", host: "shop.storegen.test", "sec-fetch-site": "same-origin" });
    const nullOrigin = post({ origin: "null", host: "localhost:3451", "sec-fetch-site": "same-origin" });
    const missing = post({ host: "localhost:3451", "sec-fetch-site": "same-origin" });
    const viaAction = await asToken(ownerSession.token, () => auth.userAction(async () => 1), { origin: "http://localhost:3451", host: "localhost:3451", "sec-fetch-site": "same-origin" });
    delete env.ADMIN_HOST;
    ok("origin (ADMIN_HOST set): the platform host and the admin host pass", platformOk && adminOk && viaAction.ok, { platformOk, adminOk, viaAction });
    ok("origin (ADMIN_HOST set): same-site, another host, Origin null, no Origin → refused", !crossSite && !foreign && !nullOrigin && !missing, { crossSite, foreign, nullOrigin, missing });
  }

  /* ---------------------------------------------------------------- */
  /* members: leaveStore, the scoped reads, require 2FA                */
  /* ---------------------------------------------------------------- */
  const ctxA = (await runAsIdentity({ userId: a.userId, path: null }, () => seam.requireStoreMember({ handle: "atlas-aa", throwOnFail: true }))) as StoreCtx;
  ok("leave: the last owner is refused", (await caught(invites.leaveStore(ctxA))) === "last_owner:team.leave.last_owner");
  const co = await users.createAccount({ email: "co.owner@example.ma", name: "Co Owner", password: PASSWORD, locale: "en" });
  const agentAcc = await users.createAccount({ email: "agent.one@example.ma", name: "Agent One", password: PASSWORD, locale: "ar" });
  await c.query("INSERT INTO store_members (store_id, user_id, role, status) VALUES (?, ?, 'owner', 'active'), (?, ?, 'agent', 'active')", [a.storeId, co.userId, a.storeId, agentAcc.userId]);
  const agentLanding = await listMemberships(agentAcc.userId);
  ok("landing: an agent's single store → its queue", landingPathFor(agentLanding, null, "none") === "/app/atlas-aa/queue");
  const members = await invites.listMembersByScope(ctxA.scope);
  ok("listMembersByScope: three members with roles", members.length === 3 && members.map((m) => m.role).sort().join(",") === "agent,owner,owner", members.map((m) => m.role));
  await c.query(
    `INSERT INTO store_invites (id, store_id, email_norm, role, token_hash, invited_by, expires_at, accepted_at, revoked_at) VALUES
     ('01JINV00000000000000000001', ?, 'salma.b@gmail.com', 'agent', ?, ?, UTC_TIMESTAMP(3) + INTERVAL 7 DAY, NULL, NULL),
     ('01JINV00000000000000000002', ?, 'karim@outlook.com', 'editor', ?, ?, UTC_TIMESTAMP(3) - INTERVAL 1 DAY, NULL, NULL),
     ('01JINV00000000000000000003', ?, 'nadia@yahoo.fr', 'viewer', ?, ?, UTC_TIMESTAMP(3) + INTERVAL 7 DAY, NULL, UTC_TIMESTAMP(3)),
     ('01JINV00000000000000000004', ?, 'agent.one@example.ma', 'agent', ?, ?, UTC_TIMESTAMP(3) + INTERVAL 7 DAY, UTC_TIMESTAMP(3), NULL)`,
    [a.storeId, sha("t1"), a.userId, a.storeId, sha("t2"), a.userId, a.storeId, sha("t3"), a.userId, a.storeId, sha("t4"), a.userId],
  );
  const inv = await invites.listInvitesByScope(ctxA.scope);
  const states = Object.fromEntries(inv.map((i) => [i.id.slice(-1), i.state]));
  ok("listInvitesByScope: states", states["1"] === "pending" && states["2"] === "expired" && states["3"] === "revoked" && states["4"] === "accepted", states);
  ok("listInvitesByScope: masked e-mails, inviter named", inv.every((i) => i.emailMasked.includes("•••") && !i.emailMasked.includes("salma.b")) && inv[0]?.invitedBy.name === "Salma Seller aa", inv[0]);
  const otherScope = (await runAsIdentity({ userId: superId, path: null }, () => seam.requireStoreMember({ handle: "maison-mere", throwOnFail: true }))) as StoreCtx;
  ok("scoped reads see only their store", (await invites.listInvitesByScope(otherScope.scope)).length === 0 && (await invites.listMembersByScope(otherScope.scope)).length === 1);
  await invites.leaveStore(ctxA);
  ok("leave: an owner with a co-owner leaves", !(await one("SELECT user_id FROM store_members WHERE store_id = ? AND user_id = ?", [a.storeId, a.userId])));
  ok("leave: audited with self", (await one<{ meta: string }>("SELECT meta FROM audit_log WHERE action = 'store.member.removed' AND store_id = ? AND target = ?", [a.storeId, a.userId]))?.meta.includes('"self":true'));
  const fakeImp = { ...ctxA, impersonation: { id: "x", storeId: a.storeId, staffUserId: superId, mode: "read" as const, reason: "ticket" as const, expiresAt: new Date() } } as StoreCtx;
  ok("leave under impersonation → impersonation_read_only", (await caught(invites.leaveStore(fakeImp))) === "seam:impersonation_read_only");

  const ctxCo = (await runAsIdentity({ userId: co.userId, path: null }, () => seam.requireStoreMember({ handle: "atlas-aa", throwOnFail: true }))) as WriteCtx;
  ok("require 2FA: an owner without TOTP can't turn it on", (await caught(setRequireMember2fa(ctxCo, true))) === "forbidden:store.security.2fa_owner_only");
  const ctxSuper = (await runAsIdentity({ userId: superId, path: null }, () => seam.requireStoreMember({ handle: "maison-mere", throwOnFail: true }))) as WriteCtx;
  await setRequireMember2fa(ctxSuper, true);
  ok("require 2FA: on, audited", (await one<{ require_member_2fa: number }>("SELECT require_member_2fa FROM stores WHERE id = ?", [setupStore.storeId]))?.require_member_2fa === 1 && !!(await one("SELECT id FROM audit_log WHERE action = 'store.2fa_required_changed' AND store_id = ?", [setupStore.storeId])));

  /* ---------------------------------------------------------------- */
  /* account deletion (§F.9)                                           */
  /* ---------------------------------------------------------------- */
  ok("delete: an owner of a live store → owns_store", (await caught(auth.deleteUserAccount(userCtx(sessionUser({ id: co.userId, email: "co.owner@example.ma", name: "Co Owner" }))))) === "owns_store:auth.account.owns_store");
  ok("delete: a staff account → is_staff", (await caught(auth.deleteUserAccount(userCtx(adminUser)))) === "is_staff:auth.account.is_staff");
  ok("delete: self with a target → forbidden", (await caught(auth.deleteUserAccount(userCtx(adminUser), { userId: co.userId, reason: "spam" }))) === "forbidden");
  const agentSession = await createSession(agentAcc.userId, { mfaPassed: true, ip: "192.0.2.80", ua: UA });
  await loginAccount({ email: "agent.one@example.ma", password: PASSWORD }, { ip: "192.0.2.81", ua: UA, deviceId: marker() });
  await auth.deleteUserAccount(userCtx(sessionUser({ id: agentAcc.userId, email: "agent.one@example.ma", name: "Agent One" }, agentSession.id)));
  const gone = await one<{ email: string; name: string; phone: string | null; locale: string | null; disabled: number; disabled_reason: string; password_hash: string }>("SELECT * FROM users WHERE id = ?", [agentAcc.userId]);
  ok("delete: the row anonymised", /^deleted\+[0-9a-z]{26}@invalid$/.test(gone?.email ?? "") && gone?.name === "" && gone.phone === null && gone.locale === null && gone.disabled === 1 && gone.disabled_reason === "deleted", gone);
  ok("delete: links, sessions and memberships gone", Number((await one<{ n: number }>("SELECT (SELECT COUNT(*) FROM identity_links WHERE user_id = ?) + (SELECT COUNT(*) FROM sessions WHERE user_id = ?) + (SELECT COUNT(*) FROM store_members WHERE user_id = ?) AS n", [agentAcc.userId, agentAcc.userId, agentAcc.userId]))?.n) === 0);
  ok("delete: audited (auth.account.deleted, store.member.removed)", !!(await one("SELECT id FROM audit_log WHERE action = 'auth.account.deleted' AND user_id = ?", [agentAcc.userId])) && !!(await one("SELECT id FROM audit_log WHERE action = 'store.member.removed' AND target = ? AND store_id = ?", [agentAcc.userId, a.storeId])));
  ok("delete: the old e-mail no longer signs in", !(await loginAccount({ email: "agent.one@example.ma", password: PASSWORD }, { ip: "192.0.2.82", ua: UA })).ok);
  ok("delete: twice → not_found", (await caught(auth.deleteUserAccount(userCtx(sessionUser({ id: agentAcc.userId, email: "x@y.z", name: "x" }))))) === "not_found");
  const victim = await users.createAccount({ email: "spam.account@example.ma", name: "Spam", password: PASSWORD, locale: "fr" });
  ok("delete (staff): a stale step-up → step_up", (await caught(auth.deleteUserAccount(staff(adminUser, "admin", false), { userId: victim.userId, reason: "spam signups" }))) === "step_up");
  await auth.deleteUserAccount(adminCtx, { userId: victim.userId, reason: "spam signups" });
  const staffDel = await one<{ actor_kind: string; meta: string }>("SELECT actor_kind, meta FROM audit_log WHERE action = 'platform.user.deleted' AND target = ?", [victim.userId]);
  ok("delete (staff): platform.user.deleted with the reason, no e-mail", staffDel?.actor_kind === "platform" && staffDel.meta.includes("spam signups") && !staffDel.meta.includes("spam.account@"), staffDel);
  {
    // review r1.0-t2 F5: staff can't bring a deleted account back (unban, ban, reset link, 2FA reset)
    const results = [
      await caught(users.unbanUser(adminCtx, victim.userId, "appeal")),
      await caught(users.banUser(adminCtx, victim.userId, { reason: "Fraud reports" })),
      await caught(users.createPasswordResetLink(adminCtx, victim.userId, "lost access")),
      await caught(users.resetUserTwoFactor(adminCtx, victim.userId, "lost phone")),
    ];
    const still = await one<{ disabled: number; disabled_reason: string }>("SELECT disabled, disabled_reason FROM users WHERE id = ?", [victim.userId]);
    ok("delete: unban / ban / reset link / 2FA reset on a deleted account → not_found", results.every((r) => r === "not_found"), results);
    ok("delete: the deleted marker stays", still?.disabled === 1 && still.disabled_reason === "deleted", still);
    ok("delete: no reset link was issued", !(await one("SELECT id FROM password_resets WHERE user_id = ?", [victim.userId])));
  }
  {
    // review r1.0-t2 F2: today's /admin (the legacy permission option) admits only active legacy-store members and
    // staff with TOTP; a tenant account (users.role defaults to 'editor') is refused
    const LEGACY = "00000000000000000000000001";
    await c.query(
      "INSERT INTO stores (id, handle, name, mode, status, plan_id, market, currency, timezone, default_locale, brand_seed, created_at, updated_at) VALUES (?, 'legacy-one', 'Legacy One', 'landing', 'active', 'internal', 'MA', 'MAD', 'Africa/Casablanca', 'ar', 'a1b2c3d4e5f60718', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
      [LEGACY],
    );
    const legacyGuard = async (email: string, prep: (userId: string) => Promise<void>) => {
      const acc = await users.createAccount({ email, name: email.split("@")[0]!, password: PASSWORD, locale: "fr" });
      await prep(acc.userId);
      const ses = await createSession(acc.userId, { mfaPassed: true, ip: "192.0.2.90", ua: UA });
      return caught(asToken(ses.token, () => auth.requireUser({ permission: "orders.read", throwOnFail: true })));
    };
    const tenantRole = await one<{ role: string }>("SELECT role FROM users WHERE id = ?", [a.userId]);
    ok("legacy /admin: a tenant account carries the legacy column default", tenantRole?.role === "editor", tenantRole);
    ok("legacy /admin: a tenant account → forbidden", (await legacyGuard("tenant.only@example.ma", async () => undefined)) === "auth:forbidden");
    ok("legacy /admin: an owner of another store → forbidden", (await caught(asToken(ownerSession.token, () => auth.requireUser({ permission: "orders.read", throwOnFail: true })))) === "auth:forbidden");
    ok("legacy /admin: an active legacy member → in", (await legacyGuard("legacy.member@example.ma", async (id) => void (await c.query("INSERT INTO store_members (store_id, user_id, role, status) VALUES (?, ?, 'editor', 'active')", [LEGACY, id])))) === "ok");
    ok("legacy /admin: a suspended legacy member → forbidden", (await legacyGuard("legacy.suspended@example.ma", async (id) => void (await c.query("INSERT INTO store_members (store_id, user_id, role, status) VALUES (?, ?, 'editor', 'suspended')", [LEGACY, id])))) === "auth:forbidden");
    ok("legacy /admin: staff without TOTP → forbidden", (await legacyGuard("staff.nototp@example.ma", async (id) => void (await c.query("UPDATE users SET platform_role = 'support' WHERE id = ?", [id])))) === "auth:forbidden");
    ok("legacy /admin: staff with TOTP → in", (await legacyGuard("staff.totp@example.ma", async (id) => void (await c.query("UPDATE users SET platform_role = 'support', totp_enabled = 1 WHERE id = ?", [id])))) === "ok");
    ok("legacy /admin: the account guard (no permission) is unchanged for a tenant", (await caught(asToken(ownerSession.token, () => auth.requireUser({ throwOnFail: true })))) === "ok");
    const created = await auth.createUser({ email: "legacy.new@example.ma", name: "Legacy New", role: "editor", password: PASSWORD }, { id: a.userId, ip: null });
    const createdMember = await one<{ role: string; status: string }>("SELECT role, status FROM store_members WHERE store_id = ? AND user_id = ?", [LEGACY, created.id]);
    ok("legacy /admin: createUser also joins the legacy store", createdMember?.role === "editor" && createdMember.status === "active", createdMember);
  }

  /* ---------------------------------------------------------------- */
  /* mail                                                              */
  /* ---------------------------------------------------------------- */
  ok("mail: disabled without SMTP_URL", !mail.mailer().enabled && (await mail.mailer().enqueue({ to: "a@b.ma", locale: "fr", template: "invite", vars: {}, dedupeKey: "k" })).queued === false);
  const received: string[] = [];
  const smtp = net.createServer((sock) => {
    let data = false;
    let buf = "";
    sock.write("220 stub ESMTP\r\n");
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      if (data) {
        const end = buf.indexOf("\r\n.\r\n");
        if (end === -1) return;
        received.push(buf.slice(0, end));
        buf = buf.slice(end + 5);
        data = false;
        sock.write("250 queued\r\n");
      }
      let nl: number;
      while (!data && (nl = buf.indexOf("\r\n")) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        received.push(`> ${line}`);
        if (/^EHLO/i.test(line)) sock.write("250-stub\r\n250 AUTH PLAIN\r\n");
        else if (/^AUTH PLAIN/i.test(line)) sock.write("235 ok\r\n");
        else if (/^(MAIL|RCPT)/i.test(line)) sock.write("250 ok\r\n");
        else if (/^DATA/i.test(line)) {
          data = true;
          sock.write("354 go\r\n");
        } else if (/^QUIT/i.test(line)) sock.end("221 bye\r\n");
        else sock.write("500 ?\r\n");
      }
    });
  });
  await new Promise<void>((r) => smtp.listen(0, "127.0.0.1", r));
  const port = (smtp.address() as net.AddressInfo).port;
  env.SMTP_URL = `smtp://relay%40storegen.test:s3cret@127.0.0.1:${port}`;
  env.MAIL_FROM = "Store Gen <no-reply@storegen.test>";
  const m1 = await mail.mailer().enqueue({ to: "salma@gmail.com", locale: "fr", template: "invite", vars: { inviterName: "Karim", storeName: "Atlas Argan", role: "agent", url: "http://localhost:3451/invite/x", expiresAt: "31/10" }, dedupeKey: "invite:1" });
  await mail.settleMail();
  const message = received.find((l) => l.includes("Subject:")) ?? "";
  const subject = /Subject: =\?UTF-8\?B\?([^?]+)\?=/.exec(message)?.[1];
  ok("mail: sent through the relay with AUTH", m1.queued && received.some((l) => l.startsWith("> AUTH PLAIN")) && received.some((l) => l === "> RCPT TO:<salma@gmail.com>"), received.filter((l) => l.startsWith(">")));
  ok("mail: the French subject", Buffer.from(subject ?? "", "base64").toString("utf8") === "Karim vous invite à rejoindre Atlas Argan", subject);
  ok("mail: the same dedupe key → duplicate", (await mail.mailer().enqueue({ to: "salma@gmail.com", locale: "fr", template: "invite", vars: {}, dedupeKey: "invite:1" })).queued === false);
  ok("mail: a bad address → suppressed", JSON.stringify(await mail.mailer().enqueue({ to: "not an address", locale: "fr", template: "invite", vars: {}, dedupeKey: "invite:2" })) === JSON.stringify({ queued: false, reason: "suppressed" }));
  delete env.SMTP_URL;
  delete env.MAIL_FROM;
  await new Promise<void>((r) => smtp.close(() => r()));
  await sleep(10);
}

main()
  .catch((err: unknown) => {
    failures.push(`crashed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  })
  .finally(() => {
    for (const f of failures) console.error(`  ✗ ${f}`);
    console.log(failures.length ? `identity selftest: ${pass} passed, ${failures.length} failed` : `✓ identity selftest: all ${pass} checks passed`);
    process.exit(failures.length ? 1 : 0);
  });

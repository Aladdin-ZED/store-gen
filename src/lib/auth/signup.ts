import "server-only";
/**
 * Signup and "Create another store" (docs/STORE-SAAS.md §B.2, D9, D69; platform.md PLA-§3.1). `signupAction`
 * (src/app/(public)/signup/actions.ts) runs
 *
 *   return publicAction("signup", (ctx) => signupAccount(form, ctx), { turnstile: "challenge", burst: "signup", token });
 *
 * so steps 1-2 of §B.2 (`burstLimit`, `p:signup:ip` 5/h) and the same-origin check have passed when this runs:
 *
 *   0. `signups_enabled` (kill switch, §H.8) and the effective mode (D9): closed → closed; waitlist → a waitlist row
 *   2. the human check: a verified token in `approval` / `open` (a gate, D69: anything else is refused with
 *      `challenge`); in `invite` mode it is only scored
 *   3. the fields (account, store, handle, market, mode, invite code, legal acceptance), all at once
 *   4. scrypt through the semaphore
 *   5. `scoreSignup()` (2 s budget)
 *   6. the daily sandbox ceiling when the store would start `pending`: a `QuotaError` → a waitlist row with
 *      `source = "cap:<day>"`, no account
 *   7. one transaction, `INSERT users` first, then the store, the owner membership, the review row, the identity
 *      links, the legal acceptances and the invite code's conditional consumption (SEC-24); a duplicate e-mail or
 *      handle answers the one generic sentence; a rollback after step 6 refunds the day's slot (rev 5, CRIT2-12)
 *   8. a full session (tenants have no mandatory 2FA); the action sets the cookie and opens `/app/<handle>`
 *
 * Auto-approval: an invite code with `auto_approve`, or `autoApprove()` of PLA-§3.4.1 (P1 owns the function with the
 * score; the R1.0 score is the fixed `review` band, so only codes auto-approve until P1 merges).
 */
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { identityLinks, legalAcceptances, legalDocuments, signupReviews, storeMembers, waitlist } from "@/lib/db/schema";
import { mailer } from "@/lib/mail";
import { errorSummary } from "@/lib/orders/log";
import { notify } from "@/lib/platform/notify";
import { scoreSignup, type SignupRiskInput, type SignupScore } from "@/lib/platform/signup-risk";
import { hashIp } from "@/lib/security/crypto";
import type { PlatformSetting } from "@/lib/settings/keys/platform";
import { periodOf } from "@/lib/tenancy/entitlement-keys";
import { QuotaError, chargePlatformUsage, refundPlatformUsage } from "@/lib/tenancy/entitlements";
import { STORE_MODES, selectableStoreModes, type StoreMode } from "@/lib/tenancy/mode";
import { storeValues } from "@/lib/tenancy/sql";
import type { MessageKey, UserCtx, WriteScope } from "@/lib/tenancy/types";
import { platformOrigin } from "@/lib/urls";
import { limits } from "./attempts";
import { PLATFORM_TIMEZONE } from "./config";
import { AuthRefusal, FieldsError } from "./errors";
import { signupIdentityLinks } from "./identity";
import { consumeInviteTx, findUsableInvite, normalizeInviteCode, type UsableInvite } from "./platform-invites";
import { effectiveSignupMode, isT1Stub, killSwitchTripped, platformSetting, type EffectiveSignupMode, type SignupMode } from "./platform-config";
import type { PublicActionCtx } from "./public-action";
import { createSession, setSessionLastStore, type IssuedSession } from "./session";
import { auditStoreCreated, cleanStoreName, insertStoreTx, newHandleProblem, type Tx } from "./stores";
import { riskTurnstileState, type HumanCheck } from "./turnstile";
import { ACCOUNT_REFUSED, EmailInput, insertAccount, isDuplicate, parseAccountPhone, prepareAccount, type AccountLocale } from "./users";
import { passwordProblem } from "./password";
import type { CountryCode } from "libphonenumber-js/max";

/** The raw form (the action reads FormData into it); every semantic rule is checked below, all fields at once. */
export const SignupFormInput = z.object({
  name: z.string().max(400).default(""),
  email: z.string().max(400).default(""),
  password: z.string().max(1024).default(""),
  phone: z.string().max(64).optional(),
  storeName: z.string().max(400).default(""),
  handle: z.string().max(64).default(""),
  mode: z.enum(STORE_MODES).default("landing"),
  /** "Tell me when it's ready" on a Coming-soon mode card (PD30) */
  modeInterest: z.enum(["store", "both"]).nullable().optional(),
  market: z.string().max(8).optional(),
  inviteCode: z.string().max(64).optional(),
  acceptLegal: z.boolean().default(false),
  /** focus time inside the form across both steps; clamped to 0 … 30 min */
  formMs: z.number().nullable().optional(),
  locale: z.enum(["ar", "fr", "en"]).default("fr"),
  /** waitlist mode: "What do you sell?" */
  note: z.string().max(600).optional(),
});
export type SignupForm = z.input<typeof SignupFormInput>;

export type SignupOutcome =
  | { kind: "created"; userId: string; storeId: string; handle: string; storeStatus: "pending" | "active"; session: IssuedSession }
  | { kind: "waitlisted"; reason: "mode" | "capped" }
  | { kind: "closed" };

const FORM_MS_MAX = 30 * 60_000;

/** The day of the sandbox ceiling ("YYYY-MM-DD" in the platform's time zone). */
export function platformDay(at: Date = new Date()): string {
  return periodOf("day", at, PLATFORM_TIMEZONE);
}

/* ------------------------------------------------------------------ */
/* Waitlist                                                            */
/* ------------------------------------------------------------------ */

/** One row per e-mail (`wl_email_uq`, INSERT IGNORE): joining twice answers exactly like joining once. */
async function joinWaitlist(input: { email: string; phone: string | null; note?: string; locale: AccountLocale; market: string | null; modeInterest: StoreMode | null; source: string | null; ip: string }): Promise<void> {
  let ipHash: string | null = null;
  try {
    ipHash = hashIp(input.ip);
  } catch {
    ipHash = null;
  }
  const note = input.note?.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) || null;
  await db
    .insert(waitlist)
    .ignore()
    .values({
      id: newId(),
      emailNorm: input.email,
      phone: input.phone,
      note,
      locale: input.locale,
      ipHash,
      source: input.source,
      market: input.market,
      modeInterest: input.modeInterest,
    });
}

async function waitlistFromForm(form: z.output<typeof SignupFormInput>, ctx: PublicActionCtx, source: string | null, setting: PlatformSetting): Promise<void> {
  const email = EmailInput.safeParse(form.email);
  const fields: Record<string, MessageKey> = {};
  if (!email.success) fields.email = "auth.email_invalid";
  let phone: string | null = null;
  try {
    phone = parseAccountPhone(form.phone, marketCountry(form.market, setting));
  } catch (err) {
    if (!(err instanceof FieldsError)) throw err;
    Object.assign(fields, err.fields);
  }
  if (Object.keys(fields).length || !email.success) throw new FieldsError(fields);
  await joinWaitlist({
    email: email.data,
    phone,
    note: form.note,
    locale: form.locale,
    market: allowedMarket(form.market, setting),
    modeInterest: form.modeInterest ?? null,
    source,
    ip: ctx.ip,
  });
}

/* ------------------------------------------------------------------ */
/* Fields                                                              */
/* ------------------------------------------------------------------ */

const allowedMarket = (market: string | undefined, setting: PlatformSetting): string | null => {
  const value = (market ?? setting.signup.allowedMarkets[0] ?? "MA").trim().toUpperCase();
  return setting.signup.allowedMarkets.includes(value) ? value : null;
};

const marketCountry = (market: string | undefined, setting: PlatformSetting): CountryCode => (allowedMarket(market, setting) ?? "MA") as CountryCode;

interface StoreFields {
  storeName: string;
  handle: string;
  mode: StoreMode;
  market: string;
}

/** The store half of the form; problems go into `fields`. */
async function checkStoreFields(form: { storeName: string; handle: string; mode: StoreMode; market?: string }, setting: PlatformSetting, fields: Record<string, MessageKey>): Promise<StoreFields | null> {
  const storeName = cleanStoreName(form.storeName);
  if (!storeName) fields.storeName = "auth.signup.store_name_invalid";
  const handle = form.handle.trim().toLowerCase();
  const handleProblem = await newHandleProblem(handle, setting);
  if (handleProblem) fields.handle = handleProblem;
  if (!selectableStoreModes().includes(form.mode)) fields.mode = "auth.signup.mode_unavailable";
  const market = allowedMarket(form.market, setting);
  if (!market) fields.market = "auth.signup.market_unavailable";
  return storeName && !handleProblem && market && selectableStoreModes().includes(form.mode) ? { storeName, handle, mode: form.mode, market } : null;
}

/** The published ToS, Privacy and AUP in `locale` (else English, else any), newest version of each. */
async function currentLegalDocuments(locale: AccountLocale): Promise<{ id: string; kind: string }[]> {
  const rows = await db
    .select({ id: legalDocuments.id, kind: legalDocuments.kind, locale: legalDocuments.locale, version: legalDocuments.version })
    .from(legalDocuments)
    .where(and(eq(legalDocuments.status, "published"), inArray(legalDocuments.kind, ["tos", "privacy", "aup"])));
  const best = new Map<string, { id: string; rank: number; version: number }>();
  for (const r of rows) {
    const rank = r.locale === locale ? 2 : r.locale === "en" ? 1 : 0;
    const current = best.get(r.kind);
    if (!current || rank > current.rank || (rank === current.rank && r.version > current.version)) best.set(r.kind, { id: r.id, rank, version: r.version });
  }
  return [...best].map(([kind, v]) => ({ id: v.id, kind }));
}

/* ------------------------------------------------------------------ */
/* Score and approval                                                  */
/* ------------------------------------------------------------------ */

const SCORE_BUDGET_MS = 2_500;

/** Hold-class flags (PLA-§3.4.1): each keeps a signup out of auto-approval in every mode. */
const HOLD_CLASS: ReadonlySet<string> = new Set(["linked_banned", "brand_exact", "offensive_term", "bot_ua", "market_not_allowed", "dup_device"]);

/** The safe signals of an unfinished score: the review band, `partial` (a lookup ran past the budget). */
function fallbackScore(input: SignupRiskInput): SignupScore {
  return {
    score: 0,
    flags: [],
    band: "review",
    signals: {
      v: 1,
      flags: [],
      band: "review",
      inputs: {
        emailDomain: (input.email.split("@")[1] ?? "").trim().toLowerCase().slice(0, 120),
        phoneCountry: null,
        market: input.market,
        mode: input.mode,
        ...(input.modeInterest ? { modeInterest: input.modeInterest } : {}),
        locale: input.locale,
        uaLabel: "",
        turnstile: input.turnstile,
        formMs: input.formMs,
        via: input.via,
      },
      cluster: { users: 0, banned: 0, kinds: [] },
      partial: true,
      ms: SCORE_BUDGET_MS,
    },
  };
}

/** `scoreSignup` within its budget; a slow or failing scorer never blocks a signup (the review band, `partial`). */
async function scoreWithin(input: SignupRiskInput): Promise<SignupScore> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      scoreSignup(input),
      new Promise<SignupScore>((resolve) => {
        timer = setTimeout(() => resolve(fallbackScore(input)), SCORE_BUDGET_MS);
      }),
    ]);
  } catch (err) {
    console.error("[signup] score failed:", errorSummary(err));
    return fallbackScore(input);
  } finally {
    clearTimeout(timer);
  }
}

/** PLA-§3.4.1 `autoApprove(mode, s, ctx)`: the reason code of an auto-approval, or null (the store starts pending). */
function autoApproval(mode: SignupMode, s: SignupScore, ctx: { trustedCreator: boolean; setting: PlatformSetting["signup"] }): "auto_open" | "auto_trusted" | null {
  if (s.band !== "fast" || s.flags.some((f) => HOLD_CLASS.has(f.code))) return null;
  const human = s.signals.inputs.turnstile;
  if (mode === "open") return human === "ok" ? "auto_open" : null;
  if (mode === "approval" && ctx.trustedCreator && ctx.setting.trustedCreatorAutoApprove) return human === "ok" || human === "off" ? "auto_trusted" : null;
  return null;
}

/* ------------------------------------------------------------------ */
/* The daily sandbox ceiling (D69)                                     */
/* ------------------------------------------------------------------ */

let ceilingStubWarned = false;

/**
 * One of the day's `pending_stores` slots. false = no slot was taken (T1's counter is not merged yet: no ceiling,
 * logged once). A full day throws QuotaError.
 */
async function chargePendingSlot(day: string, limit: number): Promise<boolean> {
  try {
    await chargePlatformUsage("pending_stores", day, 1, { limit });
    return true;
  } catch (err) {
    if (!isT1Stub(err)) throw err;
    if (!ceilingStubWarned) {
      ceilingStubWarned = true;
      console.warn("[signup] the daily sandbox ceiling is not enforced until T1's platform usage counter merges");
    }
    return false;
  }
}

async function refundPendingSlot(day: string): Promise<void> {
  try {
    await refundPlatformUsage("pending_stores", day, 1);
  } catch (err) {
    console.error("[signup] pending_stores refund failed:", errorSummary(err));
  }
}

/** The console counter of a capped day (`staff.signup_capped`, once per day through the dedupe key). */
async function signalCapped(day: string): Promise<void> {
  await notify({ audience: "platform_staff", minRole: "admin" }, "staff.signup_capped", { day }, { dedupeKey: `signup_capped:${day}`, severity: "warn", link: "/admin/settings/signup" });
}

/* ------------------------------------------------------------------ */
/* Rows of a new store                                                 */
/* ------------------------------------------------------------------ */

interface ReviewRow {
  userId: string;
  score: SignupScore;
  approved: "auto_invite" | "auto_open" | "auto_trusted" | null;
}

async function insertReviewTx(tx: Tx, scope: WriteScope, row: ReviewRow): Promise<void> {
  const now = new Date();
  await tx.insert(signupReviews).values(
    storeValues(scope, {
      id: newId(),
      userId: row.userId,
      kind: "signup" as const,
      score: Math.max(0, Math.min(100, Math.round(row.score.score))),
      signals: row.score.signals,
      band: row.score.band,
      status: row.approved ? ("approved" as const) : ("pending" as const),
      ...(row.approved ? { decidedAt: now, reasonCode: row.approved } : {}),
    }),
  );
}

/* ------------------------------------------------------------------ */
/* The platform state a signup reads                                   */
/* ------------------------------------------------------------------ */

/** What a signup reads from the platform; production always reads it, the DB selftest injects it. */
export interface SignupEnv {
  /** `signups_enabled` is off (§H.8) */
  killed: boolean;
  mode: EffectiveSignupMode;
  setting: PlatformSetting;
  /** the day's sandbox slot: true = charged, false = no counter to charge; throws QuotaError when the day is full */
  chargeSlot(day: string, limit: number): Promise<boolean>;
  refundSlot(day: string): Promise<void>;
}

async function signupEnv(over: Partial<SignupEnv>): Promise<SignupEnv> {
  return {
    killed: over.killed ?? (await killSwitchTripped("signups_enabled")),
    mode: over.mode ?? (await effectiveSignupMode()),
    setting: over.setting ?? (await platformSetting()),
    chargeSlot: over.chargeSlot ?? chargePendingSlot,
    refundSlot: over.refundSlot ?? refundPendingSlot,
  };
}

/* ------------------------------------------------------------------ */
/* signupAccount                                                       */
/* ------------------------------------------------------------------ */

export async function signupAccount(rawForm: SignupForm, ctx: PublicActionCtx, envOverrides: Partial<SignupEnv> = {}): Promise<SignupOutcome> {
  const form = SignupFormInput.parse(rawForm);
  const env = await signupEnv(envOverrides);
  if (env.killed) return { kind: "closed" };
  const mode = env.mode.mode;
  if (mode === "closed") return { kind: "closed" };
  const setting = env.setting;
  if (mode === "waitlist") {
    await waitlistFromForm(form, ctx, null, setting);
    return { kind: "waitlisted", reason: "mode" };
  }

  // 2. the human check: a gate where anyone may sign up, a score where a code already gates
  const human: HumanCheck = await ctx.turnstile();
  if ((mode === "approval" || mode === "open") && human !== "ok") throw new AuthRefusal("challenge", "auth.signup.challenge");

  // 3. every field at once (the account half without hashing first)
  const fields: Record<string, MessageKey> = {};
  const email = EmailInput.safeParse(form.email);
  if (!email.success) fields.email = "auth.email_invalid";
  const store = await checkStoreFields(form, setting, fields);
  if (!form.password) fields.password = "auth.password.too_short";
  else {
    const problem = passwordProblem(form.password, email.success ? email.data : null);
    if (problem) fields.password = `auth.password.${problem}`;
  }
  let invite: UsableInvite | null = null;
  if (mode === "invite") {
    if (!normalizeInviteCode(form.inviteCode)) fields.inviteCode = "auth.signup.invite_invalid";
    else if (!(invite = await findUsableInvite(form.inviteCode))) fields.inviteCode = "auth.signup.invite_invalid";
  }
  const legal = await currentLegalDocuments(form.locale);
  if (legal.length > 0 && setting.legal.requireAcceptance && !form.acceptLegal) fields.acceptLegal = "auth.signup.legal_required";

  // 4. the account (name, phone and the policy again) and its scrypt hash
  let account: Awaited<ReturnType<typeof prepareAccount>> | null = null;
  try {
    if (Object.keys(fields).length === 0) {
      account = await prepareAccount({ email: form.email, name: form.name, password: form.password, phone: form.phone, locale: form.locale }, { phoneCountry: marketCountry(form.market, setting) });
    }
  } catch (err) {
    if (!(err instanceof FieldsError)) throw err;
    Object.assign(fields, err.fields);
  }
  if (Object.keys(fields).length || !account || !store || !email.success) throw new FieldsError(fields);
  const acct = account;

  // 5. the score
  const formMs = typeof form.formMs === "number" && Number.isFinite(form.formMs) ? Math.max(0, Math.min(FORM_MS_MAX, Math.round(form.formMs))) : null;
  const score = await scoreWithin({
    email: acct.email,
    phoneE164: acct.phone ?? null,
    name: acct.name,
    storeName: store.storeName,
    handle: store.handle,
    ip: ctx.ip,
    ua: ctx.ua || null,
    deviceId: ctx.deviceId,
    turnstile: riskTurnstileState(human),
    formMs,
    market: store.market,
    mode: store.mode,
    ...(form.modeInterest ? { modeInterest: form.modeInterest } : {}),
    locale: form.locale,
    via: invite ? "invite_code" : "signup",
    ...(invite?.label ? { inviteLabel: invite.label } : {}),
  });
  const approved = invite?.autoApprove ? "auto_invite" : autoApproval(mode, score, { trustedCreator: false, setting: setting.signup });
  const status = approved ? ("active" as const) : ("pending" as const);

  // 6. the day's sandbox slot
  const day = platformDay();
  let charged = false;
  if (status === "pending") {
    try {
      charged = await env.chargeSlot(day, setting.signup.pendingStoresPerDay);
    } catch (err) {
      if (!(err instanceof QuotaError)) throw err;
      await joinWaitlist({ email: acct.email, phone: acct.phone ?? null, locale: form.locale, market: store.market, modeInterest: form.modeInterest ?? null, source: `cap:${day}`, ip: ctx.ip });
      await signalCapped(day);
      return { kind: "waitlisted", reason: "capped" };
    }
  }

  // 7. one transaction
  const userId = acct.id;
  let storeId: string;
  try {
    storeId = await db.transaction(async (tx) => {
      await insertAccount(acct, tx);
      const created = await insertStoreTx(tx, { name: store.storeName, handle: store.handle, mode: store.mode, status, market: store.market, createdBy: userId }, setting.newStore);
      await insertReviewTx(tx, created.scope, { userId, score, approved });
      const links = signupIdentityLinks({ email: acct.email, phoneE164: acct.phone ?? null, ip: ctx.ip, deviceId: ctx.deviceId });
      await tx
        .insert(identityLinks)
        .ignore()
        .values(links.map((l) => ({ userId, kind: l.kind, valueHash: l.valueHash, source: "signup" as const })));
      if (legal.length) {
        let ipHash: string | null = null;
        try {
          ipHash = hashIp(ctx.ip);
        } catch {
          ipHash = null;
        }
        await tx
          .insert(legalAcceptances)
          .values(legal.map((d) => ({ userId, storeId: created.scope.storeId, documentId: d.id, ipHash, ua: ctx.ua || null, context: "signup" as const })));
      }
      if (invite && !(await consumeInviteTx(tx, invite.id))) throw new FieldsError({ inviteCode: "auth.signup.invite_invalid" });
      return created.storeId;
    });
  } catch (err) {
    if (charged) await env.refundSlot(day);
    if (isDuplicate(err)) throw new AuthRefusal("invalid", ACCOUNT_REFUSED); // a handle taken meanwhile: the same sentence
    throw err;
  }

  // 8. after commit: the velocity counter, the audit rows, the session
  await limits.signupNet(ctx.ip).catch((err: unknown) => console.error("[signup] velocity counter:", errorSummary(err)));
  await audit("auth.user.created", { userId, target: userId, meta: { via: invite ? "invite_code" : "signup" }, ip: ctx.ip });
  await auditStoreCreated(storeId, userId, ctx.ip, { via: invite ? "invite_code" : "signup", status, mode: store.mode, ...(approved ? { approved } : {}) });
  const session = await createSession(userId, { mfaPassed: true, ip: ctx.ip, ua: ctx.ua, lastStoreId: storeId });
  void mailer()
    .enqueue({ to: acct.email, locale: form.locale, template: "signup_received", vars: { storeName: store.storeName, url: `${platformOrigin()}/app/${store.handle}` }, storeId, dedupeKey: `signup_received:${storeId}` })
    .catch((err: unknown) => console.error("[signup] mail:", errorSummary(err)));
  return { kind: "created", userId, storeId, handle: store.handle, storeStatus: status, session };
}

/* ------------------------------------------------------------------ */
/* /app/new: another store for a signed-in account                     */
/* ------------------------------------------------------------------ */

export const NewStoreFormInput = z.object({
  storeName: z.string().max(400).default(""),
  handle: z.string().max(64).default(""),
  mode: z.enum(STORE_MODES).default("landing"),
  modeInterest: z.enum(["store", "both"]).nullable().optional(),
  market: z.string().max(8).optional(),
  formMs: z.number().nullable().optional(),
});
export type NewStoreForm = z.input<typeof NewStoreFormInput>;

/** An active owner membership anywhere (the invite-mode rule of /app/new). */
async function ownsAStore(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ storeId: storeMembers.storeId })
    .from(storeMembers)
    .where(and(eq(storeMembers.userId, userId), eq(storeMembers.role, "owner"), eq(storeMembers.status, "active"))) // tenancy: platform the account's own memberships (PLA-§3.1)
    .limit(1);
  return !!row;
}

export type NewStoreOutcome = { kind: "created"; storeId: string; handle: string; storeStatus: "pending" | "active" } | { kind: "closed" } | { kind: "capped" };

/**
 * `/app/new` (PLA-§22.2, §B.1): `p:store:create:<userId>` 3/day, the kill switch, the score (`via: "app_new"`), the
 * day's sandbox slot when the store starts pending, then the store, its owner and its review row in one transaction.
 * The session's last store becomes the new one.
 */
export async function createAdditionalStore(ctx: UserCtx, rawForm: NewStoreForm, req: { ua: string; deviceId: string | null }, envOverrides: Partial<SignupEnv> = {}): Promise<NewStoreOutcome> {
  const form = NewStoreFormInput.parse(rawForm);
  const ip = ctx.actor.ip ?? "0.0.0.0";
  const env = await signupEnv(envOverrides);
  if (env.killed) return { kind: "closed" };
  const effective = env.mode;
  // the PLA-§3.1 mode table (review r1.0-t2 F4): closed = console invites only, waitlist = no store; in invite mode an
  // account that owns no store needs a platform code (the signup form), so only existing owners open more here
  if (effective.mode === "closed" || effective.mode === "waitlist") return { kind: "closed" };
  if (effective.mode === "invite" && !(await ownsAStore(ctx.user.id))) return { kind: "closed" };
  if (!(await limits.storeCreate(ctx.user.id)).ok) throw new AuthRefusal("rate_limited");
  const setting = env.setting;

  const fields: Record<string, MessageKey> = {};
  const store = await checkStoreFields(form, setting, fields);
  if (Object.keys(fields).length || !store) throw new FieldsError(fields);

  const formMs = typeof form.formMs === "number" && Number.isFinite(form.formMs) ? Math.max(0, Math.min(FORM_MS_MAX, Math.round(form.formMs))) : null;
  const score = await scoreWithin({
    email: ctx.user.email,
    phoneE164: null,
    name: ctx.user.name,
    storeName: store.storeName,
    handle: store.handle,
    ip,
    ua: req.ua || null,
    deviceId: req.deviceId,
    turnstile: "off",
    formMs,
    market: store.market,
    mode: store.mode,
    ...(form.modeInterest ? { modeInterest: form.modeInterest } : {}),
    locale: ctx.user.locale ?? "fr",
    via: "app_new",
    existingUserId: ctx.user.id,
  });
  // P1's trustedCreator() signal (PD31) is not in R1.0: no creator is trusted yet
  const approved = autoApproval(effective.mode, score, { trustedCreator: false, setting: setting.signup });
  const status = approved ? ("active" as const) : ("pending" as const);

  const day = platformDay();
  let charged = false;
  if (status === "pending") {
    try {
      charged = await env.chargeSlot(day, setting.signup.pendingStoresPerDay);
    } catch (err) {
      if (!(err instanceof QuotaError)) throw err;
      await signalCapped(day);
      return { kind: "capped" };
    }
  }

  let storeId: string;
  try {
    storeId = await db.transaction(async (tx) => {
      const created = await insertStoreTx(tx, { name: store.storeName, handle: store.handle, mode: store.mode, status, market: store.market, createdBy: ctx.user.id }, setting.newStore);
      await insertReviewTx(tx, created.scope, { userId: ctx.user.id, score, approved });
      return created.storeId;
    });
  } catch (err) {
    if (charged) await env.refundSlot(day);
    if (isDuplicate(err)) throw new FieldsError({ handle: "auth.signup.handle_unavailable" });
    throw err;
  }
  await auditStoreCreated(storeId, ctx.user.id, ctx.actor.ip, { via: "app_new", status, mode: store.mode, ...(approved ? { approved } : {}) });
  if (!ctx.user.sessionId.startsWith("ctx:")) await setSessionLastStore(ctx.user.sessionId, storeId);
  return { kind: "created", storeId, handle: store.handle, storeStatus: status };
}

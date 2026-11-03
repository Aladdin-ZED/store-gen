import "server-only";
/**
 * The Domains view's logic (platform.md PLA-§16, OS-06; core §C.10, §H.7, D9, D44 rev 3, PD82). Status facts from the
 * environment, the domain-move checklist kept in `platform.domainMove`, the server-runnable checks and the re-render
 * fan-out.
 *
 *   await domainStatus(ctx);                                  // console.read: env facts, non-secret values only
 *   await getDomainMove(ctx);                                 // the checklist with its state
 *   await markDomainStep(ctx, { stepId, done: true });        // domains.manage: date and staff, audit platform.domains.step
 *   await runDomainCheck(ctx, { id: "V12", requestHost });    // the check's answers; a pass is recorded
 *   await requestRerenderAll(ctx, opId);                      // domains.manage ↑: returns at once, the job fans out
 *
 * Secrets never leave this file: `EDGE_KEY` and `EDGE_KEY_PREV` read "set" / "not set". The checks that do not apply
 * yet answer without any network call: V3, V7, V8, V10 while S mode is off ("S mode is off"), V12 while `ADMIN_HOST` is
 * unset ("ADMIN_HOST not set (expected before the move)"). The network checks reach only the platform's own hosts
 * from the environment, never an address a request sent (5 s each, redirects not followed).
 *
 * The checklist state lives in the `platform` setting (survives restarts and deploys); a change reads the row fresh
 * under the `domain-move` lock, so two staff members marking steps at once never lose one. "Re-render all live
 * pages" writes a request (`cron_cursors` row `platform.rerender:request`); the `platform.rerender` job walks the
 * stores in slices and calls P8's `enqueueRenders(scope, "all-live", "address")` per store (PLA-§16.2: the request
 * returns at once). The pure rules and texts are ./domain-move-rules.ts.
 */
import { connect as tlsConnect, type PeerCertificate } from "node:tls";
import { and, asc, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import { auditFrom } from "@/lib/audit";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { checkPlatformTurnstile } from "@/lib/auth/turnstile";
import { platformTurnstileKeys } from "@/lib/auth/platform-config";
import { db } from "@/lib/db/client";
import { platformLock, withNamedLock } from "@/lib/db/locks";
import { stores } from "@/lib/db/schema";
import { adminHostName, edgeKeyProblem, legacyPlatformHosts, platformHost, storeRootDomain, subdomainMode } from "@/lib/edge/env";
import type { EffectiveHost } from "@/lib/edge/host";
import { enqueueRenders, renderSummary } from "@/lib/jobs/renders";
import type { JobCtx, JobResult } from "@/lib/jobs/runner";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import { trustedProxyHops } from "@/lib/security/ip";
import { getPlatformSetting, setPlatformSetting } from "@/lib/settings";
import type { PlatformSetting } from "@/lib/settings/keys/platform";
import type { PlatformCtx, StoreStatus } from "@/lib/tenancy/types";
import {
  ADMIN_HOST_TEXT,
  CHECK_NOTE_MAX,
  DOMAIN_CHECKS,
  DOMAIN_STEPS,
  SKIP_TEXT,
  adminHostLine,
  allChecksPassed,
  isDomainCheck,
  isDomainStep,
  noteOf,
  signupDefaultFor,
  type AdminHostLine,
  type DomainCheckId,
  type DomainCheckResult,
  type DomainCheckView,
  type DomainStepView,
} from "./domain-move-rules";
import { readJobState, writeJobState } from "./job-state";
import { recordPlatformError } from "./log";
import { firstRun } from "./op-once";
import { cleanText } from "./queue-rules";

function requireRead(ctx: PlatformCtx): void {
  if (!ctx.can("console.read")) throw new AuthRefusal("forbidden");
}

function requireManage(ctx: PlatformCtx, opts: { stepUp?: boolean } = {}): void {
  if (!ctx.can("domains.manage")) throw new AuthRefusal("forbidden");
  if (opts.stepUp && !ctx.stepUpFresh) throw new AuthRefusal("step_up");
}

/* ------------------------------------------------------------------ */
/* The status card (PLA-§16.1)                                         */
/* ------------------------------------------------------------------ */

export interface DomainStatus {
  /** "P only" (path mode) or "S on" (store subdomains) */
  sMode: boolean;
  platformHost: string | null;
  storeRootDomain: string | null;
  legacyHosts: string[];
  behindCloudflare: boolean;
  trustedProxyHops: number;
  adminHost: string | null;
  adminHostLine: AdminHostLine;
  adminHostText: string;
  /** set / not set only: the values are secrets */
  edgeKey: "set" | "not_set";
  /** set but refused by the app (too short, a template value, APP_SECRET): S mode stays off */
  edgeKeyUsable: boolean;
  edgeKeyPrev: "set" | "not_set";
  /** the stored mode (null = derived) and the D9 default the addresses imply */
  signup: { stored: string | null; defaultMode: "invite" | "approval"; turnstile: boolean; v13Passed: boolean };
}

const setOrNot = (raw: string | undefined): "set" | "not_set" => (edgeKeyProblem(raw) === "unset" ? "not_set" : "set");

/** The env facts behind the card, no secret value: computed per call (env is read at runtime, restart after a change). */
export async function domainStatus(ctx: PlatformCtx): Promise<DomainStatus> {
  requireRead(ctx);
  const [setting, turnstile] = await Promise.all([getPlatformSetting("platform"), platformTurnstileKeys()]);
  const sMode = subdomainMode();
  const adminHost = adminHostName();
  const line = adminHostLine({ sMode, adminHost });
  const v13Passed = Boolean(setting.domainMove.checks["V13"]?.passedAt);
  return {
    sMode,
    platformHost: platformHost(),
    storeRootDomain: storeRootDomain(),
    legacyHosts: [...legacyPlatformHosts()],
    behindCloudflare: process.env.BEHIND_CLOUDFLARE === "1",
    trustedProxyHops: trustedProxyHops(),
    adminHost,
    adminHostLine: line,
    adminHostText: ADMIN_HOST_TEXT[line],
    edgeKey: setOrNot(process.env.EDGE_KEY),
    edgeKeyUsable: edgeKeyProblem(process.env.EDGE_KEY) === null,
    edgeKeyPrev: setOrNot(process.env.EDGE_KEY_PREV),
    signup: { stored: setting.signup.mode, defaultMode: signupDefaultFor({ sMode, v13Passed, turnstile: turnstile !== null }), turnstile: turnstile !== null, v13Passed },
  };
}

/* ------------------------------------------------------------------ */
/* The checklist (PLA-§16.3)                                           */
/* ------------------------------------------------------------------ */

export interface DomainMoveView {
  steps: DomainStepView[];
  checks: DomainCheckView[];
  /** every V check passed: the banner "Switch sign-up to approval" */
  allPassed: boolean;
}

type DomainMoveState = PlatformSetting["domainMove"];

function viewOf(state: DomainMoveState): DomainMoveView {
  return {
    steps: DOMAIN_STEPS.map((s) => {
      const done = state.steps[s.id];
      return { ...s, done: done ? { at: done.doneAt, by: done.by } : null };
    }),
    checks: DOMAIN_CHECKS.map((c) => {
      const passed = state.checks[c.id];
      return { ...c, passed: passed ? { at: passed.passedAt, by: passed.by, note: passed.note } : null };
    }),
    allPassed: allChecksPassed(state.checks),
  };
}

/** `console.read`: the checklist and the checks with their recorded state. */
export async function getDomainMove(ctx: PlatformCtx): Promise<DomainMoveView> {
  requireRead(ctx);
  return viewOf((await getPlatformSetting("platform")).domainMove);
}

/** One read-modify-write of `platform.domainMove`, fresh, under the platform lock. */
async function updateDomainMove(ctx: PlatformCtx, change: (state: DomainMoveState) => boolean): Promise<{ changed: boolean; state: DomainMoveState }> {
  const res = await withNamedLock(platformLock("domain-move"), 5, async () => {
    const setting = await getPlatformSetting("platform", { fresh: true });
    const state: DomainMoveState = { steps: { ...setting.domainMove.steps }, checks: { ...setting.domainMove.checks } };
    if (!change(state)) return { changed: false, state };
    await setPlatformSetting("platform", { ...setting, domainMove: state }, { id: ctx.user.id, ip: ctx.actor.ip, kind: "platform" });
    return { changed: true, state };
  });
  if (!res.ran) throw new AuthRefusal("busy");
  return res.value;
}

const StepInput = z.object({ stepId: z.string().max(40), done: z.boolean() });

/**
 * `domains.manage` (PLA-§16.3 "Mark done"): records the date and the staff member, or clears the mark. Audit
 * `platform.domains.step { stepId, done }`. A mark already in that state changes nothing.
 */
export async function markDomainStep(ctx: PlatformCtx, input: unknown, now: Date = new Date()): Promise<{ changed: boolean }> {
  requireManage(ctx);
  const v = StepInput.parse(input);
  if (!isDomainStep(v.stepId)) throw new FieldsError({ stepId: "console.domains.step_unknown" });
  const { changed } = await updateDomainMove(ctx, (state) => {
    const has = Boolean(state.steps[v.stepId]);
    if (has === v.done) return false;
    if (v.done) state.steps[v.stepId] = { doneAt: now.toISOString(), by: ctx.user.id };
    else delete state.steps[v.stepId];
    return true;
  });
  if (changed) await auditFrom(ctx, "platform.domains.step", { target: v.stepId, meta: { stepId: v.stepId, done: v.done } });
  return { changed };
}

const CheckMarkInput = z.object({ id: z.string().max(4), passed: z.boolean(), note: z.string().max(CHECK_NOTE_MAX * 2).nullish() });

/**
 * `domains.manage`: a manual check (V1, V2, V4, V5, V6, V9, V11) marked passed with its note, or unmarked. A runnable
 * check is recorded by its run only (`runDomainCheck`), so a pass is never typed in for it. Audit
 * `platform.domains.step { check, passed }`.
 */
export async function markDomainCheck(ctx: PlatformCtx, input: unknown, now: Date = new Date()): Promise<{ changed: boolean }> {
  requireManage(ctx);
  const v = CheckMarkInput.parse(input);
  if (!isDomainCheck(v.id)) throw new FieldsError({ id: "console.domains.check_unknown" });
  const def = DOMAIN_CHECKS.find((c) => c.id === v.id)!;
  if (def.runnable && v.passed) throw new AuthRefusal("invalid", "console.domains.check_run_it");
  const note = v.note ? cleanText(v.note).slice(0, CHECK_NOTE_MAX) : "";
  const { changed } = await updateDomainMove(ctx, (state) => {
    if (!v.passed) {
      if (!state.checks[v.id]) return false;
      delete state.checks[v.id];
      return true;
    }
    state.checks[v.id] = { passedAt: now.toISOString(), by: ctx.user.id, note };
    return true;
  });
  if (changed) await auditFrom(ctx, "platform.domains.step", { target: v.id, meta: { check: v.id, passed: v.passed } });
  return { changed };
}

/* ------------------------------------------------------------------ */
/* The runnable checks (PLA-§16.3: V3, V7, V8, V10, V12, V13)          */
/* ------------------------------------------------------------------ */

export interface RunCheckInput {
  id: string;
  /** V12: the class of the host this request was served on (`effectiveHost(headers)` in the action) */
  requestHost?: Pick<EffectiveHost, "cls" | "host"> | null;
  /** V10 / V13: a token from the test widget */
  token?: string | null;
  /** V13: the staff member confirms the widget lists the new domain (Cloudflare does not tell the app) */
  hostnamesConfirmed?: boolean;
  /** V7: a store handle to follow (default: the oldest active store) */
  handle?: string | null;
  /** the caller's address for the Turnstile verification */
  ip?: string;
}

/** The network seam of the checks (the DB test injects one that fails the test when called). */
export interface CheckNet {
  head(url: string): Promise<{ status: number; headers: Headers }>;
  get(url: string): Promise<{ status: number; headers: Headers }>;
  certificate(host: string): Promise<{ subjectAltNames: string[] }>;
  turnstile(token: string, ip: string): Promise<string>;
}

const NET_TIMEOUT_MS = 5_000;

const liveNet: CheckNet = {
  async head(url) {
    const r = await fetch(url, { method: "HEAD", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(NET_TIMEOUT_MS) });
    return { status: r.status, headers: r.headers };
  },
  async get(url) {
    const r = await fetch(url, { method: "GET", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(NET_TIMEOUT_MS) });
    void r.body?.cancel();
    return { status: r.status, headers: r.headers };
  },
  certificate(host) {
    return new Promise((resolve, reject) => {
      const socket = tlsConnect({ host, port: 443, servername: host, timeout: NET_TIMEOUT_MS }, () => {
        const cert: PeerCertificate = socket.getPeerCertificate();
        socket.end();
        const names = (cert.subjectaltname ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.startsWith("DNS:"))
          .map((s) => s.slice(4).toLowerCase());
        resolve({ subjectAltNames: names });
      });
      socket.on("timeout", () => socket.destroy(new Error("timeout")));
      socket.on("error", reject);
    });
  },
  turnstile: (token, ip) => checkPlatformTurnstile(token, ip),
};

/** A cut error for an answer line (never a stack, never a header value). */
function errText(err: unknown): string {
  if (!(err instanceof Error)) return "failed";
  return err.name === "TimeoutError" || /timeout/i.test(err.message) ? "timed out" : err.message.slice(0, 80);
}

const result = (id: DomainCheckId, outcome: DomainCheckResult["outcome"], message: string, answers: string[], network: boolean, now: Date): DomainCheckResult => ({
  id,
  outcome,
  message,
  answers,
  network,
  ranAt: now.toISOString(),
});

/** Cloudflare's cache answer on a store response passes only when it never went through the cache (CCR r1.0-t3-9). */
const uncached = (h: Headers) => {
  const s = (h.get("cf-cache-status") ?? "").toUpperCase();
  return s === "" || s === "DYNAMIC" || s === "BYPASS";
};

async function oldestActiveHandle(): Promise<string | null> {
  // tenancy: platform the domain check V7 (PLA-§16.3): one active store's public handle to follow, no row data
  const [row] = await db.select({ handle: stores.handle }).from(stores).where(inArray(stores.status, ["active"] as StoreStatus[])).orderBy(asc(stores.createdAt)).limit(1);
  return row?.handle ?? null;
}

async function runCheck(input: RunCheckInput, id: DomainCheckId, net: CheckNet, now: Date): Promise<DomainCheckResult> {
  const sMode = subdomainMode();
  const root = storeRootDomain();
  switch (id) {
    case "V3": {
      if (!sMode || !root) return result(id, "skipped", SKIP_TEXT.sModeOff, [], false, now);
      const url = `https://probe.${root}/`;
      try {
        const r = await net.head(url);
        const mode = r.headers.get("x-sg-mode");
        const cache = r.headers.get("cf-cache-status") ?? "absent";
        const answers = [`HEAD ${url} → ${r.status}, x-sg-mode: ${mode ?? "absent"}, cf-cache-status: ${cache}`];
        const ok = r.status === 404 && mode === "subdomain" && uncached(r.headers);
        return result(id, ok ? "passed" : "failed", ok ? "The probe subdomain answers the neutral 404 through the Worker, uncached." : "The probe subdomain did not answer the neutral 404 with x-sg-mode: subdomain, uncached.", answers, true, now);
      } catch (err) {
        return result(id, "failed", "The probe subdomain did not answer.", [`HEAD ${url} → ${errText(err)}`], true, now);
      }
    }
    case "V7": {
      if (!sMode || !root) return result(id, "skipped", SKIP_TEXT.sModeOff, [], false, now);
      const legacy = [...legacyPlatformHosts()][0];
      if (!legacy) return result(id, "skipped", SKIP_TEXT.noLegacyHost, [], false, now);
      const handle = input.handle && /^[a-z0-9-]{2,30}$/.test(input.handle) ? input.handle : await oldestActiveHandle();
      if (!handle) return result(id, "needs_input", "No active store to follow yet: give a store handle.", [], false, now);
      const query = "?fbclid=1&utm_source=fb";
      const url = `https://${legacy}/s/${handle}/x${query}`;
      const want = `https://${handle}.${root}/x${query}`;
      try {
        const r = await net.get(url);
        const location = r.headers.get("location");
        const ok = r.status === 308 && location === want;
        return result(id, ok ? "passed" : "failed", ok ? "The legacy link redirects with the query kept byte for byte." : `Expected a 308 to ${want}.`, [`GET ${url} → ${r.status}${location ? `, Location: ${location.slice(0, 120)}` : ""}`], true, now);
      } catch (err) {
        return result(id, "failed", "The legacy host did not answer.", [`GET ${url} → ${errText(err)}`], true, now);
      }
    }
    case "V8": {
      if (!sMode || !root) return result(id, "skipped", SKIP_TEXT.sModeOff, [], false, now);
      const host = `probe.${root}`;
      try {
        const { subjectAltNames } = await net.certificate(host);
        const ok = subjectAltNames.includes(`*.${root}`);
        return result(id, ok ? "passed" : "failed", ok ? `The edge certificate covers *.${root}.` : `The certificate does not list *.${root}.`, [`TLS ${host}:443 → ${subjectAltNames.slice(0, 6).join(", ") || "no DNS name"}`], true, now);
      } catch (err) {
        return result(id, "failed", "No TLS answer from the store subdomain.", [`TLS ${host}:443 → ${errText(err)}`], true, now);
      }
    }
    case "V10": {
      if (!sMode || !root) return result(id, "skipped", SKIP_TEXT.sModeOff, [], false, now);
      if (!input.token) return result(id, "needs_input", "Solve the test widget on a store subdomain first.", [], false, now);
      const verdict = await net.turnstile(input.token, input.ip ?? "0.0.0.0");
      const ok = verdict === "ok";
      return result(id, ok ? "passed" : "failed", ok ? "The token from a store subdomain verifies." : "The token did not verify.", [`siteverify → ${verdict}`], true, now);
    }
    case "V12": {
      const admin = adminHostName();
      if (!admin) return result(id, "skipped", SKIP_TEXT.adminHostUnset, [], false, now);
      const served = input.requestHost?.cls === "console";
      const answers = [`this page: ${served ? `served on ${admin}` : `served on ${input.requestHost?.host?.slice(0, 80) || "another host"}`}`];
      const apex = root ?? platformHost();
      if (!apex) return result(id, "failed", "PLATFORM_URL is not set.", answers, false, now);
      const url = `https://${apex}/admin`;
      try {
        const r = await net.head(url);
        answers.push(`HEAD ${url} (no cookie) → ${r.status}`);
        const ok = served && r.status === 404;
        return result(id, ok ? "passed" : "failed", ok ? "The console answers only on its own host." : served ? "The apex still answers /admin: expected the neutral 404." : "Open this page on ADMIN_HOST and run the check again.", answers, true, now);
      } catch (err) {
        answers.push(`HEAD ${url} → ${errText(err)}`);
        return result(id, "failed", "The apex did not answer.", answers, true, now);
      }
    }
    case "V13": {
      if (!sMode || !root) return result(id, "skipped", SKIP_TEXT.sModeOff, [], false, now);
      const widget = await platformTurnstileKeys();
      if (!widget) return result(id, "failed", "The platform Turnstile widget is not configured.", ["platform_turnstile: not set"], false, now);
      if (input.hostnamesConfirmed !== true) return result(id, "needs_input", `Confirm the widget's hostnames include ${root}.`, ["platform_turnstile: set"], false, now);
      if (!input.token) return result(id, "needs_input", "Solve the test widget first.", ["platform_turnstile: set"], false, now);
      const verdict = await net.turnstile(input.token, input.ip ?? "0.0.0.0");
      const ok = verdict === "ok";
      return result(id, ok ? "passed" : "failed", ok ? "Sign-up's human check is ready on the new domain." : "The test token did not verify.", ["platform_turnstile: set", `hostnames include ${root}: confirmed`, `siteverify → ${verdict}`], true, now);
    }
    default:
      throw new AuthRefusal("invalid", "console.domains.check_manual");
  }
}

/**
 * `domains.manage` (PLA-§16.3 "Run"): one server-runnable check. A pass is recorded in `platform.domainMove.checks`
 * with the answers as its note (audit `platform.domains.step { check, passed: true }`); a failure, a skip or a missing
 * input is answered and not recorded. A passed V13 is what flips the D9 sign-up default (core §B.2 rev 6).
 */
export async function runDomainCheck(ctx: PlatformCtx, input: RunCheckInput, opts: { net?: CheckNet; now?: Date } = {}): Promise<DomainCheckResult> {
  requireManage(ctx);
  if (!isDomainCheck(input.id)) throw new FieldsError({ id: "console.domains.check_unknown" });
  const def = DOMAIN_CHECKS.find((c) => c.id === input.id)!;
  if (!def.runnable) throw new AuthRefusal("invalid", "console.domains.check_manual");
  const now = opts.now ?? new Date();
  const out = await runCheck(input, def.id, opts.net ?? liveNet, now);
  if (out.outcome === "passed") {
    await updateDomainMove(ctx, (state) => {
      state.checks[def.id] = { passedAt: now.toISOString(), by: ctx.user.id, note: noteOf(out) };
      return true;
    });
    await auditFrom(ctx, "platform.domains.step", { target: def.id, meta: { check: def.id, passed: true } });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Re-render all live pages (PLA-§16.2)                                */
/* ------------------------------------------------------------------ */

/** The fan-out's state row (`cron_cursors`): counts and ids only. */
export interface RerenderState {
  requestedAt: string;
  by: string;
  /** the last store id handled (keyset over `stores.id`) */
  after: string;
  stores: number;
  enqueued: number;
  failed: number;
  done: boolean;
  finishedAt: string | null;
  /** P8's queue is not available on this build: stopped, nothing enqueued */
  unavailable?: boolean;
}

const RERENDER_KEY = "platform.rerender:request";
/** the states whose live pages are served (D32: a suspended store's pages answer the neutral 503, re-rendered on restore) */
const RERENDER_STATES: readonly StoreStatus[] = ["active", "restricted", "pending"];
/** stores per slice of the job */
const RERENDER_SLICE = 50;

/** `console.read`: the fan-out's progress, or null before the first request. */
export async function rerenderProgress(ctx: PlatformCtx): Promise<RerenderState | null> {
  requireRead(ctx);
  return readJobState<RerenderState>(RERENDER_KEY);
}

/**
 * `domains.manage` ↑ (PLA-§16.2 "Re-render all live pages"): records the request and returns at once; the
 * `platform.rerender` job enqueues every live page of every serving store (reason `address`). A request while one is
 * running answers `{ started: false }` with its progress. Audit `platform.domains.rerender { scope: "all" }`.
 */
export async function requestRerenderAll(ctx: PlatformCtx, opId: string, now: Date = new Date()): Promise<{ started: boolean; state: RerenderState }> {
  requireManage(ctx, { stepUp: true });
  const current = await readJobState<RerenderState>(RERENDER_KEY);
  if (current && !current.done) return { started: false, state: current };
  // a repeat of the same confirmed sheet: the run it started answers
  if (!(await firstRun(ctx, opId))) {
    const started = await readJobState<RerenderState>(RERENDER_KEY);
    if (started) return { started: false, state: started };
    throw new AuthRefusal("busy");
  }
  const state: RerenderState = { requestedAt: now.toISOString(), by: ctx.user.id, after: "", stores: 0, enqueued: 0, failed: 0, done: false, finishedAt: null };
  await writeJobState(RERENDER_KEY, state);
  await auditFrom(ctx, "platform.domains.rerender", { target: "all", meta: { scope: "all" } });
  return { started: true, state };
}

/**
 * `domains.manage` (PLA-§16.2 "Retry failed"): the stores with failed renders in the last 24 h get every live page
 * enqueued again (one pending job per page, so nothing doubles). Answers how many stores, or `unavailable` while P8's
 * queue is the stub. Audit `platform.domains.rerender { scope: "failed", stores }`.
 */
export async function retryFailedRenders(ctx: PlatformCtx): Promise<{ stores: number; enqueued: number } | { unavailable: true }> {
  requireManage(ctx);
  let failedStores: string[];
  try {
    failedStores = [...new Set((await renderSummary()).failed24h.map((f) => f.storeId))].slice(0, 200);
  } catch (err) {
    recordPlatformError("domains renderSummary", err);
    return { unavailable: true };
  }
  let enqueued = 0;
  for (const storeId of failedStores) {
    try {
      enqueued += (await enqueueRenders(systemScope(systemCtx("platform.rerender"), storeId), "all-live", "address", 5)).enqueued;
    } catch (err) {
      recordPlatformError("domains retry enqueueRenders", err, { storeId });
      return { unavailable: true };
    }
  }
  await auditFrom(ctx, "platform.domains.rerender", { target: "failed", meta: { scope: "failed", stores: failedStores.length, enqueued } });
  return { stores: failedStores.length, enqueued };
}

/**
 * The `platform.rerender` job (every tick, a short slice): nothing to do without an open request; else the next
 * stores after the cursor, one `enqueueRenders` each, until the deadline. A store that fails is counted and skipped;
 * P8's stub (`not implemented`) stops the run as `unavailable` (never a made-up count).
 */
export async function runRerenderJob(ctx: Pick<JobCtx, "deadline">): Promise<JobResult> {
  const state = await readJobState<RerenderState>(RERENDER_KEY);
  if (!state || state.done) return { done: true, summary: { idle: true } };
  const sys = systemCtx("platform.rerender");
  let handled = 0;
  while (Date.now() < ctx.deadline) {
    // tenancy: platform the re-render fan-out (PLA-§16.2): the next serving stores by id (PK), ids only
    const batch = await db
      .select({ id: stores.id })
      .from(stores)
      .where(and(inArray(stores.status, [...RERENDER_STATES]), state.after ? gt(stores.id, state.after) : undefined))
      .orderBy(asc(stores.id))
      .limit(RERENDER_SLICE);
    if (!batch.length) {
      state.done = true;
      state.finishedAt = new Date().toISOString();
      break;
    }
    for (const s of batch) {
      if (Date.now() >= ctx.deadline) break;
      try {
        state.enqueued += (await enqueueRenders(systemScope(sys, s.id), "all-live", "address", 5)).enqueued;
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("not implemented")) {
          state.unavailable = true;
          state.done = true;
          state.finishedAt = new Date().toISOString();
          await writeJobState(RERENDER_KEY, state);
          return { done: true, summary: { unavailable: true } };
        }
        state.failed++;
        recordPlatformError("domains rerender enqueue", err, { storeId: s.id });
      }
      state.after = s.id;
      state.stores++;
      handled++;
    }
    if (batch.length < RERENDER_SLICE && state.after === batch[batch.length - 1]!.id) {
      state.done = true;
      state.finishedAt = new Date().toISOString();
      break;
    }
  }
  await writeJobState(RERENDER_KEY, state);
  return { done: state.done, summary: { stores: handled, enqueued: state.enqueued, failed: state.failed } };
}

/** For the DB test: the state row's key (a restart reads the same row). */
export const RERENDER_STATE_KEY = RERENDER_KEY;

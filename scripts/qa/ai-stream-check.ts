/**
 * qa:ai-stream (P7 AI; ai.md AI-§Q.3, AI-§A.7, AI-§B.13; docs/STORE-SAAS.md §J.3, §H.12, D56): the browser transports of
 * the AI routes against the localhost fake of the Claude API (src/lib/ai/testing/fake-anthropic.ts, reached only through
 * the `ai-base-url` seam: `SG_E2E=1`, `SG_AI_BASE_URL`, a `cod_test_*` database), with no key. A throwaway database
 * (cod_test_p7_stream_* by default; any other name than cod_test_* is refused) is created, migrated, seeded with one
 * active store and its owner, then dropped.
 *
 *   npm run qa:ai-stream                                  (tsx scripts/qa/ai-stream-check.ts)
 *   npx tsx scripts/qa/ai-stream-check.ts --db cod_test_p7_stream --keep --verbose
 *
 * The handlers run in this process: each check calls the body every `src/app/api/app/[store]/ai/**` route runs after its
 * storeGuard (src/lib/ai/http/handlers.ts) with real `Request` objects, and reads the real NDJSON `ReadableStream` with
 * arrival times; the static part proves every route is `storeGuard(req, …, "ai.use")` and that body. The guard itself
 * (same-origin, impersonation, another store's ids) is the tenancy suite's (scripts/qa/tenancy-cases/ai.ts).
 *
 *   static     the three job-capable handlers ([task], director/critique, jobs/[id]) export maxDuration 360, every other
 *              ai handler 120; every method's first statement is storeGuard with ai.use; the stream cap is under the
 *              ≈ 120 s proxy cut
 *   stream     copy.page through a slow stub: the headers (application/x-ndjson, no-store + no-transform, X-Accel-Buffering
 *              no), start first and final last, seq contiguous from 0, the `wait` heartbeat every 5 s, the
 *              headline field ≥ 1 s before final
 *   abort      a body cancelled mid-stream and a request signal aborted mid-stream each cancel the upstream call (the
 *              fake sees its client go; the run row ends cancelled)
 *   cap        a stream past its cap (the seam's 2.5 s): the fields already shown, then `error: timeout` last, upstream
 *              cancelled (the deadline cut keeps what the owner saw)
 *   poll       the poll transport: 202 { runId }, then runs/[id]?after=<seq> to done, the same event types and final
 *              value as the stream of the same answer (parity)
 *   locales    ar / fr / en in parallel, one failing at the provider: two finals written by the model, one error
 *   passes     director/plan of pass 1, then pass 2 of the same session while pass 1 runs: pass 1 answers 410
 *              pass_superseded after its stage, pass 2 200; director/critique of pass 1 then answers 410 with no call
 *   jobs       the critique-as-job (probe line 11 below 80 tok/s): 202 { jobId } within 500 ms; a 20 s stub stage: a
 *              poll without Sec-Fetch-Site same-origin leaves it unchanged, the same-origin poll answers within 25 s with
 *              the stage done and the row heartbeat during the stage
 * Exit code 1 when a check fails.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import type { AiStreamEvent } from "@/lib/ai/stream/events";
import type { StoreCtx, StoreRow, StoreScope, WriteScope } from "@/lib/tenancy/types";

const ROOT = path.resolve(__dirname, "..", "..");
const nodeRequire = createRequire(__filename);
const load = <T>(id: string): T => nodeRequire(id) as T;

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const DB_NAME = flag("db") ?? `cod_test_p7_stream_${randomBytes(3).toString("hex")}`;
const DB_SERVER = (process.env.AI_DB_SERVER ?? "mysql://root@127.0.0.1:3306").replace(/\/+$/, "");
const VERBOSE = process.argv.includes("--verbose");
const KEEP = process.argv.includes("--keep");

if (!/^cod_test_[a-z0-9_]{1,48}$/.test(DB_NAME)) {
  console.error(`✗ refusing to run on database "${DB_NAME}": use a throwaway cod_test_* name`);
  process.exit(1);
}

{
  const env = process.env as Record<string, string | undefined>;
  for (const k of ["PUBLIC_URL", "STORE_ROOT_DOMAIN", "ADMIN_HOST", "EDGE_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "SG_AI_NO_AFTER", "SG_AI_HARNESS"]) delete env[k];
  env.DATABASE_URL = `${DB_SERVER}/${DB_NAME}`;
  env.SG_TEST_CONTEXT = "1";
  env.APP_SECRET = randomBytes(32).toString("hex");
  env.PLATFORM_URL = "http://localhost:3453";
  // a fake key in the shape the reader accepts: never a real one, never printed
  env.ANTHROPIC_API_KEY = `sk-ant-streamcheck-${randomBytes(16).toString("hex")}`;
  env.SG_E2E = "1";
  if (!env.NODE_ENV || env.NODE_ENV === "production") env.NODE_ENV = "test";
  (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;
}

{
  const M = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const empty = nodeRequire.resolve("drizzle-orm");
  M._resolveFilename = function (request: string, ...rest: unknown[]) {
    return request === "server-only" || request === "client-only" ? empty : (orig as (...a: unknown[]) => string).call(this, request, ...rest);
  };
}

/* ------------------------------------------------------------------ */
/* checks                                                              */
/* ------------------------------------------------------------------ */

let passed = 0;
const failures: string[] = [];
let suiteName = "";
function suite(name: string): void {
  suiteName = name;
  if (VERBOSE) console.log(`\n— ${name}`);
}
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    passed++;
    if (VERBOSE) console.log(`  ✓ ${name}`);
    return;
  }
  failures.push(`[${suiteName}] ${name}`);
  console.error(`  ✗ [${suiteName}] ${name}${detail === undefined ? "" : `: ${JSON.stringify(detail)?.slice(0, 500)}`}`);
}
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* database and fixtures                                               */
/* ------------------------------------------------------------------ */

async function rootQuery(sqlText: string): Promise<unknown> {
  const mysql = load<typeof import("mysql2/promise")>("mysql2/promise");
  const conn = await mysql.createConnection({ uri: DB_SERVER, charset: "utf8mb4_unicode_ci" });
  try {
    const [rows] = await conn.query(sqlText);
    return rows;
  } finally {
    await conn.end();
  }
}

async function q<T = Record<string, unknown>>(sqlText: string, params: unknown[] = []): Promise<T[]> {
  const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const [rows] = await pool().query(sqlText, params);
  return rows as T[];
}

async function dropDatabase(): Promise<void> {
  try {
    const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
    await pool().end();
  } catch {
    // never opened
  }
  if (!KEEP) await rootQuery(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
}

interface Fx {
  id: string;
  owner: string;
  staff: string;
  row: StoreRow;
  scope: WriteScope;
}

const scopeOf = (storeId: string, kind: StoreScope["kind"] = "member"): StoreScope => load<typeof import("@/lib/tenancy/seam")>("@/lib/tenancy/seam").mintScope(kind, storeId);

async function seed(): Promise<Fx> {
  const { newId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const { getStoreById } = load<typeof import("@/lib/tenancy/public")>("@/lib/tenancy/public");
  const user = async (email: string, role = "none") => {
    const id = newId();
    await q("INSERT INTO users (id, email, name, password_hash, platform_role) VALUES (?, ?, ?, 'ai-stream-check:no-password', ?)", [id, email, email.split("@")[0], role]);
    return id;
  };
  const owner = await user("owner@ai-stream.test");
  const staff = await user("staff@ai-stream.test", "super_admin");
  const id = newId();
  await q("INSERT INTO stores (id, handle, name, status, brand_seed, created_by, default_locale) VALUES (?, ?, 'Stream store', 'active', ?, ?, 'fr')", [id, `aistream-${randomBytes(2).toString("hex")}`, randomBytes(8).toString("hex"), owner]);
  await q("INSERT INTO store_members (store_id, user_id, role) VALUES (?, ?, 'owner')", [id, owner]);
  return { id, owner, staff, row: (await getStoreById(id))!, scope: scopeOf(id) as WriteScope };
}

/** The owner's context as the seam hands it after storeGuard(req, handle, "ai.use"). */
function ctxOf(fx: Fx): StoreCtx {
  return {
    user: { id: fx.owner, email: "owner@ai-stream.test", name: "owner", totpEnabled: false, sessionId: "s", platformRole: "none", locale: null, lastStoreId: null },
    store: fx.row,
    membership: { role: "owner", status: "active" },
    scope: fx.scope,
    actor: { kind: "user", userId: fx.owner, impersonatorId: null, ip: null },
    impersonation: null,
    stepUpUntil: null,
    can: () => true,
  };
}

async function setAi(patch: Record<string, unknown>, staff: string): Promise<void> {
  const { setPlatformSetting, getPlatformSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
  const cur = await getPlatformSetting("platform_ai", { fresh: true });
  const next = { ...cur, ...patch, caps: { ...cur.caps, ...((patch.caps as object | undefined) ?? {}) } };
  await setPlatformSetting("platform_ai", next as never, { id: staff, kind: "platform" });
}

async function flagOn(key: string, storeId: string): Promise<void> {
  await q("INSERT INTO flag_overrides (flag_key, scope, scope_id, value, updated_at) VALUES (?, 'store', ?, 'true', UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE value = VALUES(value)", [key, storeId]);
  load<typeof import("@/lib/ai/server/flags")>("@/lib/ai/server/flags").invalidateAiFlags();
}

/* ------------------------------------------------------------------ */
/* NDJSON reading                                                      */
/* ------------------------------------------------------------------ */

interface Arrived {
  e: AiStreamEvent;
  /** ms since the request started */
  at: number;
}

/** Reads an NDJSON body with arrival times; `stop` cancels the body after the event it returns true for. */
async function readStream(res: Response, t0: number, stop?: (e: AiStreamEvent) => boolean): Promise<Arrived[]> {
  const { NdjsonSplitter } = load<typeof import("@/lib/ai/stream/events")>("@/lib/ai/stream/events");
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  const split = new NdjsonSplitter();
  const out: Arrived[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    for (const e of split.push(dec.decode(value, { stream: true }))) {
      out.push({ e, at: Date.now() - t0 });
      if (stop?.(e)) {
        await reader.cancel();
        return out;
      }
    }
  }
  for (const e of split.end()) out.push({ e, at: Date.now() - t0 });
  return out;
}

const typesOf = (evs: readonly (Arrived | AiStreamEvent)[]) => evs.map((a) => ("e" in a ? a.e : a).t).filter((t) => t !== "progress");
const contiguous = (evs: Arrived[]) => evs.every((a, i) => a.e.s === i);

/* ------------------------------------------------------------------ */
/* the checks                                                          */
/* ------------------------------------------------------------------ */

const AI_DIR = path.join(ROOT, "src", "app", "api", "app", "[store]", "ai");
/** the handlers that may start or drive a pattern-B job (core D56) */
const JOB_CAPABLE = new Set(["[task]", "director/critique", "jobs/[id]"]);

function routeFiles(dir: string, rel = ""): { rel: string; file: string }[] {
  const out: { rel: string; file: string }[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full, rel ? `${rel}/${name}` : name));
    else if (name === "route.ts") out.push({ rel, file: full });
  }
  return out;
}

function staticSuite(): void {
  suite("static");
  const files = routeFiles(AI_DIR);
  check("the nine ai route modules exist", files.length === 9, files.map((f) => f.rel));
  for (const { rel, file } of files) {
    const src = readFileSync(file, "utf8");
    const md = /^export const maxDuration = (\d+);/m.exec(src)?.[1];
    const want = JOB_CAPABLE.has(rel) ? "360" : "120";
    check(`${rel}: export const maxDuration = ${want}`, md === want, md);
    const methods = [...src.matchAll(/^export async function (GET|POST|PUT|PATCH|DELETE)\b[\s\S]*?^}/gm)];
    check(`${rel}: exports a handler`, methods.length >= 1);
    for (const m of methods) {
      const body = m[0];
      const lines = body.split("\n").slice(1).map((l) => l.trim()).filter((l) => l && !l.startsWith("//"));
      const guardAt = lines.findIndex((l) => /storeGuard\(req, [^,]+, "ai\.use"\)/.test(l));
      check(`${rel} ${m[1]}: storeGuard(req, …, "ai.use") before anything but the params`, guardAt >= 0 && lines.slice(0, guardAt).every((l) => /^const p = await params;$/.test(l)) && /if \(!g\.ok\) return g\.response;/.test(lines[guardAt + 1] ?? ""), lines.slice(0, 3));
    }
  }
  const { STREAM_CAP_MS } = load<typeof import("@/lib/ai/http/transport")>("@/lib/ai/http/transport");
  check("the stream cap stays under the ≈ 120 s proxy cut (with room for the last line)", STREAM_CAP_MS > 0 && STREAM_CAP_MS <= 110_000, STREAM_CAP_MS);
}

async function main(): Promise<void> {
  const started = Date.now();
  let done = false;
  let fake: import("@/lib/ai/testing/fake-anthropic").FakeAnthropic | null = null;
  try {
    staticSuite();
    await rootQuery(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
    await rootQuery(`CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const { runMigrations } = load<typeof import("@/lib/db/migrate")>("@/lib/db/migrate");
    suite("setup");
    const migrated = await runMigrations();
    check("migrations applied on the throwaway database", (migrated as { status?: string }).status === "applied", migrated);
    const fx = await seed();

    const { startFakeAnthropic } = load<typeof import("@/lib/ai/testing/fake-anthropic")>("@/lib/ai/testing/fake-anthropic");
    const { resetAnthropic } = load<typeof import("@/lib/ai/server/client")>("@/lib/ai/server/client");
    const { breaker } = load<typeof import("@/lib/ai/server/breaker")>("@/lib/ai/server/breaker");
    const { ALL_FIXTURES } = load<typeof import("@/lib/ai/eval/fixtures")>("@/lib/ai/eval/fixtures");
    const H = load<typeof import("@/lib/ai/http/handlers")>("@/lib/ai/http/handlers");
    const R = load<typeof import("@/lib/ai/jobs/run")>("@/lib/ai/jobs/run");
    const { insertJob } = load<typeof import("@/lib/ai/store/jobs")>("@/lib/ai/store/jobs");
    const { probePlan } = load<typeof import("@/lib/ai/jobs/stages")>("@/lib/ai/jobs/stages");
    const { newId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
    const { sha256Hex } = load<typeof import("@/lib/ai/prompts/sha256")>("@/lib/ai/prompts/sha256");
    fake = await startFakeAnthropic();
    const f = fake;
    process.env.SG_AI_BASE_URL = f.origin;
    resetAnthropic();
    breaker().reset();
    H.httpDeps.after = (fn) => void fn();
    R.jobDeps.after = () => undefined;
    await setAi({ enabled: true, streamTransport: "stream", caps: { monthlyUsd: 100, storeDailyCapPct: 100 } }, fx.staff);
    await flagOn("ai_director_brief", fx.id);
    check("seeded: one active store, Cloud AI on against the fake", fx.row.status === "active");

    const ctx = ctxOf(fx);
    const recordedOf = (family: string, id: string) =>
      (JSON.parse(readFileSync(path.join(ROOT, `src/lib/ai/eval/sets/${family}/recorded/${family}@s1.json`), "utf8")) as { runs: Record<string, { output: unknown }[]> }).runs[id]![0]!.output;
    const page = (l: "ar" | "fr" | "en") => ALL_FIXTURES.find((x) => x.id === `copy.page/core-blender-${l}`)!;
    const pageOut = (l: "ar" | "fr" | "en") => recordedOf("copy.page", page(l).id);
    const req = (method: string, rel: string, body?: unknown, headers: Record<string, string> = {}, signal?: AbortSignal) =>
      new Request(`http://localhost:3453/api/app/${fx.row.handle}/ai/${rel}`, { method, headers: { "content-type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...(signal ? { signal } : {}) });
    let n = 0;
    const nonce = () => `stream${++n}`;
    const pageReq = (l: "ar" | "fr" | "en" = "fr", signal?: AbortSignal) => req("POST", "copy.page", { input: page(l).input, surface: "wizard", nonce: nonce() }, {}, signal);
    const runRow = async (id: string) => (await q<{ status: string; error_code: string | null }>("SELECT status, error_code FROM ai_runs WHERE id = ?", [id]))[0];
    const settled = async (id: string) => {
      for (let i = 0; i < 50; i++) {
        const r = await runRow(id);
        if (r && r.status !== "running") return r;
        await wait(100);
      }
      return runRow(id);
    };
    const startOf = (evs: Arrived[]) => {
      const s = evs.find((a) => a.e.t === "start")?.e;
      return s && s.t === "start" ? s.runId : "";
    };

    /* stream ------------------------------------------------------- */
    suite("stream");
    // ≈ 2.5 KB of JSON in 24-character deltas 70 ms apart: ≈ 7 s, so the 5 s heartbeat shows
    f.enqueue({ kind: "ok", json: pageOut("fr"), deltaMs: 70 });
    let t0 = Date.now();
    const res = await H.handleTask(ctx, pageReq("fr"), "copy.page");
    check("200 application/x-ndjson", res.status === 200 && (res.headers.get("content-type") ?? "").startsWith("application/x-ndjson"), [res.status, res.headers.get("content-type")]);
    check("Cache-Control: no-store, no-transform", res.headers.get("cache-control") === "no-store, no-transform", res.headers.get("cache-control"));
    check("X-Accel-Buffering: no", res.headers.get("x-accel-buffering") === "no", res.headers.get("x-accel-buffering"));
    const evs = await readStream(res, t0);
    const types = evs.map((a) => a.e.t);
    const final = evs.find((a) => a.e.t === "final");
    const headline = evs.find((a) => a.e.t === "field" && a.e.path === "headline");
    check("start first, final last, nothing after it", types[0] === "start" && types[types.length - 1] === "final" && types.filter((t) => t === "final" || t === "error").length === 1, types);
    check("seq numbered 0, 1, 2… without a gap", contiguous(evs), evs.map((a) => a.e.s));
    check("fields stream before final (several, the headline among them)", types.filter((t) => t === "field").length >= 3 && !!headline, types);
    const firstBeat = evs.find((a) => a.e.t === "progress" && a.e.stage === "wait");
    check("the `progress: wait` heartbeat 5 s in (the run took longer than 5 s)", !!final && final.at > 5_000 && !!firstBeat && firstBeat.at >= 4_500 && firstBeat.at <= 6_500, { final: final?.at, beat: firstBeat?.at });
    check("the headline field arrives ≥ 1 s before final (a slow stub streams in place)", !!headline && !!final && final.at - headline.at >= 1_000, { headline: headline?.at, final: final?.at });
    const fe = final?.e;
    const fv = fe && fe.t === "final" ? fe : null;
    check("final: the run id of start, the guarded value, credits charged", !!fv && fv.runId === startOf(evs) && typeof (fv.value as { headline?: unknown }).headline === "string" && fv.credits > 0, fv && { runId: fv.runId, credits: fv.credits });
    const streamFinal = fv?.value;
    const streamTypes = typesOf(evs);

    /* abort -------------------------------------------------------- */
    suite("abort");
    for (const how of ["the body cancelled", "the request signal aborted"] as const) {
      const abortedBefore = f.aborted;
      f.enqueue({ kind: "ok", json: pageOut("fr"), deltaMs: 150 });
      const ac = new AbortController();
      t0 = Date.now();
      const r = await H.handleTask(ctx, pageReq("fr", ac.signal), "copy.page");
      const got = await readStream(r, t0, (e) => {
        if (e.t !== "field") return false;
        if (how === "the body cancelled") return true;
        ac.abort();
        return false;
      });
      const runId = startOf(got);
      const row = runId ? await settled(runId) : undefined;
      for (let i = 0; i < 30 && f.aborted === abortedBefore; i++) await wait(100);
      check(`${how} after the first field: the fake sees its client go (upstream cancelled)`, f.aborted === abortedBefore + 1, { aborted: f.aborted - abortedBefore, types: typesOf(got) });
      check(`${how}: the run row ends cancelled, not ok`, row?.status !== "running" && row?.status !== "ok" && (row?.error_code === "cancelled" || row?.status === "cancelled"), row);
    }

    /* cap ---------------------------------------------------------- */
    suite("cap");
    H.httpDeps.streamCapMs = 2_500;
    {
      const abortedBefore = f.aborted;
      f.enqueue({ kind: "ok", json: pageOut("fr"), deltaMs: 120 });
      t0 = Date.now();
      const cut = await readStream(await H.handleTask(ctx, pageReq("fr"), "copy.page"), t0);
      const last = cut[cut.length - 1];
      const fields = cut.filter((a) => a.e.t === "field");
      for (let i = 0; i < 30 && f.aborted === abortedBefore; i++) await wait(100);
      const le = last?.e;
      check("past the cap: `error: timeout` is the last line, at the cap", !!le && le.t === "error" && le.code === "timeout" && !!last && last.at >= 2_400 && last.at < 4_000, last);
      check("the deadline cut keeps the fields already shown (they precede the error)", fields.length >= 1 && fields.every((a) => a.at < (last?.at ?? 0)), fields.map((a) => a.e.t === "field" && a.e.path));
      check("the cut cancels the upstream call", f.aborted === abortedBefore + 1, f.aborted - abortedBefore);
    }
    H.httpDeps.streamCapMs = null;

    /* poll --------------------------------------------------------- */
    suite("poll");
    await setAi({ streamTransport: "poll" }, fx.staff);
    f.enqueue({ kind: "ok", json: pageOut("fr"), deltaMs: 10 });
    t0 = Date.now();
    const accepted = await H.handleTask(ctx, pageReq("fr"), "copy.page");
    const ab = (await accepted.json()) as { ok?: boolean; runId?: string };
    check("the poll transport: 202 { runId } as soon as the run row exists", accepted.status === 202 && ab.ok === true && /^[0-9A-Z]{26}$/.test(ab.runId ?? "") && Date.now() - t0 < 2_000, ab);
    const polled: AiStreamEvent[] = [];
    let after = -1;
    let finished = false;
    for (let i = 0; i < 200 && !finished && ab.runId; i++) {
      const r = await H.handleRunPoll(ctx, req("GET", `runs/${ab.runId}?after=${after}`), ab.runId);
      const b = (await r.json()) as { events: AiStreamEvent[]; done: boolean };
      polled.push(...b.events);
      if (b.events.length) after = b.events[b.events.length - 1]!.s;
      finished = b.done;
      if (!finished) await wait(100);
    }
    const pf = polled.find((e) => e.t === "final");
    check("runs/[id]?after=<seq> to done: no event twice, seq increasing", finished && polled.every((e, i) => i === 0 || e.s > polled[i - 1]!.s), polled.map((e) => e.s));
    check("parity: the same event types as the stream of the same answer", JSON.stringify(typesOf(polled)) === JSON.stringify(streamTypes), { poll: typesOf(polled), stream: streamTypes });
    check("parity: the same final value", !!pf && pf.t === "final" && JSON.stringify(pf.value) === JSON.stringify(streamFinal));
    await setAi({ streamTransport: "stream" }, fx.staff);

    /* locales ------------------------------------------------------ */
    suite("locales");
    {
      const locales = ["ar", "fr", "en"] as const;
      const failing = "en";
      const marker = Object.fromEntries(locales.map((l) => [l, String((page(l).input as { product: { facts: string[] } }).product.facts[0])])) as Record<(typeof locales)[number], string>;
      f.respond = (body) => {
        const text = JSON.stringify(body.messages ?? []);
        const l = locales.find((x) => text.includes(marker[x]));
        if (!l) return { kind: "ok" };
        return l === failing ? { kind: "status", status: 400 } : { kind: "ok", json: pageOut(l), deltaMs: 20 };
      };
      t0 = Date.now();
      const all = await Promise.all(locales.map(async (l) => ({ l, evs: await readStream(await H.handleTask(ctx, pageReq(l), "copy.page"), t0) })));
      f.respond = null;
      const ends = Object.fromEntries(all.map(({ l, evs }) => [l, evs[evs.length - 1]?.e])) as Record<string, AiStreamEvent | undefined>;
      check("three locales in parallel: ar and fr end with final, written by the model", ["ar", "fr"].every((l) => ends[l]?.t === "final" && typeof (ends[l] as unknown as { value?: { headline?: unknown } }).value?.headline === "string"), ends);
      check("the failing locale ends with one error, the two others untouched by it", ends.en?.t === "error" && all.every(({ evs }) => evs.filter((a) => a.e.t === "final" || a.e.t === "error").length === 1), ends.en);
    }

    /* passes ------------------------------------------------------- */
    suite("passes");
    {
      const planFx = ALL_FIXTURES.find((x) => x.task === "design.plan")!;
      const planOut = recordedOf("director.plan", planFx.id);
      const session = `sess${randomBytes(6).toString("hex")}`;
      const p1 = { session, id: `pass${randomBytes(6).toString("hex")}` };
      const p2 = { session, id: `pass${randomBytes(6).toString("hex")}` };
      f.enqueue({ kind: "ok", json: planOut, delayMs: 1_500 }, { kind: "ok", json: planOut });
      const first = H.handleDirector(ctx, req("POST", "director/plan", { input: planFx.input, pass: p1 }), "plan");
      await wait(300);
      const second = await H.handleDirector(ctx, req("POST", "director/plan", { input: planFx.input, pass: p2 }), "plan");
      const firstRes = await first;
      const b1 = (await firstRes.json()) as { error?: string };
      const b2 = (await second.json()) as { ok?: boolean; value?: unknown };
      check("pass 2 of the same session: 200 with its plan", second.status === 200 && b2.ok === true && !!b2.value, { status: second.status, b2 });
      check("pass 1, superseded while its stage ran: 410 pass_superseded", firstRes.status === 410 && b1.error === "pass_superseded", { status: firstRes.status, b1 });
      const calls = f.total("/v1/messages");
      const late = await H.handleDirector(ctx, req("POST", "director/critique", { input: {}, pass: p1 }), "critique");
      const bl = (await late.json()) as { error?: string };
      check("a later stage of pass 1 (critique): 410 pass_superseded before any provider call", late.status === 410 && bl.error === "pass_superseded" && f.total("/v1/messages") === calls, { status: late.status, bl });
      const verify = await H.handleDirector(ctx, req("POST", "director/verify", { input: {}, pass: p2 }), "verify");
      check("director/verify (R2): the neutral 404 in R1", verify.status === 404, verify.status);
    }

    /* jobs --------------------------------------------------------- */
    suite("jobs");
    {
      const crit = ALL_FIXTURES.find((x) => x.task === "design.critique")!;
      await setAi({ probe: { at: new Date().toISOString(), callShape: null, streamTransport: null, tokPerSec: { director_interactive: 60 }, detachedJob: null, prices: {}, lines: {} } }, fx.staff);
      const calls = f.total("/v1/messages");
      t0 = Date.now();
      const created = await H.handleDirector(ctx, req("POST", "director/critique", { input: crit.input, pass: { session: `sess${randomBytes(6).toString("hex")}`, id: `pass${randomBytes(6).toString("hex")}` } }), "critique");
      const ms = Date.now() - t0;
      const cb = (await created.json()) as { jobId?: string };
      check("a pattern-B route (the critique-as-job below 80 tok/s): 202 { jobId } within 500 ms, no model call", created.status === 202 && !!cb.jobId && ms <= 500 && f.total("/v1/messages") === calls, { status: created.status, ms });
      if (cb.jobId) await H.handleJobCancel(ctx, cb.jobId);
      await setAi({ probe: null }, fx.staff);

      // a 20 s stub stage (the probe's model-free sleep), driven by a same-origin poll
      const plan = probePlan(20_000, 20_000);
      const jobId = newId();
      await insertJob(fx.scope, {
        id: jobId,
        kind: "probe",
        task: "probe.sleep",
        inputHash: sha256Hex(`stream-probe|${jobId}`),
        progress: { done: 0, total: plan.stages.length, stages: {}, plan: plan.stages.map((s) => s.id) },
        class: "director_deep",
        doc: { runIds: [], input: { totalMs: 20_000, stageMs: 20_000 }, plan: [...plan.stages], reservation: null },
        reservedCredits: 0,
        createdBy: fx.owner,
        now: new Date(),
      });
      const rowOf = async () => (await q<{ status: string; stage: string | null; lease_until: Date | null; heartbeat_at: Date | null; progress: string }>("SELECT status, stage, lease_until, heartbeat_at, progress FROM ai_jobs WHERE id = ?", [jobId]))[0];
      const idle = JSON.stringify(await rowOf());
      for (const site of [null, "cross-site", "same-site", "none"]) {
        const r = await H.handleJobPoll(ctx, req("GET", `jobs/${jobId}?advance=1`, undefined, site ? { "sec-fetch-site": site } : {}), jobId);
        const b = (await r.json()) as { status?: string };
        check(`advance=1 with ${site ? `Sec-Fetch-Site ${site}` : "no Sec-Fetch-Site"}: the read-only view, the stage unchanged`, r.status === 200 && b.status === "queued" && JSON.stringify(await rowOf()) === idle, b);
      }
      const beats = new Set<string>();
      let polling = true;
      const sampler = (async () => {
        while (polling) {
          const r = await rowOf();
          if (r?.status === "running" && r.heartbeat_at) beats.add(new Date(r.heartbeat_at).toISOString());
          await wait(1_000);
        }
      })();
      t0 = Date.now();
      const driven = await H.handleJobPoll(ctx, req("GET", `jobs/${jobId}?advance=1`, undefined, { "sec-fetch-site": "same-origin" }), jobId);
      const elapsed = Date.now() - t0;
      polling = false;
      await sampler;
      const db = (await driven.json()) as { status?: string; progress?: { done?: number } };
      check("the same-origin poll of a 20 s stub stage answers within 25 s, the stage done", driven.status === 200 && db.status === "done" && db.progress?.done === 1 && elapsed >= 15_000 && elapsed <= 25_000, { elapsed, db });
      check("the job row heartbeat while the stage ran (10 s apart)", beats.size >= 1, [...beats]);
    }
    done = true;
  } catch (err) {
    check("the check ran to the end", false, err instanceof Error ? err.stack : String(err));
  } finally {
    await fake?.close().catch(() => undefined);
    await dropDatabase().catch((e) => console.error(`cleanup failed: ${e instanceof Error ? e.message : String(e)}`));
    const secs = Math.round((Date.now() - started) / 1000);
    console.log(`qa:ai-stream: ${passed} passed, ${failures.length} failed · database ${DB_NAME} ${KEEP ? "kept" : "dropped"} · ${secs} s`);
    process.exit(failures.length || !done ? 1 : 0);
  }
}

if (require.main === module) void main();

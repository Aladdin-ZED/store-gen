/**
 * qa:ai-probe (P7 AI; ai.md AI-§B.12; docs/STORE-SAAS.md §J.3): the manual probe of the Claude API, run by the owner or
 * the maintainer with a real key on a throwaway database. Never in npm test. Prints pass / fail per line; `--write`
 * stores the results in `platform_ai.probe` (and `callShape` from line 1).
 *
 *   npm run qa:ai-probe                          (real key: platform_ai_secret, else ANTHROPIC_API_KEY; .env.local read)
 *   npm run qa:ai-probe -- --write               (records platform_ai.probe incl. tokPerSec per class)
 *   npm run qa:ai-probe -- --dry-run             (every line against the localhost fake, src/lib/ai/testing/fake-anthropic.ts)
 *   npm run qa:ai-probe -- --lines 1,2,11 --reps 1
 *
 * Lines here (step 7): 1 shape A `beta.messages.parse` + fallbacks + format; 2 the same streamed, first-delta time;
 * 3 fast mode + fallbacks on copy.field; 4 a 512+ token prefix twice (cache read on the second); 5 count_tokens of a
 * 1,024 × 1,024 photo and a 390 × 844 tile against ⌈w/28⌉ × ⌈h/28⌉; 6 Fable 5.1 (the 30-day retention 400) and Haiku 5.5
 * without fallbacks and with a forced tool_choice; 7 a batch of 2 (submitted, polled once); 9 a `max_tokens: 1` call on
 * the real Director prefix, then the same prefix; 10 one interactive Director plan on three onboarding fixtures (p50 /
 * p95, the thinking share); 11 sustained output tok/s per class at its effort (median of `--reps`, default 3).
 * Lines 8 and 12 (step 9) need a running server: `--base <origin> --store <handle>` and QA_AI_PROBE_COOKIE (the Cookie
 * header of an owner session of that store, never printed). 8: the NDJSON route on copy.page, the first line's arrival
 * against the last's → `streamTransport` ("stream" when ≥ 2 s apart; `--write` also sets platform_ai.streamTransport).
 * 12: a 3 × 20 s sleep job (no model) written into the server's database, polled through the real jobs route: a poll
 * without Sec-Fetch-Site same-origin leaves it, each same-origin poll advances exactly one stage, a stage left with a
 * stale lease and heartbeat is re-claimed by the next poll, and polls alone take it to done (run the server with
 * SG_AI_NO_AFTER=1 or the flag ai_detached_jobs off). Without --base both are skipped.
 *
 * Refuses the databases cod_studio and cod_storegen (core §J.2). The key is never printed: only "settings" / "env".
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";

const ROOT = path.resolve(__dirname, "..", "..");
const nodeRequire = createRequire(__filename);
const load = <T>(id: string): T => nodeRequire(id) as T;
const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const arg = (f: string) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};
const DRY = has("--dry-run");
const WRITE = has("--write");
const REPS = Math.max(1, Math.min(5, Number(arg("--reps") ?? 3) || 3));
const ALL_LINES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const LINES = new Set((arg("--lines") ?? ALL_LINES.join(",")).split(",").map(Number).filter((n) => ALL_LINES.includes(n)));

{
  const M = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const empty = nodeRequire.resolve("drizzle-orm");
  M._resolveFilename = function (request: string, ...rest: unknown[]) {
    return request === "server-only" || request === "client-only" ? empty : (orig as (...a: unknown[]) => string).call(this, request, ...rest);
  };
}

const env = process.env as Record<string, string | undefined>;
if (!DRY && !env.DATABASE_URL) {
  for (const f of [".env.local", ".env"]) {
    const p = path.join(ROOT, f);
    if (existsSync(p)) {
      // loads the variables without printing any of them
      (process as unknown as { loadEnvFile(p: string): void }).loadEnvFile(p);
      break;
    }
  }
}
if (DRY) {
  env.DATABASE_URL = `mysql://root@127.0.0.1:3306/cod_test_p7_probe_${randomBytes(3).toString("hex")}`;
  env.ANTHROPIC_API_KEY = `sk-ant-probe-dryrun-${randomBytes(16).toString("hex")}`;
}
const dbName = (() => {
  try {
    return decodeURIComponent(new URL(env.DATABASE_URL ?? "").pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
})();
if (dbName === "cod_studio" || dbName === "cod_storegen") {
  console.error(`✗ refusing to probe with the database "${dbName}": use a throwaway database`);
  process.exit(2);
}
if (DRY && WRITE) {
  console.error("✗ --write records live measurements only (not with --dry-run)");
  process.exit(2);
}

/* ------------------------------------------------------------------ */

interface LineResult {
  pass: boolean;
  note: string;
}
const results: Record<string, LineResult> = {};
const out: { callShape: "parse" | "create" | null; streamTransport: "stream" | "poll" | null; tokPerSec: Partial<Record<string, number>> } = { callShape: null, streamTransport: null, tokPerSec: {} };
function report(line: number, pass: boolean, note: string): void {
  results[String(line)] = { pass, note: note.slice(0, 300) };
  console.log(`${pass ? "✓" : "✗"} line ${line}: ${note}`);
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((xs.length - 1) * p))] ?? 0;

async function main(): Promise<void> {
  const { PlatformAi } = load<typeof import("@/lib/settings/keys/platform_ai")>("@/lib/settings/keys/platform_ai");
  const { callClaude } = load<typeof import("@/lib/ai/server/call")>("@/lib/ai/server/call");
  const { buildParams, batchParams } = load<typeof import("@/lib/ai/server/request")>("@/lib/ai/server/request");
  const { CircuitBreaker } = load<typeof import("@/lib/ai/server/breaker")>("@/lib/ai/server/breaker");
  const { routeFor } = load<typeof import("@/lib/ai/tasks")>("@/lib/ai/tasks");
  const { promptFor } = load<typeof import("@/lib/ai/prompts/registry")>("@/lib/ai/prompts/registry");
  const { assemble } = load<typeof import("@/lib/ai/prompts/assemble")>("@/lib/ai/prompts/assemble");
  const { ALL_FIXTURES, storeCtxOf } = load<typeof import("@/lib/ai/eval/fixtures")>("@/lib/ai/eval/fixtures");
  const { imageTokens } = load<typeof import("@/lib/ai/quota/cost")>("@/lib/ai/quota/cost");
  const { z } = load<typeof import("zod")>("zod");

  let fake: Awaited<ReturnType<typeof import("@/lib/ai/testing/fake-anthropic")["startFakeAnthropic"]>> | null = null;
  let client: Anthropic | null;
  let settings = PlatformAi.parse({});
  if (DRY) {
    const { startFakeAnthropic } = load<typeof import("@/lib/ai/testing/fake-anthropic")>("@/lib/ai/testing/fake-anthropic");
    fake = await startFakeAnthropic();
    env.SG_E2E = "1";
    env.SG_AI_BASE_URL = fake.origin;
    const { anthropicEndpoint } = load<typeof import("@/lib/security/test-seams")>("@/lib/security/test-seams");
    const Sdk = load<{ default: typeof Anthropic }>("@anthropic-ai/sdk").default;
    client = new Sdk({ apiKey: env.ANTHROPIC_API_KEY!, ...anthropicEndpoint(), maxRetries: 0, timeout: 90_000 });
    console.log(`dry run against the fake provider (${fake.origin})`);
  } else {
    const { anthropic, keySource } = load<typeof import("@/lib/ai/server/client")>("@/lib/ai/server/client");
    const { getPlatformSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
    settings = await getPlatformSetting("platform_ai").catch(() => settings);
    client = await anthropic();
    console.log(`key: ${await keySource()} · database: ${dbName || "(none)"}`);
  }
  if (!client) {
    console.error("✗ no key (platform_ai_secret or ANTHROPIC_API_KEY)");
    process.exit(2);
  }
  const c = client;
  const brk = new CircuitBreaker();
  const env1 = (shape: "parse" | "create") => ({ client: c, callShape: shape, breaker: brk });
  const Tiny = z.object({ ok: z.boolean(), word: z.string() });
  const tinyFormat = { name: "probe_tiny", zod: Tiny, json: z.toJSONSchema(Tiny) as Record<string, unknown> };
  const user = (text: string) => [{ role: "user" as const, content: [{ type: "text" as const, text }] }];
  const spec = (over: Record<string, unknown>) =>
    ({ task: "copy.hero", class: "worker", model: settings.classes.worker.model, effort: "low", maxTokens: 1_024, pattern: "A", system: [{ type: "text", text: "You are a probe. Answer with the JSON object only." }], messages: user('Answer {"ok": true, "word": "hello"}.'), format: tinyFormat, stream: false, fallbacks: true, fast: false, deadlineMs: 60_000, ...over }) as Parameters<typeof callClaude>[0];
  const safe = async (line: number, fn: () => Promise<void>) => {
    if (!LINES.has(line)) return;
    try {
      await fn();
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : err instanceof Error ? err.name : "error";
      report(line, false, `failed: ${code}`);
    }
  };

  await safe(1, async () => {
    const director = settings.classes.director_interactive.model;
    try {
      const r = await callClaude(spec({ class: "director_interactive", model: director, effort: "medium", maxTokens: 2_000 }), env1("parse"));
      out.callShape = "parse";
      report(1, r.parsed !== null, `shape A parse + fallbacks on ${director}: ${r.parsed !== null ? "parsed" : "not parsed"} (served ${r.servedModel})`);
    } catch (err) {
      const r = await callClaude(spec({ class: "director_interactive", model: director, effort: "medium", maxTokens: 2_000 }), env1("create"));
      out.callShape = "create";
      report(1, r.parsed !== null, `shape A refused (${(err as { code?: string }).code ?? "error"}); shape B create works → callShape "create"`);
    }
  });
  await safe(2, async () => {
    const t0 = Date.now();
    let first = -1;
    const r = await callClaude(spec({ stream: true, onText: () => void (first < 0 && (first = Date.now() - t0)) }), env1(out.callShape ?? "parse"));
    report(2, r.parsed !== null, `structured streaming + fallbacks: parsed ${r.parsed !== null}, first delta after ${first} ms, total ${r.ms} ms`);
  });
  await safe(3, async () => {
    try {
      const r = await callClaude(spec({ task: "copy.field", model: "claude-opus-5-5", fast: true }), env1("parse"));
      report(3, true, `fast + fallbacks accepted on copy.field (${r.fastDropped ? "speed dropped after a 429" : "fast"}): fast routes keep fallbacks`);
    } catch (err) {
      report(3, false, `fast + fallbacks refused (${(err as { code?: string }).code ?? "error"}): fast routes drop fallbacks (AI-§B.7)`);
    }
  });
  await safe(4, async () => {
    const prefix = Array.from({ length: 140 }, (_, i) => `Rule ${i + 1}: write plain, honest product copy without invented figures.`).join("\n");
    const sys = [{ type: "text" as const, text: prefix, cache_control: { type: "ephemeral" as const } }];
    await callClaude(spec({ system: sys }), env1("parse"));
    const r2 = await callClaude(spec({ system: sys }), env1("parse"));
    const read = r2.iterations.reduce((n, i) => n + i.cacheReadTok, 0);
    report(4, read > 0, `cache read on the second call: ${read} tokens (compare the invoice preview with the seed row of ${settings.classes.worker.model})`);
  });
  await safe(5, async () => {
    // sharp's CommonJS export is the factory itself
    const sharp = load<(o: { create: { width: number; height: number; channels: 3; background: { r: number; g: number; b: number } } }) => { jpeg(o: { quality: number }): { toBuffer(): Promise<Buffer> } }>("sharp");
    const photo = await sharp({ create: { width: 1_024, height: 1_024, channels: 3, background: { r: 40, g: 90, b: 160 } } }).jpeg({ quality: 82 }).toBuffer();
    const tile = await sharp({ create: { width: 390, height: 844, channels: 3, background: { r: 230, g: 230, b: 240 } } }).jpeg({ quality: 85 }).toBuffer();
    const count = async (img: Buffer) => {
      const base = { model: settings.classes.worker.model, messages: [{ role: "user" as const, content: [{ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: img.toString("base64") } }, { type: "text" as const, text: "x" }] }] };
      const none = { model: settings.classes.worker.model, messages: [{ role: "user" as const, content: [{ type: "text" as const, text: "x" }] }] };
      return (await c.beta.messages.countTokens(base)).input_tokens - (await c.beta.messages.countTokens(none)).input_tokens;
    };
    const [p, t] = [await count(photo), await count(tile)];
    const [ep, et] = [imageTokens(1_024, 1_024), imageTokens(390, 844)];
    report(5, Math.abs(p - ep) / ep < 0.15 && Math.abs(t - et) / et < 0.15, `per-image tokens: photo ${p} (formula ${ep}), tile ${t} (formula ${et})`);
  });
  await safe(6, async () => {
    const deep = settings.classes.director_deep.model;
    let deepOk = true;
    try {
      await callClaude(spec({ class: "director_deep", model: deep, effort: "high", pattern: "B", maxTokens: 2_000 }), env1("parse"));
    } catch {
      deepOk = false;
    }
    const fast = settings.classes.fast.model;
    const r = await callClaude(spec({ class: "fast", model: fast, task: "injection.screen", fallbacks: false }), env1("parse"));
    const tool = await c.beta.messages.create({ model: fast, max_tokens: 256, output_config: { effort: "low" }, messages: user("Call the tool with word hello."), tools: [{ name: "say", description: "Say a word", input_schema: { type: "object", properties: { word: { type: "string" } }, required: ["word"] } }], tool_choice: { type: "tool", name: "say" } });
    const toolOk = tool.content.some((b) => b.type === "tool_use");
    report(6, deepOk && r.parsed !== null && toolOk, `${deep}: ${deepOk ? "available" : "refused (retention 400?): the deep class stays off"}; ${fast} without fallbacks ${r.parsed !== null ? "ok" : "not parsed"}; forced tool_choice ${toolOk ? "ok" : "refused"}`);
  });
  await safe(7, async () => {
    const base = spec({});
    const p1 = batchParams(base);
    const created = await c.messages.batches.create({ requests: [{ custom_id: "probe_1", params: p1 }, { custom_id: "probe_2", params: p1 }] });
    const polled = await c.messages.batches.retrieve(created.id);
    report(7, !!created.id, `batch ${created.id} submitted; status ${polled.processing_status} (not awaited)`);
  });
  await safe(9, async () => {
    const p = promptFor("director.plan", settings, "server")!;
    const sys = [{ type: "text" as const, text: p.platformBlock(null), cache_control: { type: "ephemeral" as const, ttl: "1h" as const } }];
    const params = { model: settings.classes.director_interactive.model, max_tokens: 1, system: sys, messages: user("ok"), output_config: { effort: "medium" as const } };
    const first = await c.beta.messages.create(params);
    const second = await c.beta.messages.create({ ...params, max_tokens: 16 });
    const read = second.usage.cache_read_input_tokens ?? 0;
    report(9, read > 0, `max_tokens 1 on the Director prefix wrote ${first.usage.cache_creation_input_tokens ?? 0} cache tokens; the next call read ${read}`);
  });
  await safe(10, async () => {
    const p = promptFor("director.plan", settings, "server")!;
    const fx = ALL_FIXTURES.filter((f) => f.task === "design.plan").slice(0, 3);
    const ms: number[] = [];
    const thinking: number[] = [];
    for (const f of fx) {
      const input = { ...(f.input as object), images: [] } as never;
      const prompt = assemble({ kind: "system", storeId: storeCtxOf(f).storeId } as never, p, input, storeCtxOf(f));
      const plan = routeFor("design.plan", settings);
      const r = await callClaude({ task: "design.plan", class: plan.class, model: plan.model, effort: plan.effort, maxTokens: plan.maxTokens, pattern: "A", system: prompt.system, messages: prompt.messages, ...(prompt.format ? { format: prompt.format } : {}), stream: false, fallbacks: plan.fallbacks, fast: false, deadlineMs: 90_000 }, env1(out.callShape ?? "parse"));
      ms.push(r.ms);
      const details = (r.message.usage as unknown as { output_tokens_details?: { thinking_tokens?: number } | null }).output_tokens_details;
      const outTok = r.message.usage.output_tokens || 1;
      thinking.push((details?.thinking_tokens ?? 0) / outTok);
    }
    report(10, ms.length === 3, `Director plan ×${ms.length}: p50 ${pct(ms, 0.5)} ms, p95 ${pct(ms, 0.95)} ms, thinking share ${(median(thinking) * 100).toFixed(0)} % (record in HANDOFF)`);
  });
  await safe(11, async () => {
    const Many = z.object({ items: z.array(z.string()) });
    const manyFormat = { name: "probe_many", zod: Many, json: z.toJSONSchema(Many) as Record<string, unknown> };
    const notes: string[] = [];
    for (const cls of ["director_interactive", "director_deep", "worker", "fast"] as const) {
      const cfg = settings.classes[cls];
      const target = Math.min(6_000, cfg.maxTokens - 500);
      const rates: number[] = [];
      for (let i = 0; i < REPS; i++) {
        let first = 0;
        let last = 0;
        const r = await callClaude(
          spec({
            task: cls === "fast" ? "injection.screen" : cls === "worker" ? "copy.page" : "design.plan",
            class: cls,
            model: cfg.model,
            effort: cfg.effort,
            pattern: cls === "director_deep" ? "B" : "A",
            maxTokens: Math.min(cfg.maxTokens, target + 1_500),
            fallbacks: cls !== "fast",
            stream: true,
            deadlineMs: 90_000,
            format: manyFormat,
            messages: user(`Write ${Math.round(target / 45)} different two-sentence product descriptions of everyday household items, as {"items": [...]}.`),
            onText: () => {
              const t = Date.now();
              if (!first) first = t;
              last = t;
            },
          }),
          env1(out.callShape ?? "parse"),
        );
        const secs = Math.max(0.001, (last - first) / 1000);
        rates.push(r.message.usage.output_tokens / secs);
      }
      out.tokPerSec[cls] = Math.round(median(rates));
      notes.push(`${cls} ${out.tokPerSec[cls]}`);
    }
    report(11, Object.values(out.tokPerSec).every((v) => (v ?? 0) > 0), `tok/s (median of ${REPS}): ${notes.join(", ")}; < 80 on director_interactive moves the critique to a deep-job stage`);
  });
  // lines 8 and 12 (step 9) run against a running server: --base <origin> --store <handle>, QA_AI_PROBE_COOKIE = the
  // Cookie header of an owner session of that store (never printed); line 12 also writes the probe job into the
  // server's database (DATABASE_URL), so it runs against a local server started with SG_AI_NO_AFTER=1 or the flag off
  const base = (arg("--base") ?? "").replace(/\/+$/, "");
  const handle = arg("--store") ?? "";
  const cookie = env.QA_AI_PROBE_COOKIE ?? "";
  const server = base && /^[a-z0-9-]{2,63}$/.test(handle) && cookie ? { base, handle, cookie } : null;
  const aiUrl = (rel: string) => `${server!.base}/api/app/${encodeURIComponent(server!.handle)}/ai/${rel}`;
  for (const line of [8, 12]) if (LINES.has(line) && !server) console.log(`- line ${line}: skipped (needs --base <origin> --store <handle> and QA_AI_PROBE_COOKIE)`);

  await safe(8, async () => {
    if (!server) return;
    const fixture = ALL_FIXTURES.find((f) => f.id === "copy.page/core-blender-fr")!;
    const t0 = Date.now();
    const res = await fetch(aiUrl("copy.page"), {
      method: "POST",
      headers: { cookie: server.cookie, origin: server.base, "content-type": "application/json", accept: "application/x-ndjson" },
      body: JSON.stringify({ input: fixture.input, surface: "wizard", nonce: `probe8${randomBytes(4).toString("hex")}` }),
      signal: AbortSignal.timeout(130_000),
    });
    if (res.status === 202) {
      report(8, true, "the server answers on the poll transport already (202 { runId }): streamTransport stays poll");
      out.streamTransport = "poll";
      return;
    }
    if (res.status !== 200 || !(res.headers.get("content-type") ?? "").startsWith("application/x-ndjson")) {
      report(8, false, `the stream route answered ${res.status} ${res.headers.get("content-type") ?? ""}`);
      return;
    }
    const reader = res.body!.getReader();
    let first = 0;
    let last = 0;
    let lines = 0;
    let tail = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = tail + new TextDecoder().decode(value);
      const parts = text.split("\n");
      tail = parts.pop() ?? "";
      for (const p of parts) {
        if (!p.trim()) continue;
        const t = Date.now() - t0;
        if (!lines) first = t;
        last = t;
        lines++;
      }
    }
    const transport = last - first >= 2_000 ? "stream" : "poll";
    out.streamTransport = transport;
    report(8, lines > 1, `${lines} lines, the first at ${first} ms, the last at ${last} ms → streamTransport "${transport}"${transport === "poll" ? " (a proxy holds the stream back)" : ""}`);
  });

  await safe(12, async () => {
    if (!server) return;
    const { insertJob } = load<typeof import("@/lib/ai/store/jobs")>("@/lib/ai/store/jobs");
    const { claimStage } = load<typeof import("@/lib/ai/jobs/claim")>("@/lib/ai/jobs/claim");
    const { probePlan } = load<typeof import("@/lib/ai/jobs/stages")>("@/lib/ai/jobs/stages");
    const { mintScope } = load<typeof import("@/lib/tenancy/seam")>("@/lib/tenancy/seam");
    const { resolveStoreByHandle } = load<typeof import("@/lib/tenancy/public")>("@/lib/tenancy/public");
    const { newId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
    const { sha256Hex } = load<typeof import("@/lib/ai/prompts/sha256")>("@/lib/ai/prompts/sha256");
    const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
    const store = await resolveStoreByHandle(server.handle);
    if (!store) {
      report(12, false, "the store handle is not in this database (line 12 needs the server's own database)");
      return;
    }
    const scope = mintScope("member", store.id) as import("@/lib/tenancy/types").WriteScope;
    const owner = (await pool().query("SELECT user_id FROM store_members WHERE store_id = ? AND role = 'owner' LIMIT 1", [store.id]))[0] as { user_id: string }[];
    const plan = probePlan(60_000, 20_000);
    const jobId = newId();
    await insertJob(scope, {
      id: jobId,
      kind: "probe",
      task: "probe.sleep",
      inputHash: sha256Hex(`probe12|${jobId}`),
      progress: { done: 0, total: plan.stages.length, stages: {}, plan: plan.stages.map((s) => s.id) },
      class: "director_deep",
      doc: { runIds: [], input: { totalMs: 60_000, stageMs: 20_000 }, plan: [...plan.stages], reservation: null },
      reservedCredits: 0,
      createdBy: owner[0]?.user_id ?? null,
      now: new Date(),
    });
    const poll = async (sameOrigin: boolean) => {
      const res = await fetch(aiUrl(`jobs/${jobId}?advance=1`), { headers: { cookie: server.cookie, accept: "application/json", ...(sameOrigin ? { "sec-fetch-site": "same-origin" } : {}) }, signal: AbortSignal.timeout(120_000) });
      return (await res.json().catch(() => ({}))) as { status?: string; progress?: { done?: number } };
    };
    const attempts = async () => Number(((await pool().query("SELECT stage_attempts FROM ai_jobs WHERE id = ?", [jobId]))[0] as { stage_attempts: number }[])[0]?.stage_attempts ?? -1);
    const notes: string[] = [];
    const bare = await poll(false);
    const unchanged = bare.status === "queued" && (bare.progress?.done ?? 0) === 0;
    notes.push(`no header: ${unchanged ? "unchanged" : `moved (${bare.status})`}`);
    const one = await poll(true);
    const advancedOne = one.progress?.done === 1;
    notes.push(`poll 1: ${one.progress?.done ?? "?"}/3`);
    // a driver that died mid-stage: the stage claimed, its lease and heartbeat stale
    await claimStage(scope, jobId, "after");
    await pool().query("UPDATE ai_jobs SET lease_until = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND), heartbeat_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 61 SECOND) WHERE id = ?", [jobId]);
    const two = await poll(true);
    const resumed = two.progress?.done === 2 && (await attempts()) >= 1;
    notes.push(`poll 2 (stale stage re-claimed): ${two.progress?.done ?? "?"}/3${resumed ? ", resumed" : ""}`);
    const three = await poll(true);
    notes.push(`poll 3: ${three.status}`);
    report(12, unchanged && advancedOne && resumed && three.status === "done", `poll-driven stages: ${notes.join("; ")}`);
  });
  void buildParams;

  if (WRITE) {
    const { getPlatformSetting, setPlatformSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
    const cur = await getPlatformSetting("platform_ai", { fresh: true });
    const probe = {
      ...(cur.probe ?? {}),
      at: new Date().toISOString(),
      callShape: out.callShape ?? cur.probe?.callShape ?? null,
      streamTransport: out.streamTransport ?? cur.probe?.streamTransport ?? null,
      tokPerSec: { ...(cur.probe?.tokPerSec ?? {}), ...out.tokPerSec },
      lines: { ...(cur.probe?.lines ?? {}), ...results },
    };
    await setPlatformSetting("platform_ai", { ...cur, ...(out.callShape ? { callShape: out.callShape } : {}), ...(out.streamTransport ? { streamTransport: out.streamTransport } : {}), probe } as never, { id: "ai-probe", kind: "system" });
    console.log("✓ written to platform_ai.probe");
  }
  await fake?.close();
  const failed = Object.values(results).filter((r) => !r.pass).length;
  console.log(`qa:ai-probe: ${Object.keys(results).length - failed} passed, ${failed} failed${DRY ? " (dry run)" : ""}`);
  process.exit(failed ? 1 : 0);
}

void main().catch((err) => {
  console.error(`✗ probe failed: ${err instanceof Error ? err.name : "error"}`);
  process.exit(1);
});

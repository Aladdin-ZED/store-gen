import "server-only";
/**
 * A localhost fake of the Claude API (P7 AI; ai.md AI-§Q.2, AI-§Q.3, AI-§B.12 `--dry-run`). Server-only and imported
 * only by scripts (test:ai-db, ai-stream-check, the wizard e2e, the probe's dry run): it binds 127.0.0.1 on a free port
 * and the server client reaches it only through the `ai-base-url` test seam (`SG_E2E=1`, `SG_AI_BASE_URL` = its
 * origin, a `cod_test_*` database). It never forwards anything anywhere and accepts any `x-api-key`.
 *
 *   POST /v1/messages                 JSON, or SSE when `stream: true` (text deltas `deltaMs` apart)
 *   POST /v1/messages/count_tokens    { input_tokens } (4 characters per token, 1,369 per image)
 *   POST /v1/messages/batches         create; GET …/batches/{id} retrieve (ended at once); GET …/{id}/results (JSONL)
 *   GET  /v1/models/{id}              the model's facts; an id starting "claude-missing" answers 404
 *
 * The fake keeps a prompt cache (the system prefix up to its last breakpoint, ≥ 512 tokens: written once, then read),
 * counts an image's tokens from its JPEG size and answers a forced `tool_choice` with a `tool_use` block.
 * Every /v1/messages answer comes from the scenario queue (`enqueue`), else from `respond(body)`, else a valid object
 * sampled from the request's own `output_config.format.schema`. Scenarios: ok (JSON text, optional model and usage),
 * refusal (with `stop_details`), a fallback iteration (`usage.iterations` with a `fallback_message`), 429 with
 * retry-after, 529, 500, 400, 401, 403, 404, malformed JSON text, a `max_tokens` stop, and a delay before answering.
 * `calls` counts requests per path; `inFlight` / `maxInFlight` count /v1/messages requests being answered; `aborted`
 * counts streamed answers whose client hung up before the last event (ai-stream-check: a disconnect cancels upstream).
 */
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export type FakeScenario =
  | { kind: "ok"; json?: unknown; text?: string; model?: string; usage?: Partial<FakeUsage>; delayMs?: number; deltaMs?: number }
  | { kind: "refusal"; category?: "cyber" | "bio" | "frontier_llm" | "reasoning_extraction" | "general_harms" | null; partial?: string; delayMs?: number }
  | { kind: "fallback"; json?: unknown; from?: string; to: string; delayMs?: number }
  | { kind: "status"; status: 400 | 401 | 403 | 404 | 429 | 500 | 529; retryAfter?: number; delayMs?: number }
  | { kind: "malformed"; delayMs?: number }
  | { kind: "max_tokens"; partial?: string; delayMs?: number };

export interface FakeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface FakeRequest {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
  /** header names only (never values: the key rides in x-api-key) */
  headerNames: string[];
  beta: string | null;
}

export interface FakeAnthropic {
  origin: string;
  calls: Record<string, number>;
  requests: FakeRequest[];
  inFlight: number;
  maxInFlight: number;
  /** streamed answers whose client went away before the last event (an upstream call aborted mid-stream) */
  aborted: number;
  enqueue(...s: FakeScenario[]): void;
  /** the answer when the queue is empty; null = sample the request's schema */
  respond: ((body: Record<string, unknown>) => FakeScenario) | null;
  /** every /v1/messages answer waits this long first (the 2 s calls of AI-01 (15)) */
  delayMs: number;
  total(path?: string): number;
  reset(): void;
  close(): Promise<void>;
}

const IMAGE_TOKENS = 1_369;
const DEFAULT_MODEL = "claude-sonnet-5-5";

/* ------------------------------------------------------------------ */
/* A valid object from a JSON schema (the default answer)              */
/* ------------------------------------------------------------------ */

type Schema = Record<string, unknown>;

function sample(schema: Schema | undefined, root: Schema, depth = 0): unknown {
  if (!schema || depth > 12) return null;
  if (typeof schema.$ref === "string") {
    const name = schema.$ref.split("/").pop() ?? "";
    const defs = (root.$defs ?? root.definitions ?? {}) as Record<string, Schema>;
    return sample(defs[name], root, depth + 1);
  }
  if (Array.isArray(schema.enum)) return schema.enum[0];
  if ("const" in schema) return schema.const;
  const anyOf = (schema.anyOf ?? schema.oneOf) as Schema[] | undefined;
  if (Array.isArray(anyOf)) return sample(anyOf.find((s) => s.type !== "null") ?? anyOf[0], root, depth + 1);
  const type = Array.isArray(schema.type) ? (schema.type as string[]).find((t) => t !== "null") : (schema.type as string | undefined);
  switch (type) {
    case "object": {
      const props = (schema.properties ?? {}) as Record<string, Schema>;
      return Object.fromEntries(Object.entries(props).map(([k, s]) => [k, sample(s, root, depth + 1)]));
    }
    case "array":
      return [sample(schema.items as Schema, root, depth + 1)];
    case "string":
      return "Plain answer";
    case "integer":
    case "number":
      return 1;
    case "boolean":
      return false;
    case "null":
      return null;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Responses                                                           */
/* ------------------------------------------------------------------ */

let seq = 0;
const msgId = () => `msg_fake_${(++seq).toString(36).padStart(6, "0")}`;

function usageOf(u: Partial<FakeUsage> | undefined, text: string): FakeUsage {
  return {
    input_tokens: u?.input_tokens ?? 900,
    output_tokens: u?.output_tokens ?? Math.max(1, Math.ceil(text.length / 4)),
    cache_read_input_tokens: u?.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: u?.cache_creation_input_tokens ?? 0,
  };
}

interface Built {
  status: number;
  headers?: Record<string, string>;
  /** a message answer */
  message?: { model: string; text: string; stop_reason: string; stop_details: unknown; usage: Record<string, unknown>; toolUse?: { name: string; input: unknown } };
  /** an error answer */
  error?: { type: string; message: string };
  delayMs: number;
  deltaMs: number;
}

const ERROR_TYPE: Record<number, string> = { 400: "invalid_request_error", 401: "authentication_error", 403: "permission_error", 404: "not_found_error", 429: "rate_limit_error", 500: "api_error", 529: "overloaded_error" };

/**
 * The prompt cache of the fake: the system text up to the last `cache_control` block, per model. The first request
 * writes it (`cache_creation_input_tokens`), an identical prefix later reads it (`cache_read_input_tokens`).
 */
function cacheUsage(body: Record<string, unknown>, cache: Set<string>): { read: number; write: number } {
  const system = Array.isArray(body.system) ? (body.system as { text?: string; cache_control?: unknown }[]) : [];
  let last = -1;
  system.forEach((b, i) => {
    if (b.cache_control) last = i;
  });
  if (last < 0) return { read: 0, write: 0 };
  const prefix = system.slice(0, last + 1).map((b) => b.text ?? "").join("\n\n");
  const tokens = Math.ceil(prefix.length / 4);
  if (tokens < 512) return { read: 0, write: 0 };
  const key = `${String(body.model)}|${createHash("sha256").update(prefix).digest("hex")}`;
  if (cache.has(key)) return { read: tokens, write: 0 };
  cache.add(key);
  return { read: 0, write: tokens };
}

function build(s: FakeScenario, body: Record<string, unknown>, cache: Set<string> = new Set()): Built {
  const model = typeof body.model === "string" ? body.model : DEFAULT_MODEL;
  const schema = ((body.output_config as Schema | undefined)?.format as Schema | undefined)?.schema as Schema | undefined;
  const json = (v: unknown) => JSON.stringify(v ?? (schema ? sample(schema, schema) : { ok: true }));
  switch (s.kind) {
    case "ok": {
      const choice = body.tool_choice as { type?: string; name?: string } | undefined;
      const tools = Array.isArray(body.tools) ? (body.tools as { name: string; input_schema?: Schema }[]) : [];
      if (tools.length && (choice?.type === "tool" || choice?.type === "any")) {
        const tool = tools.find((t) => t.name === choice.name) ?? tools[0]!;
        const input = tool.input_schema ? sample(tool.input_schema, tool.input_schema) : {};
        return { status: 200, message: { model, text: "", stop_reason: "tool_use", stop_details: null, usage: { ...usageOf(undefined, "{}") }, toolUse: { name: tool.name, input } }, delayMs: s.delayMs ?? 0, deltaMs: 0 };
      }
      const text = s.text ?? json(s.json);
      const c = s.usage ? { read: s.usage.cache_read_input_tokens ?? 0, write: s.usage.cache_creation_input_tokens ?? 0 } : cacheUsage(body, cache);
      const usage = { ...usageOf(s.usage, text), cache_read_input_tokens: c.read, cache_creation_input_tokens: c.write };
      return { status: 200, message: { model: s.model ?? model, text, stop_reason: "end_turn", stop_details: null, usage }, delayMs: s.delayMs ?? 0, deltaMs: s.deltaMs ?? 0 };
    }
    case "refusal": {
      const text = s.partial ?? "";
      return { status: 200, message: { model, text, stop_reason: "refusal", stop_details: { type: "refusal", category: s.category ?? null, explanation: null }, usage: { ...usageOf(undefined, text) } }, delayMs: s.delayMs ?? 0, deltaMs: 0 };
    }
    case "fallback": {
      const text = json(s.json);
      const from = s.from ?? model;
      const u = usageOf(undefined, text);
      return {
        status: 200,
        message: {
          model: s.to,
          text,
          stop_reason: "end_turn",
          stop_details: null,
          usage: {
            ...u,
            iterations: [
              { type: "message", model: from, input_tokens: 400, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null },
              { type: "fallback_message", model: s.to, input_tokens: u.input_tokens, output_tokens: u.output_tokens, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null },
            ],
          },
        },
        delayMs: s.delayMs ?? 0,
        deltaMs: 0,
      };
    }
    case "status":
      return { status: s.status, headers: s.retryAfter !== undefined ? { "retry-after": String(s.retryAfter) } : {}, error: { type: ERROR_TYPE[s.status] ?? "api_error", message: `fake ${s.status}` }, delayMs: s.delayMs ?? 0, deltaMs: 0 };
    case "malformed":
      return { status: 200, message: { model, text: '{"oops": tru', stop_reason: "end_turn", stop_details: null, usage: { ...usageOf(undefined, "{") } }, delayMs: s.delayMs ?? 0, deltaMs: 0 };
    case "max_tokens": {
      const text = s.partial ?? '{"kicker": "Partial';
      return { status: 200, message: { model, text, stop_reason: "max_tokens", stop_details: null, usage: { ...usageOf(undefined, text) } }, delayMs: s.delayMs ?? 0, deltaMs: 0 };
    }
  }
}

function messageJson(m: NonNullable<Built["message"]>): Record<string, unknown> {
  const content: unknown[] = m.text ? [{ type: "text", text: m.text }] : [];
  if (m.toolUse) content.push({ type: "tool_use", id: `toolu_fake_${(++seq).toString(36)}`, name: m.toolUse.name, input: m.toolUse.input });
  return { id: msgId(), type: "message", role: "assistant", model: m.model, content, stop_reason: m.stop_reason, stop_sequence: null, stop_details: m.stop_details, usage: m.usage };
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function sendSse(res: ServerResponse, m: NonNullable<Built["message"]>, deltaMs: number, onAbort: () => void): Promise<void> {
  let gone = false;
  res.on("close", () => {
    if (!res.writableEnded && !gone) {
      gone = true;
      onAbort();
    }
  });
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  const ev = (type: string, data: unknown) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...(data as object) })}\n\n`);
  const startUsage = { ...m.usage, output_tokens: 1 };
  delete (startUsage as { iterations?: unknown }).iterations;
  ev("message_start", { message: { id: msgId(), type: "message", role: "assistant", model: m.model, content: [], stop_reason: null, stop_sequence: null, stop_details: null, usage: startUsage } });
  if (m.text) {
    ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    // ~24-character deltas, split anywhere (inside strings and escapes too)
    for (let i = 0; i < m.text.length && !gone; i += 24) {
      ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: m.text.slice(i, i + 24) } });
      if (deltaMs > 0) await wait(deltaMs);
    }
    ev("content_block_stop", { index: 0 });
  }
  ev("message_delta", { delta: { stop_reason: m.stop_reason, stop_sequence: null, stop_details: m.stop_details }, usage: { ...m.usage } });
  ev("message_stop", {});
  res.end();
}

/* ------------------------------------------------------------------ */
/* The server                                                          */
/* ------------------------------------------------------------------ */

function readBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      if (!chunks.length) return resolve(null);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>);
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

/** ⌈w/28⌉ × ⌈h/28⌉ for a base64 JPEG whose size the SOF marker gives; 1,369 (1,024²) otherwise. */
function imageTokensOf(source: unknown): number {
  const data = (source as { data?: unknown } | null)?.data;
  if (typeof data !== "string") return IMAGE_TOKENS;
  const b = Buffer.from(data, "base64");
  for (let i = 2; i + 9 < b.length; ) {
    if (b[i] !== 0xff) return IMAGE_TOKENS;
    const marker = b[i + 1]!;
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      const h = b.readUInt16BE(i + 5);
      const w = b.readUInt16BE(i + 7);
      return Math.ceil(w / 28) * Math.ceil(h / 28);
    }
    i += 2 + len;
  }
  return IMAGE_TOKENS;
}

function countTokens(body: Record<string, unknown> | null): number {
  let chars = 0;
  let images = 0;
  const walk = (v: unknown, key: string | null): void => {
    if (typeof v === "string") {
      if (key !== "data") chars += v.length;
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, null));
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (o.type === "image") images += imageTokensOf(o.source);
      for (const [k, x] of Object.entries(o)) walk(x, k);
    }
  };
  walk(body?.system ?? null, null);
  walk(body?.messages ?? null, null);
  return Math.ceil(chars / 4) + images;
}

interface FakeBatch {
  id: string;
  requests: { custom_id: string; params: Record<string, unknown> }[];
  created: string;
}

/** Starts the fake on 127.0.0.1 and a free port (or `port`). */
export async function startFakeAnthropic(opts: { port?: number } = {}): Promise<FakeAnthropic> {
  const queue: FakeScenario[] = [];
  const batches = new Map<string, FakeBatch>();
  const promptCache = new Set<string>();
  let server: Server | null = null;
  const fake: FakeAnthropic = {
    origin: "",
    calls: {},
    requests: [],
    inFlight: 0,
    maxInFlight: 0,
    aborted: 0,
    respond: null,
    delayMs: 0,
    enqueue: (...s) => void queue.push(...s),
    total: (path) => (path ? (fake.calls[path] ?? 0) : Object.values(fake.calls).reduce((a, b) => a + b, 0)),
    reset: () => {
      queue.length = 0;
      fake.calls = {};
      fake.requests = [];
      fake.inFlight = 0;
      fake.maxInFlight = 0;
      fake.aborted = 0;
      fake.respond = null;
      fake.delayMs = 0;
    },
    close: () => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())),
  };

  const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json", "request-id": `req_fake_${seq}`, ...headers });
    res.end(JSON.stringify(body));
  };

  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname.replace(/\/msgbatch_[a-z0-9]+/i, "/{id}").replace(/\/v1\/models\/[^/]+$/, "/v1/models/{id}");
    fake.calls[path] = (fake.calls[path] ?? 0) + 1;
    const body = req.method === "POST" ? await readBody(req) : null;
    fake.requests.push({ method: req.method ?? "GET", path, body, headerNames: Object.keys(req.headers).sort(), beta: (req.headers["anthropic-beta"] as string | undefined) ?? null });
    if (fake.requests.length > 500) fake.requests.shift();
    try {
      if (req.method === "POST" && url.pathname === "/v1/messages") {
        fake.inFlight++;
        fake.maxInFlight = Math.max(fake.maxInFlight, fake.inFlight);
        try {
          const s = queue.shift() ?? fake.respond?.(body ?? {}) ?? { kind: "ok" };
          const b = build(s, body ?? {}, promptCache);
          if (fake.delayMs + b.delayMs > 0) await wait(fake.delayMs + b.delayMs);
          if (b.error) return json(res, b.status, { type: "error", error: b.error }, b.headers);
          if (body?.stream === true) return await sendSse(res, b.message!, b.deltaMs, () => void fake.aborted++);
          return json(res, 200, messageJson(b.message!));
        } finally {
          fake.inFlight--;
        }
      }
      if (req.method === "POST" && url.pathname === "/v1/messages/count_tokens") return json(res, 200, { input_tokens: countTokens(body) });
      if (req.method === "POST" && url.pathname === "/v1/messages/batches") {
        const id = `msgbatch_fake${(++seq).toString(36)}`;
        const reqs = Array.isArray(body?.requests) ? (body!.requests as FakeBatch["requests"]) : [];
        batches.set(id, { id, requests: reqs, created: new Date().toISOString() });
        return json(res, 200, batchJson(fake.origin, batches.get(id)!, "in_progress"));
      }
      const bm = /^\/v1\/messages\/batches\/(msgbatch_[a-z0-9]+)(\/results)?$/i.exec(url.pathname);
      if (req.method === "GET" && bm) {
        const b = batches.get(bm[1]!);
        if (!b) return json(res, 404, { type: "error", error: { type: "not_found_error", message: "fake batch" } });
        if (!bm[2]) return json(res, 200, batchJson(fake.origin, b, "ended"));
        res.writeHead(200, { "content-type": "application/binary" });
        for (const r of b.requests) {
          const built = build(queue.shift() ?? { kind: "ok" }, r.params ?? {}, promptCache);
          const result = built.message ? { type: "succeeded", message: messageJson(built.message) } : { type: "errored", error: { type: "error", error: built.error } };
          res.write(`${JSON.stringify({ custom_id: r.custom_id, result })}\n`);
        }
        return res.end();
      }
      const mm = /^\/v1\/models\/([^/]+)$/.exec(url.pathname);
      if (req.method === "GET" && mm) {
        const id = decodeURIComponent(mm[1]!);
        if (id.startsWith("claude-missing")) return json(res, 404, { type: "error", error: { type: "not_found_error", message: "fake model" } });
        return json(res, 200, { type: "model", id, display_name: id, created_at: "2026-01-01T00:00:00Z", max_input_tokens: 1_000_000, max_tokens: 128_000 });
      }
      return json(res, 404, { type: "error", error: { type: "not_found_error", message: "fake route" } });
    } catch {
      if (!res.headersSent) json(res, 500, { type: "error", error: { type: "api_error", message: "fake failure" } });
      else res.end();
    }
  });
  await new Promise<void>((resolve) => server!.listen(opts.port ?? 0, "127.0.0.1", resolve));
  fake.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return fake;
}

function batchJson(origin: string, b: FakeBatch, status: "in_progress" | "ended"): Record<string, unknown> {
  const n = b.requests.length;
  return {
    id: b.id,
    type: "message_batch",
    processing_status: status,
    request_counts: { processing: status === "ended" ? 0 : n, succeeded: status === "ended" ? n : 0, errored: 0, canceled: 0, expired: 0 },
    created_at: b.created,
    ended_at: status === "ended" ? new Date().toISOString() : null,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    archived_at: null,
    cancel_initiated_at: null,
    results_url: status === "ended" ? `${origin}/v1/messages/batches/${b.id}/results` : null,
  };
}

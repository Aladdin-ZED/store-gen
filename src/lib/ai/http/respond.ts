import "server-only";
/**
 * The answers of the AI route handlers (P7 AI; ai.md AI-§A.7, AI-§A.3; docs/STORE-SAAS.md §C.9, §E.2, §H.12). Every
 * handler under `src/app/api/app/[store]/ai/**` calls `storeGuard(req, handle, "ai.use")` first and answers through
 * these helpers, so every body has one shape:
 *
 *   success   the route's own JSON (`{ ok: true, … }`), NDJSON, `202 { ok: true, runId | jobId }` or `204`
 *   failure   `{ ok: false, error: AiFailCode, retryable, retryAfterSec? }` with the status of `FAIL_CODES`
 *             (policy 403, input 422, money 429, busy / provider 503), `Retry-After` when it is known
 *   flag_off  the neutral `{ ok: false, error: "not_found" }` 404 the seam answers for an unknown handle: a task whose
 *             release or flag is off, an unknown task id and another store's run or job id answer the same bytes
 *
 * The envelopes are parsed before the task is looked up, so an unknown task and a hidden one answer alike whatever
 * the body is (AI-§A.2: an invisible task never shows).
 */
import { z } from "zod";
import { json, noContent, readJson } from "./plumbing";
import { guardResponse } from "@/lib/tenancy/seam";
import { FAIL_CODES } from "../provider/failures";
import type { AiFailCode } from "../provider/types";
import type { AiSurface } from "../tasks";

/** Every AI handler that never starts or drives a job (core D56, AI-§A.7). */
export const AI_ROUTE_MAX_DURATION_S = 120;

/** The largest body an AI route reads: three photos of the analyze / plan inputs (≤ 400 KB each as base64) and the brief. */
export const AI_BODY_MAX_BYTES = 1_000_000;

/** The surfaces a browser may name (never `system` or `console`: those are the server's own runs). */
const BROWSER_SURFACES = ["onboarding", "wizard", "builder", "settings", "catalog", "ops", "copilot", "dashboard"] as const satisfies readonly AiSurface[];

const present = (v: unknown) => v !== undefined;
const NonceZ = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
/** a wizard session or a Director pass, minted by the browser */
const PassIdZ = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

/** `POST /ai/[task]` (AI-§A.7). */
export const TaskEnvelopeZ = z.strictObject({
  input: z.unknown().refine(present, "input"),
  surface: z.enum(BROWSER_SURFACES),
  nonce: NonceZ.optional(),
  /** false: a stream task answered as JSON (a caller that cannot read NDJSON) */
  stream: z.boolean().optional(),
});
export type TaskEnvelope = z.output<typeof TaskEnvelopeZ>;

/** `POST /ai/director/{plan,critique,verify}`: the stage input and the pass it belongs to. */
export const DirectorEnvelopeZ = z.strictObject({
  input: z.unknown().refine(present, "input"),
  pass: z.strictObject({ session: PassIdZ, id: PassIdZ }),
  surface: z.enum(["wizard", "builder"]).default("wizard"),
  nonce: NonceZ.optional(),
});
export type DirectorEnvelope = z.output<typeof DirectorEnvelopeZ>;

/** The typed failure answer of an AI route. */
export function failResponse(code: AiFailCode, opts: { retryAfterSec?: number; retryable?: boolean } = {}): Response {
  if (code === "flag_off") return notFound();
  const info = FAIL_CODES[code];
  const retryAfterSec = opts.retryAfterSec !== undefined ? Math.max(0, Math.ceil(opts.retryAfterSec)) : undefined;
  const body = { ok: false as const, error: code, retryable: opts.retryable ?? info.retryable, ...(retryAfterSec !== undefined ? { retryAfterSec } : {}) };
  return json(body, info.status, retryAfterSec !== undefined ? { "Retry-After": String(retryAfterSec) } : undefined);
}

/** The neutral 404 (an unknown task, a hidden one, another store's run or job id): the seam's own bytes. */
export function notFound(): Response {
  return guardResponse("not_found", 404);
}

/** `410 Gone`: the withdrawn pre-warm (AI-D36) and a superseded Director pass. */
export function gone(error: "gone" | "pass_superseded"): Response {
  return json({ ok: false, error, retryable: false }, 410);
}

export { json, noContent };

/** The JSON body of an AI POST, or the 422 / 413 / 415 of a body that is not one. */
export async function readEnvelope<S extends z.ZodType>(req: Request, schema: S): Promise<{ ok: true; value: z.output<S> } | { ok: false; response: Response }> {
  const body = await readJson(req, AI_BODY_MAX_BYTES);
  if (!body.ok) {
    const status = body.status === 400 ? 422 : body.status;
    return { ok: false, response: json({ ok: false, error: "input_invalid", retryable: false }, status) };
  }
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) return { ok: false, response: failResponse("input_invalid") };
  return { ok: true, value: parsed.data };
}

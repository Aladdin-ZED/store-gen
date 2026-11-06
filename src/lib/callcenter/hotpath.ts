import "server-only";
/**
 * The agent hot path's HTTP plumbing (P4 CALL CENTER; operations.md OD36, OD37, §13.2, §13.2b, §L, §M.2): the four
 * route handlers `POST /api/app/<h>/ops/{next,outcome,reveal,presence}` share it. Each handler opens with its own
 * `storeGuard` (lint L13), then:
 *
 *   idemOf        the `Idempotency-Key` header, a UUID the console minted when it drew the control; missing or not a
 *                 UUID → 400 `idem_required` (presence takes none: a heartbeat is idempotent by itself)
 *   bodyOf        the JSON body, ≤ 2 KB (413 `too_large` above, 415 for another type, 400 `invalid` for bad JSON),
 *                 parsed with the route's zod schema (400 `invalid`)
 *   answer        bounded JSON with the API headers (no-store, noindex, nosniff): a card fits 5.5 KB gz
 *                 (src/lib/callcenter/card.ts), so every answer stays under 6 KB gz
 *   failure       a refusal the seam or a bucket throws inside the handler (`SeamError`) as the guard's JSON answer
 *                 (429 for a bucket); anything else is logged (no request data) and answers 500 `server`
 *
 * Domain answers keep their body (`{ ok: false, error }` / the queue's `{ ok: false, reason }`); `statusOf` maps the
 * codes the console tells apart by status.
 */
import type { z } from "zod";
import { isIdemKey } from "@/lib/callcenter/idem";
import { json, logError, readJson } from "@/lib/orders/http";
import { guardResponse, SeamError } from "@/lib/tenancy/seam";

/** OD36: a hot-path request body, at most */
export const HOT_BODY_MAX = 2_048;

type Fail = { ok: false; response: Response };

/** The request's `Idempotency-Key` (a UUID), or the 400 `idem_required` answer. */
export function idemOf(req: Request): { ok: true; idem: string } | Fail {
  const key = req.headers.get("idempotency-key")?.trim();
  return isIdemKey(key) ? { ok: true, idem: key.toLowerCase() } : { ok: false, response: answer({ ok: false, error: "idem_required" }, 400) };
}

/** The body parsed by `schema`, or the 413 / 415 / 400 answer. */
export async function bodyOf<S extends z.ZodType>(req: Request, schema: S): Promise<{ ok: true; value: z.output<S> } | Fail> {
  const body = await readJson(req, HOT_BODY_MAX);
  if (!body.ok) return { ok: false, response: answer({ ok: false, error: body.status === 413 ? "too_large" : body.status === 415 ? "unsupported_type" : "invalid" }, body.status) };
  const parsed = schema.safeParse(body.value);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, response: answer({ ok: false, error: "invalid" }, 400) };
}

/** A JSON answer with the API headers (no-store). */
export const answer = (body: unknown, status = 200): Response => json(body, status);

/** The status of a domain error code (the body carries the code itself). */
export function statusOf(error: string): number {
  switch (error) {
    case "not_found":
      return 404;
    case "conflict":
      return 409;
    case "forbidden":
    case "read_only":
    case "impersonation_read_only":
    case "step_up":
      return 403;
    case "rate_limited":
      return 429;
    case "invalid":
    case "too_short":
      return 400;
    default:
      // the state machine's refusals: illegal, reason_required, bad_due, bad_hold, bad_duplicate, locked_ship, …
      return 422;
  }
}

/** A throw inside a handler: the seam's refusals as the guard answers them, anything else a logged 500. */
export function failure(err: unknown, area: string): Response {
  if (err instanceof SeamError) return guardResponse(err.code, err.status);
  logError(area, err);
  return answer({ ok: false, error: "server" }, 500);
}

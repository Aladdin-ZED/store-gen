import "server-only";
/**
 * Outbox handler `capi` (P5 INTEGRATIONS; operations.md OPE-§20.4 (4), OPE-§J; docs/STORE-SAAS.md §H.1, §H.8): the
 * server-side ad events (Meta Purchase, ConfirmedOrder, DeliveredOrder; TikTok Events API Purchase).
 * Extension file (docs/STORE-SAAS.md §K.3), created empty at P0 and imported for its effect by src/lib/jobs/registry.ts;
 * the track registers its handler here and never edits the registry.
 *
 * One item = one event for one pixel (src/lib/orders/conversions-core.ts `capiOutboxItems`). At send time:
 *   - the store's `tracking_secrets` and pixel library are loaded (a token removed meanwhile → done, nothing sent);
 *   - the 7-day guard (OD20, §H.1): an event older than 7 days − 1 h is dropped (`cancelled:stale_event`, CCR r1-p5-9)
 *     and the order's timeline says why (`capi_stale`);
 *   - the body: Meta's Purchase body with the event name swapped for a custom event, TikTok's for the Purchase; the
 *     test code only inside the page's active test window; the token in the body (Meta) or a header (TikTok), never
 *     in a URL; through `integrationFetch` (the e2e seam);
 *   - the answer: a 2xx the platform accepted → done; no answer, 408, 429, 5xx or a rate code → retry; any other 4xx
 *     or refusal → final (`retry: false`). Each answer updates the pixel's health (throttled), the
 *     `integration_status` row `capi` / "<platform>:<pixel>" (≤ 1 write / min) and the order's timeline (`capi_sent`;
 *     `capi_failed` once, when the failure is final, with `int.delivery_dead` for the store's owners).
 * The `capi_enabled` kill switch pauses the kind (`paused()`): the items wait, unclaimed, without burning their backoff.
 * Nothing here logs a token, a payload or a customer field: cause codes and the pixel's last 4 digits only.
 */
import { z } from "zod";
import { classifyMetaError, type CauseCode } from "@/lib/integrations/causes";
import { notifyDeliveryDead, recordIntegrationStatus } from "@/lib/integrations/status";
import { integrationFetch } from "@/lib/integrations/transport";
import { isFinalFailure, registerOutboxHandler, type ClaimedItem, type SendResult } from "@/lib/jobs/outbox";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import {
  acceptedBy,
  failureCode,
  fromWire,
  hashCustomer,
  isStale,
  metaDescribe,
  metaEventBody,
  metaEventsUrl,
  readJson,
  retryableFailure,
  serverCredentials,
  SERVER_EVENTS,
  tiktokDescribe,
  tiktokPurchaseBody,
  TIKTOK_EVENTS_URL,
  type CapiPayload,
  type HealthCode,
} from "@/lib/orders/conversions-core";
import { capiDeps, notBuiltYet, storeFallbackUrl } from "@/lib/orders/conversions";
import { errorSummary } from "@/lib/orders/log";
import { recordPixelHealth } from "@/lib/pixels/health.server";
import type { ServerPlatform } from "@/lib/pixels/ids";
import { getStoreSettings } from "@/lib/settings";
import { activeKillSwitches } from "@/lib/tenancy/entitlements";
import type { WriteScope } from "@/lib/tenancy/types";

const LOG = "[capi]";
/** the handler's own budget per send (the drainer's `timeoutMs` is 8 s) */
const SEND_TIMEOUT_MS = 7_500;
/**
 * A dropped item (CCR r1-p5-9): a final failure whose error starts with this is `cancelled` by P8's drainer, never
 * `dead` (not replayable, no dead notice). Until the drainer reads it the item goes `dead` with that error.
 */
export const CANCELLED_PREFIX = "cancelled:";

const ID_RE = /^[A-Za-z0-9_.-]{1,40}$/;
/** The payload as the handler trusts it (an item enqueued by an older build, or tampered, is refused). */
const Payload = z.object({
  platform: z.enum(["meta", "tiktok"]),
  pixelId: z.string().regex(/^[A-Za-z0-9]{5,32}$/),
  event: z.enum(SERVER_EVENTS),
  eventId: z.string().regex(ID_RE),
  eventTime: z.string().max(40),
  ctx: z.enum(["created", "sealed", "missing"]),
  conversion: z.looseObject({ orderId: z.string().regex(ID_RE), pageId: z.string().max(26), time: z.string().max(40), pixels: z.object({ meta: z.array(z.string()), tiktok: z.array(z.string()) }) }),
});

/** The cause code of a failed answer (`integration_status.last_error_code`). */
export function capiCause(platform: ServerPlatform, status: number | null, json: Record<string, unknown> | null): CauseCode {
  if (status === null) return "network";
  if (platform === "meta") {
    const err = (json?.error ?? null) as { code?: unknown; error_subcode?: unknown; message?: unknown } | null;
    const num = (v: unknown) => (v === undefined || v === null || !Number.isFinite(Number(v)) ? null : Number(v));
    return classifyMetaError({ status, code: num(err?.code), subcode: num(err?.error_subcode), message: typeof err?.message === "string" ? err.message : null });
  }
  const byHealth: Record<HealthCode, CauseCode> = { token: "token_invalid", permission: "permission_denied", pixel: "pixel_not_found", rate: "rate_limited", network: "server_error", other: "event_rejected" };
  return byHealth[failureCode(platform, status, json)];
}

const last4 = (pixelId: string) => pixelId.slice(-4);

/** A timeline event of the order (P4's `appendOrderEvent`; skipped while it is the P0 stub). Never throws. */
async function timeline(scope: WriteScope, orderId: string, type: "capi_sent" | "capi_failed" | "capi_stale", meta: Record<string, unknown>): Promise<void> {
  try {
    const r = await capiDeps().appendOrderEvent(scope, orderId, { actorKind: "system", type, meta });
    if (!r.ok && r.error !== "not_found") console.error(`${LOG} ${type} not recorded: ${r.error}`);
  } catch (err) {
    if (!notBuiltYet(err)) console.error(`${LOG} ${type} not recorded:`, errorSummary(err));
  }
}

/** One send of one item (exported for the tests; the drainer calls it through the registered handler). */
export async function sendCapiItem(item: ClaimedItem<unknown>, opts: { now?: number } = {}): Promise<SendResult> {
  const now = opts.now ?? Date.now();
  if (!item.storeId) return { ok: false, retry: false, error: "refused: no store" };
  const parsed = Payload.safeParse(item.payload);
  if (!parsed.success) return { ok: false, retry: false, error: "refused: bad payload" };
  const p = parsed.data as unknown as CapiPayload;
  const scope = systemScope(systemCtx("outbox.capi"), item.storeId);
  const c = fromWire(p.conversion);
  const orderId = c.orderId;
  const meta = { platform: p.platform, pixel: last4(p.pixelId), event: p.event, ...(p.ctx === "missing" ? { ctx: "server_fields_only" } : {}) };
  const targetId = `${p.platform}:${p.pixelId}`;

  // the 7-day guard (OD20): never sent, the timeline says why; not a delivery failure, so no dead notice
  if (isStale(new Date(p.eventTime), now)) {
    await timeline(scope, orderId, "capi_stale", meta);
    return { ok: false, retry: false, error: `${CANCELLED_PREFIX}stale_event` };
  }

  // the store's own token and library, read now (a token removed meanwhile: done, nothing sent)
  const { tracking_secrets: secrets, pixel_library: library } = await getStoreSettings(scope, ["tracking_secrets", "pixel_library"]);
  const cred = serverCredentials(secrets, library, p.platform, p.pixelId, c.pageId, now);
  if (!cred) return { ok: true };
  // TikTok receives the Purchase only (OPE-§20.5); an older item of another event is done without a send
  if (p.platform === "tiktok" && p.event !== "Purchase") return { ok: true };

  const event = c.sourceUrl ? c : { ...c, sourceUrl: await storeFallbackUrl(scope, c).catch(() => null) };
  const h = hashCustomer(event.customer);
  const testMode = !!cred.testCode;
  let status: number | null = null;
  let json: Record<string, unknown> | null = null;
  try {
    const res =
      p.platform === "meta"
        ? await integrationFetch(metaEventsUrl(p.pixelId), {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            // in the body, not the URL: tokens never end up in URL logs
            body: JSON.stringify({ ...metaEventBody(event, h, p.event, cred.testCode), access_token: cred.token }),
            signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
          })
        : await integrationFetch(TIKTOK_EVENTS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json", "Access-Token": cred.token },
            body: JSON.stringify(tiktokPurchaseBody(event, h, p.pixelId, cred.testCode)),
            signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
          });
    status = res.status;
    json = await readJson(res);
  } catch {
    status = null;
  }

  if (status !== null && acceptedBy(p.platform, status, json)) {
    await recordPixelHealth(scope, [{ platform: p.platform, id: p.pixelId, state: "ok", testMode }], { throttle: true });
    await recordIntegrationStatus(scope, { kind: "capi", targetId, outcome: "ok" }).catch((err: unknown) => console.error(`${LOG} status:`, errorSummary(err)));
    await timeline(scope, orderId, "capi_sent", { ...meta, ...(testMode ? { test: true } : {}) });
    return { ok: true, status };
  }

  const retry = retryableFailure(p.platform, status, json);
  const code = capiCause(p.platform, status, json);
  const describe = status === null ? "no answer" : p.platform === "meta" ? metaDescribe(status, json) : tiktokDescribe(status, json);
  const result: SendResult = { ok: false, retry, ...(status !== null ? { status } : {}), error: `${code}: ${describe}`.slice(0, 280) };
  await recordPixelHealth(scope, [{ platform: p.platform, id: p.pixelId, state: "refused", code: failureCode(p.platform, status, json), testMode }], { throttle: true });
  await recordIntegrationStatus(scope, { kind: "capi", targetId, outcome: retry ? "retry" : "failed", code, status: status ?? 0 }).catch((err: unknown) => console.error(`${LOG} status:`, errorSummary(err)));
  console.error(`${LOG} ${p.platform} ${p.event} (pixel …${last4(p.pixelId)}) failed: ${code}`);
  if (isFinalFailure(item, result)) {
    await timeline(scope, orderId, "capi_failed", { ...meta, code });
    // one notice per store and kind per 60 minutes (batched), and the store's health is marked dirty
    await notifyDeliveryDead(scope, "capi");
  }
  return result;
}

/** The `capi_enabled` kill switch (§H.8): while tripped the kind is not claimed and its items wait. */
export async function capiPaused(): Promise<boolean> {
  try {
    return (await activeKillSwitches()).includes("capi_enabled");
  } catch (err) {
    console.error(`${LOG} kill switches unreadable:`, errorSummary(err));
    return false;
  }
}

registerOutboxHandler<unknown>({
  kind: "capi",
  maxPerTick: 60,
  perStorePerTick: 20,
  timeoutMs: 8_000,
  send: (item) => sendCapiItem(item),
  paused: capiPaused,
});

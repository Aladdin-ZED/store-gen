import "server-only";
/**
 * The order drawer's integration blocks (P5 INTEGRATIONS; operations.md OPE-§12.7 "Google Sheets" and "Ad events",
 * OPE-§20, OD18-OD20, D54): `orderIntegrationState(scope, orderId)`, the one read P4's drawer mounts through
 * src/components/admin/integrations/{order-sheet-block,order-ad-events}.tsx.
 *
 *   sheet     the order's `sheet_status` as its word, and the stored failure text (`explain()`'s words, written by the
 *             push runner) while it failed
 *   adEvents  per pixel, the server Purchase: sent, sending, waiting for confirmation (the trigger is a later moment),
 *             skipped (test order, spam, typed order, risk N), dropped (older than 7 days), failed (token refused, or
 *             another cause's words), or nothing recorded; from the order's `capi` outbox rows, then its timeline
 *             (`capi_sent` / `capi_failed` / `capi_stale`), then the order's own gates for the pixels with a server
 *             token that have neither
 *
 * Scoped: the order, its outbox rows and its events are read through the seam (`byId` / `whereStore`); another store's
 * order is `null` (the action's not_found). Never a payload, a token, a phone or a customer field: a pixel is its
 * platform and its last 4 digits.
 */
import { and, eq, inArray, like } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orderEvents, orders, outbox } from "@/lib/db/schema";
import { CONVERSION_MAX_RISK, MANUAL_SOURCES, triggerFor } from "@/lib/orders/conversions-core";
import { getStoreSettings } from "@/lib/settings";
import { byId, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { causeKey, isCauseCode } from "./causes";

export type SheetState = "pending" | "synced" | "failed" | "disabled";

export type AdEventState =
  | "sent"
  | "sending"
  | "waiting"
  | "skipped_test"
  | "skipped_spam"
  | "skipped_manual"
  | "skipped_risk"
  | "dropped_old"
  | "failed_token"
  | "failed"
  | "none";

export interface OrderAdEvent {
  platform: "meta" | "tiktok";
  /** the pixel's last 4 digits */
  pixel: string;
  state: AdEventState;
  /** skipped_risk: the order's score */
  risk?: number;
  /** failed: the cause's words (`int.cause.<code>`) */
  causeKey?: string;
}

export interface OrderIntegrationState {
  sheet: { status: SheetState; label: string; error: string | null };
  adEvents: OrderAdEvent[];
}

/** OD20 / §H.1: an event older than 7 days is never sent. */
const MAX_AGE_MS = 7 * 24 * 3600_000;
const TOKEN_CAUSES = new Set(["token_revoked", "token_invalid"]);
const DELIVERED = new Set(["delivered"]);

const pixelKey = (platform: string, last4: string) => `${platform}:${last4}`;

/** The state of one outbox row of the Purchase (pure). */
export function outboxAdState(row: { state: string; lastStatus: number | null; lastError: string | null }): Pick<OrderAdEvent, "state" | "causeKey"> {
  if (row.state === "pending" || row.state === "running") return { state: "sending" };
  if (row.state === "done") return row.lastStatus !== null && row.lastStatus >= 200 && row.lastStatus < 300 ? { state: "sent" } : { state: "none" };
  if (row.lastError?.includes("stale_event")) return { state: "dropped_old" };
  if (row.state === "cancelled") return { state: "none" };
  const code = (row.lastError ?? "").split(":")[0] ?? "";
  if (TOKEN_CAUSES.has(code)) return { state: "failed_token" };
  return { state: "failed", ...(isCauseCode(code) ? { causeKey: causeKey(code)! } : {}) };
}

/** What the order's own gates say for a pixel with no row and no event (pure; OPE-§20.2's matrix, D54). */
export function gateAdState(
  o: { isTest: boolean; honeypot: boolean; source: string; risk: number; createdAt: Date; confirmed: boolean; delivered: boolean },
  conv: { trigger: "order" | "confirmed" | "delivered"; manualOrders: boolean },
  now: number,
): Pick<OrderAdEvent, "state" | "risk"> {
  if (o.isTest) return { state: "skipped_test" };
  if (o.honeypot) return { state: "skipped_spam" };
  if (!conv.manualOrders && MANUAL_SOURCES.includes(o.source)) return { state: "skipped_manual" };
  if (conv.trigger === "order" && o.risk >= CONVERSION_MAX_RISK) return { state: "skipped_risk", risk: o.risk };
  const reached = conv.trigger === "order" || (conv.trigger === "confirmed" ? o.confirmed : o.delivered);
  if (!reached) return now - o.createdAt.getTime() > MAX_AGE_MS ? { state: "dropped_old" } : { state: "waiting" };
  return { state: "none" };
}

const SHEET_LABEL: Record<SheetState, string> = {
  pending: "int.ord.sheet.pending",
  synced: "int.ord.sheet.synced",
  failed: "int.ord.sheet.failed",
  disabled: "int.ord.sheet.disabled",
};

export async function orderIntegrationState(scope: StoreScope, orderId: string, now: number = Date.now()): Promise<OrderIntegrationState | null> {
  const [order] = await db
    .select({
      id: orders.id,
      pageId: orders.pageId,
      source: orders.source,
      isTest: orders.isTest,
      flags: orders.flags,
      riskScore: orders.riskScore,
      createdAt: orders.createdAt,
      confirmState: orders.confirmState,
      shipState: orders.shipState,
      sheetStatus: orders.sheetStatus,
      sheetError: orders.sheetError,
    })
    .from(orders)
    .where(byId(orders, scope, orderId))
    .limit(1);
  if (!order) return null;

  const [rows, events, settings] = await Promise.all([
    db
      .select({ targetId: outbox.targetId, state: outbox.state, lastStatus: outbox.lastStatus, lastError: outbox.lastError })
      .from(outbox)
      .where(whereStore(outbox, scope, eq(outbox.kind, "capi"), eq(outbox.topic, "Purchase"), like(outbox.dedupeKey, `capi:%:${order.id}:Purchase%`)))
      .limit(40),
    db
      .select({ type: orderEvents.type, meta: orderEvents.meta })
      .from(orderEvents)
      .where(whereStore(orderEvents, scope, and(eq(orderEvents.orderId, order.id), inArray(orderEvents.type, ["capi_sent", "capi_failed", "capi_stale"]))))
      .orderBy(orderEvents.id)
      .limit(60),
    getStoreSettings(scope, ["conversions", "tracking_secrets"]),
  ]);

  const out = new Map<string, OrderAdEvent>();
  // 1. the outbox rows (the newest resend of a pixel wins: rows come in no order, so a sent row is never overwritten)
  for (const r of rows) {
    const [platform, pixelId] = (r.targetId ?? "").split(":");
    if ((platform !== "meta" && platform !== "tiktok") || !pixelId) continue;
    const key = pixelKey(platform, pixelId.slice(-4));
    if (out.get(key)?.state === "sent") continue;
    out.set(key, { platform, pixel: pixelId.slice(-4), ...outboxAdState(r) });
  }
  // 2. the timeline, for the pixels the outbox no longer holds (purged rows, the R1.0 direct send)
  for (const e of events) {
    const m = (e.meta ?? {}) as { platform?: unknown; pixel?: unknown; event?: unknown; code?: unknown };
    if ((m.platform !== "meta" && m.platform !== "tiktok") || typeof m.pixel !== "string" || (m.event !== undefined && m.event !== "Purchase")) continue;
    const key = pixelKey(m.platform, m.pixel);
    if (out.has(key) && out.get(key)!.state !== "none") continue;
    const code = typeof m.code === "string" ? m.code : "";
    const state: OrderAdEvent =
      e.type === "capi_sent"
        ? { platform: m.platform, pixel: m.pixel, state: "sent" }
        : e.type === "capi_stale"
          ? { platform: m.platform, pixel: m.pixel, state: "dropped_old" }
          : TOKEN_CAUSES.has(code)
            ? { platform: m.platform, pixel: m.pixel, state: "failed_token" }
            : { platform: m.platform, pixel: m.pixel, state: "failed", ...(isCauseCode(code) ? { causeKey: causeKey(code)! } : {}) };
    out.set(key, state);
  }
  // 3. the pixels with a server token and nothing recorded: what the order's gates say
  const secrets = settings.tracking_secrets;
  const conv = settings.conversions;
  const gate = gateAdState(
    {
      isTest: order.isTest,
      honeypot: (order.flags ?? []).includes("honeypot"),
      source: order.source,
      risk: order.riskScore,
      createdAt: order.createdAt,
      confirmed: order.confirmState === "confirmed",
      delivered: DELIVERED.has(order.shipState ?? ""),
    },
    { trigger: triggerFor(conv, order.pageId), manualOrders: conv.manualOrders },
    now,
  );
  for (const platform of ["meta", "tiktok"] as const) {
    const tokens = (platform === "meta" ? secrets.metaTokens : secrets.tiktokTokens) ?? {};
    for (const [pixelId, token] of Object.entries(tokens)) {
      if (!token) continue;
      const key = pixelKey(platform, pixelId.slice(-4));
      if (!out.has(key)) out.set(key, { platform, pixel: pixelId.slice(-4), ...gate });
    }
  }

  const status = order.sheetStatus as SheetState;
  return {
    sheet: { status, label: SHEET_LABEL[status], error: status === "failed" || order.sheetError ? (order.sheetError ?? null) : null },
    adEvents: [...out.values()].sort((a, b) => a.platform.localeCompare(b.platform) || a.pixel.localeCompare(b.pixel)),
  };
}

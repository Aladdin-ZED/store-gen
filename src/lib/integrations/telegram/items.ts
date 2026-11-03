/**
 * The Telegram outbox items (P5 INTEGRATIONS; operations.md OPE-§21.2, §21.3, §26; core §H.1; IN-04). Pure: the
 * messages, their payloads (zod, as the handler trusts them), the dedupe keys, the switches of `notifications`, the
 * incidents Telegram hears and the drainer's merge key. src/lib/integrations/telegram/queue.ts queues with them,
 * src/lib/jobs/handlers/telegram.ts parses them, `test:conversions` proves them offline.
 *
 * A payload holds ids, codes and counts only: never the token, never a customer field (`pii` is false). Dedupe keys
 * are unique across every store and state (the outbox's `INSERT IGNORE`): `tg:new:<orderId>` (order ids are global),
 * `tg:daily:<storeId>:<day>`, `tg:incident:<storeId>:<kind>:<hour>`, `tg:alert:<storeId>:<code>:<day>`.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import type { IntegrationIncident } from "@/lib/integrations/status";
import type { ClaimedItem, OutboxItem } from "@/lib/jobs/outbox";
import type { NotificationsSetting } from "@/lib/settings/keys/notifications";
import type { DailyFigures, ProfitAlert, TgIncident } from "./messages";

export type TelegramMessage =
  | { kind: "new_order"; orderId: string; test: boolean }
  | { kind: "daily"; figures: DailyFigures }
  | { kind: "incident"; incident: TgIncident; key: string; since?: string }
  | { kind: "profit_alert"; alert: ProfitAlert; day: string };

/** Outbox topics (≤ 48 chars). */
export const TG_TOPICS = { new_order: "new_order", daily: "daily_summary", incident: "incident", profit_alert: "profit_alert" } as const;

const ORDER_ID = z.string().regex(/^[A-Z]{2,6}-[0-9A-HJKMNP-TV-Z]{6}$/);
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const COUNT = z.number().int().min(0).max(10_000_000);
const Kpi = z.union([
  z.object({ value: z.number().finite(), n: COUNT, min: COUNT }),
  z.object({ n: COUNT, min: COUNT, insufficient: z.literal(true) }),
]);
const Figures = z.object({
  day: DAY,
  placed: COUNT.optional(),
  confirmed: COUNT.optional(),
  confirmationRate: Kpi.optional(),
  delivered: COUNT.optional(),
  callbacksDue: COUNT.optional(),
  deliveryProblems: COUNT.optional(),
  sheets: z.enum(["ok", "warn", "failing"]).optional(),
  cashHeld: z
    .array(z.object({ carrier: z.string().max(60), amountCents: COUNT, currency: z.string().length(3), days: COUNT, parcels: COUNT, settlement: z.enum(["statement", "at_delivery"]) }))
    .max(10)
    .optional(),
});
const Incident = z.discriminatedUnion("integration", [
  z.object({ integration: z.literal("sheets"), minutes: COUNT }),
  z.object({ integration: z.literal("capi"), platform: z.enum(["meta", "tiktok"]), pixelLast4: z.string().regex(/^[A-Za-z0-9]{1,4}$/) }),
  z.object({ integration: z.literal("dead") }),
]);
const Alert = z.discriminatedUnion("code", [
  z.object({ code: z.literal("cpa_over_breakeven"), days: COUNT, costCents: COUNT, thresholdCents: COUNT, currency: z.string().length(3) }),
  z.object({ code: z.literal("refusal_spike"), rate7: z.number().min(0).max(100), rate28: z.number().min(0).max(100), n: COUNT }),
  z.object({ code: z.literal("city_refusal"), city: z.string().max(120), rate: z.number().min(0).max(100), storeRate: z.number().min(0).max(100), n: COUNT }),
]);

/** The payload as the handler trusts it (an item from an older build, or tampered, is refused). */
export const TelegramPayload = z.discriminatedUnion("m", [
  z.object({ m: z.literal("new_order"), orderId: ORDER_ID, test: z.boolean() }),
  z.object({ m: z.literal("daily"), figures: Figures }),
  z.object({ m: z.literal("incident"), incident: Incident, since: z.string().datetime().nullable() }),
  z.object({ m: z.literal("profit_alert"), alert: Alert }),
]);
export type TelegramPayload = z.output<typeof TelegramPayload>;

/** The outbox target of a chat: "chat:<last 4>" (the deliveries log's label; the chat id itself stays in the setting). */
export const chatTarget = (chatId: string): string => `chat:${chatId.replace(/[^0-9A-Za-z_]/g, "").slice(-4) || "0"}`;

const hourOf = (ms: number) => Math.floor(ms / 3_600_000);
const shortKey = (s: string) => createHash("sha256").update(s, "utf8").digest("hex").slice(0, 12);

/** The outbox item of one message (pure; exported for the tests). */
export function telegramItem(storeId: string, chatId: string, message: TelegramMessage, now = Date.now()): OutboxItem<TelegramPayload> {
  const targetId = chatTarget(chatId);
  switch (message.kind) {
    case "new_order":
      return { kind: "telegram", topic: TG_TOPICS.new_order, targetId, dedupeKey: `tg:new:${message.orderId}`, payload: { m: "new_order", orderId: message.orderId, test: message.test }, pii: false };
    case "daily":
      return { kind: "telegram", topic: TG_TOPICS.daily, targetId, dedupeKey: `tg:daily:${storeId}:${message.figures.day}`, payload: { m: "daily", figures: message.figures }, pii: false };
    case "incident":
      return {
        kind: "telegram",
        topic: TG_TOPICS.incident,
        targetId,
        dedupeKey: `tg:incident:${storeId}:${shortKey(message.key)}:${hourOf(now)}`,
        payload: { m: "incident", incident: message.incident, since: message.since ?? null },
        pii: false,
      };
    case "profit_alert":
      return { kind: "telegram", topic: TG_TOPICS.profit_alert, targetId, dedupeKey: `tg:alert:${storeId}:${message.alert.code}:${message.day}`, payload: { m: "profit_alert", alert: message.alert }, pii: false };
  }
}

/* ------------------------------------------------------------------ */
/* Gates                                                               */
/* ------------------------------------------------------------------ */

export type QueueSkip = "not_configured" | "feature_off" | "switch_off" | "test_off" | "honeypot" | "not_built";

/** The switch of a message in `notifications` (OPE-§2.9). */
export function messageSkip(n: NotificationsSetting, message: TelegramMessage): QueueSkip | null {
  switch (message.kind) {
    case "new_order":
      if (!n.telegram.newOrders) return "switch_off";
      return message.test && !n.testOrders ? "test_off" : null;
    case "daily":
      return n.telegram.dailySummary ? null : "switch_off";
    case "incident":
      return n.telegram.integrationErrors ? null : "switch_off";
    case "profit_alert":
      return n.telegram.profitAlerts ? null : "switch_off";
  }
}

/* ------------------------------------------------------------------ */
/* Integration problems                                                */
/* ------------------------------------------------------------------ */

/** OPE-§21.2: Sheets failing for more than this before Telegram hears of it. */
export const SHEETS_INCIDENT_AFTER_MS = 15 * 60_000;
/** CAPI incidents Telegram sends: a refused token (OPE-§21.2 "CAPI token refused"). */
const CAPI_TOKEN_CODES: ReadonlySet<string> = new Set(["token_revoked", "token_invalid"]);

/** The message of an incident, or null when Telegram does not send it (pure; exported for the tests). */
export function incidentMessage(inc: IntegrationIncident, now: number): { message: TelegramMessage; notBefore: Date | null } | null {
  const at = Date.parse(inc.at) || now;
  if (inc.dead) {
    if (inc.kind === "telegram") return null;
    return { message: { kind: "incident", incident: { integration: "dead" }, key: "dead" }, notBefore: null };
  }
  if (inc.kind === "sheets") {
    const since = at - inc.sinceMinutes * 60_000;
    const due = since + SHEETS_INCIDENT_AFTER_MS;
    return {
      message: { kind: "incident", incident: { integration: "sheets", minutes: Math.max(inc.sinceMinutes, 15) }, key: "sheets", since: new Date(since).toISOString() },
      notBefore: due > now ? new Date(due) : null,
    };
  }
  if (inc.kind === "capi" && CAPI_TOKEN_CODES.has(inc.code)) {
    const m = /^(meta|tiktok):([0-9A-Za-z_-]{4,64})$/.exec(inc.targetId);
    if (!m) return null;
    return { message: { kind: "incident", incident: { integration: "capi", platform: m[1] as "meta" | "tiktok", pixelLast4: m[2]!.slice(-4) }, key: `capi:${inc.targetId}` }, notBefore: null };
  }
  return null;
}

/** The drainer's merge key (OPE-§21.3): one store's `new_order` items, test orders apart from real ones. */
export function telegramBatchKey(item: Pick<ClaimedItem<unknown>, "topic" | "payload">): string | null {
  const p = item.payload as { m?: unknown; test?: unknown } | null;
  if (item.topic !== TG_TOPICS.new_order || p?.m !== "new_order") return null;
  return p.test === true ? "new_order:test" : "new_order";
}

import "server-only";
/**
 * Outbox handler `telegram` (P5 INTEGRATIONS; operations.md OPE-§21.3, §21.2, §26, §28.1, §28.2, OPE-§J, OPE-§L;
 * docs/STORE-SAAS.md §H.1): the store's Telegram messages (new orders, the daily summary, integration problems, profit
 * alerts), queued by src/lib/integrations/telegram/queue.ts. Extension file (docs/STORE-SAAS.md §K.3) imported for its
 * effect by src/lib/jobs/registry.ts; perStorePerTick 10, timeoutMs 6,000 (the PHP export's 6 s).
 *
 * At send time:
 *   - the store's `telegram` setting is read (the token is opened here and goes only into the Bot API call: never a
 *     payload, a log line or a result); Telegram turned off, unset or the feature off → the items are cancelled
 *     (`cancelled:<why>`, CCR r1-p5-9), nothing sent;
 *   - `new_order` items of one store are merged by the drainer (`batch`, ≤ 10, test orders apart) into one message:
 *     the orders are read from the store's own rows now (a deleted test order is left out), test orders only while
 *     `notifications.testOrders` is on and prefixed "[TEST]" (OPE-§26), customer fields at the setting's level
 *     (masked: P4's maskPhone, the phone left out while it is not available; full: the phone and the address);
 *   - a deliberate re-send (core §H.1: `replay` of a `done` row) is one message marked "(renvoi)" (OPE-§28.1);
 *   - a Sheets incident is sent only while Sheets still fails (its 15 minutes are counted from the first failure);
 *   - pacing per chat (Telegram Bots FAQ): ≥ 1 s between two messages, ≤ 20 per minute in a group, and nothing before
 *     a 429's `retry_after` (the item is retried then: `retryAfterMs`, CCR r1-p5-11);
 *   - the answer: ok → done; 429, 5xx, a timeout → retry; 401, 403, "chat not found" → final (`dead`), the
 *     `integration_status` row `telegram` turns `failing` and `int.telegram_failing` reaches the owners once per
 *     incident per hour (src/lib/integrations/status.ts), `int.delivery_dead` once at the dead transition; another 4xx
 *     refuses this message only (`warn`). A group upgraded to a supergroup: the new chat id is saved and sent to once.
 * Logs carry cause codes only: never the token, the chat id, a text or a customer field.
 */
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, outbox } from "@/lib/db/schema";
import { integrationHealth } from "@/lib/integrations/health";
import { notifyDeliveryDead, recordIntegrationStatus } from "@/lib/integrations/status";
import { sendMessage, type TgFailure } from "@/lib/integrations/telegram/client";
import {
  dailySummaryText,
  incidentText,
  orderMessage,
  profitAlertText,
  TG_BATCH_MAX,
  tgLocaleOf,
  type TgEnv,
  type TgOrder,
} from "@/lib/integrations/telegram/messages";
import { TelegramPayload, telegramBatchKey, telegramDeps } from "@/lib/integrations/telegram/queue";
import { dialable, firstWord } from "@/lib/integrations/template-values";
import { isFinalFailure, registerOutboxHandler, type ClaimedItem, type SendResult } from "@/lib/jobs/outbox";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import { errorSummary } from "@/lib/orders/log";
import { orderText } from "@/lib/orders/text";
import { getStoreSettings, updateStoreSetting } from "@/lib/settings";
import { scopedCache } from "@/lib/tenancy/cache";
import { entitlement } from "@/lib/tenancy/entitlements";
import { getStoreById } from "@/lib/tenancy/public";
import { whereStore } from "@/lib/tenancy/sql";
import type { WriteScope } from "@/lib/tenancy/types";
import { orderItemsView } from "@/lib/orders/items-v3";

const LOG = "[telegram]";
/** A dropped item (CCR r1-p5-9, the `capi` handler's prefix): `cancelled`, never `dead`, never a dead notice. */
export const CANCELLED_PREFIX = "cancelled:";
/** Telegram Bots FAQ: one message per second in a chat, 20 per minute in a group. */
export const CHAT_GAP_MS = 1_000;
export const GROUP_PER_MINUTE = 20;

/** A failed send with the time Telegram asked to wait (CCR r1-p5-11: P8's drainer sets `next_at` from it). */
export type TelegramSendResult = SendResult & { retryAfterMs?: number };

/* ------------------------------------------------------------------ */
/* pacing per chat                                                     */
/* ------------------------------------------------------------------ */

interface Pace {
  /** the last send to the chat */
  last: number;
  /** the sends of the last minute (groups) */
  recent: number[];
  /** Telegram's 429: nothing before this */
  blockedUntil: number;
}
const paces = scopedCache<Pace>({ name: "tg-pace", maxEntries: 5_000, ttlMs: 30 * 60_000 });
const isGroup = (chatId: string) => chatId.startsWith("-") || chatId.startsWith("@");

/** Wait for a free slot, or the ms to come back after (no call made). Pure but for the clock and `sleep`. */
async function paceFor(storeId: string, chatId: string, now: () => number, sleep: (ms: number) => Promise<void>): Promise<number> {
  const p = paces.get(storeId, chatId) ?? { last: 0, recent: [], blockedUntil: 0 };
  const t = now();
  if (p.blockedUntil > t) return p.blockedUntil - t;
  const recent = p.recent.filter((at) => t - at < 60_000);
  if (isGroup(chatId) && recent.length >= GROUP_PER_MINUTE) return recent[0]! + 60_000 - t;
  const gap = p.last + CHAT_GAP_MS - t;
  if (gap > 0) await sleep(gap);
  return 0;
}

function noteSent(storeId: string, chatId: string, at: number): void {
  const p = paces.get(storeId, chatId) ?? { last: 0, recent: [], blockedUntil: 0 };
  paces.set(storeId, chatId, { last: at, recent: [...p.recent.filter((x) => at - x < 60_000), at].slice(-GROUP_PER_MINUTE), blockedUntil: p.blockedUntil });
}

function noteBlocked(storeId: string, chatId: string, until: number): void {
  const p = paces.get(storeId, chatId) ?? { last: 0, recent: [], blockedUntil: 0 };
  paces.set(storeId, chatId, { ...p, blockedUntil: Math.max(p.blockedUntil, until) });
}

/** Forget the pacing (tests). */
export function clearTelegramPacing(storeId?: string): void {
  if (storeId) paces.delete(storeId);
  else paces.clear();
}

/* ------------------------------------------------------------------ */
/* the message of a send                                               */
/* ------------------------------------------------------------------ */

type Built = { text: string } | { cancel: string };

/** Was any of these rows delivered before (a `done` row replayed: core §H.1's deliberate re-send)? */
async function resentOf(scope: WriteScope, items: readonly ClaimedItem<unknown>[]): Promise<boolean> {
  if (items.some((i) => (i as { resend?: unknown }).resend === true)) return true;
  const rows = await db
    .select({ doneAt: outbox.doneAt })
    .from(outbox)
    .where(whereStore(outbox, scope, inArray(outbox.id, items.map((i) => i.id))));
  return rows.some((r) => r.doneAt !== null);
}

/** The orders of the items, read now from the store's own rows (ids of another store read as nothing). */
async function ordersOf(scope: WriteScope, ids: readonly string[], market: string): Promise<TgOrder[]> {
  const rows = await db
    .select({
      id: orders.id,
      name: orders.name,
      phone: orders.phone,
      city: orders.city,
      address: orders.address,
      productName: orders.productName,
      items: orders.items,
      total: orders.total,
      currency: orders.currency,
      createdAt: orders.createdAt,
      isTest: orders.isTest,
      flags: orders.flags,
    })
    .from(orders)
    .where(whereStore(orders, scope, inArray(orders.id, [...ids])));
  const { maskPhone } = telegramDeps();
  return rows
    .filter((r) => !(r.flags ?? []).includes("honeypot"))
    .map((r) => {
      const items = orderItemsView(r.items);
      const label = items?.bundleLabel && !/^\d+$/.test(items.bundleLabel.trim()) ? items.bundleLabel.trim() : r.productName;
      let units = "";
      try {
        units = orderText(items, { mode: "warehouse", orderId: r.id, productName: r.productName }).trim();
      } catch {
        units = "";
      }
      let masked: string | null = null;
      try {
        masked = maskPhone(r.phone);
      } catch {
        // P4's masking is the P0 stub: the masked level shows no phone rather than the full one
        masked = null;
      }
      return {
        id: r.id,
        offer: units && units !== label ? `${label}, ${units}` : label,
        totalCents: Math.round(Number(r.total) * 100),
        currency: r.currency,
        firstName: firstWord(r.name),
        phoneMasked: masked,
        phone: r.phone ? dialable(r.phone, market) : null,
        address: r.address,
        city: r.city,
        createdAt: r.createdAt,
        test: r.isTest,
      };
    });
}

async function build(scope: WriteScope, payloads: readonly TelegramPayload[], env: TgEnv, ctx: { market: string; testOrders: boolean; newOrders: boolean; now: number }): Promise<Built> {
  const first = payloads[0]!;
  if (first.m === "new_order") {
    if (!ctx.newOrders) return { cancel: "switch_off" };
    const wanted = payloads.filter((p): p is Extract<TelegramPayload, { m: "new_order" }> => p.m === "new_order" && (!p.test || ctx.testOrders));
    if (!wanted.length) return { cancel: "test_off" };
    const found = await ordersOf(scope, wanted.map((p) => p.orderId), ctx.market);
    // a test order is a test order by its row, whatever the payload says (D54)
    const sendable = found.filter((o) => !o.test || ctx.testOrders);
    const text = orderMessage(sendable, env);
    return text ? { text } : { cancel: "order_gone" };
  }
  if (first.m === "daily") {
    const text = dailySummaryText(first.figures, env);
    return text ? { text } : { cancel: "nothing_to_send" };
  }
  if (first.m === "incident") {
    const inc = first.incident;
    if (inc.integration === "sheets") {
      const row = (await integrationHealth(scope)).find((r) => r.kind === "sheets" && r.targetId === "");
      if (row?.state !== "failing") return { cancel: "recovered" };
      const since = first.since ? Date.parse(first.since) : NaN;
      const minutes = Number.isFinite(since) ? Math.max(inc.minutes, Math.round((ctx.now - since) / 60_000)) : inc.minutes;
      return { text: incidentText({ integration: "sheets", minutes }, env) };
    }
    return { text: incidentText(inc, env) };
  }
  return { text: profitAlertText(first.alert, env) };
}

/* ------------------------------------------------------------------ */
/* the send                                                            */
/* ------------------------------------------------------------------ */

const cancelled = (why: string): TelegramSendResult => ({ ok: false, retry: false, error: `${CANCELLED_PREFIX}${why}` });

function failed(f: TgFailure): TelegramSendResult {
  const retry = !f.final;
  const r: TelegramSendResult = { ok: false, retry, ...(f.status !== null ? { status: f.status } : {}), error: f.code };
  if (f.retryAfterSec !== null) r.retryAfterMs = f.retryAfterSec * 1_000;
  return r;
}

export interface TelegramSendOpts {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * One send of one item or of a merged group of one store's `new_order` items (exported for the tests; the drainer
 * calls it through the registered handler). The result applies to every item of the group.
 */
export async function sendTelegramItems(items: readonly ClaimedItem<unknown>[], opts: TelegramSendOpts = {}): Promise<TelegramSendResult> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const storeId = items[0]?.storeId ?? null;
  if (!storeId || items.some((i) => i.storeId !== storeId)) return { ok: false, retry: false, error: "refused: no store" };
  const payloads: TelegramPayload[] = [];
  for (const item of items) {
    const parsed = TelegramPayload.safeParse(item.payload);
    if (!parsed.success) return { ok: false, retry: false, error: "refused: bad payload" };
    payloads.push(parsed.data);
  }
  if (payloads.length > 1 && payloads.some((p) => p.m !== "new_order")) return { ok: false, retry: false, error: "refused: mixed group" };

  const scope = systemScope(systemCtx("outbox.telegram"), storeId);
  const [{ telegram, notifications }, store] = await Promise.all([getStoreSettings(scope, ["telegram", "notifications"]), getStoreById(storeId)]);
  if (!store) return cancelled("store_gone");
  if (!telegram.enabled || !telegram.botToken || !telegram.chatId) return cancelled("not_configured");
  if ((await entitlement(scope, "telegram").catch(() => false)) !== true) return cancelled("feature_off");
  let chatId = telegram.chatId;

  const env: TgEnv = { locale: tgLocaleOf(store.defaultLocale), tz: store.timezone || "Africa/Casablanca", pii: telegram.pii, resent: await resentOf(scope, items) };
  const built = await build(scope, payloads.slice(0, TG_BATCH_MAX), env, {
    market: store.market,
    testOrders: notifications.testOrders,
    newOrders: notifications.telegram.newOrders,
    now: now(),
  });
  if ("cancel" in built) return cancelled(built.cancel);

  const wait = await paceFor(storeId, chatId, now, sleep);
  if (wait > 0) return { ok: false, retry: true, status: 429, error: "rate_limited", retryAfterMs: wait };

  let answer = await sendMessage(telegram.botToken, chatId, built.text);
  if (!answer.ok && answer.migrateTo) {
    // a group became a supergroup: its new id is the store's chat from now on, and this message goes there once
    const to = answer.migrateTo;
    await updateStoreSetting(scope, "telegram", { chatId: to }, { id: "system", ip: null, kind: "system" }).catch((err: unknown) => console.error(`${LOG} chat id not updated:`, errorSummary(err)));
    chatId = to;
    answer = await sendMessage(telegram.botToken, chatId, built.text);
  }
  const at = now();
  if (answer.ok) {
    noteSent(storeId, chatId, at);
    await recordIntegrationStatus(scope, { kind: "telegram", targetId: "", outcome: "ok" }).catch((err: unknown) => console.error(`${LOG} status:`, errorSummary(err)));
    return { ok: true, status: 200 };
  }

  if (answer.retryAfterSec !== null) noteBlocked(storeId, chatId, at + answer.retryAfterSec * 1_000);
  const result = failed(answer);
  await recordIntegrationStatus(scope, { kind: "telegram", targetId: "", outcome: answer.final ? "failed" : "retry", code: answer.code, status: answer.status ?? 0 }).catch((err: unknown) =>
    console.error(`${LOG} status:`, errorSummary(err)),
  );
  console.error(`${LOG} send failed: ${answer.code}${answer.status !== null ? ` (${answer.status})` : ""}`);
  if (items.some((i) => isFinalFailure(i, result))) await notifyDeliveryDead(scope, "telegram");
  return result;
}

registerOutboxHandler<unknown>({
  kind: "telegram",
  maxPerTick: 40,
  perStorePerTick: 10,
  timeoutMs: 6_000,
  send: (item) => sendTelegramItems([item]),
  batch: { max: TG_BATCH_MAX, key: telegramBatchKey, send: (items) => sendTelegramItems(items) },
});

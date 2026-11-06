import "server-only";
/**
 * Queueing the store's Telegram messages (P5 INTEGRATIONS; operations.md OPE-§21.2, §21.3, §26, OPE-§J; core §H.1;
 * IN-04, SF-05). Every message is an outbox item of kind `telegram`; the handler (src/lib/jobs/handlers/telegram.ts)
 * builds its text at send time with the token read then, so a payload holds ids, codes and counts only: never the
 * token, never a customer field (`pii` is false).
 *
 *   await queueTelegram(scope, { kind: "new_order", orderId, test }, { tx, notBefore });   // the int.telegram hook
 *   await queueTelegram(scope, { kind: "profit_alert", alert, day });                      // P4's fin.alerts
 *
 * One dedupe key per message (./items.ts, the outbox's `INSERT IGNORE`, unique across every state and store):
 * `tg:new:<orderId>`, `tg:daily:<storeId>:<day>`, `tg:incident:<storeId>:<kind>:<hour>`,
 * `tg:alert:<storeId>:<code>:<day>`. A message is queued only when the store's Telegram is set up and on
 * (`telegram.enabled`, a token and a chat, feature `telegram`) and its own switch in `notifications.telegram` is on; a
 * test order's message only with `notifications.testOrders` (core §H.1's one exception, prefixed "[TEST]").
 *
 * Integration problems (OPE-§21.2): the listener registered here hears src/lib/integrations/status.ts's incidents and,
 * with `notifications.telegram.integrationErrors`, queues one message per incident kind per hour: Sheets failing for
 * more than 15 minutes (queued with `notBefore` at the 15th minute; the handler sends it only if Sheets still fails),
 * a refused CAPI token, outbox items dead. Telegram's own failures are not sent to Telegram.
 *
 * Until P8's `enqueue` exists (the P0 stub throws "not implemented: P8"), nothing is queued and nothing fails: the
 * order's transaction goes through (OD6), the message is simply not sent.
 */
import { drainOutbox as drainOutboxP8, enqueue as enqueueP8 } from "@/lib/jobs/outbox";
import { maskPhone as maskPhoneP4 } from "@/lib/orders/masking";
import { errorSummary } from "@/lib/orders/log";
import { orderKpis as orderKpisP4, queueCounts as queueCountsP4 } from "@/lib/orders/profile";
import type { Tx } from "@/lib/orders/hooks";
import { getStoreSettings } from "@/lib/settings";
import { scopedCache } from "@/lib/tenancy/cache";
import { entitlement } from "@/lib/tenancy/entitlements";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import { onIntegrationIncident, type IntegrationIncident } from "../status";
import { incidentMessage, messageSkip, telegramItem, type QueueSkip, type TelegramMessage } from "./items";

export * from "./items";

/* ------------------------------------------------------------------ */
/* P8's and P4's calls, and the test double                            */
/* ------------------------------------------------------------------ */

/** The calls of other tracks the Telegram files make (frozen signatures, src/lib/contracts/r1-p0.ts). */
export interface TelegramDeps {
  enqueue: typeof enqueueP8;
  drainOutbox: typeof drainOutboxP8;
  maskPhone: typeof maskPhoneP4;
  orderKpis: typeof orderKpisP4;
  queueCounts: typeof queueCountsP4;
}

let double: Partial<TelegramDeps> | null = null;

/** Replace P8's and P4's calls with spies (test:integrations-db). Refused under NODE_ENV=production. */
export function setTelegramDoubleForTests(d: Partial<TelegramDeps> | null): void {
  if (process.env.NODE_ENV === "production") throw new Error("telegram: the test double is refused in production");
  double = d;
}

export function telegramDeps(): TelegramDeps {
  const d = process.env.NODE_ENV === "production" ? null : double;
  return {
    enqueue: d?.enqueue ?? enqueueP8,
    drainOutbox: d?.drainOutbox ?? drainOutboxP8,
    maskPhone: d?.maskPhone ?? maskPhoneP4,
    orderKpis: d?.orderKpis ?? orderKpisP4,
    queueCounts: d?.queueCounts ?? queueCountsP4,
  };
}

/** A P0 stub of another track ("not implemented: P4 …" / "P8 …"): not available yet, never an error to log. */
export const notBuiltYet = (err: unknown): boolean => err instanceof Error && /^not implemented: P[48]\b/.test(err.message);

/* ------------------------------------------------------------------ */
/* Gates (the messages, payloads and switches: ./items.ts)             */
/* ------------------------------------------------------------------ */

export type QueueResult = { queued: true; inserted: number } | { queued: false; reason: QueueSkip };

/** The store's Telegram as the queue and the handler read it (the token stays inside the server). */
export interface TelegramState {
  ready: boolean;
  chatId: string | null;
  notifications: Awaited<ReturnType<typeof readSettings>>["notifications"];
}

async function readSettings(scope: StoreScope) {
  return getStoreSettings(scope, ["telegram", "notifications"]);
}

/** Is the store's Telegram set up and on (token, chat, `enabled`, feature `telegram`)? */
export async function telegramState(scope: StoreScope): Promise<TelegramState> {
  const { telegram, notifications } = await readSettings(scope);
  const configured = telegram.enabled && !!telegram.botToken && !!telegram.chatId;
  const feature = configured ? await entitlement(scope, "telegram").catch(() => false) : false;
  return { ready: configured && feature === true, chatId: telegram.chatId, notifications };
}


/**
 * Queues one message (exported for P4's `fin.alerts` and this track's hook, job and listener). With `opts.tx` the
 * item is inserted on the caller's transaction (the int.telegram hook: it rolls back with the order). Never throws for
 * P8's stub; any other enqueue error is the caller's (an inTx hook rolls the order back, OD6).
 */
export async function queueTelegram(scope: WriteScope, message: TelegramMessage, opts: { tx?: Tx; notBefore?: Date; now?: number } = {}): Promise<QueueResult> {
  const state = await telegramState(scope);
  if (!state.ready || !state.chatId) {
    const { telegram } = await readSettings(scope);
    return { queued: false, reason: telegram.enabled && telegram.botToken && telegram.chatId ? "feature_off" : "not_configured" };
  }
  const skip = messageSkip(state.notifications, message);
  if (skip) return { queued: false, reason: skip };
  const item = telegramItem(scope.storeId, state.chatId, message, opts.now);
  if (opts.notBefore) item.notBefore = opts.notBefore;
  try {
    const r = await telegramDeps().enqueue(scope, [item], opts.tx ? { tx: opts.tx } : undefined);
    return { queued: true, inserted: r.inserted };
  } catch (err) {
    if (notBuiltYet(err)) return { queued: false, reason: "not_built" };
    throw err;
  }
}

/**
 * Hook `int.telegram` on creation (inTx, OPE-§3.6): the order's `new_order` item on the order's transaction, due at
 * the end of the batch window (`notifications.telegram.batchSeconds`, 45 s by default), so the orders of one window
 * leave as one message. A honeypot row sends nothing; a test order only with `notifications.testOrders` (D54).
 */
export async function queueNewOrderTelegram(scope: WriteScope, order: { id: string; isTest: boolean; flags?: string[] | null }, tx: Tx, now = Date.now()): Promise<QueueResult> {
  if ((order.flags ?? []).includes("honeypot")) return { queued: false, reason: "honeypot" };
  const { notifications } = await readSettings(scope);
  const delayMs = notifications.telegram.batchSeconds * 1_000;
  const r = await queueTelegram(scope, { kind: "new_order", orderId: order.id, test: order.isTest }, { tx, notBefore: new Date(now + delayMs), now });
  if (r.queued && r.inserted > 0) scheduleTelegramDrain(scope.storeId, delayMs);
  return r;
}

/* ------------------------------------------------------------------ */
/* The batch drain                                                     */
/* ------------------------------------------------------------------ */

/** One pending drain per store (the batch window's end): later orders of the window join it. */
const drains = scopedCache<{ at: number }>({ name: "tg-drain", maxEntries: 5_000, ttlMs: 10 * 60_000 });

/**
 * Drains the store's `telegram` items once the batch window has passed (the cron's outbox slot drains them too; this
 * only shortens the wait on a long-lived server). One timer per store; never throws.
 */
export function scheduleTelegramDrain(storeId: string, delayMs: number): void {
  const at = Date.now() + Math.max(0, delayMs) + 1_000;
  const pending = drains.get(storeId, "next");
  if (pending && pending.at >= at - 1_000 && pending.at > Date.now()) return;
  drains.set(storeId, "next", { at });
  const timer = setTimeout(() => {
    drains.delete(storeId);
    telegramDeps()
      .drainOutbox({ storeId, kinds: ["telegram"], budgetMs: 6_000 })
      .catch((err: unknown) => {
        if (!notBuiltYet(err)) console.error("[telegram] drain:", errorSummary(err));
      });
  }, at - Date.now());
  timer.unref?.();
}

/* ------------------------------------------------------------------ */
/* Integration problems (the rule: ./items.ts `incidentMessage`)       */
/* ------------------------------------------------------------------ */


/** The registered listener: never throws (src/lib/integrations/status.ts logs a listener's failure). */
export async function onIncidentForTelegram(scope: WriteScope, inc: IntegrationIncident): Promise<void> {
  const now = Date.now();
  const planned = incidentMessage(inc, now);
  if (!planned) return;
  await queueTelegram(scope, planned.message, { notBefore: planned.notBefore ?? undefined, now });
}

onIntegrationIncident(onIncidentForTelegram);

import "server-only";
/**
 * Setting up the store's Telegram (P5 INTEGRATIONS; operations.md OPE-§21.1, OPE-§L `s:<sid>:tg:find`, OPE-§F
 * actions; core §F.5, §F.10, §E.8; IN-04). Step 8's server actions (`saveTelegramTokenAction`, …) call these after
 * their permission (`integrations.manage`), the fresh step-up of a secret write and the zod parse:
 *
 *   await saveBotToken(scope, actor, token, { stepUp: "totp" })   // getMe first; sealed write; chat and switch reset
 *   await findChats(scope, actor)                                  // getUpdates once; ≤ 10 per hour per store
 *   await selectChat(scope, actor, chatId)                         // getChat: the bot sees it; saved, not yet on
 *   await sendTestMessage(scope, actor)                            // success → enabled: true
 *   await setPii(scope, actor, "full", { confirmed: true })        // full needs the explicit confirmation
 *   await disableTelegram(scope, actor, { forget: false })         // off (forget: the token and the chat go too)
 *
 * The token is write-only: it is validated with `getMe`, stored in the sealed `telegram` setting (store envelope,
 * §F.3) and never returned, logged, audited or put in a payload; `telegramView` says "set / not set" and the bot's
 * @username. Every change is audited `integrations.telegram.changed` with what changed (never the token, never the
 * chat id: its type and last 4 digits only) and marks the store's health dirty. Every function needs the feature
 * `telegram` except `disableTelegram` (letting go never needs a feature).
 */
import { auditIn, settingsActor } from "@/lib/admin-data/store-audit";
import { errorSummary } from "@/lib/orders/log";
import { markHealthDirty } from "@/lib/platform/health-snapshot";
import { rateLimit, storeBucket } from "@/lib/security/rate-limit";
import { getStoreSetting, updateStoreSetting } from "@/lib/settings";
import { assertFeature } from "@/lib/tenancy/entitlements";
import { getStoreById } from "@/lib/tenancy/public";
import type { Actor, StoreScope, WriteScope } from "@/lib/tenancy/types";
import { recordIntegrationStatus } from "../status";
import { BOT_TOKEN_RE, CHAT_ID_RE, getChat, getMe, getUpdatesOnce, sendMessage, type ChatType, type FoundChat, type TgFailure } from "./client";
import { testMessageText, tgLocaleOf } from "./messages";

/** `s:<sid>:tg:find`: "Find my chat" 10 per hour per store (OPE-§L, core §E.8). */
export const TG_FIND_BUCKET = { name: "tg:find", limit: 10, windowSec: 3600 } as const;

/** The method of the fresh step-up that let the member save the token (§F.5 rev 4 `meta.stepUp`). */
export type TelegramStepUp = "totp" | "password";

/** Why a setup step failed (the screen words each one; never a provider's raw text). */
export type TelegramSetupError =
  | "token_format"
  | "token_invalid"
  | "token_missing"
  | "chat_missing"
  | "chat_format"
  | "chat_not_found"
  | "bot_blocked"
  | "webhook_active"
  | "rate_limited"
  | "network"
  | "confirm_required"
  | "refused";

export type SetupResult<T> = ({ ok: true } & T) | { ok: false; error: TelegramSetupError; retryAfterSec?: number };

/** What a screen may know of the store's Telegram (never the token, never the full chat id). */
export interface TelegramView {
  enabled: boolean;
  tokenSet: boolean;
  botUsername: string | null;
  chat: { title: string | null; type: ChatType | null; last4: string } | null;
  pii: "masked" | "full";
}

const last4 = (chatId: string) => chatId.replace(/[^0-9A-Za-z_]/g, "").slice(-4);

export async function telegramView(scope: StoreScope): Promise<TelegramView> {
  const s = await getStoreSetting(scope, "telegram");
  return {
    enabled: s.enabled,
    tokenSet: !!s.botToken,
    botUsername: s.botUsername ?? null,
    chat: s.chatId ? { title: s.chatTitle ?? null, type: s.chatType ?? null, last4: last4(s.chatId) } : null,
    pii: s.pii,
  };
}

/** A Bot API failure in the setup's words. */
function setupError(f: TgFailure, step: "token" | "chat" | "send"): { ok: false; error: TelegramSetupError; retryAfterSec?: number } {
  if (f.status === 409) return { ok: false, error: "webhook_active" };
  if (f.code === "rate_limited") return { ok: false, error: "rate_limited", ...(f.retryAfterSec !== null ? { retryAfterSec: f.retryAfterSec } : {}) };
  if (f.code === "network" || f.code === "timeout" || f.code === "server_error") return { ok: false, error: "network" };
  if (f.code === "bot_token_revoked") return { ok: false, error: "token_invalid" };
  if (f.code === "chat_not_found") return { ok: false, error: "chat_not_found" };
  if (f.code === "bot_blocked") return { ok: false, error: step === "token" ? "token_invalid" : "bot_blocked" };
  return { ok: false, error: step === "token" ? "token_invalid" : "refused" };
}

async function changed(scope: WriteScope, actor: Actor, meta: Record<string, unknown>): Promise<void> {
  await auditIn(scope, actor, "integrations.telegram.changed", { target: "telegram", meta });
  await markHealthDirty(scope.storeId).catch((err: unknown) => console.error("[telegram] markHealthDirty:", errorSummary(err)));
}

/**
 * Saves a pasted bot token once `getMe` accepts it. A new bot cannot write to the old chat by itself: the chat is
 * cleared and Telegram stays off until a chat is chosen and a test message went through.
 */
export async function saveBotToken(scope: WriteScope, actor: Actor, token: string, opts: { stepUp: TelegramStepUp }): Promise<SetupResult<{ botUsername: string | null }>> {
  await assertFeature(scope, "telegram");
  const value = token.trim();
  if (!BOT_TOKEN_RE.test(value)) return { ok: false, error: "token_format" };
  const me = await getMe(value);
  if (!me.ok) return setupError(me, "token");
  const prev = await getStoreSetting(scope, "telegram");
  const sameBot = prev.botToken === value;
  await updateStoreSetting(
    scope,
    "telegram",
    sameBot ? { botUsername: me.result.username } : { botToken: value, botUsername: me.result.username, chatId: null, chatTitle: null, chatType: null, enabled: false },
    settingsActor(actor),
  );
  await changed(scope, actor, { change: "token", replaced: !!prev.botToken && !sameBot, stepUp: opts.stepUp });
  return { ok: true, botUsername: me.result.username };
}

/** "Find my chat": the chats that wrote to the bot (getUpdates once; titles and types only). */
export async function findChats(scope: WriteScope, actor: Actor): Promise<SetupResult<{ chats: FoundChat[] }>> {
  void actor;
  await assertFeature(scope, "telegram");
  const gate = await rateLimit(storeBucket(scope, TG_FIND_BUCKET.name), TG_FIND_BUCKET.limit, TG_FIND_BUCKET.windowSec);
  if (!gate.ok) return { ok: false, error: "rate_limited", retryAfterSec: gate.retryAfter };
  const { botToken } = await getStoreSetting(scope, "telegram");
  if (!botToken) return { ok: false, error: "token_missing" };
  const r = await getUpdatesOnce(botToken);
  if (!r.ok) return setupError(r, "chat");
  return { ok: true, chats: r.result };
}

/** Chooses the chat (the bot must see it: `getChat`); Telegram stays off until the test message. */
export async function selectChat(scope: WriteScope, actor: Actor, chatId: string): Promise<SetupResult<{ chat: { title: string; type: ChatType } }>> {
  await assertFeature(scope, "telegram");
  const id = chatId.trim();
  if (!CHAT_ID_RE.test(id)) return { ok: false, error: "chat_format" };
  const { botToken } = await getStoreSetting(scope, "telegram");
  if (!botToken) return { ok: false, error: "token_missing" };
  const r = await getChat(botToken, id);
  if (!r.ok) return setupError(r, "chat");
  await updateStoreSetting(scope, "telegram", { chatId: r.result.id, chatTitle: r.result.title, chatType: r.result.type, enabled: false }, settingsActor(actor));
  await changed(scope, actor, { change: "chat", chatType: r.result.type, chat: last4(r.result.id) });
  return { ok: true, chat: { title: r.result.title, type: r.result.type } };
}

/** Sends the test message; success turns Telegram on (OPE-§21.1 step 3). */
export async function sendTestMessage(scope: WriteScope, actor: Actor): Promise<SetupResult<{ enabled: true }>> {
  await assertFeature(scope, "telegram");
  const s = await getStoreSetting(scope, "telegram");
  if (!s.botToken) return { ok: false, error: "token_missing" };
  if (!s.chatId) return { ok: false, error: "chat_missing" };
  const store = await getStoreById(scope.storeId);
  const text = testMessageText(store?.name ?? "", { locale: tgLocaleOf(store?.defaultLocale), tz: store?.timezone || "Africa/Casablanca", pii: s.pii });
  const r = await sendMessage(s.botToken, s.chatId, text);
  if (!r.ok) {
    await recordIntegrationStatus(scope, { kind: "telegram", targetId: "", outcome: r.final ? "failed" : "retry", code: r.code, status: r.status ?? 0 }).catch((err: unknown) =>
      console.error("[telegram] status:", errorSummary(err)),
    );
    return setupError(r, "send");
  }
  await updateStoreSetting(scope, "telegram", { enabled: true }, settingsActor(actor));
  await recordIntegrationStatus(scope, { kind: "telegram", targetId: "", outcome: "ok" }).catch((err: unknown) => console.error("[telegram] status:", errorSummary(err)));
  if (!s.enabled) await changed(scope, actor, { change: "enabled" });
  return { ok: true, enabled: true };
}

/** Customer fields in messages; "full" (the phone and the address in a shared chat) needs the explicit confirmation. */
export async function setPii(scope: WriteScope, actor: Actor, level: "masked" | "full", opts: { confirmed?: boolean } = {}): Promise<SetupResult<{ pii: "masked" | "full" }>> {
  await assertFeature(scope, "telegram");
  if (level === "full" && opts.confirmed !== true) return { ok: false, error: "confirm_required" };
  const prev = await getStoreSetting(scope, "telegram");
  if (prev.pii === level) return { ok: true, pii: level };
  await updateStoreSetting(scope, "telegram", { pii: level }, settingsActor(actor));
  await changed(scope, actor, { change: "pii", pii: level });
  return { ok: true, pii: level };
}

/** Turns Telegram off; `forget` also removes the token and the chat. Pending messages are cancelled at send time. */
export async function disableTelegram(scope: WriteScope, actor: Actor, opts: { forget?: boolean } = {}): Promise<SetupResult<{ enabled: false }>> {
  const prev = await getStoreSetting(scope, "telegram");
  if (!prev.enabled && !(opts.forget && (prev.botToken || prev.chatId))) return { ok: true, enabled: false };
  await updateStoreSetting(
    scope,
    "telegram",
    opts.forget ? { enabled: false, botToken: null, botUsername: null, chatId: null, chatTitle: null, chatType: null } : { enabled: false },
    settingsActor(actor),
  );
  await recordIntegrationStatus(scope, { kind: "telegram", targetId: "", outcome: "off" }).catch((err: unknown) => console.error("[telegram] status:", errorSummary(err)));
  await changed(scope, actor, { change: opts.forget ? "forgotten" : "disabled" });
  return { ok: true, enabled: false };
}

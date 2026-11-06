import "server-only";
/**
 * The Telegram Bot API client (P5 INTEGRATIONS; operations.md OPE-§21.1, §21.3; IN-04). Three calls, each one POST
 * through `integrationFetch` (the e2e seam) with a 6 s timeout, the PHP export's (order.php):
 *
 *   await getMe(token)                       // validates a pasted token: { id, username, name }
 *   await getUpdatesOnce(token)              // limit 20, timeout 0: the chats that wrote to the bot (title, type)
 *   await sendMessage(token, chatId, text)   // text ≤ 3,500 chars, no link preview
 *
 * The token travels in the URL path, as the Bot API requires: nothing here logs a URL, a body or an answer's text, and
 * callers log cause codes only. The token is read by the caller at send time from the sealed `telegram` setting; it
 * never enters an outbox payload.
 *
 * An answer is classified once (src/lib/integrations/causes.ts `classifyTelegramError`): 401 (token revoked), 403 (the
 * bot was blocked or removed) and "chat not found" are final; 429 carries `retry_after`; a 5xx, a timeout or no answer
 * may be retried; any other 4xx is final for that message (the row turns `warn`, not `failing`). A group upgraded to a
 * supergroup answers its new chat id (`migrateTo`), which the handler saves and sends to once.
 *
 * Bot API limits, Telegram Bots FAQ (https://core.telegram.org/bots/faq), as of this build (2026-11): avoid more than
 * one message per second in one chat, at most 20 messages per minute in one group, about 30 messages per second
 * overall per bot. The handler enforces the first two per chat (src/lib/jobs/handlers/telegram.ts).
 */
import { integrationFetch } from "@/lib/integrations/transport";
import { TG_TEXT_MAX } from "./messages";
import { BOT_TOKEN_RE, chatsOf, tgFailure, type ApiAnswer, type ApiChat, type BotInfo, type FoundChat, type TgResult } from "./wire";

export * from "./wire";

export const TELEGRAM_API = "https://api.telegram.org";
/** the PHP export's timeout (order.php) and the handler's `timeoutMs` */
export const TG_TIMEOUT_MS = 6_000;
export const TG_UPDATES_LIMIT = 20;

/** One Bot API call. Never throws: a network failure or a timeout is `{ ok: false, status: null }`. */
export async function tgCall<T>(token: string, method: string, body: Record<string, unknown>, timeoutMs = TG_TIMEOUT_MS): Promise<TgResult<T>> {
  if (!BOT_TOKEN_RE.test(token)) return { ok: false, status: 401, code: "bot_token_revoked", final: true, retryAfterSec: null, migrateTo: null };
  let res: Response;
  try {
    res = await integrationFetch(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return tgFailure(null, null);
  }
  let json: ApiAnswer | null = null;
  try {
    json = (await res.json()) as ApiAnswer;
  } catch {
    json = null;
  }
  if (res.ok && json?.ok === true) return { ok: true, result: json.result as T };
  return tgFailure(res.ok ? (json?.error_code ?? 502) : res.status, json);
}

/** Validates a token: the bot it belongs to. */
export async function getMe(token: string): Promise<TgResult<BotInfo>> {
  const r = await tgCall<{ id?: number; username?: string; first_name?: string }>(token, "getMe", {});
  if (!r.ok) return r;
  return { ok: true, result: { id: String(r.result?.id ?? ""), username: r.result?.username ?? null, name: String(r.result?.first_name ?? "").slice(0, 64) } };
}

/** `getUpdates` once (limit 20, timeout 0; OPE-§21.1 "Find my chat"). A bot with a webhook answers 409. */
export async function getUpdatesOnce(token: string): Promise<TgResult<FoundChat[]>> {
  const r = await tgCall<unknown[]>(token, "getUpdates", { limit: TG_UPDATES_LIMIT, timeout: 0 });
  if (!r.ok) return r;
  return { ok: true, result: chatsOf(Array.isArray(r.result) ? r.result : []) };
}

/** One chat's title and type (the setup's "select" checks the bot can see it). */
export async function getChat(token: string, chatId: string): Promise<TgResult<FoundChat>> {
  const r = await tgCall<ApiChat>(token, "getChat", { chat_id: chatId });
  if (!r.ok) return r;
  const found = chatsOf([{ message: { chat: r.result } }])[0];
  return found ? { ok: true, result: found } : { ok: false, status: 400, code: "chat_not_found", final: true, retryAfterSec: null, migrateTo: null };
}

/** `sendMessage` (chat_id, text ≤ 3,500, no link preview). */
export async function sendMessage(token: string, chatId: string, text: string, timeoutMs = TG_TIMEOUT_MS): Promise<TgResult<{ messageId: number | null }>> {
  const capped = Array.from(text).length > TG_TEXT_MAX ? `${Array.from(text).slice(0, TG_TEXT_MAX - 1).join("")}…` : text;
  const r = await tgCall<{ message_id?: number }>(token, "sendMessage", { chat_id: chatId, text: capped, disable_web_page_preview: true }, timeoutMs);
  if (!r.ok) return r;
  return { ok: true, result: { messageId: typeof r.result?.message_id === "number" ? r.result.message_id : null } };
}

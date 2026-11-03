/**
 * The Telegram Bot API on the wire (P5 INTEGRATIONS; operations.md OPE-§21.1, §21.3): the token and chat rules, a
 * failed answer classified, the chats of an update list. Pure: ./client.ts makes the calls with them, and
 * `test:conversions` proves them offline.
 */
import { classifyTelegramError, TELEGRAM_FINAL_CODES, type CauseCode } from "@/lib/integrations/causes";

/** The token rule of the `telegram` setting (the PHP export's, order.php). */
export const BOT_TOKEN_RE = /^[0-9]{5,15}:[A-Za-z0-9_-]{20,80}$/;
export const CHAT_ID_RE = /^-?[0-9]{3,20}$|^@[A-Za-z0-9_]{4,64}$/;

export type ChatType = "private" | "group" | "supergroup" | "channel";

export interface TgFailure {
  ok: false;
  /** the HTTP status; null: no answer (timeout, network) */
  status: number | null;
  code: CauseCode;
  /** never retried: the bot can not send to this chat again by itself, or this message is refused */
  final: boolean;
  /** 429: seconds to wait (Telegram's `parameters.retry_after`) */
  retryAfterSec: number | null;
  /** a group upgraded to a supergroup: its new chat id */
  migrateTo: string | null;
}
export type TgResult<T> = { ok: true; result: T } | TgFailure;

export interface ApiAnswer {
  ok?: boolean;
  result?: unknown;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number; migrate_to_chat_id?: number };
}

/** Classifies a failed answer (pure; exported for the tests). */
export function tgFailure(status: number | null, body: ApiAnswer | null): TgFailure {
  const description = typeof body?.description === "string" ? body.description : null;
  const httpStatus = status ?? null;
  const code: CauseCode = httpStatus === null ? "network" : classifyTelegramError({ status: httpStatus, description });
  const retryAfter = Number(body?.parameters?.retry_after);
  const migrate = body?.parameters?.migrate_to_chat_id;
  const retryable = httpStatus === null || httpStatus === 408 || httpStatus === 429 || httpStatus >= 500;
  return {
    ok: false,
    status: httpStatus,
    code,
    final: TELEGRAM_FINAL_CODES.has(code) || !retryable,
    retryAfterSec: httpStatus === 429 && Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(Math.ceil(retryAfter), 86_400) : null,
    migrateTo: typeof migrate === "number" && Number.isSafeInteger(migrate) ? String(migrate) : null,
  };
}

export interface BotInfo {
  id: string;
  username: string | null;
  name: string;
}

export interface FoundChat {
  id: string;
  title: string;
  type: ChatType;
}

export interface ApiChat {
  id?: number;
  type?: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

const CHAT_TYPES: readonly ChatType[] = ["private", "group", "supergroup", "channel"];

/** The chats of an update list, newest first, once each; titles and types only (no message text). Pure. */
export function chatsOf(updates: readonly unknown[]): FoundChat[] {
  const seen = new Map<string, FoundChat>();
  for (const u of [...updates].reverse()) {
    const up = (u ?? {}) as Record<string, { chat?: ApiChat; message?: { chat?: ApiChat } } | undefined>;
    const chat = up.message?.chat ?? up.edited_message?.chat ?? up.channel_post?.chat ?? up.my_chat_member?.chat ?? up.chat_member?.chat ?? up.callback_query?.message?.chat;
    if (!chat || typeof chat.id !== "number" || !Number.isSafeInteger(chat.id)) continue;
    const type = CHAT_TYPES.includes(chat.type as ChatType) ? (chat.type as ChatType) : null;
    if (!type) continue;
    const id = String(chat.id);
    if (seen.has(id)) continue;
    const person = [chat.first_name, chat.last_name].filter(Boolean).join(" ");
    const title = (chat.title ?? (person || (chat.username ? `@${chat.username}` : id))).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 128);
    seen.set(id, { id, title, type });
  }
  return [...seen.values()];
}

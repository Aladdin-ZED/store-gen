/**
 * Shape every dashboard server action returns, and the client helper that turns it into toasts.
 * Isomorphic types; `runAction` is used from client components only.
 *
 * The store's actions answer through `storeAction` (docs/STORE-SAAS.md §E.2, D65): `error` is a code ("invalid",
 * "forbidden", "read_only", "quota"…) and `message` the text or message key to show; a few account screens still
 * answer the older form, where `error` is the text itself. `actionMessage` reads both.
 */
import { toast } from "sonner";
import { messageOf, t } from "@/lib/i18n/admin";

export type ActionFailure = { ok: false; error: string; message?: string; jobId?: string; items?: unknown[] };
export type ActionResult<T = null> = { ok: true; data: T } | ActionFailure;

const FALLBACK = "That didn't work. Please try again.";

/** The text of a failed action: its message (a key or plain text), else its code's message, else the legacy text. */
export function actionMessage(res: ActionFailure, fallback = FALLBACK): string {
  if (res.message) return t(res.message);
  if (!res.error) return fallback;
  const key = `error.${res.error}`;
  if (messageOf(key) !== undefined) return t(key);
  // an older action's error is already the text; an unknown code never shows raw
  return /^[a-z][a-z0-9_]*$/.test(res.error) ? fallback : res.error;
}

/**
 * Await a server action and report it: success toast (optional) or the action's error message.
 * Returns the data on success, undefined on failure.
 */
export async function runAction<T>(
  promise: Promise<ActionResult<T>>,
  messages: { success?: string | ((data: T) => string); error?: string } = {},
): Promise<T | undefined> {
  try {
    const res = await promise;
    if (res.ok) {
      const msg = typeof messages.success === "function" ? messages.success(res.data) : messages.success;
      if (msg) toast.success(msg);
      return res.data;
    }
    toast.error(actionMessage(res, messages.error));
    return undefined;
  } catch {
    toast.error(messages.error ?? "Connection problem — check your network and try again.");
    return undefined;
  }
}

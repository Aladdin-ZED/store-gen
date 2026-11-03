"use server";
/**
 * Actions of Connect → Telegram (operations.md OPE-§M.3 P5 rows, §21.1, §21.4; core §E.2, §B.7, §E.8, §F.5). Each
 * wraps one setup function of src/lib/integrations/telegram/setup.server.ts and answers its `SetupResult` as the data:
 * `{ ok: false, error }` there is a setup step the screen words (`int.tg.err.<error>`), never a provider's raw text.
 *
 *   saveTelegramTokenAction(token)       integrations.manage · telegram · fresh step-up (the token is write-only)
 *   findTelegramChatsAction()            integrations.manage · telegram · `s:<sid>:tg:find` 10/h (in findChats)
 *   selectTelegramChatAction(chatId)     integrations.manage · telegram
 *   sendTelegramTestAction()             integrations.manage · telegram (success turns Telegram on)
 *   setTelegramPiiAction(level, ok?)     integrations.manage · telegram ("full" needs the confirmation)
 *   disableTelegramAction(forget?)       integrations.manage · telegram
 *   saveNotificationsAction(input)       integrations.manage            the `notifications` setting (OPE-§21.4)
 */
import { z } from "zod";
import { revalidateStore } from "@/lib/admin-data/shell";
import { settingsActor } from "@/lib/admin-data/store-audit";
import { disableTelegram, findChats, saveBotToken, selectChat, sendTestMessage, setPii, type SetupResult } from "@/lib/integrations/telegram/setup.server";
import type { ChatType, FoundChat } from "@/lib/integrations/telegram/wire";
import { getStoreSetting, updateStoreSetting } from "@/lib/settings";
import { NotificationsSetting } from "@/lib/settings/keys/notifications";
import { requireStepUp, storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";

const PAGE = "/integrations/telegram" as const;
const Token = z.string().max(200);
const ChatId = z.string().max(40);

export async function saveTelegramTokenAction(token: string): Promise<ActionResult<SetupResult<{ botUsername: string | null }>>> {
  return storeAction(
    "integrations.manage",
    async (ctx) => {
      // the bot token is a secret write under integrations.manage: a fresh step-up, named on the audit row (§B.7)
      const stepUp = requireStepUp(ctx);
      const r = await saveBotToken(ctx.scope, ctx.actor, Token.parse(token), { stepUp });
      revalidateStore(ctx.store.handle, PAGE);
      return r;
    },
    { feature: "telegram" },
  );
}

export async function findTelegramChatsAction(): Promise<ActionResult<SetupResult<{ chats: FoundChat[] }>>> {
  return storeAction("integrations.manage", (ctx) => findChats(ctx.scope, ctx.actor), { feature: "telegram" });
}

export async function selectTelegramChatAction(chatId: string): Promise<ActionResult<SetupResult<{ chat: { title: string; type: ChatType } }>>> {
  return storeAction(
    "integrations.manage",
    async (ctx) => {
      const r = await selectChat(ctx.scope, ctx.actor, ChatId.parse(chatId));
      revalidateStore(ctx.store.handle, PAGE);
      return r;
    },
    { feature: "telegram" },
  );
}

export async function sendTelegramTestAction(): Promise<ActionResult<SetupResult<{ enabled: true }>>> {
  return storeAction(
    "integrations.manage",
    async (ctx) => {
      const r = await sendTestMessage(ctx.scope, ctx.actor);
      revalidateStore(ctx.store.handle, PAGE, "/integrations");
      return r;
    },
    { feature: "telegram" },
  );
}

/** "Full" details (the phone and the address in a shared chat) need `confirmed: true` (OPE-§21.1 step 3). */
export async function setTelegramPiiAction(level: "masked" | "full", confirmed?: boolean): Promise<ActionResult<SetupResult<{ pii: "masked" | "full" }>>> {
  return storeAction(
    "integrations.manage",
    async (ctx) => {
      const r = await setPii(ctx.scope, ctx.actor, z.enum(["masked", "full"]).parse(level), { confirmed: confirmed === true });
      revalidateStore(ctx.store.handle, PAGE);
      return r;
    },
    { feature: "telegram" },
  );
}

/** Turns Telegram off; `forget` also removes the bot token and the chat. */
export async function disableTelegramAction(forget?: boolean): Promise<ActionResult<SetupResult<{ enabled: false }>>> {
  return storeAction(
    "integrations.manage",
    async (ctx) => {
      const r = await disableTelegram(ctx.scope, ctx.actor, { forget: forget === true });
      revalidateStore(ctx.store.handle, PAGE, "/integrations");
      return r;
    },
    { feature: "telegram" },
  );
}

const NotificationsInput = z.object({
  telegram: NotificationsSetting.shape.telegram.unwrap().partial().optional(),
  inApp: NotificationsSetting.shape.inApp.unwrap().partial().optional(),
  testOrders: z.boolean().optional(),
});

/** Which events reach Telegram and the in-app centre, and the daily summary hour (OPE-§21.4; a partial merge). */
export async function saveNotificationsAction(input: z.input<typeof NotificationsInput>): Promise<ActionResult<NotificationsSetting>> {
  return storeAction("integrations.manage", async (ctx) => {
    const v = NotificationsInput.parse(input ?? {});
    const prev = await getStoreSetting(ctx.scope, "notifications", { fresh: true });
    const next = NotificationsSetting.parse({
      telegram: { ...prev.telegram, ...v.telegram },
      inApp: { ...prev.inApp, ...v.inApp },
      testOrders: v.testOrders ?? prev.testOrders,
    });
    const saved = await updateStoreSetting(ctx.scope, "notifications", next, settingsActor(ctx.actor));
    revalidateStore(ctx.store.handle, PAGE);
    return saved as NotificationsSetting;
  });
}

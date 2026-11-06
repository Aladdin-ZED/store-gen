import "server-only";
/**
 * The Telegram screen's one read (P5 INTEGRATIONS; operations.md OPE-§21.1, §21.4, OD23; IN-04): what
 * `/app/<h>/integrations/telegram` shows, every part through the store's scope. Each block loads on its own: a failed
 * read is `null` there (the screen shows an inline retry) and never blanks the others.
 *
 * - `view`: set / not set, the bot's @name, the chosen chat's title, type and last 4 characters (never the token,
 *   never the full chat id, ./setup.server.ts `telegramView`);
 * - `notifications`: the `notifications` setting (switches, batch seconds, the daily summary hour);
 * - `status`: the `integration_status` row `telegram` and the three likely causes when it fails (cause and fix);
 * - `feature`: the plan's `telegram` feature (off → the screen says so and offers nothing).
 */
import { getStoreSetting } from "@/lib/settings";
import type { NotificationsSetting } from "@/lib/settings/keys/notifications";
import { entitlement } from "@/lib/tenancy/entitlements";
import type { StoreScope } from "@/lib/tenancy/types";
import { whatToCheck, type CheckItem } from "../causes";
import { integrationHealth, type IntegrationHealthRow } from "../health";
import { telegramView, type TelegramView } from "./setup.server";

export interface TelegramScreen {
  feature: boolean;
  view: TelegramView | null;
  notifications: NotificationsSetting | null;
  status: IntegrationHealthRow | null;
  checks: CheckItem[];
}

const orNull = <T>(p: Promise<T>): Promise<T | null> =>
  p.catch((err: unknown) => {
    console.error("[telegram:screen]", err instanceof Error ? err.message.slice(0, 200) : "read failed");
    return null;
  });

export async function telegramScreen(scope: StoreScope): Promise<TelegramScreen> {
  const [feature, view, notifications, rows] = await Promise.all([
    entitlement(scope, "telegram").catch(() => true),
    orNull(telegramView(scope)),
    orNull(getStoreSetting(scope, "notifications")),
    orNull(integrationHealth(scope)),
  ]);
  const status = rows?.find((r) => r.kind === "telegram") ?? null;
  const failing = status && (status.state === "failing" || status.state === "warn");
  return {
    feature: feature === true,
    view,
    notifications,
    status,
    checks: failing ? whatToCheck("telegram", status.lastErrorCode) : [],
  };
}

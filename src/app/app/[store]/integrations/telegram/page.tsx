import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/common/page-header";
import { Screen } from "@/components/admin/common/screen";
import { LockedCard, ReadOnlyNote } from "@/components/admin/integrations/hub-states";
import { TelegramOff, TelegramSetup } from "@/components/admin/integrations/telegram-setup";
import { viewerLocale } from "@/lib/auth/locale";
import { dirOf, translator } from "@/lib/i18n/admin";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { telegramScreen } from "@/lib/integrations/telegram/screen.server";
import { requireStoreMember, SeamError } from "@/lib/tenancy/seam";
import type { StoreCtx } from "@/lib/tenancy/types";

/**
 * Who opens the screen: `integrations.manage` (owner, admin), else the neutral 404 (core §I.1). "View as store" opens it
 * read-only: the token is only ever "set / not set" and the chat its title and last 4 characters.
 */
async function telegramMember(handle: string): Promise<StoreCtx> {
  try {
    return await requireStoreMember({ handle, permission: "integrations.manage", throwOnFail: true });
  } catch (err) {
    if (err instanceof SeamError && err.code === "impersonation_read_only") return requireStoreMember({ handle });
    return requireStoreMember({ handle, permission: "integrations.manage" });
  }
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: translator(await viewerLocale(null))("int.tgs.title") };
}

/**
 * Connect → Telegram (operations.md OPE-§21.1, §21.4, OD23; IN-04): the bot, the chat and the test message, then the
 * details level and the notifications. A pending store sees the locked card; a plan without `telegram` says so.
 */
export default async function TelegramPage({ params }: { params: Promise<{ store: string }> }) {
  const ctx = await telegramMember((await params).store);
  const locale = await viewerLocale(ctx.user);
  const t = translator(locale);
  const impersonating = ctx.scope.kind === "impersonation";
  const canWrite = ctx.can("integrations.manage") && !impersonating;
  const locked = ctx.store.status === "pending";
  const screen = locked ? null : await telegramScreen(ctx.scope);

  return (
    <AdminI18nProvider locale={locale}>
      <div lang={locale} dir={dirOf(locale)} className="contents">
        <Screen>
          <PageHeader title={t("int.tgs.title")} description={t("int.tgs.lead")} />
          {impersonating && <ReadOnlyNote text={t("int.tgs.impersonation")} />}
          <div className="grid max-w-3xl gap-5">
            {!screen ? (
              <LockedCard />
            ) : !screen.feature ? (
              <TelegramOff />
            ) : (
              <TelegramSetup
                initial={screen.view}
                notifications={screen.notifications}
                status={screen.status}
                checks={screen.checks}
                canWrite={canWrite}
                timezone={ctx.store.timezone || "Africa/Casablanca"}
              />
            )}
          </div>
        </Screen>
      </div>
    </AdminI18nProvider>
  );
}

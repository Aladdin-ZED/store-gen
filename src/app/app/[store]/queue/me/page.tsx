import type { Metadata } from "next";
import { MyDay } from "@/components/admin/queue/my-day";
import { viewerLocale } from "@/lib/auth/locale";
import { myFigures } from "@/lib/callcenter/console.server";
import { dirOf, t } from "@/lib/i18n/admin";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { appHref } from "@/lib/urls";
import { requireStoreMember } from "@/lib/tenancy/seam";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t("ops.me.title", undefined, await viewerLocale(null)) };
}

/**
 * `/app/<h>/queue/me` (P4 CALL CENTER; operations.md OPE-§15.5 R1 half, §13.2a, §M.1: `agents.self`): the agent's own
 * KPIs for today, 7 and 28 days, each with its n ("needs 20" below the agent minimum, OD17), and the end-of-day line.
 * The earnings statement is R2 (S3). Only the viewer's own rows; ar / fr / en from the account's language.
 */
export default async function MyDayPage({ params }: { params: Promise<{ store: string }> }) {
  const { store: handle } = await params;
  const ctx = await requireStoreMember({ handle, permission: "agents.self" });
  const [locale, figures] = await Promise.all([viewerLocale(ctx.user), myFigures(ctx)]);
  return (
    <AdminI18nProvider locale={locale}>
      <div lang={locale} dir={dirOf(locale)} className="contents">
        <MyDay figures={figures} locale={locale} storeName={ctx.store.name} queueHref={appHref(ctx.store.handle, "/queue")} />
      </div>
    </AdminI18nProvider>
  );
}

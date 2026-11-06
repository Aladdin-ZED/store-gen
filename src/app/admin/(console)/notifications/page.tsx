import type { Metadata } from "next";
import { StaffFeed } from "@/components/console/notifications/staff-feed";
import { ConsolePanel, PanelError, PanelUnavailable } from "@/components/console/panel";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { t as message, translator } from "@/lib/i18n/admin";
import { listNotifications } from "@/lib/platform/notify";
import { panel } from "@/lib/platform/panel";
import { requirePlatform } from "@/lib/platform/seam";

/*
 * `/admin/notifications`: the staff feed (platform.md PLA-§4.1, §18.1, PL-13). `console.read`; the reader is the
 * session's user with their platform role, so only the `platform_staff` rows their rank may read are listed (the
 * rules of src/lib/platform/notify.ts). 50 rows a page, keyset by id (`?before=`), All / Unread in the URL.
 */
export const metadata: Metadata = { title: message("console.notifications.meta") };

const PAGE = 50;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function StaffNotificationsPage({ searchParams }: Props) {
  const ctx = await requirePlatform({ permission: "console.read" });
  const sp = await searchParams;
  const filter = one(sp.filter) === "unread" ? "unread" : "all";
  const rawBefore = Number(one(sp.before));
  const before = Number.isSafeInteger(rawBefore) && rawBefore > 0 ? rawBefore : null;
  const tr = translator(CONSOLE_LOCALE);
  const reader = { userId: ctx.user.id, storeId: null, role: null, platformRole: ctx.role } as const;
  // a full page may have an older one (the read caps a page at 50 rows)
  const p = await panel("notifications.staff", () => listNotifications(reader, { limit: PAGE, unreadOnly: filter === "unread", ...(before ? { beforeId: before } : {}) }));

  return (
    <div className="mx-auto grid w-full max-w-[880px] gap-4 md:gap-5">
      <header className="grid gap-1">
        <h1 className="text-[20px] leading-tight font-semibold tracking-[-0.014em]">{tr("console.notifications.title")}</h1>
        <p className="text-[13px] text-muted-foreground">{tr("console.notifications.lead")}</p>
      </header>
      {p.state === "ok" ? (
        <StaffFeed items={p.data} filter={filter} older={p.data.length >= PAGE ? (p.data[p.data.length - 1]?.id ?? null) : null} newer={before !== null} at={p.at} />
      ) : (
        <ConsolePanel title={tr("console.notifications.title")}>
          {p.state === "error" ? <PanelError reference={p.ref} /> : <PanelUnavailable />}
        </ConsolePanel>
      )}
    </div>
  );
}

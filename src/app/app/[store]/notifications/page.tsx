import type { Metadata } from "next";
import { NotificationCentre } from "@/components/admin/shell/notification-centre";
import { CENTRE_GROUPS, CENTRE_PAGE, centrePager, decodeCentreCursor, type CentreGroup } from "@/components/admin/shell/pulse-state";
import { screenLocale, screenLocalesFor } from "@/components/admin/shell/store-nav";
import { viewerLocale } from "@/lib/auth/locale";
import { t } from "@/lib/i18n/admin";
import { listNotifications, type Reader } from "@/lib/platform/notify";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { readerRoleOf } from "@/app/api/app/[store]/pulse/compose";
import { memberCtx } from "../member-ctx";

type Props = { params: Promise<{ store: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { user } = await memberCtx((await params).store);
  return { title: t("shell.notifications.title", undefined, screenLocale(await viewerLocale(user), screenLocalesFor("/notifications"))) };
}

/*
 * /app/<h>/notifications: the notification centre (P2 SHELL; platform.md PLA-§22.6, §18.1; PL-13), `store.read`. The
 * reader is the viewer in this store (their role; none for staff viewing it, who read only rows addressed to them),
 * so P1's `listNotifications` applies the §18.1 read rules: an agent never reads a row addressed to owners. Keyset
 * paging, 50 rows a page (`?before=`), filters by group (`?group=`).
 */
export default async function NotificationsPage({ params, searchParams }: Props) {
  const { store: handle } = await params;
  const ctx = await requireStoreMember({ handle, permission: "store.read" });
  const sp = await searchParams;
  const group = CENTRE_GROUPS.find((g) => g === sp.group) ?? null;
  const reader: Reader = { userId: ctx.user.id, storeId: ctx.store.id, role: readerRoleOf(ctx.membership), platformRole: ctx.user.platformRole };
  const page = await readCentrePage(reader, decodeCentreCursor(sp.before), group ?? undefined);
  return <NotificationCentre group={group} {...page} />;
}

/** One page of the centre: the rows, the cursors, and the clock the day groups are read against. */
async function readCentrePage(reader: Reader, stack: number[], group: CentreGroup | undefined) {
  const items = await listNotifications(reader, { beforeId: stack.at(-1), limit: CENTRE_PAGE, group });
  const last = items.at(-1)?.id ?? null;
  // Next only when an older row exists (one more read of a single row, never an empty page behind the button)
  const more = items.length === CENTRE_PAGE && last !== null && (await listNotifications(reader, { beforeId: last, limit: 1, group })).length > 0;
  return { items, ...centrePager(stack, last, more), now: Date.now() };
}

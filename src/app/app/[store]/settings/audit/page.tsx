import type { Metadata } from "next";
import { AuditView } from "@/components/admin/settings/audit-view";
import { centrePager, decodeCentreCursor } from "@/components/admin/shell/pulse-state";
import { screenLocale, screenLocalesFor } from "@/components/admin/shell/store-nav";
import { viewerLocale } from "@/lib/auth/locale";
import { t } from "@/lib/i18n/admin";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { memberCtx } from "../../member-ctx";
import { AUDIT_ACTOR_KINDS, AUDIT_AREA_PREFIX, auditViewPage, zonedMidnight, type AuditActorKind, type AuditAreaId } from "./data";

type Props = {
  params: Promise<{ store: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { user } = await memberCtx((await params).store);
  return {
    title: t("shell.settings.audit", undefined, screenLocale(await viewerLocale(user), screenLocalesFor("/settings/audit"))),
  };
}

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/**
 * Settings → Audit (P2 SHELL; platform.md PLA-§22.10.6, PD75, ENGC-8): the store's own activity log. The spec names
 * `settings.read`; the page asks `audit.read`, the guard of T1's frozen `listStoreAudit` (recorded drift: a member with
 * settings.read but not audit.read would get the neutral 404 here, as `navFor` already hides the tab). Filters in the
 * URL (`?actor=`, `?area=`, `?from=`, `?to=` as store-local days), keyset pages of 50 (`?before=`), so every view is a
 * link; a member of another store gets the neutral 404 from the seam.
 */
export default async function AuditSettingsPage({ params, searchParams }: Props) {
  const ctx = await requireStoreMember({
    handle: (await params).store,
    permission: "audit.read",
  });
  const sp = await searchParams;
  const actor = AUDIT_ACTOR_KINDS.find((k) => k === one(sp.actor)) as AuditActorKind | undefined;
  const area = (Object.keys(AUDIT_AREA_PREFIX) as AuditAreaId[]).find((a) => a === one(sp.area));
  const fromDay = one(sp.from);
  const toDay = one(sp.to);
  const from = zonedMidnight(fromDay, ctx.store.timezone);
  const toStart = zonedMidnight(toDay, ctx.store.timezone);
  // `to` is inclusive on screen: the rows before the next day's midnight
  const to = toStart ? new Date(toStart.getTime() + 86_400_000) : null;
  const stack = decodeCentreCursor(one(sp.before));
  const { rows, more } = await auditViewPage(ctx, {
    beforeId: stack.at(-1),
    actorKind: actor,
    area,
    from: from ?? undefined,
    to: to ?? undefined,
  });
  const pager = centrePager(stack, rows.at(-1)?.id ?? null, more);
  return (
    <AuditView
      rows={rows}
      timeZone={ctx.store.timezone}
      filters={{
        actor: actor ?? "",
        area: area ?? "",
        from: from ? (fromDay ?? "") : "",
        to: toStart ? (toDay ?? "") : "",
      }}
      next={pager.next}
      prev={pager.prev}
    />
  );
}

import type { Metadata } from "next";
import { Screen } from "@/components/admin/common/screen";
import { LocaleScope } from "@/components/admin/landing/locale-scope";
import { LinksView } from "@/components/admin/links/links-view";
import { viewerLocale } from "@/lib/auth/locale";
import { linkPageOptions, listShortLinks } from "@/lib/links/read";
import { entitlement } from "@/lib/tenancy/entitlements";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { usageValue } from "@/lib/tenancy/usage";
import { createLinkAction, deleteLinkAction, editLinkTargetAction, pauseLinkAction, resumeLinkAction } from "./actions";

export const metadata: Metadata = { title: "Short links" };

type Params = Promise<{ store: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Short links (P3 LANDING; landing.md LAN-§12.2, LP-12; core §I.1 `/app/<h>/links`, `pages.read`, edit
 * `campaigns.write`): the store's links with their target, channel, tags, clicks and status, the create sheet (a
 * target picker, never a typed URL), the row actions (copy, QR, pause / resume with Undo, change target, delete) and
 * the gauge `short_links` against `short_links_max`, whose limit sheet opens on a refused create. `?new=1` (the ⌘K
 * command "New short link") opens the create sheet.
 */
export default async function LinksPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "pages.read" });
  const { scope, store } = ctx;
  const openNew = (await searchParams).new === "1";
  const [links, pages, used, limit, locale] = await Promise.all([
    listShortLinks(scope, store),
    linkPageOptions(scope, store),
    usageValue(scope, { metric: "short_links", period: "total" }),
    entitlement(scope, "short_links_max"),
    viewerLocale(ctx.user),
  ]);

  return (
    <LocaleScope locale={locale}>
      <Screen wide>
        <LinksView
          links={links}
          pages={pages}
          gauge={{ used, limit }}
          canWrite={ctx.can("campaigns.write") && !ctx.impersonation}
          openNew={openNew}
          timeZone={store.timezone}
          renderedAt={new Date().toISOString()}
          actions={{ create: createLinkAction, pause: pauseLinkAction, resume: resumeLinkAction, remove: deleteLinkAction, retarget: editLinkTargetAction }}
        />
      </Screen>
    </LocaleScope>
  );
}

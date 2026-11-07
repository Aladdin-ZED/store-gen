/**
 * The campaigns list screen as a server component (P3 LANDING, wave 2; landing.md LAN-§13.4): `/app/<h>/campaigns` and,
 * for a live page's id, `/app/<h>/campaigns/<pageId>` (the create sheet opened on that page: "Make a campaign" from
 * anywhere that knows the page). The seam's context is the caller's (`requireStoreMember` with `pages.read`).
 */
import { CampaignsView } from "@/components/admin/campaigns/campaigns-view";
import { Screen } from "@/components/admin/common/screen";
import { LocaleScope } from "@/components/admin/landing/locale-scope";
import { createCampaignAction } from "@/app/app/[store]/campaigns/actions";
import { viewerLocale } from "@/lib/auth/locale";
import { listCampaigns } from "@/lib/campaigns/read.server";
import type { LinkPageOption } from "@/lib/links/read";
import { entitlement } from "@/lib/tenancy/entitlements";
import { usageValue } from "@/lib/tenancy/usage";
import type { StoreCtx } from "@/lib/tenancy/types";

export async function CampaignsScreen({ ctx, pages, openNew, pageId }: { ctx: StoreCtx; pages: LinkPageOption[]; openNew: boolean; pageId: string | null }) {
  const { scope } = ctx;
  const [rows, used, limit, linksUsed, linksLimit, locale] = await Promise.all([
    listCampaigns(scope),
    usageValue(scope, { metric: "campaigns", period: "total" }),
    entitlement(scope, "campaigns_max"),
    usageValue(scope, { metric: "short_links", period: "total" }),
    entitlement(scope, "short_links_max"),
    viewerLocale(ctx.user),
  ]);
  const canWrite = ctx.can("campaigns.write") && !ctx.impersonation;
  return (
    <LocaleScope locale={locale}>
      <Screen wide>
        <CampaignsView
          rows={rows}
          pages={pages}
          gauge={{ used, limit }}
          linkGauge={{ used: linksUsed, limit: linksLimit }}
          canWrite={canWrite}
          openNew={openNew}
          pageId={pageId}
          actions={{ create: createCampaignAction }}
        />
      </Screen>
    </LocaleScope>
  );
}

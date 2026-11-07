import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CampaignsScreen } from "@/components/admin/campaigns/campaigns-screen";
import { KitView } from "@/components/admin/campaigns/kit-view";
import { Screen } from "@/components/admin/common/screen";
import { LocaleScope } from "@/components/admin/landing/locale-scope";
import { previewAssetsFor } from "@/lib/admin-data/assets";
import { storeInfoOf } from "@/lib/admin-data/store-info";
import { aiPolicyFor } from "@/lib/ai/router/server";
import { viewerLocale } from "@/lib/auth/locale";
import { campaignDetail } from "@/lib/campaigns/read.server";
import { campaignResults } from "@/lib/campaigns/results.server";
import { linkPageOptions } from "@/lib/links/read";
import { entitlement } from "@/lib/tenancy/entitlements";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { usageValue } from "@/lib/tenancy/usage";
import { endCampaignAction, goLiveAction, pauseCampaignAction, recompileCampaignAction, refineKitAction, revokeShareAction, shareCampaignAction } from "../actions";

export const metadata: Metadata = { title: "Campaign" };

type Params = Promise<{ store: string; id: string }>;

/**
 * One Campaign Kit (P3 LANDING, wave 2; landing.md LAN-§13.4; core §I.1 `/app/<h>/campaigns/<id>`, `pages.read`, edit
 * `campaigns.write`). Another store's id answers the neutral 404 (the read is scoped); the id of one of the store's live
 * pages opens the create sheet on that page. The results strip reads the
 * store's orders of 28 days tagged with the kit's slug; the Cloud brief runs from the screen (pattern A).
 */
export default async function CampaignPage({ params }: { params: Params }) {
  const { store: handle, id } = await params;
  const ctx = await requireStoreMember({ handle, permission: "pages.read" });
  const { scope, store } = ctx;
  const detail = await campaignDetail(scope, store, id);
  if (!detail) {
    // a live page's id opens the create sheet on that page; anything else (another store's id too) is the neutral 404
    const pages = await linkPageOptions(scope, store);
    if (!pages.some((p) => p.id === id)) notFound();
    return <CampaignsScreen ctx={ctx} pages={pages} openNew pageId={id} />;
  }
  const canWrite = ctx.can("campaigns.write") && !ctx.impersonation;
  const [results, locale, policy, used, limit, info, assets] = await Promise.all([
    campaignResults(scope, {
      slug: detail.row.slug,
      links: detail.links.map((l) => ({ channel: l.channel, shortLinkId: l.id, source: l.source, clicks: l.clicks })),
      angles: detail.kit.brief.angles.map((a) => a.id),
    }),
    viewerLocale(ctx.user),
    canWrite ? aiPolicyFor(ctx) : Promise.resolve(null),
    usageValue(scope, { metric: "campaigns", period: "total" }),
    entitlement(scope, "campaigns_max"),
    detail.doc ? storeInfoOf(scope, store) : Promise.resolve(null),
    detail.doc ? previewAssetsFor(scope, [detail.doc]) : Promise.resolve({}),
  ]);
  const cloud = !!policy && canWrite && ctx.can("ai.use") && policy.cloud.available && policy.mode !== "local";

  return (
    <LocaleScope locale={locale}>
      <Screen wide>
        <KitView
          row={detail.row}
          kit={detail.kit}
          links={detail.links.map((l) => ({ id: l.id, channel: l.channel, url: l.url, status: l.status, clicks: l.clicks }))}
          results={results}
          thumb={detail.doc && info ? { doc: detail.doc, assets, store: info } : null}
          canWrite={canWrite}
          cloud={cloud}
          policy={policy}
          gauge={{ used, limit }}
          actions={{
            recompile: recompileCampaignAction,
            live: goLiveAction,
            pause: pauseCampaignAction,
            end: endCampaignAction,
            share: shareCampaignAction,
            revoke: revokeShareAction,
            refine: refineKitAction,
          }}
        />
      </Screen>
    </LocaleScope>
  );
}

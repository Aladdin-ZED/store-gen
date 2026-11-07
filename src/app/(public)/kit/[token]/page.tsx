import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { KitCards } from "@/components/admin/campaigns/kit-cards";
import { CampaignStatusPill } from "@/components/admin/campaigns/status-pill";
import { SharedThumbnail } from "@/components/admin/campaigns/shared-thumbnail";
import { previewAssetsFor } from "@/lib/admin-data/assets";
import { storeInfoOf } from "@/lib/admin-data/store-info";
import { getSignedInUser } from "@/lib/auth";
import { viewerLocale } from "@/lib/auth/locale";
import { kitForShare } from "@/lib/campaigns/share.server";
import { translator } from "@/lib/i18n/admin";
import { hashIp } from "@/lib/security/crypto";
import { clientIp } from "@/lib/security/ip";
import { platformBucket, rateLimit } from "@/lib/security/rate-limit";

/*
 * `/kit/<token>` (P3 LANDING, wave 2; landing.md LAN-§13.5, LP-18 = SF-01; core §C.3 area `kit`, §B.1, §F.6): a Campaign
 * Kit shared read-only with a media buyer or a partner, on the platform host only (store hosts answer the neutral 404
 * through the proxy, which also sends the `auth`-class headers: nonce CSP, noindex, `private, no-store`,
 * `Referrer-Policy: no-referrer`). `kitForShare` resolves the token through `resolveKitShare` (sha256 = the stored hash,
 * servable stores only, never cached): a revoked, unknown or malformed token, and an IP over its bucket
 * (`p:kit:ip:<h>`, 60 per 10 minutes), answer the same 404. The kit holds no customer datum; its addresses render as
 * text with a copy button, never as a free href.
 */
export async function generateMetadata(): Promise<Metadata> {
  return { title: translator(await viewerLocale(null))("landing.campaigns.shared.meta"), robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };
}

const KIT_BUCKET = { limit: 60, windowSec: 600 } as const;

export default async function SharedKitPage({ params }: { params: Promise<{ token: string }> }) {
  const [{ token }, h, viewer] = await Promise.all([params, headers(), getSignedInUser()]);
  const allowed = await rateLimit(platformBucket("kit:ip", hashIp(clientIp(h))), KIT_BUCKET.limit, KIT_BUCKET.windowSec).catch(() => ({ ok: false }));
  if (!allowed.ok) notFound();
  const shared = await kitForShare(token);
  if (!shared) notFound();
  const t = translator(await viewerLocale(viewer));
  const { store, scope, campaign, doc } = shared;
  const [info, assets] = doc ? await Promise.all([storeInfoOf(scope, store), previewAssetsFor(scope, [doc])]) : [null, {}];

  return (
    <div className="grid gap-6 pb-4">
      <header className="grid gap-4">
        <div className="flex items-start gap-4">
          {doc && info && <SharedThumbnail doc={doc} assets={assets} store={info} label={campaign.name} />}
          <div className="grid min-w-0 gap-1.5">
            <p className="text-[0.8125rem] font-medium text-muted-foreground">{t("landing.campaigns.shared.by", { store: store.name })}</p>
            <h1 className="font-display text-[1.6rem] leading-[1.1] font-semibold tracking-[-0.03em] text-balance">{campaign.name}</h1>
            <CampaignStatusPill status={campaign.status} />
          </div>
        </div>
        <p className="text-[0.8125rem] leading-relaxed text-pretty text-muted-foreground">{t("landing.campaigns.shared.lead")}</p>
      </header>
      <KitCards kit={campaign.kit} links={campaign.kit.links.map((l) => ({ channel: l.channel, url: l.url }))} stacked />
    </div>
  );
}

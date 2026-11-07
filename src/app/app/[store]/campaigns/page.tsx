import type { Metadata } from "next";
import { CampaignsScreen } from "@/components/admin/campaigns/campaigns-screen";
import { linkPageOptions } from "@/lib/links/read";
import { requireStoreMember } from "@/lib/tenancy/seam";

export const metadata: Metadata = { title: "Campaigns" };

type Params = Promise<{ store: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * Campaigns (P3 LANDING, wave 2; landing.md LAN-§13.4, LP-18 = SF-01; core §I.1 `/app/<h>/campaigns`, `pages.read`, edit
 * `campaigns.write`): the store's kits with their page, status, link clicks and orders of 28 days, the create sheet
 * (`?new=1`, `&page=<id>` from the pages list row menu and the address card) and the `campaigns` gauge against
 * `campaigns_max`.
 */
export default async function CampaignsPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "pages.read" });
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const pageId = one(sp.page);
  const pages = await linkPageOptions(ctx.scope, ctx.store);
  return <CampaignsScreen ctx={ctx} pages={pages} openNew={one(sp.new) === "1"} pageId={pageId && ID_RE.test(pageId) ? pageId : null} />;
}

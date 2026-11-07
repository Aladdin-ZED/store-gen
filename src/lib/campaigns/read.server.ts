import "server-only";
/**
 * Campaign reads for the screens (P3 LANDING, wave 2; landing.md LAN-§13.4): every read takes the store's scope, so
 * another store's id answers null like a missing one.
 *
 *   listCampaigns(scope)          the list: name, page (title, live), status, the kit's link clicks, orders 28 days
 *   campaignDetail(scope, id)     the detail: the row, the kit, its links with their live status and clicks, the
 *                                 page's published document (the header thumbnail)
 *   searchCampaigns(scope, q)     ⌘K: by name or slug
 */
import { desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { likeEscape } from "@/lib/admin-data/store-audit";
import { db } from "@/lib/db/client";
import { campaigns, pages, pageVersions, shortLinks, type CampaignKit } from "@/lib/db/schema";
import { PageDoc } from "@/lib/page/schema";
import { byId, whereStore } from "@/lib/tenancy/sql";
import type { StoreRow, StoreScope } from "@/lib/tenancy/types";
import { storeUrl } from "@/lib/urls";
import { ordersBySlug } from "./results.server";
import type { CampaignChannel, CampaignRow, CampaignStatus } from "./types";

const ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const LIST_MAX = 200;

const COLS = {
  id: campaigns.id,
  name: campaigns.name,
  slug: campaigns.slug,
  status: campaigns.status,
  pageId: campaigns.pageId,
  pageVersionId: campaigns.pageVersionId,
  channels: campaigns.channels,
  kitSource: campaigns.kitSource,
  kit: campaigns.kit,
  shareTokenHash: campaigns.shareTokenHash,
  createdAt: campaigns.createdAt,
  updatedAt: campaigns.updatedAt,
};
type Raw = Pick<typeof campaigns.$inferSelect, keyof typeof COLS>;

async function pageInfo(scope: StoreScope, ids: readonly string[]) {
  if (!ids.length) return new Map<string, { name: string; slug: string; live: boolean; versionId: string | null }>();
  const rows = await db
    .select({ id: pages.id, name: pages.name, slug: pages.slug, status: pages.status, versionId: pages.publishedVersionId })
    .from(pages)
    .where(whereStore(pages, scope, inArray(pages.id, [...new Set(ids)])));
  return new Map(rows.map((p) => [p.id, { name: p.name, slug: p.slug, live: p.status === "published" && !!p.versionId, versionId: p.versionId }]));
}

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : new Date(0).toISOString());

function rowOf(r: Raw, page: { name: string; slug: string; live: boolean } | undefined): CampaignRow {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    status: r.status as CampaignStatus,
    pageId: r.pageId,
    pageTitle: page?.name ?? null,
    pageSlug: page?.slug ?? null,
    pageLive: page?.live ?? false,
    channels: r.channels,
    kitSource: r.kitSource,
    stale: r.kit.stale === true,
    shared: typeof r.shareTokenHash === "string" && r.shareTokenHash.length === 64,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}

export interface CampaignListRow extends CampaignRow {
  clicks: number;
  orders: number;
}

export async function listCampaigns(scope: StoreScope): Promise<CampaignListRow[]> {
  const rows = (await db.select(COLS).from(campaigns).where(whereStore(campaigns, scope)).orderBy(desc(campaigns.createdAt)).limit(LIST_MAX)) as Raw[];
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [info, clicks, orderCounts] = await Promise.all([
    pageInfo(
      scope,
      rows.map((r) => r.pageId),
    ),
    db
      .select({ campaignId: shortLinks.campaignId, n: sql<number>`COALESCE(SUM(${shortLinks.clicks}), 0)` })
      .from(shortLinks)
      .where(whereStore(shortLinks, scope, inArray(shortLinks.campaignId, ids)))
      .groupBy(shortLinks.campaignId),
    ordersBySlug(
      scope,
      rows.map((r) => r.slug),
    ),
  ]);
  const clicksOf = new Map(clicks.map((c) => [c.campaignId, Number(c.n) || 0]));
  return rows.map((r) => ({ ...rowOf(r, info.get(r.pageId)), clicks: clicksOf.get(r.id) ?? 0, orders: orderCounts.get(r.slug) ?? 0 }));
}

export interface KitLinkState {
  id: string;
  code: string;
  channel: CampaignChannel;
  url: string;
  status: "active" | "paused";
  clicks: number;
  source: string | null;
}

export interface CampaignDetail {
  row: CampaignRow;
  kit: CampaignKit;
  pageVersionId: string | null;
  links: KitLinkState[];
  /** the page's published document (the header thumbnail), null when it is not live */
  doc: PageDoc | null;
}

export async function campaignDetail(scope: StoreScope, store: StoreRow, id: string): Promise<CampaignDetail | null> {
  if (!ID_RE.test(String(id))) return null;
  const [r] = (await db.select(COLS).from(campaigns).where(byId(campaigns, scope, id)).limit(1)) as Raw[];
  if (!r) return null;
  const [info, links] = await Promise.all([
    pageInfo(scope, [r.pageId]),
    db
      .select({ id: shortLinks.id, code: shortLinks.code, channel: shortLinks.channel, status: shortLinks.status, clicks: shortLinks.clicks, utm: shortLinks.utm })
      .from(shortLinks)
      .where(whereStore(shortLinks, scope, eq(shortLinks.campaignId, r.id)))
      .orderBy(shortLinks.createdAt),
  ]);
  const page = info.get(r.pageId);
  let doc: PageDoc | null = null;
  if (page?.live && page.versionId) {
    const [v] = await db.select({ doc: pageVersions.doc }).from(pageVersions).where(byId(pageVersions, scope, page.versionId)).limit(1);
    const parsed = v ? PageDoc.safeParse(v.doc) : null;
    doc = parsed?.success ? parsed.data : null;
  }
  return {
    row: rowOf(r, page),
    kit: r.kit,
    pageVersionId: r.pageVersionId,
    links: links.flatMap((l) => (l.channel ? [{ id: l.id, code: l.code, channel: l.channel, url: storeUrl(store, `/go/${l.code}`), status: l.status, clicks: l.clicks, source: l.utm?.source ?? null }] : [])),
    doc,
  };
}

/** ⌘K: the store's campaigns whose name or slug contains `q` (≥ 2 characters), newest first. */
export async function searchCampaigns(scope: StoreScope, q: string, limit = 5): Promise<{ id: string; name: string; slug: string }[]> {
  const text = q.trim().slice(0, 80);
  if (text.length < 2) return [];
  const pattern = `%${likeEscape(text)}%`;
  return db
    .select({ id: campaigns.id, name: campaigns.name, slug: campaigns.slug })
    .from(campaigns)
    .where(whereStore(campaigns, scope, or(like(campaigns.name, pattern), like(campaigns.slug, `%${likeEscape(text.toLowerCase())}%`))))
    .orderBy(desc(campaigns.createdAt))
    .limit(limit);
}

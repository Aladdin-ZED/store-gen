import "server-only";
/**
 * Campaign results (P3 LANDING, wave 2; landing.md LAN-§13.4 results strip): over the trailing 28 days, the orders
 * whose `utm_campaign` is the kit's slug, per link (its channel's `utm_source`) and per `utm_content` angle: orders,
 * confirmed, delivered; clicks are the link's counter. Test and honeypot orders are left out (core D54, OPE-§10.2);
 * the confirmation and delivery rates are withheld below n = 20 orders. One grouped read on the store's orders.
 * No customer field is read.
 *
 *   campaignResults(scope, kit)      the detail screen's strip
 *   ordersBySlug(scope, slugs)       the list's "orders 28 days" column, one read for every row
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { notHoneypot } from "@/lib/callcenter/insights-sql";
import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { RATE_MIN_N, type CampaignChannel, type CampaignResults, type ResultLine } from "./types";

export const RESULT_DAYS = 28;
const DAY_MS = 86_400_000;

const utmOf = (key: "utm_campaign" | "utm_source" | "utm_content") => sql<string | null>`LEFT(JSON_UNQUOTE(JSON_EXTRACT(${orders.utm}, ${`$.${key}`})), 80)`;
const real = and(eq(orders.isTest, false), notHoneypot)!;
const since = (now: Date) => new Date(now.getTime() - RESULT_DAYS * DAY_MS);

const rate = (n: number, of: number) => (of >= RATE_MIN_N ? n / of : null);
function line(key: string, clicks: number | null, c: { orders: number; confirmed: number; delivered: number }): ResultLine {
  return { key, clicks, ...c, confirmRate: rate(c.confirmed, c.orders), deliveryRate: rate(c.delivered, c.orders) };
}

interface KitRef {
  slug: string;
  links: { channel: CampaignChannel; shortLinkId: string; source: string | null; clicks: number }[];
  angles: string[];
}

export async function campaignResults(scope: StoreScope, kit: KitRef, now = new Date()): Promise<CampaignResults> {
  const src = utmOf("utm_source");
  const content = utmOf("utm_content");
  const rows = await db
    .select({ src: src.as("k_src"), content: content.as("k_content"), cs: orders.confirmState, ss: orders.shipState, n: sql<number>`COUNT(*)` })
    .from(orders)
    .where(whereStore(orders, scope, gte(orders.createdAt, since(now)), real, sql`${utmOf("utm_campaign")} = ${kit.slug}`))
    .groupBy(sql.raw("k_src"), sql.raw("k_content"), orders.confirmState, orders.shipState);
  const zero = () => ({ orders: 0, confirmed: 0, delivered: 0 });
  const bySrc = new Map<string, ReturnType<typeof zero>>();
  const byContent = new Map<string, ReturnType<typeof zero>>();
  const total = zero();
  for (const r of rows) {
    const n = Number(r.n) || 0;
    const add = (c: ReturnType<typeof zero>) => {
      c.orders += n;
      if (r.cs === "confirmed") c.confirmed += n;
      if (r.ss === "delivered") c.delivered += n;
    };
    const s = r.src ?? "*";
    const k = r.content ?? "*";
    if (!bySrc.has(s)) bySrc.set(s, zero());
    if (!byContent.has(k)) byContent.set(k, zero());
    add(bySrc.get(s)!);
    add(byContent.get(k)!);
    add(total);
  }
  const angleKeys = [...kit.angles, ...[...byContent.keys()].filter((k) => !kit.angles.includes(k))];
  return {
    days: RESULT_DAYS,
    links: kit.links.map((l) => ({ ...line(l.channel, l.clicks, (l.source && bySrc.get(l.source)) || zero()), channel: l.channel, shortLinkId: l.shortLinkId })),
    angles: angleKeys.map((k) => line(k, null, byContent.get(k) ?? zero())),
    total: line("total", kit.links.reduce((s, l) => s + l.clicks, 0), total),
  };
}

/** Orders of the trailing 28 days per campaign slug (the list column); slugs without an order are absent. */
export async function ordersBySlug(scope: StoreScope, slugs: readonly string[], now = new Date()): Promise<Map<string, number>> {
  if (!slugs.length) return new Map();
  const campaign = utmOf("utm_campaign");
  const rows = await db
    .select({ slug: campaign.as("k_slug"), n: sql<number>`COUNT(*)` })
    .from(orders)
    .where(whereStore(orders, scope, gte(orders.createdAt, since(now)), real, inArray(campaign, [...slugs])))
    .groupBy(sql.raw("k_slug"));
  return new Map(rows.flatMap((r) => (r.slug ? [[r.slug, Number(r.n) || 0] as const] : [])));
}

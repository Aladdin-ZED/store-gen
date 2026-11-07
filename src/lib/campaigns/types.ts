/**
 * Campaign Kit types and constants (P3 LANDING, wave 2; landing.md LAN-§13, LP-18 = SF-01). The kit shapes themselves
 * are the `campaigns.kit` column's (src/lib/db/schema.ts, frozen at P0) and are re-exported here; this file adds what
 * the service, the screens and the share page share: the statuses, the kit channels with their tag presets, the slug
 * rule and the codes the kit stores for the UI to word (`pixelPlan.events[].where`, `brief.doNotSay`,
 * `brief.compliance`), so one stored kit reads in ar, fr and en. Pure and isomorphic.
 */
import type { AdBrief, CampaignChannel, CampaignKit, ShortLinkUtm } from "@/lib/db/schema";
import type { CompileKitInput, Loc } from "./compile";

export type { AdBrief, CampaignChannel, CampaignKit, CompileKitInput, Loc, ShortLinkUtm };

export const KIT_LOCALES = ["ar", "fr", "en"] as const satisfies readonly Loc[];
export const isKitLocale = (v: unknown): v is Loc => v === "ar" || v === "fr" || v === "en";

export const CAMPAIGN_STATUSES = ["draft", "live", "paused", "ended"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** LAN-§13.1: Meta, TikTok, Snap, WhatsApp broadcast, Instagram organic, print. */
export const KIT_CHANNELS = ["meta", "tiktok", "snap", "whatsapp", "instagram", "print"] as const satisfies readonly CampaignChannel[];
export type KitChannel = (typeof KIT_CHANNELS)[number];
export const isKitChannel = (v: unknown): v is KitChannel => typeof v === "string" && (KIT_CHANNELS as readonly string[]).includes(v);

/** utm_source / utm_medium per kit channel (the links screen's presets; Instagram here is the organic post). */
export const KIT_CHANNEL_UTM: Readonly<Record<KitChannel, { source: string; medium: string }>> = {
  meta: { source: "facebook", medium: "paid_social" },
  tiktok: { source: "tiktok", medium: "paid_social" },
  snap: { source: "snapchat", medium: "paid_social" },
  whatsapp: { source: "whatsapp", medium: "broadcast" },
  instagram: { source: "instagram", medium: "organic" },
  print: { source: "print", medium: "offline" },
};

/** The kit's links: one per channel, every link tagged with the campaign's slug. */
export const kitLinkUtm = (channel: KitChannel, slug: string): ShortLinkUtm => ({ ...KIT_CHANNEL_UTM[channel], campaign: slug });

export const CAMPAIGN_NAME_MAX = 120;
export const SLUG_MAX = 40;
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/** A campaign name → its `utm_campaign` value: Latin letters folded, [a-z0-9-], ≤ 40; "" when nothing is left. */
export function slugOf(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}

/** Where an event of the pixel plan fires (`pixelPlan.events[].where`); the screens word it per locale. */
export const PIXEL_WHERE = ["page_load", "offer_pick", "form_start", "phone_valid", "thank_you", "server_confirmed", "server_delivered"] as const;
export type PixelWhere = (typeof PIXEL_WHERE)[number];

/** `brief.doNotSay` codes (LAN-§13.3): every claim the store did not make. */
export const DO_NOT_SAY = ["medical", "free_delivery", "ratings", "deadline", "returns", "inspection", "numbers", "stock"] as const;
export type DoNotSay = (typeof DO_NOT_SAY)[number];

/** `brief.compliance` codes: the ad rules every angle follows (ai.md AI-§D.3 ad rules). */
export const COMPLIANCE = ["cod", "no_before_after", "no_body_question", "no_guarantee"] as const;
export type Compliance = (typeof COMPLIANCE)[number];

/** The campaign row as the screens read it (the kit without the store's secrets: there are none in a kit). */
export interface CampaignRow {
  id: string;
  name: string;
  slug: string;
  status: CampaignStatus;
  pageId: string;
  pageTitle: string | null;
  pageSlug: string | null;
  /** the page is published right now */
  pageLive: boolean;
  channels: CampaignChannel[];
  kitSource: "library" | "cloud";
  stale: boolean;
  shared: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One line of the results strip (LAN-§13.4): a link (by channel) or an angle (by utm_content). */
export interface ResultLine {
  key: string;
  clicks: number | null;
  orders: number;
  confirmed: number;
  delivered: number;
  /** confirmed / orders and delivered / orders, null below n = 20 orders */
  confirmRate: number | null;
  deliveryRate: number | null;
}

export interface CampaignResults {
  days: 28;
  links: (ResultLine & { channel: CampaignChannel; shortLinkId: string })[];
  angles: ResultLine[];
  total: ResultLine;
}

/** rates show from this many orders (LAN-§13.4) */
export const RATE_MIN_N = 20;

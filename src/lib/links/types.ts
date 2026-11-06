/**
 * Short links (P3 LANDING; landing.md LAN-§2.1, §12, LD14, LD40; docs/STORE-SAAS.md §D.5 `short_links`): the shapes
 * shared by the service, the `/go/<code>` route, the read model and the links screen. Isomorphic.
 *
 * A link points at a typed reference inside its store (rev 3, SEC-6), never at a stored URL or path: a published page
 * of the store, the store home or one of its policy pages; R2 adds a product and a collection (reserved here so the
 * union, the column and the resolver stay one list).
 */
import type { LegalKind } from "@/landing/context";
import type { CampaignChannel, SHORT_LINK_CHANNELS as DB_CHANNELS, ShortLinkUtm } from "@/lib/db/schema";

export type { CampaignChannel, ShortLinkUtm };

/** `short_links.channel` (schema.ts `SHORT_LINK_CHANNELS`), repeated so the screen's bundle never loads the schema. */
export const SHORT_LINK_CHANNELS = ["meta", "tiktok", "snap", "google", "whatsapp", "instagram", "organic", "print", "other"] as const satisfies typeof DB_CHANNELS;

/** The policy kinds a link may open: the store's served legal pages (`/policies/<kind>`, landing/context `LEGAL_KINDS`). */
export const POLICY_KINDS = ["privacy", "terms", "shipping", "contact"] as const satisfies readonly LegalKind[];
export type PolicyKind = (typeof POLICY_KINDS)[number];
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
/** compile-time: the two lists stay the lists they repeat */
export const LISTS_IN_SYNC: [Same<PolicyKind, LegalKind>, Same<CampaignChannel, (typeof SHORT_LINK_CHANNELS)[number]>] = [true, true];
export const isPolicyKind = (v: unknown): v is PolicyKind => typeof v === "string" && (POLICY_KINDS as readonly string[]).includes(v);

/** What a link opens (the create sheet's picker; R2 adds `product` and `collection`). */
export type LinkTarget = { kind: "page"; pageId: string } | { kind: "home" } | { kind: "policy"; policy: PolicyKind };
/** Reserved for R2: the kinds the column already lists. */
export type R2LinkTarget = { kind: "product"; id: string } | { kind: "collection"; id: string };

export type ShortLinkStatus = "active" | "paused";

/** The UTM keys in their fixed order (presets are appended in this order, LAN-§12.1). */
export const UTM_KEYS = ["source", "medium", "campaign", "content", "term"] as const;
export type UtmKey = (typeof UTM_KEYS)[number];
/** The order contract's maximum length of one UTM value (src/lib/orders/contract.ts `Utm`). */
export const UTM_MAX = 120;

/**
 * The channel presets of the create sheet (LAN-§12.2): `utm_source` / `utm_medium` the channel fills. The values are
 * the conventional ones each ad platform's reports group by; the owner may change both before saving.
 */
export const CHANNEL_PRESETS: Readonly<Record<CampaignChannel, { source: string; medium: string }>> = {
  meta: { source: "facebook", medium: "paid_social" },
  instagram: { source: "instagram", medium: "paid_social" },
  tiktok: { source: "tiktok", medium: "paid_social" },
  snap: { source: "snapchat", medium: "paid_social" },
  google: { source: "google", medium: "cpc" },
  whatsapp: { source: "whatsapp", medium: "messaging" },
  organic: { source: "social", medium: "organic" },
  print: { source: "print", medium: "offline" },
  other: { source: "other", medium: "referral" },
};

/** One row of the links screen (read.ts): the reference resolved to a label, the counters as stored. */
export interface ShortLinkRow {
  id: string;
  code: string;
  target: LinkTarget | R2LinkTarget;
  /** the page's title for a page target (null for the home and policy kinds, which the screen labels itself) */
  targetTitle: string | null;
  /** false: the target no longer resolves (unpublished or archived page): the link answers 404 until edited */
  targetLive: boolean;
  channel: CampaignChannel | null;
  utm: ShortLinkUtm;
  status: ShortLinkStatus;
  clicks: number;
  lastClickAt: string | null;
  campaignId: string | null;
  createdAt: string;
  /** the public address `storeUrl(store, "/go/<code>")` */
  url: string;
}

/**
 * The Campaign Kit compiler (P3 LANDING, wave 2; landing.md LAN-§13.2, §13.3, SF-01; docs/STORE-SAAS.md §K.2 P0). Pure
 * over its inputs, < 300 ms: every number in the kit is a price, an offer, the page fee or an ETA range from the inputs
 * (the brief passes the same `allowedNumbers` guard as AI output); three angles with three different structure tags
 * present on the page; `doNotSay` lists every claim the store did not make. The Cloud brief (`ad.brief`, P7) never
 * blocks the kit. Typed stub frozen at P0; the kit shapes are the `campaigns.kit` column's (src/lib/db/schema.ts).
 */
import type { AdBrief, CampaignChannel, CampaignKit, ShortLinkUtm } from "@/lib/db/schema";
import type { ScriptDoc } from "@/lib/callcenter/script";
import type { DeliveryZoneRow } from "@/lib/delivery/types";
import type { PageDoc } from "@/lib/page/schema";
import type { PixelLibraryView } from "@/lib/pixels/library";
import type { StorePolicyFacts } from "@/lib/settings/keys/policies";
import type { StoreRow } from "@/lib/tenancy/types";

export type { AdBrief, CampaignChannel, CampaignKit, ShortLinkUtm } from "@/lib/db/schema";

export type Loc = "ar" | "fr" | "en";

export interface CompileKitInput {
  doc: PageDoc;
  version: { id: string; publishedAt: string };
  store: StoreRow;
  locales: Loc[];
  policies: StorePolicyFacts;
  zones: DeliveryZoneRow[];
  pixels: PixelLibraryView;
  trigger: "order" | "confirmed" | "delivered";
  templates: { confirm: Record<Loc, string>; script: ScriptDoc };
  channels: CampaignChannel[];
  slug: string;
  links: { channel: CampaignChannel; url: string; utm: ShortLinkUtm; shortLinkId: string }[];
  cloud?: { brief: AdBrief | null };
}

export interface CompileKitResult {
  kit: CampaignKit;
  /** the pricing fingerprint of the compiled version (LAN-§18.4); a later publish that moves it marks the kit stale */
  offersHash: string;
  problems: { code: "no_structure_tags" | "no_locale" | "pixel_missing"; detail?: string }[];
}

export function compileKit(input: CompileKitInput): CompileKitResult {
  void input;
  throw new Error("not implemented: P3 compileKit");
}

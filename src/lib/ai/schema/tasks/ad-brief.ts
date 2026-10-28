/**
 * `ad.brief` (AI-20 R1 slice for SF-01; ai.md AI-§D.3; landing.md LAN-§13.2-13.3): the Campaign Kit's ad brief written
 * from the published page. Types only; guard v2 and `mergeAdBrief` (the template kept per rejected field) land in the
 * guard step. Built per page version, never per customer.
 */
import type { TaskProduct } from "./common";

type KitLocale = "ar" | "fr" | "en";
export const AD_PLATFORMS = ["meta", "tiktok", "snapchat"] as const;
export type AdPlatform = (typeof AD_PLATFORMS)[number];

export interface AdBriefInput {
  /** the published version the brief is written from */
  basedOnVersionId: string;
  locales: KitLocale[];
  product: TaskProduct;
  /** the page's sections with their DG-07 structure tags: an angle maps to one of them */
  sections: { id: string; tag: string; headline: string; lead: string }[];
}

export interface AdBriefAngle {
  /** the page section the angle is built on */
  sectionId: string;
  /** DG-07 structure tag of that section */
  tag: string;
  name: string;
  /** Darija in Arabic script, and French */
  hook: { ar: string; fr: string };
  /** shot lists */
  ugc15: string[];
  ugc30: string[];
  primary: Partial<Record<AdPlatform, string>>;
  headline: Partial<Record<AdPlatform, string>>;
}

export interface AdBriefOut {
  basedOnVersionId: string;
  /** 3 */
  angles: AdBriefAngle[];
  /** what to film */
  filmChecklist: string[];
}

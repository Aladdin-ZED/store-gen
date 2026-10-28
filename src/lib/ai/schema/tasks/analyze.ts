/**
 * `analyze` (AI-04, AI-21; ai.md AI-§A.3, AI-§D.2 rule 7, AI-§D.3): photo analysis and suggested facts. Types only;
 * the loose schema and `finalize` land with guard v2. The server sends ≤ 3 images ≤ 1,024 px and ≤ 400 KB each
 * (`platform_ai.vision`); `Analysis` keeps appearance only and every claim a vision model reads (material, origin,
 * certification, quantity) becomes an unticked suggested fact, never copy input (QUAL-18).
 */
import type { Analysis } from "../../copy-schema";
import type { CopyLocale } from "./common";
import type { ProductCategory } from "@/lib/page/schema";

export interface AnalyzeImage {
  mediaType: "image/webp" | "image/jpeg";
  /** base64, no data: prefix; downsized in the browser (≤ 1,024 px long side, quality 0.82) */
  data: string;
  w: number;
  h: number;
}

export interface AnalyzeInput {
  /** ≤ 3 */
  images: AnalyzeImage[];
  /** the locale of `photoQuality.advice` (the admin locale) */
  adminLocale: CopyLocale;
  /** what the owner already typed; the model never overrides the owner's category */
  product: { name: string | null; category: ProductCategory | null };
}

/** AI-21 vision QA; feeds design's slot choice and the Director's read */
export interface PhotoQuality {
  sharp: boolean;
  clutter: "none" | "some" | "heavy";
  fullBleedOk: boolean;
  cutoutViable: boolean;
  /** one plain line in the admin locale, or null */
  advice: string | null;
}

/** `Analysis & { suggestedFacts; photoQuality }` (AI-§A.3); suggestedFacts ≤ 5 × 80 chars, shown unticked */
export type AnalysisOut = Analysis & { suggestedFacts: string[]; photoQuality: PhotoQuality };

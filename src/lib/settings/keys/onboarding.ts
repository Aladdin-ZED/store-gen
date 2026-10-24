/**
 * Store setting `onboarding` (docs/STORE-SAAS.md §D.10, platform.md PLA-§2.4, PLA-§Q.7; owner: platform, P2): the
 * wizard's step and resumable draft, so a closed tab resumes on the same step with the same inputs (PLA-§22.2).
 */
import { z } from "zod";
import { isoDateTime } from "../fields";

export const OnboardingSchema = z.object({
  v: z.literal(1).default(1),
  step: z.enum(["photos", "details", "reveal", "contact", "done", "skipped"]).default("photos"),
  startedAt: isoDateTime.nullable().default(null),
  /** first reveal painted (client-reported, clamped to server time) */
  revealedAt: isoDateTime.nullable().default(null),
  /** signup click → reveal */
  revealMs: z.number().int().min(0).max(3_600_000).nullable().default(null),
  /** the draft created from the chosen direction (landing / both) */
  pageId: z.string().length(26).nullable().default(null),
  /** rev 3 (PD60, OPS-14): what the reveal produced; "product" in store mode (R2) */
  firstKind: z.enum(["landing", "product"]).default("landing"),
  /** rev 3: the first product created in store mode (R2) */
  productId: z.string().length(26).nullable().default(null),
  completedAt: isoDateTime.nullable().default(null),
  dismissedChecklist: z.boolean().default(false),
  draft: z
    .object({
      category: z.string().max(40).nullable().default(null),
      productName: z.string().trim().max(120).nullable().default(null),
      /** typed by the owner, never suggested; minor units */
      priceMinor: z.number().int().min(0).max(100_000_000).nullable().default(null),
      compareAtMinor: z.number().int().min(0).max(100_000_000).nullable().default(null),
      fact: z.string().trim().max(160).nullable().default(null),
      assetIds: z.array(z.string().max(64)).max(5).default([]),
    })
    .prefault({}),
});
export type OnboardingSetting = z.output<typeof OnboardingSchema>;

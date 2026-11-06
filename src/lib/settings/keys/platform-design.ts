/**
 * Platform setting `platform_design` (docs/STORE-SAAS.md §D.10, design.md DES-§2.7, request DES-R8; owner: design,
 * P6): the publish-gate thresholds and the incident switch. The `thresholds` floors are the R-D36 numbers; the
 * console can only raise them. The effective gate mode is the weaker of the flag `design_publish_gates` and
 * `gatesAtPublish` (warn < block; `designGateMode` in src/lib/render/prepublish/design.ts), warn by default, and
 * `warn` never applies to honesty items (§M.1 rule 3).
 */
import { z } from "zod";

export const PlatformDesign = z.object({
  /** warn = verdicts shown, never blocking; off = kill switch for the check */
  novelty: z.enum(["on", "warn", "off"]).default("on"),
  /** overrides calibration.json; never below the R-D36 floors */
  thresholds: z
    .object({
      platform: z.number().min(0.25).max(0.6).optional(),
      /** the base of the pool-size schedule (DES-§7.9) */
      niche: z.number().min(0.4).max(0.8).optional(),
      ownPage: z.number().min(0.3).max(0.7).optional(),
      brandRadius: z.number().min(0.2).max(0.35).optional(),
      clone: z.number().min(0.12).max(0.25).optional(),
    })
    .default({}),
  slop: z.object({ fail: z.number().int().min(4).max(10).default(6), repair: z.number().int().min(2).max(5).default(3) }).prefault({}),
  /**
   * "warn" lets hard design and budget items publish as audited notes (page.publish.design_override / budget_override);
   * "block" refuses them. Default "warn" since the first live deploy (R1 integration): pages made before the P6 height
   * model trip C2 / C3 / F1 and could not be republished. The console (General settings, "Design gates at publish")
   * switches it to "block". Honesty items never warn.
   */
  gatesAtPublish: z.enum(["block", "warn"]).default("warn"),
  calibrationVersion: z.string().max(20).nullable().default(null),
});
export type PlatformDesignSetting = z.output<typeof PlatformDesign>;

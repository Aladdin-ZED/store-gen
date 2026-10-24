/**
 * Platform setting `platform` (docs/STORE-SAAS.md §D.10, platform.md PLA-§2.4; owner: platform, P1 from P0). Written
 * by C0a with exactly the PLA-§2.4 paths T1/T2 read in R1.0 (`brand.name`, `signup.mode`, `signup.allowedMarkets`,
 * the `signup.pending*` sandbox ceilings, `newStore.*`, `allowSellerBrandOrange`, `reservedHandles`, `analytics.k`;
 * PLA Q.28), so P1 widens it without renames or a data migration.
 */
import { z } from "zod";
import { isoDateTime } from "../fields";

const E164 = /^\+[1-9]\d{6,14}$/;
const Locale3 = z.enum(["ar", "fr", "en"]);

export const PlatformSettingSchema = z.object({
  v: z.literal(1).default(1),
  brand: z
    .object({
      /** TOTP issuer, titles, manifest, mails (R2) */
      name: z.string().trim().min(2).max(40).default("Store Gen"),
      /** Help sheet, rejected / suspended pages */
      supportWhatsapp: z.string().regex(E164).nullable().default(null),
      /** owner-typed, shown as typed */
      supportHours: z.string().trim().max(80).nullable().default(null),
      /** R2 */
      mailFromName: z.string().trim().max(60).nullable().default(null),
    })
    .prefault({}),
  signup: z
    .object({
      /** null = derived (D9): invite while S mode or the platform Turnstile is off, else approval */
      mode: z.enum(["closed", "invite", "approval", "waitlist", "open"]).nullable().default(null),
      thresholds: z
        .object({
          fastLaneMax: z.number().int().min(0).max(100).default(24),
          holdMin: z.number().int().min(1).max(100).default(60),
          rejectCandidateMin: z.number().int().min(1).max(100).default(85),
        })
        .refine((t) => t.fastLaneMax < t.holdMin && t.holdMin < t.rejectCandidateMin, "thresholds_order")
        .prefault({}),
      /** per SignupFlagCode overrides of PLA-§3.4 */
      weights: z.record(z.string(), z.number().int().min(-50).max(100)).default({}),
      /** read by applyStateCap: the media cap after "Submit for review" (PLA Q.8) */
      pendingMediaMiB: z.number().int().min(10).max(1024).default(100),
      /** rev 3 (D69): the cap until the review row has submitted_at */
      pendingMediaMiBBeforeSubmit: z.number().int().min(5).max(200).default(20),
      /** rev 3 (D69): one disk budget shared by every pending store (platform_usage "pending_media_bytes") */
      pendingMediaTotalMiB: z.number().int().min(500).max(50_000).default(5_000),
      /** rev 3 (D69): sandboxes created per platform day; the next applicant joins the waitlist for that day */
      pendingStoresPerDay: z.number().int().min(1).max(1_000).default(50),
      pendingMembersMax: z.number().int().min(1).max(10).default(2),
      allowedMarkets: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1).default(["MA"]),
      /** PD31 */
      trustedCreatorAutoApprove: z.boolean().default(true),
      /** the review target shown to sellers only when set */
      slaHours: z.number().int().min(1).max(168).nullable().default(null),
    })
    .prefault({}),
  newStore: z
    .object({
      market: z.string().default("MA"),
      currency: z.string().length(3).default("MAD"),
      timezone: z.string().default("Africa/Casablanca"),
      defaultLocale: Locale3.default("ar"),
      locales: z.array(Locale3).min(1).default(["ar", "fr"]),
    })
    .prefault({}),
  /** D37; changing it needs a typed confirmation (PLA-§13.1) */
  allowSellerBrandOrange: z.boolean().default(false),
  /** extra to RESERVED_HANDLES */
  reservedHandles: z
    .array(z.string().regex(/^[a-z0-9-]{1,30}$/))
    .max(500)
    .default([]),
  analytics: z.object({ k: z.number().int().min(5).max(50).default(5) }).prefault({}),
  legal: z.object({ requireAcceptance: z.boolean().default(true) }).prefault({}),
  /** rev 2 (PD67): tunables of the shared health engine */
  health: z
    .object({
      issueNotifyMinSeverity: z.union([z.literal(2), z.literal(3)]).default(3),
      /** fixed in R1 (§I.7 "snooze 7 days") */
      snoozeDays: z.literal(7).default(7),
      staleAlarmMinutes: z.number().int().min(15).max(240).default(60),
      /** 0 = always; > 0 hides the number (not the issues) until the store has that many orders */
      showScoreToTenantsBelowN: z.number().int().min(0).max(100).default(0),
    })
    .prefault({}),
  /** rev 2 (PD54) */
  lifecycle: z
    .object({
      /** client-side cancel window before a lifecycle write */
      armSeconds: z.number().int().min(3).max(15).default(5),
      /** a second change on the same store inside this window needs the typed handle */
      cooldownMinutes: z.number().int().min(0).max(120).default(10),
    })
    .prefault({}),
  /** PLA-§16.3 checklist state (booleans and dates, never values) */
  domainMove: z
    .object({
      steps: z.record(z.string(), z.object({ doneAt: isoDateTime, by: z.string().length(26) })).default({}),
      checks: z.record(z.string(), z.object({ passedAt: isoDateTime, by: z.string().length(26), note: z.string().max(200).default("") })).default({}),
    })
    .prefault({}),
  backup: z
    .object({ lastDownloadAt: isoDateTime.nullable().default(null), remindAfterDays: z.number().int().min(1).max(60).default(7) })
    .prefault({}),
});
export type PlatformSetting = z.output<typeof PlatformSettingSchema>;

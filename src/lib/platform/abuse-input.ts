/**
 * The "Report this store" input, pure (platform.md PLA-§24.2, PLA-§L; PD70): what `recordAbuseReport`
 * (src/lib/platform/abuse-report.ts) parses before anything else, kept apart so `test:platform` runs it without a
 * database.
 *
 * - `reason`: one of the six codes;
 * - `details`: plain text (control characters other than line breaks and tabs removed), at most 2,000 characters,
 *   empty = null; longer is refused (ZodError → `invalid`);
 * - `contact`: an e-mail or a phone as typed, at most 120 characters, empty = null;
 * - `pagePath` (`?p=` of the report link): kept only as a path on the store's own host (one leading "/", no scheme,
 *   no backslash, no control or space character), without its query or fragment, at most 300 characters; anything
 *   else, an absolute or protocol-relative URL included, is dropped (null), never refused, since the form prefills it;
 * - `handle`: trimmed and lower-cased (the lookup decides; a malformed handle is discarded like an unknown one).
 */
import { z } from "zod";
import type { abuseReports } from "@/lib/db/schema";

export type AbuseReason = (typeof abuseReports.$inferInsert)["reason"];

export const ABUSE_REASONS = ["phishing", "scam", "counterfeit", "prohibited", "impersonation", "other"] as const satisfies readonly AbuseReason[];

/** PLA-§L / core §E.8 */
export const REPORT_LIMITS = {
  detailsMax: 2_000,
  contactMax: 120,
  pathMax: 300,
  ipPerHour: 5,
  storePerDay: 20,
  /** `abuse_reports_spike` (PLA-§15.2): reports platform-wide in the hour's window, or on one store in 24 hours */
  spikePlatformPerHour: 5,
  spikeStorePer24h: 3,
} as const;

/** Plain text: control characters other than line breaks and tabs removed, line endings normalised. */
const plain = (s: string) => s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");

/** The page path as stored, or null (see the header). */
export function sameHostPath(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim().split(/[?#]/, 1)[0]!;
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\u0000- \u007f]/.test(path)) return null;
  if (path.length > REPORT_LIMITS.pathMax) return null;
  return path;
}

const optionalText = (max: number) =>
  z
    .string()
    .max(max, { message: "too_long" })
    .nullable()
    .optional()
    .transform((s) => {
      const t = s == null ? "" : plain(s).trim();
      return t ? t : null;
    });

export const AbuseReportSchema = z.object({
  handle: z
    .string()
    .max(64)
    .transform((s) => s.trim().toLowerCase()),
  reason: z.enum(ABUSE_REASONS),
  details: optionalText(REPORT_LIMITS.detailsMax),
  pagePath: z
    .string()
    .max(2_000)
    .nullable()
    .optional()
    .transform((s) => sameHostPath(s)),
  contact: optionalText(REPORT_LIMITS.contactMax),
  ip: z.string().max(64).nullable().optional(),
});
export type ParsedAbuseReport = z.output<typeof AbuseReportSchema>;

/** Parses a report; throws the ZodError for a reason outside the enum or a text over its cap. */
export function parseAbuseReport(input: unknown): ParsedAbuseReport {
  return AbuseReportSchema.parse(input);
}

/**
 * Platform setting `platform_mail` (docs/STORE-SAAS.md §D.10; platform.md PLA-§13.5, IN-08; level P, **secret**; R2):
 * the SMTP transport of transactional mail. S5 INTEGRATIONS 2 owns this file in R2; the R2 contract step (C2-E)
 * registered the key with this shape and S5 refines the validation without changing it. `perMinute` / `perHour` are
 * the caps the outbox's `mailGate` reads (defaults 4 and 150, the R1 constants; clamped 1-30 and 1-2,000 there).
 */
import { z } from "zod";

export const PlatformMailSetting = z.object({
  host: z.string().max(253).nullable().default(null),
  port: z.number().int().min(1).max(65_535).default(587),
  security: z.enum(["tls", "starttls"]).default("starttls"),
  user: z.string().max(254).nullable().default(null),
  password: z.string().max(512).nullable().default(null),
  fromAddress: z.email().max(254).nullable().default(null),
  fromName: z.string().max(80).nullable().default(null),
  perMinute: z.number().int().min(1).max(30).default(4),
  perHour: z.number().int().min(1).max(2_000).default(150),
});
export type PlatformMailSetting = z.output<typeof PlatformMailSetting>;

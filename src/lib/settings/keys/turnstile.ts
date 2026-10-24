/**
 * Cloudflare Turnstile widget keys (docs/STORE-SAAS.md §D.10; secret; owner: core). One shape for two keys:
 * the store override `turnstile` (needed for custom domains, R3) and the platform widget `platform_turnstile`
 * (the apex hostname covers every store subdomain, IN-06), whose defaults are env TURNSTILE_* (SET-09). A store
 * without its own keys uses the platform's; tenants never see "from server env".
 */
import { z } from "zod";
import { optional, secretToken } from "../fields";

export const TurnstileSetting = z.object({
  siteKey: optional(z.string().trim().regex(/^[A-Za-z0-9_-]{10,100}$/)),
  secretKey: optional(secretToken),
});
export type TurnstileSetting = z.output<typeof TurnstileSetting>;

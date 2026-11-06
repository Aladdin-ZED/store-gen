/**
 * GET /app/manifest.webmanifest: the installable dashboard's manifest (P2 SHELL; platform.md PLA-§23.1, §M.2, PD10;
 * design.md DES-§16.14, UX-07; docs/STORE-SAAS.md §F.6). Public and the same for everyone but its language: no session
 * (the proxy passes it without cookies or nonce headers), no Set-Cookie, `application/manifest+json`,
 * `public, max-age=3600`, `Vary: Accept-Language` (the visitor's language picks `lang` and `dir`). Linked by the `/app`
 * layout's `metadata.manifest`. The body is `appManifest()` (src/lib/admin-theme/app-icon.ts); no service worker in R1.
 */
import { appManifest } from "@/lib/admin-theme/app-icon";
import { publicLocale } from "@/lib/auth/locale";
import { brandName } from "@/lib/auth/platform-config";
import { baseSecurityHeaders } from "@/lib/security/headers";

export async function GET(): Promise<Response> {
  const [name, locale] = await Promise.all([brandName(), publicLocale()]);
  const headers = new Headers(baseSecurityHeaders({ frame: "deny" }));
  headers.set("Content-Type", "application/manifest+json; charset=utf-8");
  headers.set("Cache-Control", "public, max-age=3600");
  headers.set("Vary", "Accept-Language");
  return new Response(JSON.stringify(appManifest({ name, locale })), { status: 200, headers });
}

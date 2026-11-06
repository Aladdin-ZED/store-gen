/**
 * The console's relative URLs for screens and client components (TENANCY-MAP ADM-37, tenancy lint L8): every console
 * link and pathname test in src/components/console/** goes through `consoleUrl()`, never an `/admin` literal, so the
 * base lives in one place. It is the client-safe, relative form of `consoleHref()` (src/lib/urls, server-only): on
 * ADMIN_HOST the console is served at the same `/admin…` paths (PD82), so the relative form is right on either host.
 * No imports: client components import it.
 *
 *   consoleUrl()                        → "/admin"
 *   consoleUrl(`/stores/${id}/team`)    → "/admin/stores/<id>/team"
 *   consoleUrl("/stores?q=")            → "/admin/stores?q="
 */
type ConsoleRest = `/${string}` | `?${string}` | `#${string}`;

export function consoleUrl(): "/admin";
export function consoleUrl<P extends ConsoleRest>(path: P): `/admin${P}`;
export function consoleUrl(path: string = ""): string {
  return `/admin${path}`;
}

/**
 * The staff entry of the tenant shell (P1 CONSOLE, platform.md PD36): exactly one item, "Platform console"
 * (`href: () => consoleHref("/")`), which the store switcher shows to staff only. Not a sidebar contribution: the
 * registry exports it as `STAFF_NAV`, outside `NAV_CONTRIBUTIONS` (P0 review G8); the console's own navigation lives in
 * `src/components/console/nav.ts`. Extension file (docs/STORE-SAAS.md §I.3, §K.3), created empty at P0 and imported by
 * ./index.ts; labels are message keys of the track's own i18n file (D67). `consoleHref` reads ADMIN_HOST on the
 * server, so the switcher calls `href()` server-side and passes the string down (src/lib/urls/index.ts).
 */
import { consoleHref } from "@/lib/urls";
import type { StaffNavItem } from "./types";

export const nav: StaffNavItem[] = [{ id: "platform-console", label: "console.nav.platform_console", href: () => consoleHref("/"), icon: "ShieldCheck" }];

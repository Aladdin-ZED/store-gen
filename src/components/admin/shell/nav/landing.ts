/**
 * Navigation items of the landing track (P3 LANDING, landing.md LAN-§24.1, §10.3, §7.3, §8.4, §3.3).
 * Extension file (docs/STORE-SAAS.md §I.3, §K.3), created empty at P0 and imported by ./index.ts; labels are
 * message keys of the track's own i18n file (D67).
 *
 * Leads sits in Sell with the pulse's `leadsDue` count. The three settings screens are contributed to the `settings`
 * group, which P2's settings sub-navigation derives its tabs from (they also list under Settings in the sidebar until
 * then). Pages and Generate are T4's items (./t4.ts) and are not repeated here; Short links (LAN-§12.2, wave 2)
 * follows them in the Landing pages group (`pages.read`, landing mode), then Campaigns (LAN-§13.4, wave 2).
 */
import { appHref } from "@/lib/urls";
import type { NavContribution } from "./types";

export const nav: NavContribution[] = [
  {
    group: "sell",
    order: 20,
    item: { id: "leads", label: "landing.nav.leads", href: (h) => appHref(h, "/leads"), icon: "Inbox", permission: "leads.read", mode: "landing", badge: { countKey: "leadsDue", tone: "warn" } },
  },
  { group: "landing", order: 30, item: { id: "links", label: "landing.nav.links", href: (h) => appHref(h, "/links"), icon: "Link2", permission: "pages.read", mode: "landing" } },
  { group: "landing", order: 31, item: { id: "campaigns", label: "landing.nav.campaigns", href: (h) => appHref(h, "/campaigns"), icon: "Megaphone", permission: "pages.read", mode: "landing" } },
  { group: "settings", order: 40, item: { id: "settings-delivery", label: "landing.nav.delivery", href: (h) => appHref(h, "/settings/delivery"), icon: "Truck", permission: "settings.read" } },
  { group: "settings", order: 41, item: { id: "settings-checkout", label: "landing.nav.afterOrder", href: (h) => appHref(h, "/settings/checkout"), icon: "PhoneCall", permission: "settings.read" } },
  { group: "settings", order: 42, item: { id: "settings-policies", label: "landing.nav.policies", href: (h) => appHref(h, "/settings/policies"), icon: "ScrollText", permission: "settings.read" } },
];

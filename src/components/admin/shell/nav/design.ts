/**
 * Navigation items of the design track (P6 DESIGN, design.md DES-§12.1; docs/STORE-SAAS.md §I.3).
 * Extension file (§K.3), imported by ./index.ts; labels are message keys of the track's own i18n file (D67).
 * Brand sits under Settings in every store mode: viewing needs `pages.read`, the page's writes need `brand.write`.
 * Generate under Landing pages is T4's item (./t4.ts: `pages.write`, landing mode); the `ai.use` half of its rule is
 * CCR r1-p6-14 (a nav item carries one permission).
 */
import { appHref } from "@/lib/urls";
import type { NavContribution } from "./types";

export const nav: NavContribution[] = [
  { group: "settings", order: 30, item: { id: "brand", label: "design.nav.brand", href: (h) => appHref(h, "/brand"), icon: "Palette", permission: "pages.read", release: "R1" } },
];

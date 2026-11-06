/**
 * Navigation items of the ai track (P7 AI, ai.md).
 * Extension file (docs/STORE-SAAS.md §I.3, §K.3), created empty at P0 and imported by ./index.ts; labels are
 * message keys of the track's own i18n file (D67).
 * Step 12: Settings → AI (AI-§K.1), readable with `settings.read`; its writes need `ai.manage`.
 */
import { appHref } from "@/lib/urls";
import type { NavContribution } from "./types";

export const nav: NavContribution[] = [
  {
    group: "settings",
    order: 30,
    item: { id: "settings-ai", label: "ai.nav.settings", href: (handle) => appHref(handle, "/settings/ai"), icon: "Cpu", permission: "settings.read", release: "R1" },
  },
];

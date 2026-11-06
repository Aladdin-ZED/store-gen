/**
 * Navigation items of the integrations track (P5 INTEGRATIONS, operations.md OPE-§M.1; core §I.3).
 * Extension file (docs/STORE-SAAS.md §I.3, §K.3), created empty at P0 and imported by ./index.ts; labels are
 * message keys of the track's own i18n file (D67).
 *
 * The Connect group: the hub (`/integrations`: health, deliveries, replay) first, then Telegram and the WhatsApp
 * templates. Google Sheets (order 10) and Pixels (order 20) stay T4's items in ./t4.ts (P2's), so only new ids live
 * here (the registry does not dedupe ids). WhatsApp templates are `callcenter.configure` (a manager edits them too).
 */
import { appHref } from "@/lib/urls";
import type { NavContribution } from "./types";

export const nav: NavContribution[] = [
  { group: "connect", order: 5, item: { id: "integrations", label: "nav.integrations", href: (h) => appHref(h, "/integrations"), icon: "Cable", permission: "integrations.manage", release: "R1" } },
  { group: "connect", order: 30, item: { id: "telegram", label: "nav.telegram", href: (h) => appHref(h, "/integrations/telegram"), icon: "Send", permission: "integrations.manage", release: "R1" } },
  { group: "connect", order: 40, item: { id: "whatsapp", label: "nav.whatsapp", href: (h) => appHref(h, "/integrations/whatsapp"), icon: "MessageCircle", permission: "callcenter.configure", release: "R1" } },
];

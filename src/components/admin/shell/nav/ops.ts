/**
 * Navigation items of the ops track (P4 CALL CENTER, operations.md; core §I.3, UX-02).
 * Extension file (docs/STORE-SAAS.md §I.3, §K.3), created empty at P0 and imported by ./index.ts; labels are
 * message keys of the track's own i18n file (D67).
 *
 *   Sell    Queue (agents.self) · Call board (orders.assign) · Customers (customers.read)
 *   Team    Agents (members.read) · Call center (callcenter.configure)
 *   Money   Finance (finance.read; the `finance_lite` flag is read by the screen itself, the registry has no flag gate)
 *
 * Orders stays T4's item (`./t4.ts`, id "orders", order 10): a second "orders" here would draw it twice. The icons
 * other than T4's fall back to the shell's circle until the shell's icon map lists them (CCR r1-p4-10).
 */
import { appHref } from "@/lib/urls";
import type { NavContribution } from "./types";

export const nav: NavContribution[] = [
  { group: "sell", order: 20, item: { id: "queue", label: "ops.nav.queue", href: (h) => appHref(h, "/queue"), icon: "Headset", permission: "agents.self", release: "R1" } },
  { group: "sell", order: 30, item: { id: "board", label: "ops.nav.board", href: (h) => appHref(h, "/queue/board"), icon: "Activity", permission: "orders.assign", release: "R1" } },
  { group: "sell", order: 40, item: { id: "customers", label: "ops.nav.customers", href: (h) => appHref(h, "/customers"), icon: "Contact", permission: "customers.read", release: "R1" } },
  { group: "team", order: 20, item: { id: "agents", label: "ops.nav.agents", href: (h) => appHref(h, "/team/agents"), icon: "UserCog", permission: "members.read", release: "R1" } },
  { group: "team", order: 30, item: { id: "callcenter", label: "ops.nav.callcenter", href: (h) => appHref(h, "/team/callcenter"), icon: "PhoneCall", permission: "callcenter.configure", release: "R1" } },
  { group: "money", order: 10, item: { id: "finance", label: "ops.nav.finance", href: (h) => appHref(h, "/finance"), icon: "Wallet", permission: "finance.read", release: "R1" } },
];

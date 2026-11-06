/**
 * ⌘K commands of the landing track (P3 LANDING, landing.md LAN-§23.9).
 * Extension file (docs/STORE-SAAS.md §I.3, §K.3; PLA Q.17), created empty at P0 and imported by ./index.ts.
 *
 * Wave 1: the jumps "Delivery zones", "Policies" and "After the order". The publish, test-order, campaign and short-link
 * commands come with their screens (wave 2).
 */
import { appHref } from "@/lib/urls";
import type { CommandDef } from "./types";

const jump = (id: string, label: string, path: `/${string}`): CommandDef => ({
  id: `landing.${id}`,
  label,
  group: "jump",
  permission: "settings.read",
  run: (ctx) => ctx.navigate(appHref(ctx.store.handle, path)),
});

export const commands: CommandDef[] = [
  jump("delivery", "landing.cmd.delivery", "/settings/delivery"),
  jump("policies", "landing.cmd.policies", "/settings/policies"),
  jump("after-order", "landing.cmd.afterOrder", "/settings/checkout"),
];

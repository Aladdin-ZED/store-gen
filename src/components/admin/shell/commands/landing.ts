/**
 * ⌘K commands of the landing track (P3 LANDING, landing.md LAN-§23.9).
 * Extension file (docs/STORE-SAAS.md §I.3, §K.3; PLA Q.17), created empty at P0 and imported by ./index.ts.
 *
 * Wave 1: the jumps "Leads" (chord `G L`), "Delivery zones", "Policies" and "After the order", and "Publish this
 * page" (`pages.publish`): inside the builder (`/app/<h>/pages/<id>/edit`) it asks the builder to open its publish
 * dialog through the `sg:command` window event (`{ id: "landing.publish", pageId }`, the builder's listener is P6's
 * mount, CCR r1-p3-12); anywhere else it opens the pages list on the drafts. The test-order, campaign and short-link
 * commands come with their screens (wave 2).
 */
import { appHref } from "@/lib/urls";
import type { CommandDef } from "./types";

const jump = (id: string, label: string, path: `/${string}`, extra: Partial<CommandDef> = {}): CommandDef => ({
  id: `landing.${id}`,
  label,
  group: "jump",
  permission: "settings.read",
  run: (ctx) => ctx.navigate(appHref(ctx.store.handle, path)),
  ...extra,
});

/** The page id of the builder on screen ("/app/<h>/pages/<id>/edit"), or null. */
export function builderPageId(pathname: string): string | null {
  const m = /\/pages\/([0-9A-HJKMNP-TV-Z]{26})\/edit(?:\/|$)/.exec(pathname);
  return m ? m[1]! : null;
}

export const commands: CommandDef[] = [
  jump("leads", "landing.cmd.leads", "/leads", { permission: "leads.read", mode: "landing", shortcut: "G L" }),
  jump("delivery", "landing.cmd.delivery", "/settings/delivery"),
  jump("policies", "landing.cmd.policies", "/settings/policies"),
  jump("after-order", "landing.cmd.afterOrder", "/settings/checkout"),
  {
    id: "landing.publish",
    label: "landing.cmd.publishPage",
    group: "run",
    permission: "pages.publish",
    mode: "landing",
    run: (ctx) => {
      const pageId = typeof window === "undefined" ? null : builderPageId(window.location.pathname);
      if (pageId) window.dispatchEvent(new CustomEvent("sg:command", { detail: { id: "landing.publish", pageId } }));
      else ctx.navigate(appHref(ctx.store.handle, "/pages?status=draft"));
    },
  },
];

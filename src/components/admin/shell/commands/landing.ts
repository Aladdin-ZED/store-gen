/**
 * ⌘K commands of the landing track (P3 LANDING, landing.md LAN-§23.9).
 * Extension file (docs/STORE-SAAS.md §I.3, §K.3; PLA Q.17), created empty at P0 and imported by ./index.ts.
 *
 * Wave 1: the jumps "Leads" (chord `G L`), "Delivery zones", "Policies" and "After the order", and "Publish this
 * page" (`pages.publish`): inside the builder (`/app/<h>/pages/<id>/edit`) it asks the builder to open its publish
 * dialog through the `sg:command` window event (`{ id: "landing.publish", pageId }`, the builder's listener is P6's
 * mount, CCR r1-p3-12); anywhere else it opens the pages list on the drafts.
 *
 * Wave 2: "Short links" (jump, `pages.read`), "New short link" (`campaigns.write`: the links screen with its create
 * sheet open, `?new=1`) and "Open a test order of this page" (`pages.publish`, LAN-§14.1): the builder's page when the
 * builder is on screen, else the store's home page (or its latest published page); the 2-hour link opens in a new tab,
 * and a refusal lands on the pages list. Distinct from P4's `ops.open_test_order` (the latest published landing).
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
  jump("links", "landing.cmd.links", "/links", { permission: "pages.read", mode: "landing" }),
  jump("new-link", "landing.cmd.newLink", "/links?new=1", { group: "create", permission: "campaigns.write", mode: "landing" }),
  {
    id: "landing.test_order",
    label: "landing.cmd.testOrder",
    group: "run",
    permission: "pages.publish",
    mode: "landing",
    run: async (ctx) => {
      const pageId = typeof window === "undefined" ? null : builderPageId(window.location.pathname);
      const tab = typeof window === "undefined" ? null : window.open("about:blank", "_blank");
      if (tab) tab.opener = null;
      // loaded on run: the registry is imported outside the server bundle too (P2's test:shell)
      const { mintTestLinkAction } = await import("@/app/app/[store]/pages/actions");
      const res = await mintTestLinkAction(pageId).catch(() => null);
      if (res?.ok && tab) tab.location.href = res.data.url;
      else {
        tab?.close();
        ctx.navigate(appHref(ctx.store.handle, "/pages?status=published"));
      }
    },
  },
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

import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import "@/components/admin/styles/admin.css";
import { StepUpProvider } from "@/components/admin/shell/step-up";
import { StoreProvider } from "@/components/admin/shell/store-context";
import { StoreFrame } from "@/components/admin/shell/store-frame";
import { StoreHandleMeta } from "@/components/admin/shell/store-handle";
import { navCounts } from "@/lib/admin-data/dashboard";
import { storeClientInfo, switcherMemberships } from "@/lib/admin-data/shell";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { consoleHref } from "@/lib/urls";
import { searchAction } from "./actions";
import { memberCtx } from "./member-ctx";

type Props = { children: ReactNode; params: Promise<{ store: string }> };

/** The store's name in the tab title, after the seam (a refusal answers before any title: sign-in or the neutral 404, LND-24). */
export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { store: handle } = await params;
  const { name } = (await memberCtx(handle)).store;
  return {
    title: { template: `%s · ${name}`, default: name },
    robots: { index: false, follow: false, nocache: true },
    // same-origin (as the admin's): a no-referrer page sends `Origin: null` on form POSTs
    referrer: "same-origin",
  };
}

/*
 * /app/<handle>/…: one store's dashboard (docs/STORE-SAAS.md §I.1). The seam resolves the member (signed out → the
 * sign-in page; no store, no membership, a closed door → the neutral 404) and the shell gets the store's context:
 * grants, links, the switcher, the step-up sheet (§B.7). A layout never replaces the checks of its pages and actions
 * (AUTH-31): each page calls requireStoreMember with its own permission, each action storeAction, each route
 * storeGuard. The theme, tooltips and toasts come from `src/app/app/layout.tsx` (one set for all of /app).
 *
 * The store dashboard ships in English, left to right, until its catalogs exist (§I.5, D36: the French dashboard is
 * R2, the Arabic RTL one R3, UX-08), whatever the viewer's language: an `ar` viewer would otherwise get the English
 * shell mirrored under `dir="rtl"`. The translated screens inside it (the team page) set their own language.
 */
export default async function StoreLayout({ children, params }: Props) {
  const { store: handle } = await params;
  const ctx = await memberCtx(handle);
  const [jar, memberships, counts] = await Promise.all([
    cookies(),
    switcherMemberships(ctx.user.id),
    ctx.can("orders.read") ? navCounts(ctx.scope) : Promise.resolve(null),
  ]);
  const sidebarOpen = jar.get("sidebar_state")?.value !== "false";

  return (
    <AdminI18nProvider locale="en">
      <div lang="en" dir="ltr" className="contents">
        {/* the media, framing and upload clients call this store's /api/app/<handle>/… */}
        <StoreHandleMeta handle={ctx.store.handle} />
        <StoreProvider value={storeClientInfo(ctx)}>
          <StepUpProvider totp={ctx.user.totpEnabled}>
            <StoreFrame
              user={{ name: ctx.user.name, email: ctx.user.email, totpEnabled: ctx.user.totpEnabled }}
              counts={counts}
              memberships={memberships}
              consoleHref={ctx.user.platformRole !== "none" ? consoleHref() : null}
              sidebarOpen={sidebarOpen}
              search={searchAction}
            >
              {children}
            </StoreFrame>
          </StepUpProvider>
        </StoreProvider>
      </div>
    </AdminI18nProvider>
  );
}

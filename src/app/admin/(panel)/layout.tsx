import { cookies } from "next/headers";
import type { ReactNode } from "react";
import "@/components/admin/styles/admin.css";
import { AppSidebar } from "@/components/admin/shell/app-sidebar";
import { CommandPaletteProvider } from "@/components/admin/shell/command-palette";
import { AdminProviders } from "@/components/admin/shell/providers";
import { StoreHandleMeta } from "@/components/admin/shell/store-handle";
import { Topbar } from "@/components/admin/shell/topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { navCounts } from "@/lib/admin-data/dashboard";
import { legacyStoreCtx, legacyStoreHandle } from "@/lib/admin-data/legacy-store";
import { can, getCspNonce, requireUser } from "@/lib/auth";
import { AuthError } from "@/lib/auth/errors";
import { publicOrigin } from "@/lib/render/publish.server";
import { getSetting } from "@/lib/settings";
import { SeamError } from "@/lib/tenancy/seam";
import { searchAction } from "./actions";

/** Store #1's sidebar badges when the user is one of its members with orders.read (pages guard themselves). */
async function storeCounts() {
  try {
    const ctx = await legacyStoreCtx({ throwOnFail: true });
    return ctx.can("orders.read") ? await navCounts(ctx.scope) : null;
  } catch (err) {
    if (err instanceof AuthError || err instanceof SeamError) return null;
    throw err;
  }
}

/*
 * The studio shell: inset sidebar (role-aware), frosted top bar with ⌘K, theme and toasts.
 * Every page below still calls requireUser() itself (a layout does not guard its children).
 */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const [nonce, store, counts, jar, handle] = await Promise.all([
    getCspNonce(),
    getSetting("store"),
    storeCounts(),
    cookies(),
    legacyStoreHandle(),
  ]);
  const sidebarOpen = jar.get("sidebar_state")?.value !== "false";
  const origin = publicOrigin();

  return (
    <AdminProviders nonce={nonce}>
      {/* the media clients call store #1's /api/app/<handle>/media */}
      <StoreHandleMeta handle={handle} />
      <CommandPaletteProvider role={user.role} search={searchAction}>
        <SidebarProvider defaultOpen={sidebarOpen} className="bg-sidebar">
          <AppSidebar
            user={{ name: user.name, email: user.email, role: user.role, totpEnabled: user.totpEnabled }}
            storeName={store.storeName}
            counts={counts}
          />
          <SidebarInset className="min-w-0 md:peer-data-[variant=inset]:rounded-2xl md:peer-data-[variant=inset]:shadow-[0_0_0_1px_var(--sidebar-border),0_1px_2px_rgb(0_0_0/0.03),0_24px_48px_-32px_rgb(0_0_0/0.18)]">
            <Topbar storeUrl={can(user.role, "pages.read") ? (origin ?? "/") : null} />
            <div className="flex min-w-0 flex-1 flex-col">{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </CommandPaletteProvider>
    </AdminProviders>
  );
}

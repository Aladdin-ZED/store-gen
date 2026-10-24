import type { ReactNode } from "react";
import { AdminProviders } from "@/components/admin/shell/providers";
import { StoreHandleMeta } from "@/components/admin/shell/store-handle";
import { legacyStoreHandle } from "@/lib/admin-data/legacy-store";
import { getCspNonce, requireUser } from "@/lib/auth";

/*
 * Full-screen builder shell (no sidebar): theme, tooltips and toasts shared with the panel.
 * Every page below still calls requireUser() with its own permission.
 */
export default async function EditorLayout({ children }: { children: ReactNode }) {
  await requireUser({ permission: "pages.read" });
  const [nonce, handle] = await Promise.all([getCspNonce(), legacyStoreHandle()]);
  return (
    <AdminProviders nonce={nonce}>
      {/* the builder's uploads and pickers call store #1's /api/app/<handle>/media */}
      <StoreHandleMeta handle={handle} />
      {children}
    </AdminProviders>
  );
}

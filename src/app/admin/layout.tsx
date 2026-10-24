import type { Metadata } from "next";
import type { ReactNode } from "react";
import { assertAdminAccess } from "@/lib/auth";
import { brandName } from "@/lib/auth/platform-config";

/*
 * Root of every /admin route (docs/STORE-SAAS.md §I.2): it only re-checks the console gate in-process (the proxy
 * already did), so `/admin/setup` works before any staff account exists. This also makes every console route
 * dynamic, which the per-request CSP nonce requires. Pages and actions still check the platform role themselves
 * (`requirePlatform`, `platformAction`): a layout does not guard the segments below it.
 */
export async function generateMetadata(): Promise<Metadata> {
  const brand = await brandName();
  return {
    title: { template: `%s · ${brand} console`, default: `${brand} console` },
    robots: { index: false, follow: false, nocache: true },
    // same-origin (see adminSecurityHeaders): a no-referrer page sends `Origin: null` on form POSTs
    referrer: "same-origin",
  };
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await assertAdminAccess();
  return children;
}

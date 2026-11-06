import type { ReactNode } from "react";
import { Screen } from "@/components/admin/common/screen";
import { SettingsHeader, SettingsNav } from "@/components/admin/settings/settings-nav";

/**
 * The settings frame of the store (P2 SHELL; docs/STORE-SAAS.md §I.3; platform.md PLA-§22.10): the heading, the
 * sub-navigation of the registry's `settings` group (the member's tabs, any track's), then the tab. Each tab's page
 * checks its own permission.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <Screen>
      <SettingsHeader />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        <SettingsNav />
        <div className="grid min-w-0 grid-cols-1 content-start gap-5">{children}</div>
      </div>
    </Screen>
  );
}

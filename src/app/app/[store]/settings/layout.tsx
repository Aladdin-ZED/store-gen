import type { ReactNode } from "react";
import { PageHeader } from "@/components/admin/common/page-header";
import { Screen } from "@/components/admin/common/screen";
import { SettingsNav } from "@/components/admin/settings/settings-nav";

/** Settings frame of the store: heading + sub-navigation (the member's tabs); each tab checks its own permission. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <Screen>
      <PageHeader title="Settings" description="Your store's identity, market, anti-spam and history, in one place." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        <SettingsNav />
        <div className="grid min-w-0 grid-cols-1 content-start gap-5">{children}</div>
      </div>
    </Screen>
  );
}

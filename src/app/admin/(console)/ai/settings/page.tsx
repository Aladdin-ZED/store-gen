/** Console → AI, Settings (P7 AI; ai.md AI-§K.2 Settings): `ai.platform`; the key itself never reaches the page. */
import type { Metadata } from "next";
import { AiConsoleFrame } from "@/components/admin/ai/console/frame";
import { SettingsTab } from "@/components/admin/ai/console/settings";
import { c, Section } from "@/components/admin/ai/console/ui";
import { loadConsoleSettings } from "@/lib/ai/platform/console-read";
import { requirePlatform } from "@/lib/platform/seam";

export const metadata: Metadata = { title: "AI settings" };

export default async function AiSettingsPage() {
  await requirePlatform({ permission: "ai.platform" });
  return (
    <AiConsoleFrame tab="settings">
      <Section title={c("ai.console.tab.settings")} rows={10} load={() => loadConsoleSettings()} render={(d) => <SettingsTab d={d} />} />
    </AiConsoleFrame>
  );
}

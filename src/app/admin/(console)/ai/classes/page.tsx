/** Console → AI, Classes & routes (P7 AI; ai.md AI-§K.2, AI-§B.2, AI-§F.6): `ai.platform`. */
import type { Metadata } from "next";
import { ClassesTab } from "@/components/admin/ai/console/classes";
import { AiConsoleFrame } from "@/components/admin/ai/console/frame";
import { c, Section } from "@/components/admin/ai/console/ui";
import { loadClasses } from "@/lib/ai/platform/console-read";
import { requirePlatform } from "@/lib/platform/seam";

export const metadata: Metadata = { title: "AI classes" };

export default async function AiClassesPage() {
  await requirePlatform({ permission: "ai.platform" });
  return (
    <AiConsoleFrame tab="classes">
      <Section title={c("ai.console.tab.classes")} rows={10} load={() => loadClasses()} render={(d) => <ClassesTab d={d} />} />
    </AiConsoleFrame>
  );
}

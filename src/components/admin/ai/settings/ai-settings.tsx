"use client";
/**
 * Settings → AI (P7 AI; ai.md AI-§K.1, AI-§K.5; core §I.8): the sections top to bottom, Mode, Director, Credits,
 * On-device AI, Voice, Memory, Privacy, Recent AI activity, and the staff probe card when the page allows it.
 * `settingsStates` decides what each says (the same function test:ai snapshots). Read-only (a role without
 * `ai.manage`, a suspended or closed store, "View as store") disables every input; under "View as store" no AI
 * action renders at all (no add, delete, pin, remove, save or probe).
 */
import { CloudOffIcon, LockKeyholeIcon } from "lucide-react";
import { settingsStates, type AiSettingsView } from "@/lib/ai/settings/view";
import { useT } from "@/lib/i18n/admin/client";
import { Note } from "./controls";
import { ActivitySection, PrivacySection, ProbeCard } from "./section-activity";
import { DeviceSection } from "./section-device";
import { MemorySection } from "./section-memory";
import { VoiceSection } from "./section-voice";
import { CreditsSection, DirectorSection, ModeSection } from "./sections-cloud";

export function AiSettings({ view }: { view: AiSettingsView }) {
  const t = useT();
  const states = settingsStates(view);
  const locked = states.readOnly;
  const hideActions = view.readOnly === "impersonation";
  return (
    <div className="grid grid-cols-1 gap-5" data-ai-settings={view.readOnly ?? "writable"}>
      <header className="grid gap-1 px-1">
        <h2 className="text-[1.125rem] font-semibold tracking-[-0.015em]">{t("ai.settings.title")}</h2>
        <p className="text-sm text-pretty text-muted-foreground">{t("ai.settings.lede")}</p>
      </header>
      {view.readOnly && <Note icon={<LockKeyholeIcon />}>{t(`ai.settings.readonly.${view.readOnly}`)}</Note>}
      {states.cloudNotice && <Note icon={<CloudOffIcon />}>{t(states.cloudNotice)}</Note>}
      <ModeSection view={view} states={states} locked={locked} />
      <DirectorSection view={view} states={states} locked={locked} />
      <CreditsSection view={view} states={states} locked={locked} />
      <DeviceSection view={view} locked={locked} hideActions={hideActions} />
      <VoiceSection view={view} locked={locked} />
      <MemorySection view={view} locked={locked} hideActions={hideActions} />
      <PrivacySection />
      <ActivitySection view={view} />
      {view.staffProbe && <ProbeCard />}
    </div>
  );
}

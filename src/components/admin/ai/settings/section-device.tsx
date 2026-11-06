"use client";
/**
 * Settings → AI, On-device AI (P7 AI; ai.md AI-§K.1 3, AI-§E.7): the stored switches (`store_ai.localEnabled`,
 * `localTierCeiling`, `bgRemoval`) and what this browser holds (`cacheStats`), with "Remove downloaded models"
 * (an inline confirm; hidden while read-only). The device panel reads this browser only; nothing is sent.
 */
import { HardDriveIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "@/components/admin/settings/form-kit";
import { getAi } from "@/lib/ai/client";
import type { AiSettingsView } from "@/lib/ai/settings/view";
import { useT } from "@/lib/i18n/admin/client";
import { saveLocalAction } from "@/app/app/[store]/settings/ai/actions";
import { ChoiceGroup, Pending, SaveError, SwitchRow, useFormat, useSaved } from "./controls";

type Stored = { state: "checking" } | { state: "none" } | { state: "unsupported" } | { state: "bytes"; total: number };

export function DeviceSection({ view, locked, hideActions }: { view: AiSettingsView; locked: boolean; hideActions: boolean }) {
  const t = useT();
  const f = useFormat();
  const s = view.settings;
  const [enabled, setEnabled, eState] = useSaved(s.localEnabled, (v, key) => saveLocalAction({ key, localEnabled: v }));
  const [tier, setTier, tState] = useSaved(s.localTierCeiling, (v, key) => saveLocalAction({ key, localTierCeiling: v }));
  const [bg, setBg, bState] = useSaved(s.bgRemoval, (v, key) => saveLocalAction({ key, bgRemoval: v }));
  const [stored, setStored] = useState<Stored>({ state: "checking" });
  const [confirm, setConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let live = true;
    getAi()
      .cacheStats()
      .then((st) => live && setStored(st === null ? { state: "unsupported" } : st.total > 0 ? { state: "bytes", total: st.total } : { state: "none" }))
      .catch(() => live && setStored({ state: "unsupported" }));
    return () => {
      live = false;
    };
  }, []);

  const remove = async () => {
    setRemoving(true);
    try {
      await getAi().clearCache();
      setStored({ state: "none" });
    } finally {
      setRemoving(false);
      setConfirm(false);
    }
  };

  const storedLine =
    stored.state === "checking" ? t("ai.settings.local.checking") : stored.state === "unsupported" ? t("ai.settings.local.unsupported") : stored.state === "none" ? t("ai.settings.local.stored_none") : t("ai.settings.local.stored_n", { size: f.bytes(stored.total) });

  return (
    <SettingsSection id="ai-device" title={t("ai.settings.local.title")} description={t("ai.settings.local.lede")}>
      <SwitchRow label={t("ai.settings.local.enabled")} checked={enabled} onChange={setEnabled} disabled={locked} state={eState} />
      <div className="grid gap-2">
        <span className="flex items-center gap-2 text-[0.8125rem] font-medium">
          {t("ai.settings.local.tier")}
          <Pending on={tState.pending} />
        </span>
        <ChoiceGroup
          label={t("ai.settings.local.tier")}
          value={tier}
          onChange={setTier}
          disabled={locked || !enabled}
          options={[
            { value: "lite", label: t("ai.settings.local.lite") },
            { value: "full", label: t("ai.settings.local.full") },
          ]}
          describe={t(tier === "full" ? "ai.settings.local.full_body" : "ai.settings.local.lite_body")}
        />
        <SaveError state={tState} />
      </div>
      <SwitchRow label={t("ai.settings.local.bg")} body={t("ai.settings.local.bg_body")} checked={bg} onChange={setBg} disabled={locked || !enabled} state={bState} />
      <div className="grid gap-3 rounded-xl bg-foreground/[0.03] p-3.5 ring-1 ring-foreground/[0.05] ring-inset">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-background text-muted-foreground ring-1 ring-foreground/[0.07]">
            <HardDriveIcon className="size-4" />
          </span>
          <div className="grid min-w-0 flex-1 gap-0.5">
            <span className="text-[0.8125rem] font-medium">{t("ai.settings.local.stored")}</span>
            <span aria-live="polite" className="text-[0.8125rem] text-muted-foreground tabular-nums">
              {storedLine}
            </span>
            <span className="text-[0.75rem] text-muted-foreground/80">{t("ai.settings.local.device_only")}</span>
          </div>
        </div>
        {!hideActions && stored.state === "bytes" && (
          <div className="flex flex-wrap items-center gap-2">
            {confirm ? (
              <>
                <p className="basis-full text-[0.8125rem] text-pretty">{t("ai.settings.local.remove_confirm")}</p>
                <Button variant="destructive" className="h-11 px-3.5 sm:h-9" disabled={removing} onClick={() => void remove()}>
                  <Trash2Icon aria-hidden="true" className="size-4" />
                  {t("ai.settings.local.remove")}
                </Button>
                <Button variant="ghost" className="h-11 px-3.5 sm:h-9" disabled={removing} onClick={() => setConfirm(false)}>
                  {t("ai.settings.cancel")}
                </Button>
              </>
            ) : (
              <Button variant="outline" className="h-11 px-3.5 sm:h-9" onClick={() => setConfirm(true)}>
                <Trash2Icon aria-hidden="true" className="size-4" />
                {t("ai.settings.local.remove")}
              </Button>
            )}
          </div>
        )}
      </div>
    </SettingsSection>
  );
}

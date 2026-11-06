"use client";
/**
 * Settings → AI, the cloud half (P7 AI; ai.md AI-§K.1 1, 1b, 2; AI-§K.5; AI-§C.3): where AI runs, the Director pass
 * and the deep pass, and the month's credits. Every number comes from the view (store_usage and ai_runs, never
 * estimated); the Director and the credits are greyed when the store chose On-device only or the platform keeps
 * Cloud AI off, with that one line.
 */
import { CpuIcon, InfoIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SettingsSection } from "@/components/admin/settings/form-kit";
import { creditsLeft, meterFraction, SETTINGS_GROUPS, type AiMode, type AiSettingsView, type DirectorChoice, type SettingsStates } from "@/lib/ai/settings/view";
import { useT } from "@/lib/i18n/admin/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { saveDeepPassAction, saveDirectorAction, saveModeAction } from "@/app/app/[store]/settings/ai/actions";
import { ChoiceGroup, DefaultBadge, Meter, Note, Pending, SaveError, SwitchRow, useFormat, useSaved } from "./controls";

const MODES: AiMode[] = ["auto", "local", "server"];
const DIRECTOR: DirectorChoice[] = ["auto", "ask", "off"];

export function ModeSection({ view, states, locked }: { view: AiSettingsView; states: SettingsStates; locked: boolean }) {
  const t = useT();
  const [mode, setMode, state] = useSaved(view.settings.mode, (m, key) => saveModeAction({ key, mode: m }));
  return (
    <SettingsSection id="ai-mode" title={<span className="flex items-center gap-2">{t("ai.settings.mode.title")}<Pending on={state.pending} /></span>}>
      <ChoiceGroup
        label={t("ai.settings.mode.title")}
        value={mode}
        onChange={setMode}
        disabled={locked}
        options={MODES.map((m) => ({ value: m, label: t(`ai.settings.mode.label.${m}`), disabled: m === "server" && states.serverDisabled !== null && mode !== "server" }))}
        describe={t(`ai.settings.mode.${mode}`)}
      />
      <SaveError state={state} />
    </SettingsSection>
  );
}

/** The greyed wrapper of a cloud section: the content stays readable, inert, under one line saying why. */
function Greyed({ on, reason, children }: { on: boolean; reason: string; children: React.ReactNode }) {
  if (!on) return <>{children}</>;
  return (
    <div className="grid gap-4">
      <Note icon={<CpuIcon />}>{reason}</Note>
      <div inert className="grid gap-5 opacity-50 select-none">
        {children}
      </div>
    </div>
  );
}

export function DirectorSection({ view, states, locked }: { view: AiSettingsView; states: SettingsStates; locked: boolean }) {
  const t = useT();
  const f = useFormat();
  const [director, setDirector, dState] = useSaved<DirectorChoice | null>(view.settings.director, (d, key) => saveDirectorAction({ key, director: d }));
  const [deep, setDeep, deepState] = useSaved(view.settings.deepPass, (d, key) => saveDeepPassAction({ key, deepPass: d }));
  if (!states.directorVisible) return null;
  const effective = director ?? view.cloud.directorDefault;
  const share = view.credits.director;
  const reason = states.localOnly ? t("ai.settings.local_only") : states.cloudNotice ? t(states.cloudNotice) : t("ai.settings.greyed");
  const passes = (n: number | null, key: string) => (n === null ? t("ai.settings.no_daily_limit") : t(key, { n: f.int(n) }));
  return (
    <SettingsSection
      id="ai-director"
      title={<span className="flex items-center gap-2">{t("ai.settings.director.title")}<Pending on={dState.pending || deepState.pending} /></span>}
      description={t("ai.settings.director.lede")}
    >
      <Greyed on={states.cloudGreyed} reason={reason}>
        <div className="grid gap-2">
          <ChoiceGroup
            label={t("ai.settings.director.title")}
            value={effective}
            onChange={(v) => setDirector(v)}
            disabled={locked || states.cloudGreyed}
            options={DIRECTOR.map((d) => ({ value: d, label: t(`ai.settings.director.label.${d}`), badge: director === null && d === view.cloud.directorDefault ? <DefaultBadge /> : undefined }))}
            describe={
              <>
                {t(effective === "off" ? "ai.settings.director.off" : `ai.settings.director.${effective}`)}
                {effective !== "off" && <span className="text-foreground/80"> · {t("ai.settings.director.cost", { credits: f.int(view.cloud.directorPassCredits) })}</span>}
              </>
            }
          />
          <SaveError state={dState} />
        </div>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="grid gap-0.5 rounded-xl bg-foreground/[0.03] px-3.5 py-3 ring-1 ring-foreground/[0.05] ring-inset">
            <dt className="text-[0.75rem] text-muted-foreground">{t("ai.settings.director.title")}</dt>
            <dd className="text-[0.875rem] font-medium tabular-nums">{passes(view.cloud.directorPassesLeft, "ai.settings.director.passes")}</dd>
          </div>
          <div className="grid gap-0.5 rounded-xl bg-foreground/[0.03] px-3.5 py-3 ring-1 ring-foreground/[0.05] ring-inset">
            <dt className="text-[0.75rem] text-muted-foreground">{t("ai.settings.deep.title")}</dt>
            <dd className="text-[0.875rem] font-medium tabular-nums">{passes(view.cloud.deepPassesLeft, "ai.settings.deep.passes")}</dd>
          </div>
        </dl>
        {share && (
          <div className="grid gap-2">
            <p className="text-[0.8125rem] leading-relaxed text-pretty text-muted-foreground tabular-nums">{t("ai.director.share", { used: f.int(share.used), share: f.int(share.share), kept: f.int(share.kept) })}</p>
            <Meter fraction={meterFraction(share.used, share.share)} label={t("ai.settings.group.director")} />
          </div>
        )}
        <div className="border-t border-foreground/[0.06] pt-4">
          <SwitchRow label={t("ai.settings.deep.toggle")} body={t("ai.settings.deep.body")} checked={deep} onChange={setDeep} disabled={locked || states.cloudGreyed} state={deepState} />
        </div>
      </Greyed>
      {states.retention && (
        <Note icon={<InfoIcon />} className="adm-rise">
          {t("ai.settings.retention")}
        </Note>
      )}
    </SettingsSection>
  );
}

export function CreditsSection({ view, states, locked }: { view: AiSettingsView; states: SettingsStates; locked: boolean }) {
  const t = useT();
  const f = useFormat();
  const [more, setMore] = useState(false);
  const narrow = useIsMobile();
  const c = view.credits;
  const left = creditsLeft(c.limit, c.used);
  const dayLeft = creditsLeft(c.dayLimit, c.dayUsed);
  const reset = f.date(c.resetsOn);
  const max = Math.max(1, ...SETTINGS_GROUPS.map((g) => c.groups[g]));
  return (
    <SettingsSection
      id="ai-credits"
      title={t("ai.settings.credits.title")}
      description={t("ai.settings.credits.lede")}
      aside={
        !locked && c.limit !== null ? (
          <Button variant="outline" className="h-11 px-3.5 sm:h-9" onClick={() => setMore(true)}>
            {t("ai.settings.credits.more")}
          </Button>
        ) : undefined
      }
    >
      <div className={cn("grid gap-5", states.cloudGreyed && "opacity-60")}>
        <div className="grid gap-2.5">
          <p className="text-[0.9375rem] font-medium tabular-nums">
            {left === null ? t("ai.settings.credits.unlimited", { used: f.int(c.used) }) : t("ai.settings.credits", { left: f.int(left), total: f.int(c.limit ?? 0), date: reset })}
          </p>
          <Meter fraction={meterFraction(c.used, c.limit)} label={t("ai.settings.credits.title")} />
          <p className="text-[0.8125rem] text-muted-foreground tabular-nums">
            {dayLeft === null ? t("ai.settings.credits.day_unlimited", { used: f.int(c.dayUsed) }) : t("ai.settings.credits_day", { left: f.int(dayLeft) })}
          </p>
          {states.creditsOut && <Note>{states.creditsOut === "month" ? t("ai.settings.credits.out_month", { date: reset }) : t("ai.settings.credits.out_day")}</Note>}
        </div>
        <div className="grid gap-2">
          <h3 className="text-[0.75rem] font-medium tracking-[0.01em] text-muted-foreground">{t("ai.settings.credits.groups")}</h3>
          <ul className="grid gap-px overflow-hidden rounded-xl ring-1 ring-foreground/[0.06]">
            {SETTINGS_GROUPS.filter((g) => g !== "other" || c.groups.other > 0).map((g) => (
              <li key={g} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 bg-foreground/[0.02] px-3.5 py-2.5">
                <span className="truncate text-[0.8125rem]">{t(`ai.settings.group.${g}`)}</span>
                <span className="text-[0.8125rem] text-muted-foreground tabular-nums">{t("ai.settings.credits.n", { n: f.int(c.groups[g]) })}</span>
                <span aria-hidden="true" className="col-span-2 h-1 overflow-hidden rounded-full bg-foreground/[0.05]">
                  <span className="block h-full rounded-full bg-foreground/35" style={{ width: `${(c.groups[g] / max) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side={narrow ? "bottom" : "right"} className="gap-0 p-0 sm:max-w-md">
          <SheetHeader className="gap-1.5 p-6 pb-3">
            <SheetTitle>{t("ai.settings.credits.more_title")}</SheetTitle>
            <SheetDescription>{t("ai.settings.credits.more_body")}</SheetDescription>
          </SheetHeader>
          <div className="grid gap-3 px-6 pb-6">
            <p className="text-[0.875rem] font-medium tabular-nums">{left === null ? t("ai.settings.credits.unlimited", { used: f.int(c.used) }) : t("ai.settings.credits", { left: f.int(left), total: f.int(c.limit ?? 0), date: reset })}</p>
            <Meter fraction={meterFraction(c.used, c.limit)} label={t("ai.settings.credits.title")} />
            <p className="text-[0.8125rem] text-muted-foreground">{t("ai.settings.credits.more_reset", { date: reset })}</p>
            <Button variant="outline" className="mt-2 h-11 justify-self-start px-4" onClick={() => setMore(false)}>
              {t("ai.settings.credits.more_close")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </SettingsSection>
  );
}

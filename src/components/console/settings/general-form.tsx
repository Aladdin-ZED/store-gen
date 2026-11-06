"use client";
/**
 * `/admin/settings/general` (platform.md PLA-§13.1, PL-14; PD17, PD54, PD67, D37): one card per section of the
 * `platform` setting, each with its own Save (`savePlatformSettingsAction({ section, patch, opId })`), plus P6's
 * design gates group mounted with `{ value, onSave }`. Every value is validated again on the server; the seller
 * colour band needs the typed `allow orange` and shows the owner rule; the console's own tokens never change.
 */
import { MessageCircleIcon, PlusIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { savePlatformDesignAction, savePlatformSettingsAction } from "@/app/admin/(console)/settings/actions";
import { PlatformDesignFields } from "@/components/admin/brand/platform-design-fields";
import { useT } from "@/lib/i18n/admin/client";
import type { GeneralSettingsView } from "@/lib/platform/settings-view";
import type { PlatformDesignSetting } from "@/lib/settings/keys/platform-design";
import { cn } from "@/lib/utils";
import { Banner, button, Field, inputCls, SaveBar, Segmented, SettingsCard, SwitchRow, TypedConfirm, typedOk, useSave } from "../kit";

const E164 = /^\+[1-9]\d{6,14}$/;
const HANDLE = /^[a-z0-9-]{1,30}$/;
const LOCALES = ["ar", "fr", "en"] as const;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const int = (v: string, fallback: number) => (/^-?\d+$/.test(v.trim()) ? Number(v.trim()) : fallback);

export function GeneralForm({ view, markets }: { view: GeneralSettingsView; markets: readonly string[] }) {
  return (
    <div className="grid gap-4">
      <BrandCard value={view.platform.brand} />
      <NewStoreCard value={view.platform.newStore} markets={markets} />
      <ReservedCard value={view.platform.reservedHandles} kept={view.kept} />
      <div className="grid gap-4 lg:grid-cols-2">
        <AnalyticsCard k={view.platform.analytics.k} />
        <OrangeCard on={view.platform.allowSellerBrandOrange} />
      </div>
      <DesignCard value={view.design} overrides={view.designOverrides7d} />
      <HealthCard value={view.platform.health} />
      <LifecycleCard value={view.platform.lifecycle} />
    </div>
  );
}

function BrandCard({ value }: { value: GeneralSettingsView["platform"]["brand"] }) {
  const t = useT();
  const save = useSave();
  const init = { name: value.name, supportWhatsapp: value.supportWhatsapp ?? "", supportHours: value.supportHours ?? "" };
  const [v, setV] = useState(init);
  const phoneOk = v.supportWhatsapp.trim() === "" || E164.test(v.supportWhatsapp.trim());
  const nameOk = v.name.trim().length >= 2 && v.name.trim().length <= 40;
  const dirty = !same(v, init);
  const submit = () =>
    save.save(
      (opId) => savePlatformSettingsAction({ section: "brand", patch: { name: v.name.trim(), supportWhatsapp: v.supportWhatsapp.trim() || null, supportHours: v.supportHours.trim() || null }, opId }),
      t("console.settings.saved"),
    );
  return (
    <SettingsCard title={t("console.general.brand")} lead={t("console.general.brand_lead")} footer={<SaveBar save={save} dirty={dirty} disabled={!phoneOk || !nameOk} onSave={submit} onReset={() => setV(init)} />}>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label={t("console.general.name")} hint={t("console.general.name_hint")} problem={nameOk ? null : t("console.general.name_invalid")}>
          {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!nameOk || undefined} value={v.name} maxLength={40} onChange={(e) => setV({ ...v, name: e.target.value })} className={inputCls} />}
        </Field>
        <Field label={t("console.general.whatsapp")} optional hint={t("console.general.whatsapp_hint")} problem={phoneOk ? null : t("console.general.whatsapp_invalid")}>
          {(id, d) => (
            <div className="flex gap-2">
              <input id={id} aria-describedby={d} aria-invalid={!phoneOk || undefined} dir="ltr" inputMode="tel" placeholder="+212600000000" value={v.supportWhatsapp} onChange={(e) => setV({ ...v, supportWhatsapp: e.target.value })} className={cn(inputCls, "font-mono")} />
              <a
                href={phoneOk && v.supportWhatsapp.trim() ? `https://wa.me/${v.supportWhatsapp.replace(/\D/g, "")}` : undefined}
                aria-disabled={!(phoneOk && v.supportWhatsapp.trim()) || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(button.base, button.secondary, !(phoneOk && v.supportWhatsapp.trim()) && "pointer-events-none opacity-50")}
              >
                <MessageCircleIcon aria-hidden="true" className="size-3.5" />
                {t("console.general.test")}
              </a>
            </div>
          )}
        </Field>
        <Field label={t("console.general.hours")} optional hint={t("console.general.hours_hint")}>
          {(id, d) => <input id={id} aria-describedby={d} value={v.supportHours} maxLength={80} placeholder={t("console.general.hours_placeholder")} onChange={(e) => setV({ ...v, supportHours: e.target.value })} className={inputCls} />}
        </Field>
      </div>
    </SettingsCard>
  );
}

function NewStoreCard({ value, markets }: { value: GeneralSettingsView["platform"]["newStore"]; markets: readonly string[] }) {
  const t = useT();
  const save = useSave();
  const [v, setV] = useState(value);
  const dirty = !same(v, value);
  const ok = /^[A-Z]{3}$/.test(v.currency) && v.timezone.trim().length > 2 && v.locales.length > 0 && v.locales.includes(v.defaultLocale);
  return (
    <SettingsCard
      title={t("console.general.new_store")}
      lead={t("console.general.new_store_lead")}
      footer={<SaveBar save={save} dirty={dirty} disabled={!ok} onSave={() => save.save((opId) => savePlatformSettingsAction({ section: "new_store", patch: v, opId }), t("console.settings.saved"))} onReset={() => setV(value)} />}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t("console.general.market")}>
          {(id) => (
            <select id={id} value={v.market} onChange={(e) => setV({ ...v, market: e.target.value })} className={inputCls}>
              {markets.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t("console.general.currency")} problem={/^[A-Z]{3}$/.test(v.currency) ? null : t("console.general.currency_invalid")}>
          {(id, d) => <input id={id} aria-describedby={d} dir="ltr" maxLength={3} value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value.toUpperCase() })} className={cn(inputCls, "font-mono uppercase")} />}
        </Field>
        <Field label={t("console.general.timezone")}>{(id) => <input id={id} dir="ltr" value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })} className={cn(inputCls, "font-mono")} />}</Field>
        <Field label={t("console.general.default_locale")}>
          {(id) => (
            <select id={id} value={v.defaultLocale} onChange={(e) => setV({ ...v, defaultLocale: e.target.value as (typeof LOCALES)[number] })} className={inputCls}>
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {t(`console.locale.${l}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-[12.5px] font-medium">{t("console.general.locales")}</legend>
        <div className="flex flex-wrap gap-2">
          {LOCALES.map((l) => {
            const on = v.locales.includes(l);
            return (
              <label key={l} className={cn("inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[var(--r-control)] px-3 text-[12.5px] shadow-[inset_0_0_0_1px_var(--border)] max-md:min-h-11", on && "bg-[color-mix(in_oklch,var(--brand)_8%,var(--card))] shadow-[inset_0_0_0_1px_var(--brand)]")}>
                <input type="checkbox" checked={on} onChange={() => setV({ ...v, locales: on ? v.locales.filter((x) => x !== l) : [...v.locales, l] })} className="size-3.5 accent-[var(--brand)]" />
                {t(`console.locale.${l}`)}
              </label>
            );
          })}
        </div>
        {!v.locales.includes(v.defaultLocale) && <p className="text-[12px] text-[var(--c-danger-ink)]">{t("console.general.locales_default")}</p>}
      </fieldset>
    </SettingsCard>
  );
}

function ReservedCard({ value, kept }: { value: string[]; kept: Record<string, string> }) {
  const t = useT();
  const save = useSave();
  const [list, setList] = useState(value);
  const [draft, setDraft] = useState("");
  const d = draft.trim().toLowerCase();
  const problem = d && !HANDLE.test(d) ? t("console.general.reserved_invalid") : d && list.includes(d) ? t("console.general.reserved_exists") : null;
  const add = () => {
    if (!d || problem || list.length >= 500) return;
    setList([...list, d]);
    setDraft("");
  };
  return (
    <SettingsCard
      title={t("console.general.reserved")}
      lead={t("console.general.reserved_lead")}
      aside={<span className="num text-[12px] text-muted-foreground">{t("console.general.reserved_count", { count: list.length })}</span>}
      footer={<SaveBar save={save} dirty={!same(list, value)} onSave={() => save.save((opId) => savePlatformSettingsAction({ section: "reserved_handles", patch: { reservedHandles: list }, opId }), t("console.settings.saved"))} onReset={() => setList(value)} />}
    >
      <Field label={t("console.general.reserved_add")} problem={problem} hint={t("console.general.reserved_hint")}>
        {(id, dd) => (
          <div className="flex gap-2">
            <input
              id={id}
              aria-describedby={dd}
              aria-invalid={!!problem || undefined}
              dir="ltr"
              value={draft}
              maxLength={30}
              placeholder="support"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              className={cn(inputCls, "font-mono sm:max-w-xs")}
            />
            <button type="button" onClick={add} disabled={!d || !!problem} className={cn(button.base, button.secondary)}>
              <PlusIcon aria-hidden="true" className="size-3.5" />
              {t("console.general.reserved_add_btn")}
            </button>
          </div>
        )}
      </Field>
      {list.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">{t("console.general.reserved_empty")}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {list.map((h) => (
            <li key={h} className={cn("inline-flex max-w-full items-center gap-1 rounded-[var(--r-chip)] py-0.5 ps-2 pe-0.5 text-[12px] shadow-[inset_0_0_0_1px_var(--border)]", kept[h] && "bg-[var(--c-warn-soft)]")} title={kept[h] ? t("console.general.kept_for", { handle: kept[h] }) : undefined}>
              <bdi dir="ltr" className="truncate font-mono">
                {h}
              </bdi>
              {kept[h] && <span className="text-[11px] text-muted-foreground">· {t("console.general.kept_short", { handle: kept[h] })}</span>}
              <button type="button" aria-label={t("console.general.reserved_remove", { handle: h })} onClick={() => setList(list.filter((x) => x !== h))} className="inline-grid size-6 place-items-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:size-8">
                <XIcon aria-hidden="true" className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {Object.keys(kept).length > 0 && <p className="text-[12px] text-muted-foreground">{t("console.general.kept_note")}</p>}
    </SettingsCard>
  );
}

function AnalyticsCard({ k }: { k: number }) {
  const t = useT();
  const save = useSave();
  const [v, setV] = useState(String(k));
  const n = int(v, -1);
  const ok = n >= 5 && n <= 50;
  return (
    <SettingsCard title={t("console.general.analytics")} lead={t("console.general.analytics_lead")} footer={<SaveBar save={save} dirty={n !== k} disabled={!ok} onSave={() => save.save((opId) => savePlatformSettingsAction({ section: "analytics", patch: { k: n }, opId }), t("console.settings.saved"))} onReset={() => setV(String(k))} />}>
      <Field label={t("console.general.k")} hint={t("console.general.k_hint", { k: ok ? n : 5 })} problem={ok ? null : t("console.general.k_invalid")}>
        {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!ok || undefined} inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} className={cn(inputCls, "num max-w-28")} />}
      </Field>
    </SettingsCard>
  );
}

function OrangeCard({ on }: { on: boolean }) {
  const t = useT();
  const save = useSave();
  const [v, setV] = useState(on);
  const [typed, setTyped] = useState("");
  const turningOn = v && !on;
  return (
    <SettingsCard
      title={t("console.general.orange")}
      lead={t("console.general.orange_lead")}
      footer={<SaveBar save={save} dirty={v !== on} disabled={turningOn && !typedOk(typed, "allow orange")} onSave={() => save.save((opId) => savePlatformSettingsAction({ section: "seller_colours", patch: { allowSellerBrandOrange: v }, typed, opId }), t("console.settings.saved"))} onReset={() => setV(on)} />}
    >
      <SwitchRow label={t("console.general.orange_switch")} hint={t(v ? "console.general.orange_on" : "console.general.orange_off")} checked={v} onChange={setV} />
      {turningOn && (
        <>
          <Banner tone="warn">{t("console.general.orange_rule")}</Banner>
          <TypedConfirm word="allow orange" value={typed} onChange={setTyped} />
        </>
      )}
    </SettingsCard>
  );
}

function DesignCard({ value, overrides }: { value: PlatformDesignSetting | null; overrides: GeneralSettingsView["designOverrides7d"] }) {
  const t = useT();
  const save = useSave();
  return (
    <SettingsCard
      title={t("console.general.design")}
      lead={t("console.general.design_lead")}
      aside={
        overrides ? (
          <span className="rounded-[var(--r-chip)] bg-muted px-2 py-0.5 text-[12px] text-muted-foreground">{t("console.general.design_overrides", { count: overrides.count, more: overrides.capped ? "+" : "" })}</span>
        ) : null
      }
    >
      {value ? (
        <>
          <PlatformDesignFields
            value={value}
            onSave={async (next) => {
              await save.save((opId) => savePlatformDesignAction({ value: next, opId }), t("console.settings.saved"));
            }}
          />
          <p className="text-[12px] text-muted-foreground">{t("console.general.design_later")}</p>
          {save.problem && <p className="text-[12px] text-[var(--c-danger-ink)]">{save.problem}</p>}
          {save.sheet}
        </>
      ) : (
        <p className="text-[12.5px] text-muted-foreground">{t("console.general.design_unavailable")}</p>
      )}
    </SettingsCard>
  );
}

function HealthCard({ value }: { value: GeneralSettingsView["platform"]["health"] }) {
  const t = useT();
  const save = useSave();
  const init = { issueNotifyMinSeverity: value.issueNotifyMinSeverity, staleAlarmMinutes: String(value.staleAlarmMinutes), showScoreToTenantsBelowN: String(value.showScoreToTenantsBelowN) };
  const [v, setV] = useState(init);
  const stale = int(v.staleAlarmMinutes, -1);
  const below = int(v.showScoreToTenantsBelowN, -1);
  const okStale = stale >= 15 && stale <= 240;
  const okBelow = below >= 0 && below <= 100;
  return (
    <SettingsCard
      title={t("console.general.health")}
      lead={t("console.general.health_lead")}
      footer={
        <SaveBar
          save={save}
          dirty={!same(v, init)}
          disabled={!okStale || !okBelow}
          onSave={() => save.save((opId) => savePlatformSettingsAction({ section: "health", patch: { issueNotifyMinSeverity: v.issueNotifyMinSeverity, staleAlarmMinutes: stale, showScoreToTenantsBelowN: below }, opId }), t("console.settings.saved"))}
          onReset={() => setV(init)}
        />
      }
    >
      <div className="grid gap-1.5">
        <span className="text-[12.5px] font-medium">{t("console.general.notify_min")}</span>
        <Segmented
          label={t("console.general.notify_min")}
          value={String(v.issueNotifyMinSeverity) as "2" | "3"}
          onChange={(x) => setV({ ...v, issueNotifyMinSeverity: x === "2" ? 2 : 3 })}
          options={[
            { value: "3", label: t("console.general.notify_3"), note: t("console.general.notify_3_note") },
            { value: "2", label: t("console.general.notify_2"), note: t("console.general.notify_2_note") },
          ]}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label={t("console.general.stale")} hint={okStale ? t("console.general.stale_effect", { minutes: stale }) : undefined} problem={okStale ? null : t("console.general.stale_invalid")}>
          {(id, d) => <input id={id} aria-describedby={d} inputMode="numeric" value={v.staleAlarmMinutes} onChange={(e) => setV({ ...v, staleAlarmMinutes: e.target.value })} className={cn(inputCls, "num max-w-28")} />}
        </Field>
        <Field label={t("console.general.score_below")} hint={okBelow ? t(below === 0 ? "console.general.score_always" : "console.general.score_effect", { n: below }) : undefined} problem={okBelow ? null : t("console.general.score_invalid")}>
          {(id, d) => <input id={id} aria-describedby={d} inputMode="numeric" value={v.showScoreToTenantsBelowN} onChange={(e) => setV({ ...v, showScoreToTenantsBelowN: e.target.value })} className={cn(inputCls, "num max-w-28")} />}
        </Field>
        <Field label={t("console.general.snooze")} hint={t("console.general.snooze_fixed")}>
          {(id, d) => <input id={id} aria-describedby={d} readOnly disabled value={t("console.general.days", { count: 7 })} className={cn(inputCls, "max-w-28")} />}
        </Field>
      </div>
    </SettingsCard>
  );
}

function LifecycleCard({ value }: { value: GeneralSettingsView["platform"]["lifecycle"] }) {
  const t = useT();
  const save = useSave();
  const init = { armSeconds: String(value.armSeconds), cooldownMinutes: String(value.cooldownMinutes) };
  const [v, setV] = useState(init);
  const arm = int(v.armSeconds, -1);
  const cool = int(v.cooldownMinutes, -1);
  const okArm = arm >= 3 && arm <= 15;
  const okCool = cool >= 0 && cool <= 120;
  return (
    <SettingsCard
      title={t("console.general.lifecycle")}
      lead={t("console.general.lifecycle_lead")}
      footer={<SaveBar save={save} dirty={!same(v, init)} disabled={!okArm || !okCool} onSave={() => save.save((opId) => savePlatformSettingsAction({ section: "lifecycle", patch: { armSeconds: arm, cooldownMinutes: cool }, opId }), t("console.settings.saved"))} onReset={() => setV(init)} />}
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
        <Field label={t("console.general.arm")} hint={t("console.general.arm_hint")} problem={okArm ? null : t("console.general.arm_invalid")}>
          {(id, d) => <input id={id} aria-describedby={d} inputMode="numeric" value={v.armSeconds} onChange={(e) => setV({ ...v, armSeconds: e.target.value })} className={cn(inputCls, "num max-w-28")} />}
        </Field>
        <Field label={t("console.general.cooldown")} hint={okCool ? t(cool === 0 ? "console.general.cooldown_off" : "console.general.cooldown_effect", { minutes: cool }) : undefined} problem={okCool ? null : t("console.general.cooldown_invalid")}>
          {(id, d) => <input id={id} aria-describedby={d} inputMode="numeric" value={v.cooldownMinutes} onChange={(e) => setV({ ...v, cooldownMinutes: e.target.value })} className={cn(inputCls, "num max-w-28")} />}
        </Field>
        <ArmPreview seconds={okArm ? arm : value.armSeconds} />
      </div>
    </SettingsCard>
  );
}

/** The live preview of the arm button (PD54): pressing it counts down with Cancel, like the lifecycle sheet. */
function ArmPreview({ seconds }: { seconds: number }) {
  const t = useT();
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (left === null) return;
    if (left <= 0) {
      const done = setTimeout(() => setLeft(null), 1_200);
      return () => clearTimeout(done);
    }
    const tick = setTimeout(() => setLeft(left - 1), 1_000);
    return () => clearTimeout(tick);
  }, [left]);
  return (
    <div className="grid content-start gap-1.5">
      <span className="text-[12.5px] font-medium">{t("console.general.arm_preview")}</span>
      <div className="flex flex-wrap items-center gap-2 rounded-[var(--r-control)] bg-muted/50 p-2.5">
        {left === null ? (
          <button type="button" onClick={() => setLeft(seconds)} className={cn(button.base, button.danger)}>
            {t("console.general.arm_suspend")}
          </button>
        ) : left > 0 ? (
          <>
            <span className="num text-[12.5px] font-medium text-[var(--c-danger-ink)]" aria-live="polite">
              {t("console.general.arm_counting", { seconds: left })}
            </span>
            <button type="button" onClick={() => setLeft(null)} className={cn(button.base, button.secondary)}>
              {t("console.general.arm_cancel")}
            </button>
          </>
        ) : (
          <span className="text-[12.5px] text-muted-foreground" aria-live="polite">
            {t("console.general.arm_done")}
          </span>
        )}
      </div>
    </div>
  );
}

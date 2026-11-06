"use client";
/**
 * Sign-up → Mode & thresholds (platform.md PLA-§3.2, §13.2; PD68, D9, D69): the five modes with one sentence each and
 * the automatic default marked with its reason, the honest human-check line, the linked thresholds on one 0-100 bar,
 * the sandbox ceilings with their live meters, allowed markets, trusted creators, the review target and the weights
 * table. Each card saves `savePlatformSettingsAction({ section: "signup", patch })`; Open needs the typed `open`.
 */
import { RotateCcwIcon } from "lucide-react";
import { useState } from "react";
import { savePlatformSettingsAction } from "@/app/admin/(console)/settings/actions";
import { useT } from "@/lib/i18n/admin/client";
import { DEFAULT_SIGNUP_POINTS, SIGNUP_FLAG_CODES } from "@/lib/platform/signup-band";
import { meterTone, MIB, pendingMediaVars, sandboxVars, thresholdBands, thresholdsOrdered } from "@/lib/platform/settings-rules";
import type { SignupSettingsView } from "@/lib/platform/settings-view";
import { cn } from "@/lib/utils";
import { PanelError, PanelUnavailable } from "../panel";
import { PrefetchLink } from "../prefetch-link";
import { Banner, button, card, Field, inputCls, Meter, SaveBar, Segmented, SettingsCard, StatusText, SwitchRow, td, th, TypedConfirm, typedOk, useSave } from "../kit";
import { consoleUrl } from "@/lib/platform/console-url";

type Mode = "closed" | "invite" | "approval" | "waitlist" | "open";
const MODES: readonly Mode[] = ["closed", "invite", "approval", "waitlist", "open"];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const int = (v: string) => (/^-?\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);
type Signup = SignupSettingsView["signup"];

export function SignupMode({ view, markets }: { view: SignupSettingsView; markets: readonly string[] }) {
  return (
    <div className="grid gap-4">
      <ModeCard signup={view.signup} derived={view.derived} turnstile={view.turnstile.configured} />
      <ThresholdsCard value={view.signup.thresholds} />
      <CeilingsCard view={view} />
      <AccessCard signup={view.signup} markets={markets} />
      <WeightsCard weights={view.signup.weights} />
    </div>
  );
}

function ModeCard({ signup, derived, turnstile }: { signup: Signup; derived: SignupSettingsView["derived"]; turnstile: boolean }) {
  const t = useT();
  const save = useSave();
  const [mode, setMode] = useState<Mode | null>(signup.mode);
  const [typed, setTyped] = useState("");
  const effective = mode ?? derived.mode;
  const needsTyped = mode === "open" && signup.mode !== "open";
  return (
    <SettingsCard
      title={t("console.signup.mode")}
      lead={t("console.signup.mode_lead")}
      footer={
        <>
          {mode !== null && (
            <button type="button" onClick={() => setMode(null)} className={cn(button.base, button.ghost, "me-auto")}>
              <RotateCcwIcon aria-hidden="true" className="size-3.5" />
              {t("console.signup.use_automatic")}
            </button>
          )}
          <SaveBar save={save} dirty={mode !== signup.mode} disabled={needsTyped && !typedOk(typed, "open")} onSave={() => save.save((opId) => savePlatformSettingsAction({ section: "signup", patch: { mode }, typed, opId }), t("console.settings.saved"))} />
        </>
      }
    >
      <Segmented<Mode>
        label={t("console.signup.mode")}
        value={effective}
        onChange={setMode}
        options={MODES.map((m) => ({ value: m, label: t(`console.signup.mode.${m}`), note: t(`console.signup.mode.${m}.note`), mark: mode === null && m === derived.mode ? t("console.signup.automatic") : undefined }))}
      />
      {mode === null ? (
        <p className="text-[12.5px] text-muted-foreground">{t("console.signup.automatic_line", { mode: t(`console.signup.mode.${derived.mode}`), because: t(`console.signup.because.${derived.reason}`) })}</p>
      ) : (
        <p className="text-[12.5px] text-muted-foreground">{t("console.signup.override_line", { mode: t(`console.signup.mode.${derived.mode}`) })}</p>
      )}
      {turnstile ? <StatusText tone="ok">{t("console.signup.human_configured")}</StatusText> : <StatusText tone="warn">{t("console.signup.human_missing")}</StatusText>}
      {needsTyped && (
        <>
          <Banner tone="warn">{t("console.signup.open_warning")}</Banner>
          <TypedConfirm word="open" value={typed} onChange={setTyped} />
        </>
      )}
    </SettingsCard>
  );
}

const BAND_TINT = {
  fast: "bg-[oklch(0.7_0.12_160)]",
  review: "bg-[color-mix(in_oklch,var(--foreground)_22%,transparent)]",
  hold: "bg-[oklch(0.8_0.13_95)]",
  reject_candidate: "bg-[oklch(0.58_0.18_17)]",
} as const;

function ThresholdsCard({ value }: { value: Signup["thresholds"] }) {
  const t = useT();
  const save = useSave();
  const init = { fastLaneMax: String(value.fastLaneMax), holdMin: String(value.holdMin), rejectCandidateMin: String(value.rejectCandidateMin) };
  const [v, setV] = useState(init);
  const parsed = { fastLaneMax: int(v.fastLaneMax), holdMin: int(v.holdMin), rejectCandidateMin: int(v.rejectCandidateMin) };
  const ok = Object.values(parsed).every((n) => Number.isFinite(n)) && thresholdsOrdered(parsed);
  const bands = thresholdBands(ok ? parsed : value);
  return (
    <SettingsCard
      title={t("console.signup.thresholds")}
      lead={t("console.signup.thresholds_lead")}
      footer={<SaveBar save={save} dirty={!same(v, init)} disabled={!ok} onSave={() => save.save((opId) => savePlatformSettingsAction({ section: "signup", patch: { thresholds: parsed }, opId }), t("console.settings.saved"))} onReset={() => setV(init)} />}
    >
      <div className="grid gap-2">
        <div className="flex h-2.5 overflow-hidden rounded-full" aria-hidden="true">
          {bands.map((b) => (
            <span key={b.band} className={cn("h-full", BAND_TINT[b.band])} style={{ width: `${Math.max(0, b.to - b.from + 1)}%` }} />
          ))}
        </div>
        <ul className="grid gap-x-4 gap-y-1 text-[12px] text-muted-foreground sm:grid-cols-4">
          {bands.map((b) => (
            <li key={b.band} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", BAND_TINT[b.band])} />
              <span className="font-medium text-foreground">{t(`console.band.${b.band}`)}</span>
              <span className="num">
                {b.from}–{b.to}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {(["fastLaneMax", "holdMin", "rejectCandidateMin"] as const).map((k) => (
          <Field key={k} label={t(`console.signup.${k}`)} hint={t(`console.signup.${k}_hint`)}>
            {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!ok || undefined} inputMode="numeric" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className={cn(inputCls, "num max-w-28")} />}
          </Field>
        ))}
      </div>
      {!ok && <p className="text-[12px] text-[var(--c-danger-ink)]">{t("console.signup.thresholds_order")}</p>}
    </SettingsCard>
  );
}

function CeilingsCard({ view }: { view: SignupSettingsView }) {
  const t = useT();
  const save = useSave();
  const s = view.signup;
  const init = {
    pendingMediaMiBBeforeSubmit: String(s.pendingMediaMiBBeforeSubmit),
    pendingMediaMiB: String(s.pendingMediaMiB),
    pendingMembersMax: String(s.pendingMembersMax),
    pendingMediaTotalMiB: String(s.pendingMediaTotalMiB),
    pendingStoresPerDay: String(s.pendingStoresPerDay),
  };
  const [v, setV] = useState(init);
  const n = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, int(x)])) as Record<keyof typeof init, number>;
  const range: Record<keyof typeof init, [number, number]> = { pendingMediaMiBBeforeSubmit: [5, 200], pendingMediaMiB: [10, 1024], pendingMembersMax: [1, 10], pendingMediaTotalMiB: [500, 50_000], pendingStoresPerDay: [1, 1_000] };
  const bad = (k: keyof typeof init) => !(n[k] >= range[k][0] && n[k] <= range[k][1]);
  const order = n.pendingMediaMiBBeforeSubmit <= n.pendingMediaMiB;
  const ok = (Object.keys(init) as (keyof typeof init)[]).every((k) => !bad(k)) && order;
  const media = view.pendingMedia;
  const sand = view.sandboxes;
  const input = (k: keyof typeof init, unit?: string) => (
    <Field key={k} label={t(`console.signup.${k}`)} hint={t("console.signup.range", { min: range[k][0], max: range[k][1], unit: unit ?? "" })} problem={bad(k) ? t("console.settings.invalid") : null}>
      {(id, d) => <input id={id} aria-describedby={d} aria-invalid={bad(k) || undefined} inputMode="numeric" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className={cn(inputCls, "num max-w-32")} />}
    </Field>
  );
  return (
    <SettingsCard
      id="ceilings"
      title={t("console.signup.ceilings")}
      lead={t("console.signup.ceilings_lead")}
      footer={<SaveBar save={save} dirty={!same(v, init)} disabled={!ok} onSave={() => save.save((opId) => savePlatformSettingsAction({ section: "signup", patch: n, opId }), t("console.settings.saved"))} onReset={() => setV(init)} />}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {input("pendingMediaMiBBeforeSubmit", "MiB")}
        {input("pendingMediaMiB", "MiB")}
        {input("pendingMembersMax")}
      </div>
      {!order && <p className="text-[12px] text-[var(--c-danger-ink)]">{t("console.signup.media_order")}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-3 rounded-[var(--r-control)] bg-muted/40 p-3">
          {input("pendingMediaTotalMiB", "MiB")}
          {media.state === "ok" ? (
            <Meter label={t("console.signup.media_used")} used={media.data.usedBytes} limit={media.data.limitBytes} tone={meterTone(media.data.usedBytes, media.data.limitBytes)} text={t("console.signup.media_meter", pendingMediaVars(media.data))} />
          ) : media.state === "error" ? (
            <PanelError compact reference={media.ref} />
          ) : (
            <PanelUnavailable />
          )}
        </div>
        <div className="grid content-start gap-3 rounded-[var(--r-control)] bg-muted/40 p-3">
          {input("pendingStoresPerDay")}
          {sand.state === "ok" ? (
            <Meter label={t("console.signup.sandboxes_today")} used={sand.data.used} limit={sand.data.limit} tone={sand.data.full ? "danger" : meterTone(sand.data.used, sand.data.limit)} text={t(sand.data.full ? "console.signup.sandbox_full" : "console.signup.sandbox_meter", sandboxVars(sand.data))} />
          ) : sand.state === "error" ? (
            <PanelError compact reference={sand.ref} />
          ) : (
            <PanelUnavailable />
          )}
        </div>
      </div>
      <p className="text-[12.5px] text-muted-foreground">{view.aiSlicePct === null ? t("console.signup.ai_slice_unknown") : t("console.signup.ai_slice", { pct: view.aiSlicePct })}</p>
      {media.state === "ok" && media.data.largest.length > 0 && (
        <details className="text-[12.5px]">
          <summary className="cursor-pointer text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">{t("console.signup.largest")}</summary>
          <ul className="mt-2 grid gap-1">
            {media.data.largest.map((x) => (
              <li key={x.storeId} className="flex justify-between gap-3">
                <PrefetchLink href={consoleUrl(`/stores/${x.storeId}`)} className="min-w-0 truncate text-[var(--c-brand-ink)] hover:underline">
                  {x.name} {x.handle && <bdi dir="ltr">@{x.handle}</bdi>}
                </PrefetchLink>
                <span className="num shrink-0 text-muted-foreground">{Math.max(1, Math.round(x.bytes / MIB)).toLocaleString("en-US")} MiB</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </SettingsCard>
  );
}

function AccessCard({ signup, markets }: { signup: Signup; markets: readonly string[] }) {
  const t = useT();
  const save = useSave();
  const init = { allowedMarkets: signup.allowedMarkets, trustedCreatorAutoApprove: signup.trustedCreatorAutoApprove, slaHours: signup.slaHours === null ? "" : String(signup.slaHours) };
  const [v, setV] = useState(init);
  const sla = v.slaHours.trim() === "" ? null : int(v.slaHours);
  const slaOk = sla === null || (sla >= 1 && sla <= 168);
  const ok = slaOk && v.allowedMarkets.length > 0;
  const two = markets.filter((m) => /^[A-Z]{2}$/.test(m));
  return (
    <SettingsCard
      title={t("console.signup.access")}
      lead={t("console.signup.access_lead")}
      footer={<SaveBar save={save} dirty={!same(v, init)} disabled={!ok} onSave={() => save.save((opId) => savePlatformSettingsAction({ section: "signup", patch: { allowedMarkets: v.allowedMarkets, trustedCreatorAutoApprove: v.trustedCreatorAutoApprove, slaHours: sla }, opId }), t("console.settings.saved"))} onReset={() => setV(init)} />}
    >
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-[12.5px] font-medium">{t("console.signup.markets")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {two.map((m) => {
            const on = v.allowedMarkets.includes(m);
            return (
              <button
                key={m}
                type="button"
                aria-pressed={on}
                onClick={() => setV({ ...v, allowedMarkets: on ? v.allowedMarkets.filter((x) => x !== m) : [...v.allowedMarkets, m] })}
                className={cn("h-8 min-w-11 rounded-[var(--r-chip)] px-2.5 font-mono text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:h-11", on ? "bg-[color-mix(in_oklch,var(--brand)_12%,var(--card))] font-medium text-foreground shadow-[inset_0_0_0_1px_var(--brand)]" : "text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent")}
              >
                {m}
              </button>
            );
          })}
        </div>
        {v.allowedMarkets.length === 0 && <p className="text-[12px] text-[var(--c-danger-ink)]">{t("console.signup.markets_one")}</p>}
      </fieldset>
      <SwitchRow label={t("console.signup.trusted")} hint={t("console.signup.trusted_hint")} checked={v.trustedCreatorAutoApprove} onChange={(x) => setV({ ...v, trustedCreatorAutoApprove: x })} />
      <Field label={t("console.signup.sla")} optional hint={t("console.signup.sla_hint")} problem={slaOk ? null : t("console.signup.sla_invalid")}>
        {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!slaOk || undefined} inputMode="numeric" placeholder="24" value={v.slaHours} onChange={(e) => setV({ ...v, slaHours: e.target.value })} className={cn(inputCls, "num max-w-28")} />}
      </Field>
    </SettingsCard>
  );
}

function WeightsCard({ weights }: { weights: Record<string, number> }) {
  const t = useT();
  const save = useSave();
  const toText = (w: Record<string, number>) => Object.fromEntries(SIGNUP_FLAG_CODES.map((c) => [c, w[c] === undefined ? "" : String(w[c])]));
  const [v, setV] = useState<Record<string, string>>(toText(weights));
  const parsed: Record<string, number> = {};
  let ok = true;
  for (const c of SIGNUP_FLAG_CODES) {
    const raw = v[c]?.trim() ?? "";
    if (raw === "") continue;
    const n = int(raw);
    if (!(n >= -50 && n <= 100)) ok = false;
    else parsed[c] = n;
  }
  return (
    <section aria-label={t("console.signup.weights")} className={card}>
      <div className="grid gap-0.5 px-4 pt-4 pb-3 md:px-5">
        <h2 className="text-[14px] font-semibold tracking-[-0.006em]">{t("console.signup.weights")}</h2>
        <p className="max-w-[68ch] text-[12.5px] text-muted-foreground">{t("console.signup.weights_lead")}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-t border-[var(--c-hairline)]">
          <thead>
            <tr className="border-b border-[var(--c-hairline)]">
              <th className={th}>{t("console.signup.signal")}</th>
              <th className={cn(th, "text-end")}>{t("console.signup.default_points")}</th>
              <th className={th}>{t("console.signup.override")}</th>
              <th className={th}>
                <span className="sr-only">{t("console.form.reset")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {SIGNUP_FLAG_CODES.map((c) => {
              const raw = v[c] ?? "";
              const n = int(raw);
              const invalid = raw.trim() !== "" && !(n >= -50 && n <= 100);
              return (
                <tr key={c} className="border-b border-[var(--c-hairline)] last:border-0">
                  <td className={td}>
                    <span className="grid gap-0.5">
                      <span>{t(`console.weight.${c}`)}</span>
                      <bdi dir="ltr" className="font-mono text-[11px] text-muted-foreground">
                        {c}
                      </bdi>
                    </span>
                  </td>
                  <td className={cn(td, "num text-end text-muted-foreground")}>{DEFAULT_SIGNUP_POINTS[c] > 0 ? `+${DEFAULT_SIGNUP_POINTS[c]}` : DEFAULT_SIGNUP_POINTS[c]}</td>
                  <td className={td}>
                    <input aria-label={t("console.signup.override_for", { code: c })} aria-invalid={invalid || undefined} inputMode="numeric" placeholder={String(DEFAULT_SIGNUP_POINTS[c])} value={raw} onChange={(e) => setV({ ...v, [c]: e.target.value })} className={cn(inputCls, "num h-8 w-24")} />
                  </td>
                  <td className={cn(td, "w-px")}>
                    {raw.trim() !== "" && (
                      <button type="button" onClick={() => setV({ ...v, [c]: "" })} className={cn(button.base, button.ghost, "h-8 px-2")}>
                        {t("console.form.reset")}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--c-hairline)] px-4 py-3 md:px-5">
        <SaveBar save={save} dirty={!same(parsed, weights)} disabled={!ok} onSave={() => save.save((opId) => savePlatformSettingsAction({ section: "signup", patch: { weights: parsed }, opId }), t("console.settings.saved"))} onReset={() => setV(toText(weights))} />
      </div>
    </section>
  );
}

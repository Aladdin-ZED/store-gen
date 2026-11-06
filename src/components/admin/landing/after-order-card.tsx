"use client";
/**
 * "After the order" and the checkout options (landing.md LAN-§8.4, §7.3, §10.1, §9; docs/STORE-SAAS.md §I.8).
 *
 * `AfterOrderCard`: the three thank-you switches, the caller phone with the calling window directly under it, the
 * "Confirm on WhatsApp" number, "We call within N hours", and the `customer_confirm` text per locale with its variable
 * chips, beside a live 390 px phone preview of the thank-you hero. The preview's `{when}` is `callWhen` over
 * operations' `nextCallableAt` (the page's own words), and there is none until the owner confirmed the window
 * (`shopperPromiseAllowed`). Variables show as named chips, never as made-up values.
 *
 * `CheckoutOptionsCard`: the address field, the new-page form defaults, the not-served WhatsApp button, the
 * confirmation call, lead capture (with the EU note) and the tracking page's requests. `landing.waOrder.enabled` stays
 * hidden until wave 2.
 *
 * TODO(p3-w1-verify): mount P4's `CallingWindowEditor` (src/components/admin/callcenter/calling-window.tsx) with
 * `saveCallingWindowAction` and its "Use these hours" under the caller phone once P4 is on the branch; until then the
 * card shows the window read-only with a link to the call center screen, where the hours are edited.
 */
import { CheckIcon, ExternalLinkIcon, MessageCircleIcon, PackageSearchIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { createT } from "@/landing/i18n";
import type { EffectiveWindow } from "@/lib/callcenter/window";
import { TY, plural, type ShopperLocale } from "@/lib/landing/copy";
import { callWhen } from "@/lib/landing/hours";
import { MAX_TEMPLATE_CHARS } from "@/lib/landing/limits";
import { TEMPLATE_KIND_VARS, unknownTemplateVars } from "@/lib/landing/templates";
import { useT } from "@/lib/i18n/admin/client";
import type { CheckoutSetting } from "@/lib/settings/keys/checkout";
import type { LandingSetting } from "@/lib/settings/keys/landing";
import { cn } from "@/lib/utils";
import { Segmented } from "../common/segmented";
import type { ActionResult } from "../lib/action-result";
import { Field, SettingsSection, TextInput } from "../settings/form-kit";
import { opt, ReadOnly } from "./read-only";
import { useNow, useOptimistic } from "./optimistic";

type Loc = ShopperLocale;
const LOCS: readonly Loc[] = ["ar", "fr", "en"];
const LOC_LABEL: Record<Loc, string> = { ar: "العربية", fr: "Français", en: "English" };

export interface AfterOrderData {
  canWrite: boolean;
  canWriteCheckout: boolean;
  storeName: string;
  market: string;
  euMarket: boolean;
  pageLocale: Loc;
  thankYou: LandingSetting["thankYou"];
  confirmation: { callerPhone: string | null; whatsapp: string | null; withinHours: number | null };
  storeWhatsapp: string | null;
  window: EffectiveWindow;
  /** `shopperPromiseAllowed(window)`: the owner saved the hours */
  windowConfirmed: boolean;
  /** no callable range in the next 14 store days */
  windowClosed: boolean;
  /** the week's hours in the viewer's language ("" when every day is closed) */
  hoursLine: string;
  callcenterHref: string;
  templates: Record<Loc, string | null>;
  defaults: Readonly<Record<Loc, string>>;
  checkout: Pick<CheckoutSetting, "addressMode" | "newPageForm" | "confirmationCall"> & { notServedWhatsapp: boolean };
  landing: { leadsCapture: LandingSetting["leads"]["capture"]; trackingRequests: boolean };
}

type Confirmation = AfterOrderData["confirmation"];

export interface AfterOrderActions {
  saveThankYou: (opId: string, v: LandingSetting["thankYou"]) => Promise<ActionResult<LandingSetting["thankYou"]>>;
  saveConfirmation: (opId: string, v: Confirmation) => Promise<ActionResult<Confirmation>>;
  saveTemplate: (opId: string, locale: Loc, body: string | null) => Promise<ActionResult<Record<Loc, string | null>>>;
}

function SwitchRow({ label, hint, note, checked, disabled, onChange }: { label: string; hint: string; note?: ReactNode; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="grid gap-1 py-2">
      <div className="flex min-h-11 items-center justify-between gap-4">
        <label htmlFor={id} className="grid gap-0.5">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs leading-relaxed text-muted-foreground">{hint}</span>
        </label>
        <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
      </div>
      {note && <p className="text-xs leading-relaxed font-medium text-foreground/80">{note}</p>}
    </div>
  );
}

export function AfterOrderCard({ data, actions }: { data: AfterOrderData; actions: AfterOrderActions }) {
  const t = useT();
  const { canWrite } = data;
  const tyW = useOptimistic(data.thankYou, (v, opId) => actions.saveThankYou(opId, v), { fromResult: (d) => d });
  const ty = tyW.value;
  const setTy = (patch: Partial<LandingSetting["thankYou"]>, message: string) => void tyW.save({ ...tyW.latest.current, ...patch }, message);

  const confW = useOptimistic(data.confirmation, (v, opId) => actions.saveConfirmation(opId, v), { fromResult: (d) => d });
  const [phone, setPhone] = useState(data.confirmation.callerPhone ?? "");
  const [wa, setWa] = useState(data.confirmation.whatsapp ?? "");
  const [hours, setHours] = useState(data.confirmation.withinHours?.toString() ?? "");
  const [confError, setConfError] = useState<string | undefined>();
  const conf = confW.value;
  const dirty = phone.trim() !== (conf.callerPhone ?? "") || wa.trim() !== (conf.whatsapp ?? "") || hours.trim() !== (conf.withinHours?.toString() ?? "");
  const saveConf = async () => {
    const n = hours.trim() === "" ? null : Number(hours);
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 48)) return setConfError(t("landing.after.withinRange"));
    setConfError(undefined);
    const r = await confW.save({ callerPhone: phone.trim() || null, whatsapp: wa.trim() || null, withinHours: n }, t("landing.after.saved.contacts"));
    if (r.ok) {
      setPhone(r.data.callerPhone ?? "");
      setWa(r.data.whatsapp ?? "");
      setHours(r.data.withinHours?.toString() ?? "");
    } else setConfError(r.reason);
  };

  const [templates, setTemplates] = useState(data.templates);
  const [loc, setLoc] = useState<Loc>(data.pageLocale);

  const expectNote = !conf.callerPhone ? t("landing.after.expect.noPhone") : data.windowClosed ? t("landing.after.expect.closed") : null;

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24.375rem]">
      <SettingsSection title={t("landing.after.title")} description={t("landing.after.description")}>
        {!canWrite && <ReadOnly />}
        <div className="grid divide-y divide-border/70">
          <SwitchRow
            label={t("landing.after.confirmWhatsapp")}
            hint={t("landing.after.confirmWhatsappHint")}
            note={ty.confirmWhatsapp && !conf.whatsapp && !data.storeWhatsapp ? t("landing.after.noWhatsapp") : undefined}
            checked={ty.confirmWhatsapp}
            disabled={!canWrite}
            onChange={(v) => setTy({ confirmWhatsapp: v }, t("landing.after.saved.switch"))}
          />
          <SwitchRow
            label={t("landing.after.expectation")}
            hint={t("landing.after.expectationHint")}
            note={ty.expectation ? expectNote : undefined}
            checked={ty.expectation}
            disabled={!canWrite}
            onChange={(v) => setTy({ expectation: v }, t("landing.after.saved.switch"))}
          />
          <SwitchRow
            label={t("landing.after.trackLink")}
            hint={t("landing.after.trackLinkHint")}
            checked={ty.trackLink}
            disabled={!canWrite}
            onChange={(v) => setTy({ trackLink: v }, t("landing.after.saved.switch"))}
          />
        </div>

        <div className="grid gap-4 border-t border-border/70 pt-5">
          <Field label={t("landing.after.callerPhone")} hint={t("landing.after.callerPhoneHint")}>
            {(f) => <TextInput {...f} type="tel" dir="ltr" autoComplete="off" inputMode="tel" value={phone} disabled={!canWrite} onChange={(e) => setPhone(e.target.value)} />}
          </Field>
          <WindowBlock data={data} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={opt(t, t("landing.after.whatsapp"))} hint={data.storeWhatsapp ? t("landing.after.whatsappHintStore") : t("landing.after.whatsappHint")}>
              {(f) => <TextInput {...f} type="tel" dir="ltr" autoComplete="off" inputMode="tel" value={wa} disabled={!canWrite} onChange={(e) => setWa(e.target.value)} />}
            </Field>
            <Field label={opt(t, t("landing.after.within"))} hint={t("landing.after.withinHint")}>
              {(f) => (
                <div className="flex items-center gap-2">
                  <TextInput {...f} inputMode="numeric" className="w-24 text-center tabular-nums" value={hours} disabled={!canWrite} onChange={(e) => setHours(e.target.value)} />
                  <span className="text-sm text-muted-foreground">{t("landing.after.hours")}</span>
                </div>
              )}
            </Field>
          </div>
          {confError && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {confError}
            </p>
          )}
          {canWrite && (
            <div className="flex justify-end">
              <Button type="button" className="h-11 rounded-xl px-4 sm:h-10" disabled={!dirty || confW.pending} onClick={() => void saveConf()}>
                {t("landing.after.saveContacts")}
              </Button>
            </div>
          )}
        </div>

        <TemplateEditor data={data} loc={loc} onLoc={setLoc} canWrite={canWrite} save={actions.saveTemplate} value={data.templates} onSaved={setTemplates} />
      </SettingsSection>

      <div className="xl:sticky xl:top-20">
        <PhonePreview data={data} loc={loc} thankYou={ty} confirmation={conf} template={templates[loc] ?? data.defaults[loc]} />
      </div>
    </div>
  );
}

/** The calling window under the caller phone (read-only until P4's editor is mounted; see the file header). */
function WindowBlock({ data }: { data: AfterOrderData }) {
  const t = useT();
  return (
    <div className="grid gap-2 rounded-xl bg-foreground/[0.025] p-3 ring-1 ring-border/80">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{t("landing.after.window")}</span>
        <Link href={data.callcenterHref} prefetch className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-foreground/80 underline-offset-4 hover:underline sm:min-h-0">
          {t("landing.after.windowEdit")}
          <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
      <p className="text-sm">{data.hoursLine ? <bdi>{data.hoursLine}</bdi> : <span className="text-muted-foreground">{t("landing.after.windowNone")}</span>}</p>
      {!data.windowConfirmed && <p className="text-xs leading-relaxed text-muted-foreground">{t("landing.after.windowStarting")}</p>}
    </div>
  );
}

/** The `customer_confirm` text per locale: chips insert a variable at the cursor; "Use the default" clears the row. */
function TemplateEditor({
  data,
  loc,
  onLoc,
  canWrite,
  save,
  value,
  onSaved,
}: {
  data: AfterOrderData;
  loc: Loc;
  onLoc: (l: Loc) => void;
  canWrite: boolean;
  save: AfterOrderActions["saveTemplate"];
  value: Record<Loc, string | null>;
  onSaved: (v: Record<Loc, string | null>) => void;
}) {
  const t = useT();
  const id = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const [drafts, setDrafts] = useState<Record<Loc, string>>(() => ({ ar: value.ar ?? data.defaults.ar, fr: value.fr ?? data.defaults.fr, en: value.en ?? data.defaults.en }));
  const [error, setError] = useState<string | undefined>();
  const w = useOptimistic(value, (v, opId) => save(opId, loc, v[loc]), { fromResult: (d) => d });
  const draft = drafts[loc];
  // the preview follows the text as it is typed
  useEffect(() => onSaved({ ...w.value, [loc]: draft }), [w.value, draft, loc, onSaved]);
  const stored = w.value[loc] ?? data.defaults[loc];
  const unknown = unknownTemplateVars("customer_confirm", draft);

  const insert = (name: string) => {
    const el = area.current;
    const token = `{${name}}`;
    const at = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? at;
    const next = `${draft.slice(0, at)}${token}${draft.slice(end)}`.slice(0, MAX_TEMPLATE_CHARS);
    setDrafts((d) => ({ ...d, [loc]: next }));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length, at + token.length);
    });
  };
  const commit = async (body: string | null) => {
    if (body && unknownTemplateVars("customer_confirm", body).length) return;
    setError(undefined);
    const r = await w.save({ ...w.latest.current, [loc]: body && body.trim() !== data.defaults[loc] ? body.trim() : null }, t("landing.after.saved.template"));
    if (!r.ok) setError(r.reason);
    else setDrafts((d) => ({ ...d, [loc]: r.data[loc] ?? data.defaults[loc] }));
  };

  return (
    <div className="grid gap-3 border-t border-border/70 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <span id={`${id}-h`} className="text-sm font-medium">
            {t("landing.after.template")}
          </span>
          <span className="text-xs text-muted-foreground">{t("landing.after.templateHint")}</span>
        </div>
        <Segmented value={loc} onChange={onLoc} label={t("landing.after.templateLocale")} size="sm" options={LOCS.map((l) => ({ value: l, label: LOC_LABEL[l] }))} />
      </div>
      {canWrite && (
        <div role="group" aria-label={t("landing.after.chips")} className="flex flex-wrap gap-1.5">
          {TEMPLATE_KIND_VARS.customer_confirm.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => insert(v)}
              className="h-9 rounded-full bg-foreground/[0.05] px-3 font-mono text-xs ring-1 ring-border transition-colors duration-150 ease-out outline-none hover:bg-foreground/[0.08] focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <bdi dir="ltr">{`{${v}}`}</bdi>
            </button>
          ))}
        </div>
      )}
      <label htmlFor={`${id}-t`} className="sr-only">
        {t("landing.after.template")} ({LOC_LABEL[loc]})
      </label>
      <textarea
        id={`${id}-t`}
        ref={area}
        lang={loc}
        dir={loc === "ar" ? "rtl" : "ltr"}
        rows={3}
        maxLength={MAX_TEMPLATE_CHARS}
        value={draft}
        disabled={!canWrite}
        aria-invalid={unknown.length ? true : undefined}
        onChange={(e) => setDrafts((d) => ({ ...d, [loc]: e.target.value }))}
        className="min-h-24 w-full resize-y rounded-xl bg-background px-3 py-2.5 text-sm leading-relaxed ring-1 ring-border outline-none transition-shadow duration-200 focus-visible:ring-2 focus-visible:ring-ring/60 aria-invalid:ring-destructive/60"
      />
      {(unknown.length > 0 || error) && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {unknown.length ? t("landing.after.unknownVars", { vars: unknown.map((u) => `{${u}}`).join(", ") }) : error}
        </p>
      )}
      {canWrite && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {w.value[loc] !== null && (
            <Button type="button" variant="ghost" className="h-11 rounded-xl sm:h-10" onClick={() => void commit(null)}>
              {t("landing.after.useDefault")}
            </Button>
          )}
          <Button type="button" className="h-11 rounded-xl px-4 sm:h-10" disabled={draft.trim() === stored.trim() || unknown.length > 0 || !draft.trim() || w.pending} onClick={() => void commit(draft)}>
            {t("landing.after.saveTemplate")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** A named variable in the preview (never a made-up value). */
const Chip = ({ children }: { children: ReactNode }) => <span className="mx-0.5 inline-flex items-center rounded-md bg-current/10 px-1.5 text-[0.8em] font-medium">{children}</span>;

function withChips(text: string, names: Record<string, string>): ReactNode[] {
  return text.split(/(\{\w+\})/g).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    return m && names[m[1]!] ? <Chip key={i}>{names[m[1]!]}</Chip> : <span key={i}>{part}</span>;
  });
}

/** The thank-you hero at 390 px in the chosen language, from the page's own copy and `callWhen`. */
function PhonePreview({ data, loc, thankYou, confirmation, template }: { data: AfterOrderData; loc: Loc; thankYou: LandingSetting["thankYou"]; confirmation: Confirmation; template: string }) {
  const t = useT();
  const now = useNow();
  const shopper = useMemo(() => createT(loc), [loc]);
  const c = TY[loc];
  const names: Record<string, string> = { name: t("landing.after.var.name"), order_id: t("landing.after.var.order_id"), offer: t("landing.after.var.offer"), total: t("landing.after.var.total") };
  const when = useMemo(() => {
    if (!now || !data.windowConfirmed) return null;
    const within = confirmation.withinHours ? plural(c.whenWithin, confirmation.withinHours, loc) : c.whenNow;
    return callWhen(now, data.window, { within, laterToday: c.whenToday, tomorrow: c.whenTomorrow, nextDay: c.whenDay }, loc);
  }, [now, data.windowConfirmed, data.window, confirmation.withinHours, c, loc]);
  const wa = confirmation.whatsapp ?? data.storeWhatsapp;
  const phone = confirmation.callerPhone;
  const expect = thankYou.expectation && phone ? (when ? c.expect.replace("{when}", when) : c.expectPlain) : null;

  return (
    <figure className="grid gap-2">
      <figcaption className="px-1 text-xs font-medium text-muted-foreground">{t("landing.after.preview")}</figcaption>
      <div className="mx-auto w-full max-w-[24.375rem] overflow-hidden rounded-[2rem] bg-card p-2 ring-1 ring-border shadow-[0_24px_60px_-36px_rgb(0_0_0/0.45)]">
        <div lang={loc} dir={loc === "ar" ? "rtl" : "ltr"} className="relative grid gap-4 overflow-hidden rounded-[1.6rem] bg-background px-5 pt-8 pb-6">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklab,var(--brand)_12%,transparent),transparent)]" />
          <span className="relative mx-auto flex size-14 items-center justify-center rounded-full bg-brand/10 text-brand ring-1 ring-brand/25">
            <CheckIcon aria-hidden="true" className="size-7" strokeWidth={2.4} />
          </span>
          <p className="relative mx-auto rounded-full bg-card px-3 py-1 text-xs ring-1 ring-border">{withChips("{order_id}", names)}</p>
          <h3 className="relative text-center text-xl leading-snug font-semibold tracking-[-0.01em] text-balance">{withChips(shopper("thanks.title"), names)}</h3>
          {expect && phone && (
            <p className="relative text-center text-sm leading-relaxed text-pretty text-muted-foreground">
              {expect.split("{phone}").map((part, i, all) => (
                <span key={i}>
                  {part}
                  {i < all.length - 1 && <bdi dir="ltr" className="font-medium text-foreground tabular-nums">{phone}</bdi>}
                </span>
              ))}
            </p>
          )}
          <div className="relative flex flex-wrap justify-center gap-2">
            {thankYou.confirmWhatsapp && wa && (
              <span className="inline-flex h-10 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-medium text-background">
                <MessageCircleIcon aria-hidden="true" className="size-4" />
                {c.confirm}
              </span>
            )}
            {thankYou.trackLink && (
              <span className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium ring-1 ring-border">
                <PackageSearchIcon aria-hidden="true" className="size-4" />
                {c.track}
              </span>
            )}
          </div>
          {thankYou.confirmWhatsapp && wa && (
            <div className="relative grid gap-1 rounded-2xl bg-foreground/[0.04] p-3 text-xs leading-relaxed">
              <span className="font-medium text-muted-foreground" lang={undefined}>
                {t("landing.after.previewMessage")}
              </span>
              <p>{withChips(template, names)}</p>
            </div>
          )}
        </div>
      </div>
      {!data.windowConfirmed && thankYou.expectation && phone && <p className="px-1 text-xs leading-relaxed text-muted-foreground">{t("landing.after.previewNoWhen")}</p>}
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* checkout options                                                    */
/* ------------------------------------------------------------------ */

export interface CheckoutOptionsActions {
  saveCheckout: (opId: string, patch: Partial<AfterOrderData["checkout"]>) => Promise<ActionResult<AfterOrderData["checkout"]>>;
  saveLanding: (opId: string, patch: Partial<AfterOrderData["landing"]>) => Promise<ActionResult<AfterOrderData["landing"]>>;
}

function OptionRow({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
      <div className="grid gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs leading-relaxed text-muted-foreground">{hint}</span>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function CheckoutOptionsCard({ data, actions }: { data: AfterOrderData; actions: CheckoutOptionsActions }) {
  const t = useT();
  const coW = useOptimistic(data.checkout, (v, opId) => actions.saveCheckout(opId, v), { fromResult: (d) => d });
  const laW = useOptimistic(data.landing, (v, opId) => actions.saveLanding(opId, v), { fromResult: (d) => d });
  const co = coW.value;
  const la = laW.value;
  const setCo = (patch: Partial<AfterOrderData["checkout"]>) => void coW.save({ ...coW.latest.current, ...patch }, t("landing.opts.saved"));
  const setLa = (patch: Partial<AfterOrderData["landing"]>) => void laW.save({ ...laW.latest.current, ...patch }, t("landing.opts.saved"));
  const canCo = data.canWriteCheckout;
  const switchCtl = (checked: boolean, can: boolean, on: (v: boolean) => void, label: string) => <Switch aria-label={label} checked={checked} disabled={!can} onCheckedChange={on} />;
  const seg = <V extends string>(value: V, options: { value: V; label: string }[], on: (v: V) => void, label: string, can: boolean) =>
    can ? <Segmented value={value} onChange={on} label={label} size="sm" options={options} /> : <span className="text-sm text-muted-foreground">{options.find((o) => o.value === value)?.label}</span>;

  return (
    <SettingsSection title={t("landing.opts.title")} description={t("landing.opts.description")}>
      <div className={cn("grid divide-y divide-border/70")}>
        <OptionRow label={t("landing.opts.address")} hint={t("landing.opts.addressHint")}>
          {seg(
            co.addressMode ?? "default",
            [
              { value: "default", label: t("landing.opts.marketDefault") },
              { value: "required", label: t("landing.opts.required") },
              { value: "optional", label: t("landing.opts.optional") },
            ],
            (v) => setCo({ addressMode: v === "default" ? null : v }),
            t("landing.opts.address"),
            canCo,
          )}
        </OptionRow>
        <OptionRow label={t("landing.opts.newCity")} hint={t("landing.opts.newHint")}>
          {seg(
            co.newPageForm.city ?? "select",
            [
              { value: "select", label: t("landing.opts.city.select") },
              { value: "text", label: t("landing.opts.city.text") },
              { value: "hidden", label: t("landing.opts.hidden") },
            ],
            (v) => setCo({ newPageForm: { ...co.newPageForm, city: v } }),
            t("landing.opts.newCity"),
            canCo,
          )}
        </OptionRow>
        <OptionRow label={t("landing.opts.newNote")}>
          {seg(
            co.newPageForm.note ?? "optional",
            [
              { value: "optional", label: t("landing.opts.optional") },
              { value: "hidden", label: t("landing.opts.hidden") },
            ],
            (v) => setCo({ newPageForm: { ...co.newPageForm, note: v } }),
            t("landing.opts.newNote"),
            canCo,
          )}
        </OptionRow>
        <OptionRow label={t("landing.opts.notServed")} hint={t("landing.opts.notServedHint")}>
          {switchCtl(co.notServedWhatsapp, canCo, (v) => setCo({ notServedWhatsapp: v }), t("landing.opts.notServed"))}
        </OptionRow>
        <OptionRow label={t("landing.opts.call")} hint={t("landing.opts.callHint")}>
          {switchCtl(co.confirmationCall, canCo, (v) => setCo({ confirmationCall: v }), t("landing.opts.call"))}
        </OptionRow>
        <OptionRow label={t("landing.opts.leads")} hint={data.euMarket ? t("landing.opts.leadsEu") : t("landing.opts.leadsHint")}>
          {data.euMarket ? (
            <span className="text-sm text-muted-foreground">{t("landing.opts.leadsEuOff")}</span>
          ) : (
            seg(
              la.leadsCapture,
              [
                { value: "market_default", label: t("landing.opts.marketDefault") },
                { value: "on", label: t("landing.opts.on") },
                { value: "off", label: t("landing.opts.off") },
              ],
              (v) => setLa({ leadsCapture: v }),
              t("landing.opts.leads"),
              data.canWrite,
            )
          )}
        </OptionRow>
        <OptionRow label={t("landing.opts.requests")} hint={t("landing.opts.requestsHint")}>
          {switchCtl(la.trackingRequests, data.canWrite, (v) => setLa({ trackingRequests: v }), t("landing.opts.requests"))}
        </OptionRow>
      </div>
    </SettingsSection>
  );
}

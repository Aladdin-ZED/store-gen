"use client";
/**
 * Settings → Policies (landing.md LAN-§3.3; docs/STORE-SAAS.md §I.8, D76): one column of cards, each a plain question
 * with honest answers and "Not set" as a real state, never a default promise. The answers feed the legal pages, the
 * thank-you steps, the FAQ defaults and the AI guard; an unset answer never produces a sentence anywhere.
 *
 * One save for the whole key (a solid footer, never glass), optimistic with Undo; a protected brand term in any text
 * refuses the save and names the field inline. `?card=<claim>&value=<n>` opens a card with the number prefilled, to
 * be reviewed and saved by the owner. The contact card's hours line is read-only: the window is edited in "After the
 * order".
 */
import { PlusIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/admin/client";
import type { StorePolicyFacts } from "@/lib/settings/keys/policies";
import { cn } from "@/lib/utils";
import { Segmented } from "../common/segmented";
import type { ActionResult } from "../lib/action-result";
import { opt, ReadOnly } from "../landing/read-only";
import { useOptimistic } from "../landing/optimistic";
import { Field, SettingsSection, TextInput } from "../settings/form-kit";

type Facts = StorePolicyFacts;
type Input = Omit<Facts, "v" | "reviewedAt">;
type Loc = "ar" | "fr" | "en";
type LocText = Partial<Record<Loc, string>>;
type SaveResult = { status: "saved"; facts: Facts } | { status: "brand_protected"; field: string };

export interface PolicyPrefill {
  claim: "delivery_time" | "free_delivery" | "return_window" | "exchange" | "inspection" | "warranty" | "refund";
  value: number | null;
}

const LOCS: readonly Loc[] = ["ar", "fr", "en"];
const LINE_MAX = 140;
const MAX_LINES = 6;
const CARD_OF: Record<PolicyPrefill["claim"], string> = {
  delivery_time: "delivery",
  free_delivery: "delivery",
  return_window: "returns",
  exchange: "returns",
  inspection: "inspection",
  warranty: "warranty",
  refund: "refund",
};

const toInput = (f: Facts): Input => {
  const rest: Partial<Facts> = { ...f };
  delete rest.v;
  delete rest.reviewedAt;
  return rest as Input;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const intOrNull = (s: string, min: number, max: number): number | null | "bad" => {
  const v = s.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : "bad";
};

function applyPrefill(f: Input, p: PolicyPrefill | null): Input {
  if (!p || p.value === null) return f;
  const n = Math.round(p.value);
  switch (p.claim) {
    case "return_window":
      return n >= 1 && n <= 90 ? { ...f, returns: { ...f.returns, accepted: true, windowDays: n } } : f;
    case "exchange":
      return n >= 1 && n <= 90 ? { ...f, exchange: { accepted: true, windowDays: n } } : f;
    case "warranty":
      return n >= 1 && n <= 120 ? { ...f, warranty: { ...f.warranty, months: n } } : f;
    case "refund":
      return n >= 1 && n <= 60 ? { ...f, refund: { ...f.refund, withinDays: n } } : f;
    case "free_delivery":
      return { ...f, delivery: { ...f.delivery, freeFromCents: Math.round(p.value * 100) } };
    case "delivery_time":
      return n >= 0 && n <= 30 ? { ...f, delivery: { ...f.delivery, typicalDays: [f.delivery.typicalDays?.[0] ?? n, Math.max(n, f.delivery.typicalDays?.[0] ?? n)] } } : f;
    default:
      return f;
  }
}

export function PoliciesEditor({
  initial,
  canWrite,
  market,
  currency,
  zonesEnabled,
  hours,
  links,
  prefill,
  save,
}: {
  initial: Facts;
  canWrite: boolean;
  market: string;
  currency: string;
  zonesEnabled: boolean;
  hours: { text: string; shown: boolean };
  links: { afterOrder: string; delivery: string };
  prefill: PolicyPrefill | null;
  save: (opId: string, input: Input) => Promise<ActionResult<SaveResult>>;
}) {
  const t = useT();
  const [refused, setRefused] = useState<string | null>(null);
  const saved = useOptimistic<Input, SaveResult>(toInput(initial), (v, opId) => save(opId, v), {
    fromResult: (d, sent) => (d.status === "saved" ? toInput(d.facts) : sent),
    reject: (d) => {
      if (d.status !== "brand_protected") return null;
      setRefused(d.field);
      return t("landing.pol.brandRefused");
    },
  });
  const [form, setForm] = useState<Input>(() => applyPrefill(toInput(initial), prefill));
  const [reviewedAt, setReviewedAt] = useState(initial.reviewedAt);
  const dirty = !same(form, saved.value);
  const set = (patch: Partial<Input>) => setForm((f) => ({ ...f, ...patch }));

  const focusCard = prefill ? CARD_OF[prefill.claim] : null;
  useEffect(() => {
    if (focusCard) document.getElementById(`policy-${focusCard}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [focusCard]);

  const onSave = async () => {
    setRefused(null);
    const r = await saved.save(form, t("landing.pol.saved"));
    if (r.ok && r.data.status === "saved") {
      setForm(toInput(r.data.facts));
      setReviewedAt(r.data.facts.reviewedAt);
    }
  };

  const triState = (v: boolean | null) => (v === null ? "unset" : v ? "yes" : "no");
  const fromTri = (v: string) => (v === "unset" ? null : v === "yes");
  const yesNo = [
    { value: "yes", label: t("landing.pol.yes") },
    { value: "no", label: t("landing.pol.no") },
    { value: "unset", label: t("landing.pol.unset") },
  ];
  const card = (id: string) => ({ id: `policy-${id}`, className: cn("scroll-mt-24", focusCard === id && "ring-2 ring-foreground/25") });
  const ro = !canWrite;

  return (
    <div className="grid gap-5 pb-24">
      {ro && <ReadOnly />}
      {prefill && <p className="rounded-2xl bg-foreground/[0.04] px-4 py-3 text-sm ring-1 ring-border">{t("landing.pol.prefilled")}</p>}

      <SettingsSection {...card("inspection")} title={t("landing.pol.inspection.q")} description={t("landing.pol.inspection.d")}>
        <Choice value={form.inspection === "allowed" ? "yes" : form.inspection === "not_allowed" ? "no" : "unset"} options={yesNo} label={t("landing.pol.inspection.q")} disabled={ro} onChange={(v) => set({ inspection: v === "yes" ? "allowed" : v === "no" ? "not_allowed" : "unset" })} />
      </SettingsSection>

      <SettingsSection {...card("delivery")} title={t("landing.pol.delivery.q")} description={t("landing.pol.delivery.d")}>
        <Choice
          value={form.delivery.coverage}
          options={[
            { value: "national", label: t("landing.pol.delivery.national") },
            { value: "listed_zones", label: t("landing.pol.delivery.zones") },
            { value: "unset", label: t("landing.pol.unset") },
          ]}
          label={t("landing.pol.delivery.q")}
          disabled={ro}
          onChange={(v) => set({ delivery: { ...form.delivery, coverage: v as Input["delivery"]["coverage"] } })}
        />
        {zonesEnabled ? (
          <p className="text-sm text-muted-foreground">
            {t("landing.pol.delivery.zonesOn")}{" "}
            <Link href={links.delivery} prefetch className="font-medium text-foreground underline-offset-4 hover:underline">
              {t("landing.pol.delivery.zonesLink")}
            </Link>
          </p>
        ) : (
          <DaysPair label={t("landing.pol.delivery.typical")} hint={t("landing.pol.delivery.typicalHint")} value={form.delivery.typicalDays} max={30} disabled={ro} onChange={(typicalDays) => set({ delivery: { ...form.delivery, typicalDays } })} />
        )}
        <MoneyField
          label={opt(t, t("landing.pol.delivery.freeFrom", { currency }))}
          hint={t("landing.pol.delivery.freeFromHint")}
          cents={form.delivery.freeFromCents}
          disabled={ro}
          onChange={(freeFromCents) => set({ delivery: { ...form.delivery, freeFromCents } })}
        />
      </SettingsSection>

      <SettingsSection {...card("returns")} title={t("landing.pol.returns.q")} description={t("landing.pol.returns.d")}>
        <Choice value={triState(form.returns.accepted)} options={yesNo} label={t("landing.pol.returns.q")} disabled={ro} onChange={(v) => set({ returns: { ...form.returns, accepted: fromTri(v) } })} />
        {form.returns.accepted && (
          <div className="grid gap-4">
            <NumberField label={t("landing.pol.returns.window")} unit={t("landing.pol.days")} value={form.returns.windowDays} min={1} max={90} disabled={ro} onChange={(windowDays) => set({ returns: { ...form.returns, windowDays } })} />
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">{t("landing.pol.returns.whoPays")}</span>
              <Choice
                value={form.returns.whoPays}
                options={[
                  { value: "store", label: t("landing.pol.returns.store") },
                  { value: "customer", label: t("landing.pol.returns.customer") },
                  { value: "unset", label: t("landing.pol.unset") },
                ]}
                label={t("landing.pol.returns.whoPays")}
                disabled={ro}
                onChange={(v) => set({ returns: { ...form.returns, whoPays: v as Input["returns"]["whoPays"] } })}
              />
            </div>
            <LocTextField label={t("landing.pol.returns.condition")} value={form.returns.condition} disabled={ro} refused={refused?.startsWith("returns.condition") ? refused : null} onChange={(condition) => set({ returns: { ...form.returns, condition } })} />
          </div>
        )}
        <div className="grid gap-3 border-t border-border/70 pt-4">
          <span className="text-sm font-medium">{t("landing.pol.exchange.q")}</span>
          <Choice value={triState(form.exchange.accepted)} options={yesNo} label={t("landing.pol.exchange.q")} disabled={ro} onChange={(v) => set({ exchange: { ...form.exchange, accepted: fromTri(v) } })} />
          {form.exchange.accepted && <NumberField label={t("landing.pol.exchange.window")} unit={t("landing.pol.days")} value={form.exchange.windowDays} min={1} max={90} disabled={ro} onChange={(windowDays) => set({ exchange: { ...form.exchange, windowDays } })} />}
        </div>
        {market === "MA" && <p className="rounded-xl bg-foreground/[0.03] px-3 py-2.5 text-xs leading-relaxed text-muted-foreground ring-1 ring-border/70">{t("landing.pol.returns.morocco")}</p>}
      </SettingsSection>

      <SettingsSection {...card("refund")} title={t("landing.pol.refund.q")} description={t("landing.pol.refund.d")}>
        <Choice
          value={form.refund.method}
          options={[
            { value: "cash", label: t("landing.pol.refund.cash") },
            { value: "transfer", label: t("landing.pol.refund.transfer") },
            { value: "store_credit", label: t("landing.pol.refund.credit") },
            { value: "unset", label: t("landing.pol.unset") },
          ]}
          label={t("landing.pol.refund.q")}
          disabled={ro}
          onChange={(v) => set({ refund: { ...form.refund, method: v as Input["refund"]["method"] } })}
        />
        {form.refund.method !== "unset" && <NumberField label={opt(t, t("landing.pol.refund.within"))} unit={t("landing.pol.days")} value={form.refund.withinDays} min={1} max={60} disabled={ro} onChange={(withinDays) => set({ refund: { ...form.refund, withinDays } })} />}
      </SettingsSection>

      <SettingsSection {...card("warranty")} title={t("landing.pol.warranty.q")} description={t("landing.pol.warranty.d")}>
        <NumberField label={t("landing.pol.warranty.months")} hint={t("landing.pol.warranty.monthsHint")} unit={t("landing.pol.months")} value={form.warranty.months} min={1} max={120} disabled={ro} onChange={(months) => set({ warranty: { ...form.warranty, months } })} />
        {form.warranty.months !== null && <LocTextField label={opt(t, t("landing.pol.warranty.text"))} value={form.warranty.text} disabled={ro} refused={refused?.startsWith("warranty.text") ? refused : null} onChange={(text) => set({ warranty: { ...form.warranty, text } })} />}
      </SettingsSection>

      <SettingsSection {...card("contact")} title={t("landing.pol.contact.q")} description={t("landing.pol.contact.d")}>
        <div role="group" aria-label={t("landing.pol.contact.q")} className="flex flex-wrap gap-1.5">
          {(["phone", "whatsapp", "email"] as const).map((ch) => {
            const on = form.contact.channels.includes(ch);
            return (
              <button
                key={ch}
                type="button"
                aria-pressed={on}
                disabled={ro}
                onClick={() => set({ contact: { channels: on ? form.contact.channels.filter((c) => c !== ch) : [...form.contact.channels, ch] } })}
                className={cn(
                  "h-11 rounded-xl px-4 text-sm ring-1 transition-colors duration-200 ease-out outline-none ring-inset focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-default sm:h-10",
                  on ? "bg-foreground font-medium text-background ring-foreground" : "text-muted-foreground ring-border hover:text-foreground",
                )}
              >
                {t(`landing.pol.contact.${ch}`)}
              </button>
            );
          })}
        </div>
        <p className="text-sm">
          {hours.shown ? (
            <>
              <span className="text-muted-foreground">{t("landing.pol.contact.hours")} </span>
              <bdi>{hours.text}</bdi>
              <span className="text-muted-foreground"> · </span>
            </>
          ) : (
            <span className="text-muted-foreground">{t("landing.pol.contact.starting")} · </span>
          )}
          <Link href={links.afterOrder} prefetch className="font-medium underline-offset-4 hover:underline">
            {hours.shown ? t("landing.pol.contact.edit") : t("landing.pol.contact.confirm")}
          </Link>
        </p>
      </SettingsSection>

      <SettingsSection {...card("extras")} title={t("landing.pol.extras.q")} description={t("landing.pol.extras.d")}>
        {form.extras.length === 0 && <p className="text-sm text-muted-foreground">{t("landing.pol.extras.none")}</p>}
        <ol className="grid gap-4">
          {form.extras.map((e, i) => (
            <li key={e.id} className="grid gap-3 rounded-xl p-3 ring-1 ring-border">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{t("landing.pol.extras.line", { n: i + 1 })}</span>
                {!ro && (
                  <Button type="button" variant="ghost" size="sm" className="h-11 gap-1.5 rounded-lg text-muted-foreground sm:h-9" onClick={() => set({ extras: form.extras.filter((x) => x.id !== e.id) })}>
                    <Trash2Icon aria-hidden="true" className="size-4" />
                    {t("landing.pol.extras.remove")}
                  </Button>
                )}
              </div>
              <LocTextField
                label={t("landing.pol.extras.text")}
                value={e.text}
                disabled={ro}
                refused={refused?.startsWith(`extras.${i}.`) ? refused : null}
                onChange={(text) => set({ extras: form.extras.map((x) => (x.id === e.id ? { ...x, text } : x)) })}
              />
            </li>
          ))}
        </ol>
        {!ro && form.extras.length < MAX_LINES && (
          <Button type="button" variant="outline" className="h-11 w-fit gap-1.5 rounded-xl sm:h-10" onClick={() => set({ extras: [...form.extras, { id: `l-${Date.now().toString(36)}`, text: {} }] })}>
            <PlusIcon aria-hidden="true" className="size-4" />
            {t("landing.pol.extras.add")}
          </Button>
        )}
      </SettingsSection>

      {canWrite && (
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 ring-1 ring-border shadow-[0_18px_40px_-24px_rgb(0_0_0/0.4)]">
          <div className="grid min-w-0 gap-0.5 text-sm">
            {refused ? (
              <span role="alert" className="font-medium text-destructive">
                {t("landing.pol.brandRefused")}
              </span>
            ) : (
              <span className={dirty ? "font-medium" : "text-muted-foreground"}>{dirty ? t("landing.pol.unsaved") : reviewedAt ? t("landing.pol.reviewed", { date: reviewedAt.slice(0, 10) }) : t("landing.pol.never")}</span>
            )}
          </div>
          <div className="flex gap-2">
            {dirty && (
              <Button type="button" variant="ghost" className="h-11 rounded-xl sm:h-10" onClick={() => setForm(saved.value)}>
                {t("landing.pol.discard")}
              </Button>
            )}
            <Button type="button" className="h-11 rounded-xl px-5 sm:h-10" disabled={!dirty || saved.pending} onClick={() => void onSave()}>
              {t("landing.pol.save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Choice({ value, options, label, disabled, onChange }: { value: string; options: { value: string; label: string }[]; label: string; disabled: boolean; onChange: (v: string) => void }) {
  if (disabled) return <p className="text-sm font-medium">{options.find((o) => o.value === value)?.label}</p>;
  return (
    <div className="-mx-1 overflow-x-auto px-1 adm-scroll">
      <Segmented value={value} onChange={onChange} options={options} label={label} />
    </div>
  );
}

function NumberField({ label, hint, unit, value, min, max, disabled, onChange }: { label: ReactNode; hint?: string; unit: string; value: number | null; min: number; max: number; disabled: boolean; onChange: (v: number | null) => void }) {
  const t = useT();
  const [text, setText] = useState(value?.toString() ?? "");
  const [error, setError] = useState<string | undefined>();
  // a new value from outside (a save, a reset) replaces the text being shown
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setText(value?.toString() ?? "");
  }
  const commit = (s: string) => {
    setText(s);
    const n = intOrNull(s, min, max);
    if (n === "bad") return setError(t("landing.pol.range", { min, max }));
    setError(undefined);
    setLast(n);
    onChange(n);
  };
  return (
    <Field label={label} hint={hint ?? t("landing.pol.emptyUnset")} error={error}>
      {(f) => (
        <div className="flex items-center gap-2">
          <TextInput {...f} inputMode="numeric" className="w-24 text-center tabular-nums" value={text} disabled={disabled} onChange={(e) => commit(e.target.value)} />
          <span className="text-sm text-muted-foreground">{unit}</span>
        </div>
      )}
    </Field>
  );
}

function DaysPair({ label, hint, value, max, disabled, onChange }: { label: string; hint: string; value: [number, number] | null; max: number; disabled: boolean; onChange: (v: [number, number] | null) => void }) {
  const t = useT();
  const [a, setA] = useState(value?.[0]?.toString() ?? "");
  const [b, setB] = useState(value?.[1]?.toString() ?? "");
  const [error, setError] = useState<string | undefined>();
  const commit = (na: string, nb: string) => {
    setA(na);
    setB(nb);
    const x = intOrNull(na, 0, max);
    const y = intOrNull(nb, 0, max);
    if (x === "bad" || y === "bad") return setError(t("landing.pol.range", { min: 0, max }));
    if ((x === null) !== (y === null)) return setError(t("landing.dz.form.daysBoth"));
    if (x !== null && y !== null && x > y) return setError(t("landing.dz.form.daysOrder"));
    setError(undefined);
    onChange(x === null || y === null ? null : [x, y]);
  };
  return (
    <Field label={label} hint={hint} error={error}>
      {(f) => (
        <div className="flex items-center gap-2">
          <TextInput {...f} inputMode="numeric" aria-label={t("landing.dz.form.daysMin")} className="w-20 text-center tabular-nums" value={a} disabled={disabled} onChange={(e) => commit(e.target.value, b)} />
          <span className="text-sm text-muted-foreground">{t("landing.dz.form.to")}</span>
          <TextInput inputMode="numeric" aria-label={t("landing.dz.form.daysMax")} className="w-20 text-center tabular-nums" value={b} disabled={disabled} onChange={(e) => commit(a, e.target.value)} />
          <span className="text-sm text-muted-foreground">{t("landing.pol.days")}</span>
        </div>
      )}
    </Field>
  );
}

function MoneyField({ label, hint, cents, disabled, onChange }: { label: ReactNode; hint: string; cents: number | null; disabled: boolean; onChange: (v: number | null) => void }) {
  const t = useT();
  const [text, setText] = useState(cents === null ? "" : String(cents / 100));
  const [error, setError] = useState<string | undefined>();
  const commit = (s: string) => {
    setText(s);
    const v = s.trim().replace(",", ".");
    if (!v) {
      setError(undefined);
      return onChange(null);
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return setError(t("landing.dz.form.money"));
    setError(undefined);
    onChange(Math.round(n * 100));
  };
  return (
    <Field label={label} hint={hint} error={error}>
      {(f) => <TextInput {...f} inputMode="decimal" dir="ltr" className="w-40 tabular-nums" value={text} disabled={disabled} onChange={(e) => commit(e.target.value)} />}
    </Field>
  );
}

function LocTextField({ label, value, disabled, refused, onChange }: { label: ReactNode; value: LocText | undefined; disabled: boolean; refused: string | null; onChange: (v: LocText) => void }) {
  const t = useT();
  const id = useId();
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      {LOCS.map((l) => {
        const v = value?.[l] ?? "";
        const bad = refused?.endsWith(`.${l}`) ?? false;
        return (
          <div key={l} className="grid gap-1">
            <label htmlFor={`${id}-${l}`} className="flex items-baseline justify-between text-xs text-muted-foreground">
              <span>{t(`landing.pol.loc.${l}`)}</span>
              <span className="tabular-nums">
                {v.length}/{LINE_MAX}
              </span>
            </label>
            <TextInput
              id={`${id}-${l}`}
              lang={l}
              dir={l === "ar" ? "rtl" : "ltr"}
              maxLength={LINE_MAX}
              value={v}
              disabled={disabled}
              aria-invalid={bad || undefined}
              className={cn(bad && "ring-2 ring-destructive/50")}
              onChange={(e) => {
                const next = { ...(value ?? {}) };
                const text = e.target.value.slice(0, LINE_MAX);
                if (text) next[l] = text;
                else delete next[l];
                onChange(next);
              }}
            />
            {bad && (
              <p role="alert" className="text-xs font-medium text-destructive">
                {t("landing.pol.brandField")}
              </p>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}

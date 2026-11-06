"use client";
/**
 * The Costs tab of `/finance` (P4 CALL CENTER; operations.md OPE-§16.2, OD52, OPS-13, OPS-24; SF-04).
 *
 *   Costs by SKU     first: one cost per warehouse code, inherited by every item carrying it on any page
 *   pages            per live page its items: a unit cost (pre-filled from the SKU: "From SKU ARG-250, 38.00") and
 *                    optional per-option costs (the option codes joined)
 *   packaging        per order (`accounting.packagingCents`)
 *   My carrier       "Who holds the cash after delivery?" first (at delivery / on a statement, OD52), then the
 *                    default delivery and return fee for every other city (with the COD fee), then the per-city rows
 *                    with fee charged (median of the city's delivered orders, 28 d) and fee paid side by side
 *
 * Each field saves on its own (blur or Enter) through a `finance.write` action; every change is a new dated row, so the
 * history is kept server-side. A viewer without `finance.write` sees the same values read-only.
 */
import { CheckIcon, Loader2Icon, PackageIcon, PlusIcon, TruckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { saveCarrierRateAction, saveItemCostAction, savePackagingAction, saveSettlementAction, saveSkuCostAction } from "@/app/app/[store]/finance/actions";
import { Button } from "@/components/ui/button";
import type { CarrierRateRow } from "@/lib/finance/lite/breakeven";
import type { CostItemLine, CostsOverview } from "@/lib/finance/lite/costs.server";
import type { CarrierView } from "@/lib/finance/lite/view.server";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cityLabel, type CityKey } from "@/lib/orders/address";
import { cn } from "@/lib/utils";
import { CityPicker, Section } from "../callcenter/parts";
import { settle } from "../orders/ops-ui";
import { money, num } from "../queue/time";
import { centsText, MoneyInput, parseAmount } from "./money-input";

const MAX_CENTS = 100_000_000;

/** One action call → a toast; true when saved (the field keeps the value), false to roll the field back. */
function useSaver() {
  const t = useT();
  const router = useRouter();
  return async (p: Promise<unknown>): Promise<boolean> => {
    const res = await settle(p);
    if (!res.ok) {
      toast.error(t(res.error === "feature_off" || res.error === "not_found" || res.error === "invalid" ? `fin.error.${res.error}` : res.error === "forbidden" || res.error === "network" ? `ops.error.${res.error}` : "ops.error.generic"));
      return false;
    }
    toast.success(t("fin.saved"));
    router.refresh();
    return true;
  };
}

export function CostsTab({ costs, carrier, canWrite }: { costs: CostsOverview; carrier: CarrierView; canWrite: boolean }) {
  const t = useT();
  const locale = useAdminLocale();
  const save = useSaver();
  const cur = costs.currency;
  return (
    <div className="grid gap-5">
      <Section id="fin-sku" title={t("fin.costs.bySku")} hint={t("fin.costs.bySku.hint")}>
        {costs.skus.length === 0 ? (
          <p className="q-sm rounded-[12px] border border-dashed border-border px-3.5 py-3 text-muted-foreground">{t("fin.costs.noSku")}</p>
        ) : (
          <ul className="grid divide-y divide-border/70">
            {costs.skus.map((s) => (
              <li key={s.sku} className="flex items-center gap-3 py-2.5">
                <span className="q-sm min-w-0 flex-1 truncate font-mono text-foreground" dir="ltr">
                  {s.sku}
                </span>
                <span className="q-xs q-num hidden text-muted-foreground sm:inline">{t("fin.costs.items", { n: s.items })}</span>
                {s.costCents === null && <span className="q-2xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{t("fin.costs.notSet")}</span>}
                <MoneyInput cents={s.costCents} nullable={false} disabled={!canWrite} max={MAX_CENTS} label={t("fin.costs.skuCost", { sku: s.sku })} suffix={cur} className="w-36" onCommit={(c) => save(saveSkuCostAction({ sku: s.sku, costCents: c }))} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="fin-pages" title={t("fin.costs.pages")} hint={t("fin.costs.pages.hint")}>
        {costs.pages.length === 0 ? (
          <p className="q-sm rounded-[12px] border border-dashed border-border px-3.5 py-3 text-muted-foreground">{t("fin.costs.noPages")}</p>
        ) : (
          <div className="grid gap-3">
            {costs.pages.map((p) => (
              <div key={p.pageId} className="grid gap-1 rounded-[14px] border border-border bg-background p-3 sm:p-4">
                <h3 className="q-sm font-semibold text-foreground">{p.name}</h3>
                <ul className="grid divide-y divide-border/70">
                  {p.items.map((it) => (
                    <ItemRow key={it.itemId} pageId={p.pageId} item={it} currency={cur} canWrite={canWrite} save={save} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section id="fin-pack" title={t("fin.costs.packaging")} hint={t("fin.costs.packaging.hint")}>
        <div className="flex items-center gap-3">
          <PackageIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          <MoneyInput cents={costs.packagingCents} disabled={!canWrite} max={10_000_000} label={t("fin.costs.packaging")} placeholder={t("fin.costs.notSet")} suffix={cur} className="w-40" onCommit={(c) => save(savePackagingAction({ packagingCents: c }))} />
        </div>
      </Section>

      <Carrier carrier={carrier} currency={cur} canWrite={canWrite} save={save} locale={locale} />
    </div>
  );
}

function ItemRow({ pageId, item, currency, canWrite, save }: { pageId: string; item: CostItemLine; currency: string; canWrite: boolean; save: (p: Promise<unknown>) => Promise<boolean> }) {
  const t = useT();
  const locale = useAdminLocale();
  const [adding, setAdding] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const amount = parseAmount(text);
  async function addVariant() {
    if (!codes.length || typeof amount !== "number") return;
    setBusy(true);
    const ok = await save(saveItemCostAction({ pageId, itemId: item.itemId, codes, costCents: amount }));
    setBusy(false);
    if (ok) {
      setAdding(false);
      setCodes([]);
      setText("");
    }
  }
  return (
    <li className="grid gap-2 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="q-sm min-w-0 flex-1 text-foreground">{item.name}</span>
        {item.sku && (
          <span className="q-2xs rounded-full bg-muted px-2 py-0.5 font-mono text-muted-foreground" dir="ltr">
            {item.sku}
          </span>
        )}
        <MoneyInput
          cents={item.costCents}
          nullable={false}
          disabled={!canWrite}
          max={MAX_CENTS}
          label={t("fin.costs.itemCost", { item: item.name })}
          placeholder={item.fromSkuCents !== null ? centsText(item.fromSkuCents) : t("fin.costs.notSet")}
          suffix={currency}
          className="w-36"
          onCommit={(c) => save(saveItemCostAction({ pageId, itemId: item.itemId, costCents: c }))}
        />
      </div>
      {item.costCents === null && item.fromSkuCents !== null && item.sku && (
        <p className="q-xs q-num text-muted-foreground">{t("fin.costs.fromSku", { sku: item.sku, cost: money(item.fromSkuCents, currency, locale) })}</p>
      )}
      {item.variants.length > 0 && (
        <ul className="grid gap-1.5 ps-3">
          {item.variants.map((v) => (
            <li key={v.variantKey} className="flex items-center gap-3">
              <span className="q-xs min-w-0 flex-1 truncate font-mono text-muted-foreground" dir="ltr">
                {v.variantKey.split("|").join(" + ")}
              </span>
              <MoneyInput
                cents={v.costCents}
                nullable={false}
                disabled={!canWrite}
                max={MAX_CENTS}
                label={t("fin.costs.optionCost", { option: v.variantKey })}
                suffix={currency}
                className="w-36"
                onCommit={(c) => save(saveItemCostAction({ pageId, itemId: item.itemId, codes: v.variantKey.split("|"), costCents: c }))}
              />
            </li>
          ))}
        </ul>
      )}
      {canWrite && item.optionCodes.length > 0 && !adding && (
        <Button type="button" variant="ghost" size="sm" className="h-7 w-fit gap-1 px-2 text-muted-foreground" onClick={() => setAdding(true)}>
          <PlusIcon className="size-3.5" aria-hidden="true" />
          {t("fin.costs.addOption")}
        </Button>
      )}
      {adding && (
        <div className="grid gap-2 rounded-[12px] bg-muted/40 p-2.5">
          <span className="q-2xs font-medium text-muted-foreground">{t("fin.costs.optionCodes")}</span>
          <div className="flex flex-wrap gap-1.5" dir="ltr">
            {item.optionCodes.map((c) => {
              const on = codes.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  disabled={!on && codes.length >= 4}
                  onClick={() => setCodes(on ? codes.filter((x) => x !== c) : [...codes, c])}
                  className={cn(
                    "q-xs inline-flex h-7 items-center gap-1 rounded-full border px-2.5 font-mono transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50",
                    on ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground hover:border-foreground/30",
                  )}
                >
                  {on && <CheckIcon className="size-3" aria-hidden="true" />}
                  {c}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={text}
              inputMode="decimal"
              dir="ltr"
              aria-label={t("fin.costs.perOption")}
              aria-invalid={amount === undefined || undefined}
              onChange={(e) => setText(e.target.value)}
              placeholder={currency}
              className="q-num h-8 w-32 rounded-md border border-input bg-background px-2.5 text-end outline-none focus-visible:ring-2 focus-visible:ring-ring/50 aria-[invalid=true]:border-destructive"
            />
            <Button type="button" size="sm" className="h-8 gap-1.5" disabled={busy || !codes.length || typeof amount !== "number"} onClick={addVariant}>
              {busy && <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />}
              {t("fin.save")}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setAdding(false)}>
              {t("ops.cc.cancel")}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* My carrier                                                          */
/* ------------------------------------------------------------------ */

type RateForm = { delivery: string; ret: string; codBp: string; codMin: string; codFlat: string };
const formOf = (r: CarrierRateRow | null): RateForm => ({
  delivery: centsText(r?.deliveryFeeCents ?? null),
  ret: centsText(r?.returnFeeCents ?? null),
  codBp: r && r.codFeeBp ? centsText(r.codFeeBp) : "",
  codMin: centsText(r?.codFeeMinCents ?? null),
  codFlat: r && r.codFeeFlatCents ? centsText(r.codFeeFlatCents) : "",
});

/** The form → the action input; undefined when a field is malformed. */
function rateInput(cityKey: string, f: RateForm) {
  const d = parseAmount(f.delivery);
  const r = parseAmount(f.ret);
  const bp = parseAmount(f.codBp);
  const min = parseAmount(f.codMin);
  const flat = parseAmount(f.codFlat);
  if (d === undefined || r === undefined || bp === undefined || min === undefined || flat === undefined) return undefined;
  if ((bp ?? 0) > 2_000) return undefined;
  return { cityKey, deliveryFeeCents: d, returnFeeCents: r, codFeeBp: bp ?? 0, codFeeMinCents: min, codFeeFlatCents: flat ?? 0 };
}

function RateFields({ form, onChange, disabled, currency, idPrefix, full }: { form: RateForm; onChange: (f: RateForm) => void; disabled: boolean; currency: string; idPrefix: string; full: boolean }) {
  const t = useT();
  const field = (k: keyof RateForm, label: string, suffix: string) => {
    const bad = parseAmount(form[k]) === undefined || (k === "codBp" && (parseAmount(form.codBp) ?? 0) > 2_000);
    return (
      <div className="grid gap-1.5">
        <label htmlFor={`${idPrefix}-${k}`} className="q-xs font-medium text-muted-foreground">
          {label}
        </label>
        <span dir="ltr" className="relative inline-flex items-center">
          <input
            id={`${idPrefix}-${k}`}
            value={form[k]}
            inputMode="decimal"
            disabled={disabled}
            aria-invalid={bad || undefined}
            onChange={(e) => onChange({ ...form, [k]: e.target.value })}
            placeholder={t("fin.costs.notSet")}
            className="q-num h-9 w-full rounded-md border border-input bg-background ps-2.5 pe-12 text-end shadow-xs outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60 aria-[invalid=true]:border-destructive"
          />
          <span className="q-2xs pointer-events-none absolute end-2.5 text-muted-foreground">{suffix}</span>
        </span>
      </div>
    );
  };
  return (
    <div className={cn("grid gap-3", full ? "sm:grid-cols-2 lg:grid-cols-5" : "sm:grid-cols-2")}>
      {field("delivery", t("fin.carrier.deliveryFee"), currency)}
      {field("ret", t("fin.carrier.returnFee"), currency)}
      {full && field("codBp", t("fin.carrier.codBp"), "%")}
      {full && field("codMin", t("fin.carrier.codMin"), currency)}
      {full && field("codFlat", t("fin.carrier.codFlat"), currency)}
    </div>
  );
}

function Carrier({ carrier, currency, canWrite, save, locale }: { carrier: CarrierView; currency: string; canWrite: boolean; save: (p: Promise<unknown>) => Promise<boolean>; locale: "ar" | "fr" | "en" }) {
  const t = useT();
  const uid = useId();
  const [settlement, setSettlement] = useState(carrier.settlement.value);
  const [answeredAt, setAnsweredAt] = useState(carrier.settlement.confirmedAt);
  const [fb, setFb] = useState<RateForm>(() => formOf(carrier.fallback));
  const [fbBusy, setFbBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [cityForm, setCityForm] = useState<RateForm>(() => formOf(null));
  const [newCity, setNewCity] = useState("");
  const [busy, setBusy] = useState(false);
  const fbDirty = JSON.stringify(fb) !== JSON.stringify(formOf(carrier.fallback));
  const m = (c: number | null) => (c === null ? "–" : money(c, currency, locale));

  async function answer(v: "at_delivery" | "statement") {
    const prev = settlement;
    setSettlement(v);
    const ok = await save(saveSettlementAction({ settlement: v }));
    if (!ok) setSettlement(prev);
    else setAnsweredAt(new Date().toISOString());
  }
  async function saveFallback() {
    const input = rateInput("*", fb);
    if (!input) return;
    setFbBusy(true);
    await save(saveCarrierRateAction(input));
    setFbBusy(false);
  }
  async function saveCity(cityKey: string) {
    const base = carrier.cities.find((c) => c.cityKey === cityKey)?.rate ?? carrier.fallback;
    const input = rateInput(cityKey, { ...cityForm, codBp: formOf(base).codBp, codMin: formOf(base).codMin, codFlat: formOf(base).codFlat });
    if (!input) return;
    setBusy(true);
    const ok = await save(saveCarrierRateAction(input));
    setBusy(false);
    if (ok) {
      setEditing(null);
      setNewCity("");
    }
  }
  const startEdit = (cityKey: string, rate: CarrierRateRow | null) => {
    setEditing(cityKey);
    setCityForm(formOf(rate));
  };

  return (
    <Section id="fin-carrier" title={t("fin.carrier.title")} hint={t("fin.carrier.hint")}>
      <fieldset className="grid gap-2">
        <legend className="q-sm mb-2 flex flex-wrap items-center gap-2 font-medium text-foreground">
          {t("fin.settlement.question")}
          <span className="q-2xs rounded-full bg-muted px-2 py-0.5 font-normal text-muted-foreground">
            {answeredAt ? t("fin.settlement.answered") : t("fin.settlement.notAnswered")}
          </span>
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["at_delivery", "statement"] as const).map((v) => (
            <label
              key={v}
              className={cn(
                "q-sm flex cursor-pointer items-start gap-2.5 rounded-[14px] border p-3.5 transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50 has-[:disabled]:cursor-default",
                answeredAt && settlement === v ? "border-foreground/70 bg-muted/50" : "border-border hover:border-foreground/30",
              )}
            >
              <input type="radio" name={`${uid}-set`} value={v} checked={!!answeredAt && settlement === v} disabled={!canWrite} onChange={() => answer(v)} className="mt-0.5 size-4 accent-[var(--foreground)]" />
              <span className="text-foreground">{t(`fin.settlement.${v}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 border-t border-border/70 pt-4">
        <div className="grid gap-0.5">
          <h3 className="q-sm inline-flex items-center gap-2 font-medium text-foreground">
            <TruckIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            {t("fin.carrier.default")}
          </h3>
          <p className="q-xs text-muted-foreground">{t("fin.carrier.defaultHint")}</p>
        </div>
        <RateFields form={fb} onChange={setFb} disabled={!canWrite} currency={currency} idPrefix={`${uid}-fb`} full />
        {canWrite && fbDirty && (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={fbBusy} onClick={() => setFb(formOf(carrier.fallback))}>
              {t("ops.cc.discard")}
            </Button>
            <Button type="button" size="sm" className="gap-1.5" disabled={fbBusy || !rateInput("*", fb)} onClick={saveFallback}>
              {fbBusy && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
              {t("fin.carrier.save")}
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-3 border-t border-border/70 pt-4">
        <div className="grid gap-0.5">
          <h3 className="q-sm font-medium text-foreground">{t("fin.carrier.cities")}</h3>
          <p className="q-xs text-muted-foreground">{t("fin.carrier.citiesHint")}</p>
        </div>
        {carrier.cities.length === 0 ? (
          <p className="q-sm rounded-[12px] border border-dashed border-border px-3.5 py-3 text-muted-foreground">{t("fin.carrier.noCities")}</p>
        ) : (
          <div className="overflow-x-auto rounded-[14px] border border-border">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="q-2xs border-b border-border text-muted-foreground [&>th]:px-3.5 [&>th]:py-2.5 [&>th]:text-start [&>th]:font-medium">
                  <th>{t("fin.carrier.col.city")}</th>
                  <th className="!text-end">{t("fin.carrier.col.orders")}</th>
                  <th className="!text-end">{t("fin.carrier.feeCharged")}</th>
                  <th className="!text-end">{t("fin.carrier.feePaid")}</th>
                  <th className="!text-end">{t("fin.carrier.col.gap")}</th>
                  {canWrite && <th className="w-20" />}
                </tr>
              </thead>
              <tbody className="q-num">
                {carrier.cities.map((c) => (
                  <tr key={c.cityKey} className="border-b border-border/70 align-top last:border-0 [&>td]:px-3.5 [&>td]:py-2.5">
                    <td className="font-medium text-foreground">
                      {cityLabel(c.cityKey as CityKey, locale)}
                      {!c.rate && c.paidCents !== null && <span className="q-2xs ms-2 rounded-full bg-muted px-1.5 py-0.5 font-normal text-muted-foreground">{t("fin.carrier.usesDefault")}</span>}
                      {editing === c.cityKey && (
                        <div className="mt-2.5 grid gap-2">
                          <RateFields form={cityForm} onChange={setCityForm} disabled={busy} currency={currency} idPrefix={`${uid}-c-${c.cityKey}`} full={false} />
                          <div className="flex gap-2">
                            <Button type="button" size="sm" className="gap-1.5" disabled={busy || !rateInput(c.cityKey, cityForm)} onClick={() => saveCity(c.cityKey)}>
                              {busy && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
                              {t("fin.carrier.save")}
                            </Button>
                            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(null)}>
                              {t("ops.cc.cancel")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="text-end">{num(c.n, locale)}</td>
                    <td className="text-end">{m(c.chargedCents)}</td>
                    <td className="text-end">{m(c.paidCents)}</td>
                    <td className={cn("text-end", c.gapCents !== null && c.gapCents > 0 ? "font-medium text-destructive" : "text-muted-foreground")}>
                      {c.gapCents === null ? "–" : c.gapCents > 0 ? `−${money(c.gapCents, currency, locale)}` : money(-c.gapCents, currency, locale)}
                    </td>
                    {canWrite && (
                      <td className="text-end">
                        {editing !== c.cityKey && (
                          <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => startEdit(c.cityKey, c.rate)}>
                            {t("fin.carrier.edit")}
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canWrite && (
          <div className="grid gap-2 rounded-[14px] border border-dashed border-border p-3">
            <span className="q-xs font-medium text-muted-foreground">{t("fin.carrier.addCity")}</span>
            <div className="flex flex-wrap items-end gap-3">
              <CityPicker
                id={`${uid}-newcity`}
                value={newCity}
                disabled={false}
                onChange={(k) => {
                  setNewCity(k);
                  setEditing(`new:${k}`);
                  setCityForm(formOf(null));
                }}
              />
            </div>
            {newCity && editing === `new:${newCity}` && (
              <div className="grid gap-2">
                <RateFields form={cityForm} onChange={setCityForm} disabled={busy} currency={currency} idPrefix={`${uid}-new`} full={false} />
                <div className="flex gap-2">
                  <Button type="button" size="sm" className="gap-1.5" disabled={busy || !rateInput(newCity, cityForm)} onClick={() => saveCity(newCity)}>
                    {busy && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
                    {t("fin.carrier.save")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setEditing(null);
                      setNewCity("");
                    }}
                  >
                    {t("ops.cc.cancel")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

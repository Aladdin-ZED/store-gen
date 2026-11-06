"use client";
/**
 * The Ad spend tab of `/finance` (P4 CALL CENTER; operations.md OPE-§16.2, OD56, OPS-10; SF-04).
 *
 *   grid    14 store-local days (today first) × Meta / TikTok / Snap / Google / Other; each cell saves on its own and
 *           shows the new value at once (rolled back when the save fails); amounts are typed in the platform's
 *           account currency ("Billed in USD", changed from the column header); under a foreign amount, the converted
 *           value in small type, or "Needs a rate"; a total per day in the store currency; "n days not counted"
 *   rates   the owner's dated rates, labelled "your rate, estimate"; add one (currency, first day, value) or remove
 *           one. No rate is ever fetched or invented.
 */
import { Loader2Icon, PlusIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { saveAdAccountAction, saveAdRateAction, saveAdSpendCellAction } from "@/app/app/[store]/finance/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SpendCell, SpendGrid } from "@/lib/finance/lite/spend.server";
import type { AdPlatform } from "@/lib/finance/lite/settings.server";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { settle } from "../orders/ops-ui";
import { money, num, ymdLabel } from "../queue/time";
import { MoneyInput, parseAmount } from "./money-input";

const PLATFORMS: readonly AdPlatform[] = ["meta", "tiktok", "snap", "google", "other"];

function errText(error: string): string {
  return error === "feature_off" || error === "not_found" || error === "invalid" ? `fin.error.${error}` : error === "forbidden" || error === "network" ? `ops.error.${error}` : "ops.error.generic";
}

export function AdSpendTab({ grid: initial, canWrite }: { grid: SpendGrid; canWrite: boolean }) {
  const t = useT();
  const locale = useAdminLocale();
  const router = useRouter();
  const [grid, setGrid] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setGrid(initial);
  }
  const sc = grid.storeCurrency;

  /** Optimistic: the typed amount shows at once; the converted value arrives with the answer. */
  async function saveCell(day: string, platform: AdPlatform, cents: number | null): Promise<boolean> {
    const before = grid;
    setGrid({
      ...grid,
      days: grid.days.map((d) => (d.day !== day ? d : { ...d, cells: d.cells.map((c) => (c.platform !== platform ? c : { ...c, spendCents: cents || null, storeCents: c.currency === sc ? cents || null : c.storeCents })) })),
    });
    const res = await settle<{ storeCents: number | null }>(saveAdSpendCellAction({ day, platform, spendCents: cents }));
    if (!res.ok) {
      setGrid(before);
      toast.error(t(errText(res.error)));
      return false;
    }
    router.refresh();
    return true;
  }

  const foreign = [...new Set(PLATFORMS.map((p) => grid.accounts[p]).filter((c) => c !== sc))];

  return (
    <div className="grid gap-5">
      <section aria-labelledby="fin-ads" className="grid gap-4 rounded-[18px] border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid max-w-prose gap-1">
            <h2 id="fin-ads" className="q-md font-semibold text-foreground">
              {t("fin.ads.title")}
            </h2>
            <p className="q-sm text-muted-foreground">{t("fin.ads.hint")}</p>
          </div>
          {grid.daysNotCounted > 0 && <span className="q-xs rounded-full border border-destructive/30 bg-destructive/[0.05] px-2.5 py-1 text-destructive">{t("fin.be.daysNotCounted", { n: grid.daysNotCounted })}</span>}
        </div>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[46rem] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="q-2xs text-muted-foreground [&>th]:border-b [&>th]:border-border [&>th]:px-2 [&>th]:py-2 [&>th]:text-start [&>th]:align-bottom [&>th]:font-medium">
                <th className="sticky start-0 z-[1] w-28 bg-card">{t("fin.ads.col.day")}</th>
                {PLATFORMS.map((p) => (
                  <th key={p} className="min-w-32">
                    <span className="block text-foreground">{t(`fin.ads.platform.${p}`)}</span>
                    <CurrencyPicker platform={p} currency={grid.accounts[p]} storeCurrency={sc} canWrite={canWrite} />
                  </th>
                ))}
                <th className="!text-end">{t("fin.ads.col.total", { currency: sc })}</th>
              </tr>
            </thead>
            <tbody>
              {grid.days.map((d, i) => (
                <tr key={d.day} className="[&>td]:border-b [&>td]:border-border/60 [&>td]:px-2 [&>td]:py-1.5 [&>td]:align-top">
                  <td className="q-xs sticky start-0 z-[1] bg-card pt-6 font-medium whitespace-nowrap text-foreground">{i === 0 ? t("fin.ads.today") : ymdLabel(d.day, locale)}</td>
                  {d.cells.map((c) => (
                    <td key={c.platform}>
                      <Cell cell={c} day={d.day} storeCurrency={sc} canWrite={canWrite} onSave={saveCell} platformLabel={t(`fin.ads.platform.${c.platform}`)} dayLabel={ymdLabel(d.day, locale)} />
                    </td>
                  ))}
                  <td className="q-num pt-5 text-end">
                    <span className="font-medium text-foreground">{d.totalStoreCents > 0 ? money(d.totalStoreCents, sc, locale) : "–"}</span>
                    {d.needsRate > 0 && <span className="q-2xs block text-destructive">{t("fin.ads.needsRateN", { n: d.needsRate })}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Rates rates={grid.rates} storeCurrency={sc} foreign={foreign} canWrite={canWrite} />
    </div>
  );
}

function Cell({ cell, day, storeCurrency, canWrite, onSave, platformLabel, dayLabel }: { cell: SpendCell; day: string; storeCurrency: string; canWrite: boolean; onSave: (day: string, p: AdPlatform, c: number | null) => Promise<boolean>; platformLabel: string; dayLabel: string }) {
  const t = useT();
  const locale = useAdminLocale();
  const foreign = cell.currency !== storeCurrency;
  return (
    <div className="grid gap-0.5">
      <MoneyInput
        cents={cell.spendCents}
        disabled={!canWrite}
        max={100_000_000}
        label={t("fin.ads.cellLabel", { platform: platformLabel, day: dayLabel })}
        suffix={foreign ? cell.currency : undefined}
        className="w-full"
        onCommit={(c) => onSave(day, cell.platform, c)}
      />
      {foreign && cell.spendCents !== null && (
        <span className={cn("q-2xs q-num px-1 text-end", cell.needsRate ? "text-destructive" : "text-muted-foreground")}>
          {cell.needsRate ? t("fin.ads.needsRate") : cell.storeCents !== null ? `≈ ${money(cell.storeCents, storeCurrency, locale)}` : ""}
        </span>
      )}
    </div>
  );
}

function CurrencyPicker({ platform, currency, storeCurrency, canWrite }: { platform: AdPlatform; currency: string; storeCurrency: string; canWrite: boolean }) {
  const t = useT();
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(currency);
  const [busy, setBusy] = useState(false);
  const ok = /^[A-Za-z]{3}$/.test(text.trim());
  async function save() {
    if (!ok) return;
    setBusy(true);
    const res = await settle(saveAdAccountAction({ platform, currency: text.trim().toUpperCase() }));
    setBusy(false);
    if (!res.ok) return void toast.error(t(errText(res.error)));
    setOpen(false);
    toast.success(t("fin.saved"));
    router.refresh();
  }
  const label = <span className="q-2xs font-normal">{t("fin.ads.billedIn", { currency })}</span>;
  if (!canWrite) return label;
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setText(currency);
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className="rounded-sm text-start text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none" aria-label={t("fin.ads.changeCurrency")}>
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="grid w-60 gap-2.5" align="start">
        <label htmlFor={`${uid}-cur`} className="q-xs font-medium text-foreground">
          {t("fin.ads.currency")}
        </label>
        <Input id={`${uid}-cur`} value={text} maxLength={3} dir="ltr" onChange={(e) => setText(e.target.value.toUpperCase())} className="h-9 font-mono uppercase" aria-invalid={!ok || undefined} />
        <p className="q-2xs text-muted-foreground">{t("fin.ads.currencyHint", { currency: storeCurrency })}</p>
        <Button type="button" size="sm" className="gap-1.5" disabled={!ok || busy} onClick={save}>
          {busy && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
          {t("fin.save")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function Rates({ rates, storeCurrency, foreign, canWrite }: { rates: SpendGrid["rates"]; storeCurrency: string; foreign: string[]; canWrite: boolean }) {
  const t = useT();
  const locale = useAdminLocale();
  const router = useRouter();
  const uid = useId();
  const [currency, setCurrency] = useState(foreign[0] ?? "");
  const [day, setDay] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  // the rate in thousandths: "9.85" → 9850 (toCents gives hundredths, so ×10)
  const parsed = parseAmount(value);
  const rateMilli = typeof parsed === "number" && parsed > 0 ? parsed * 10 : null;
  const canAdd = /^[A-Z]{3}$/.test(currency) && currency !== storeCurrency && /^\d{4}-\d{2}-\d{2}$/.test(day) && rateMilli !== null;

  async function call(input: { currency: string; fromDay: string; rateMilli: number | null }, key: string) {
    setBusy(key);
    const res = await settle(saveAdRateAction(input));
    setBusy(null);
    if (!res.ok) return void toast.error(t(errText(res.error)));
    toast.success(t("fin.saved"));
    if (input.rateMilli !== null) {
      setDay("");
      setValue("");
    }
    router.refresh();
  }

  return (
    <section aria-labelledby="fin-rates" className="grid gap-4 rounded-[18px] border border-border bg-card p-4 sm:p-5">
      <div className="grid max-w-prose gap-1">
        <h2 id="fin-rates" className="q-md font-semibold text-foreground">
          {t("fin.ads.rates")}
        </h2>
        <p className="q-sm text-muted-foreground">{t("fin.ads.ratesHint")}</p>
      </div>
      {foreign.length === 0 && rates.length === 0 ? (
        <p className="q-sm text-muted-foreground">{t("fin.ads.noForeign", { currency: storeCurrency })}</p>
      ) : (
        <>
          {rates.length === 0 ? (
            <p className="q-sm text-muted-foreground">{t("fin.ads.noRates")}</p>
          ) : (
            <ul className="grid divide-y divide-border/70">
              {rates.map((r) => {
                const key = `${r.currency}:${r.fromDay}`;
                return (
                  <li key={key} className="flex items-center gap-3 py-2">
                    <span className="q-sm q-num flex-1 text-foreground">{t("fin.ads.rateLine", { currency: r.currency, rate: num(r.rateMilli / 1000, locale), storeCurrency, day: ymdLabel(r.fromDay, locale) })}</span>
                    <span className="q-2xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{t("fin.ads.rateEstimate")}</span>
                    {canWrite && (
                      <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" disabled={busy === key} aria-label={t("fin.ads.removeRate")} onClick={() => call({ currency: r.currency, fromDay: r.fromDay, rateMilli: null }, key)}>
                        {busy === key ? <Loader2Icon className="size-4 animate-spin" aria-hidden="true" /> : <XIcon className="size-4" aria-hidden="true" />}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {canWrite && (
            <div className="flex flex-wrap items-end gap-3 rounded-[14px] border border-dashed border-border p-3">
              <div className="grid gap-1.5">
                <label htmlFor={`${uid}-c`} className="q-xs font-medium text-muted-foreground">
                  {t("fin.ads.currency")}
                </label>
                <Input id={`${uid}-c`} value={currency} maxLength={3} dir="ltr" onChange={(e) => setCurrency(e.target.value.toUpperCase())} className="h-9 w-24 font-mono uppercase" list={`${uid}-cl`} />
                <datalist id={`${uid}-cl`}>
                  {foreign.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="grid gap-1.5">
                <label htmlFor={`${uid}-d`} className="q-xs font-medium text-muted-foreground">
                  {t("fin.ads.rateFrom")}
                </label>
                <Input id={`${uid}-d`} type="date" value={day} dir="ltr" onChange={(e) => setDay(e.target.value)} className="q-num h-9 w-40" />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor={`${uid}-v`} className="q-xs font-medium text-muted-foreground">
                  {t("fin.ads.rateValue", { currency: currency || "…" })}
                </label>
                <span dir="ltr" className="relative inline-flex items-center">
                  <Input id={`${uid}-v`} value={value} inputMode="decimal" onChange={(e) => setValue(e.target.value)} aria-invalid={(value !== "" && rateMilli === null) || undefined} className="q-num h-9 w-32 pe-12 text-end" />
                  <span className="q-2xs pointer-events-none absolute end-2.5 text-muted-foreground">{storeCurrency}</span>
                </span>
              </div>
              <Button type="button" size="sm" className="h-9 gap-1.5" disabled={!canAdd || busy === "add"} onClick={() => rateMilli !== null && call({ currency, fromDay: day, rateMilli }, "add")}>
                {busy === "add" ? <Loader2Icon className="size-4 animate-spin" aria-hidden="true" /> : <PlusIcon className="size-4" aria-hidden="true" />}
                {t("fin.ads.addRate")}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

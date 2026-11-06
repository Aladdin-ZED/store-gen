"use client";
/**
 * Small shared pieces of the call-centre and Profit settings screens (P4 CALL CENTER; core §I.8): a titled section, a
 * bounded whole-number field with its range under it, the save bar, the city picker (a searchable CityKey list) and
 * the error text of an action answer.
 */
import { ChevronDownIcon, Loader2Icon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { CITY_KEYS, cityLabel } from "@/lib/orders/address";
import { cn } from "@/lib/utils";

const KNOWN_ERRORS = new Set(["forbidden", "invalid", "not_found", "network", "rate_limited"]);

/** The text of a failed action ("ops.error.<code>", else the generic line). */
export function errorKey(error: string): string {
  return KNOWN_ERRORS.has(error) ? `ops.error.${error}` : "ops.error.generic";
}

export function Section({ id, title, hint, children, aside, className }: { id: string; title: string; hint?: ReactNode; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn("grid gap-4 rounded-[18px] border border-border bg-card p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid max-w-prose gap-1">
          <h2 id={id} className="q-md font-semibold text-foreground">
            {title}
          </h2>
          {hint && <p className="q-sm text-muted-foreground">{hint}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export type NumValue = number | "";
export const numOk = (v: NumValue, min: number, max: number) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** A whole number between min and max; the range reads under the field, red when the value is outside it. */
export function NumField({ id, label, hint, value, min, max, onChange, disabled, unit }: { id: string; label: string; hint?: string; value: NumValue; min: number; max: number; onChange: (v: NumValue) => void; disabled: boolean; unit?: string }) {
  const t = useT();
  const bad = !numOk(value, min, max);
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="q-sm font-medium text-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={value}
          disabled={disabled}
          aria-invalid={bad || undefined}
          aria-describedby={`${id}-r`}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className="q-num h-9 w-28"
          dir="ltr"
        />
        {unit && <span className="q-sm text-muted-foreground">{unit}</span>}
      </div>
      <p id={`${id}-r`} className={cn("q-xs", bad ? "text-destructive" : "text-muted-foreground")}>
        {hint ? `${hint} ` : ""}
        {t("ops.cc.range", { min, max })}
      </p>
    </div>
  );
}

/** The bottom bar of a form: Discard and Save, shown while something changed. */
export function SaveBar({ dirty, valid, busy, onSave, onDiscard, label }: { dirty: boolean; valid: boolean; busy: boolean; onSave: () => void; onDiscard: () => void; label?: string }) {
  const t = useT();
  if (!dirty) return null;
  return (
    <div className="q-rise sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-[14px] border border-border bg-popover p-2.5 ps-4 shadow-[0_8px_30px_-12px_rgb(0_0_0/0.25)]">
      <span className="q-sm text-muted-foreground">{valid ? t("ops.cc.unsaved") : t("ops.error.invalid")}</span>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onDiscard}>
          {t("ops.cc.discard")}
        </Button>
        <Button type="button" size="sm" className="gap-1.5" disabled={!valid || busy} onClick={onSave}>
          {busy && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
          {label ?? t("ops.cc.save")}
        </Button>
      </div>
    </div>
  );
}

/** A searchable picker of the platform's city keys, labelled in the viewer's language. */
export function CityPicker({ value, onChange, disabled, id }: { value: string; onChange: (k: string) => void; disabled: boolean; id: string }) {
  const t = useT();
  const locale = useAdminLocale();
  const [open, setOpen] = useState(false);
  const options = useMemo(() => CITY_KEYS.map((k) => ({ key: k as string, label: cityLabel(k, locale) })).sort((a, b) => a.label.localeCompare(b.label, locale)), [locale]);
  const current = value ? (options.find((o) => o.key === value)?.label ?? value) : "";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" size="sm" disabled={disabled} className={cn("h-9 w-full justify-between font-normal sm:w-56", !current && "text-muted-foreground")} aria-expanded={open}>
          <span className="truncate">{current || t("ops.cc.cities.pick")}</span>
          <ChevronDownIcon className="size-4 opacity-60" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={t("ops.cc.cities.search")} />
          <CommandList>
            <CommandEmpty>{t("ops.cc.cities.none")}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.key}
                  value={`${o.label} ${o.key}`}
                  onSelect={() => {
                    onChange(o.key);
                    setOpen(false);
                  }}
                >
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

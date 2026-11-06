"use client";
/**
 * The phone field of the sign-up forms (platform.md PLA-§22.1): the national number formatted as typed
 * (`libphonenumber-js` `AsYouType` for the market's country) with the calling code shown before it. The field posts
 * what is shown; the server parses it with the same country and stores E.164 (`parseAccountPhone`), so this field
 * never decides.
 */
import { AsYouType, getCountryCallingCode, type CountryCode } from "libphonenumber-js/min";
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CONTROL_CLASS } from "./control";

function formatAsTyped(raw: string, country: CountryCode): string {
  return new AsYouType(country).input(raw);
}

function callingCode(country: CountryCode): string {
  try {
    return `+${getCountryCallingCode(country)}`;
  } catch {
    return "+";
  }
}

export function PhoneField({
  label,
  name,
  country,
  defaultValue = "",
  hint,
  error,
}: {
  label: string;
  name: string;
  country: CountryCode;
  defaultValue?: string;
  hint?: string;
  error?: string;
}) {
  const id = useId();
  const [value, setValue] = useState(() => formatAsTyped(defaultValue, country));
  const described = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </Label>
      <div dir="ltr" className="relative">
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 flex items-center ps-3.5 text-base text-muted-foreground tabular-nums md:text-[0.95rem]">
          {callingCode(country)}
        </span>
        <Input
          id={id}
          name={name}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          dir="ltr"
          maxLength={32}
          value={value}
          onChange={(e) => {
            // deleting a formatting character (a space, a dash) must not re-insert it: format only when growing
            const next = e.target.value;
            setValue(next.length < value.length ? next : formatAsTyped(next, country));
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          className={cn(CONTROL_CLASS, "bg-card ps-[4.25rem] pe-3.5 tabular-nums")}
        />
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

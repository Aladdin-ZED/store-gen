"use client";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import { useId } from "react";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";

/** Six-digit authenticator code input (submits its value as `name`). */
export function OtpField({
  label,
  name,
  value,
  onChange,
  onComplete,
  error,
  autoFocus,
  disabled,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  error?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const slotClass = "size-11 bg-card text-lg font-medium tabular-nums md:size-12";
  return (
    <div className="grid gap-3">
      <Label htmlFor={id}>{label}</Label>
      <InputOTP
        id={id}
        name={name}
        maxLength={6}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        autoComplete="one-time-code"
        value={value}
        onChange={onChange}
        onComplete={onComplete}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        containerClassName="justify-between gap-2"
      >
        <InputOTPGroup>
          {[0, 1, 2].map((i) => (
            <InputOTPSlot key={i} index={i} className={slotClass} aria-invalid={error ? true : undefined} />
          ))}
        </InputOTPGroup>
        <InputOTPSeparator className="text-muted-foreground" />
        <InputOTPGroup>
          {[3, 4, 5].map((i) => (
            <InputOTPSlot key={i} index={i} className={slotClass} aria-invalid={error ? true : undefined} />
          ))}
        </InputOTPGroup>
      </InputOTP>
      {error && (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

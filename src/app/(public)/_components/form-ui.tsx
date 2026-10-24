"use client";

import { AlertCircleIcon, EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Form-level error (role="alert", so it is announced when it appears). */
export function FormAlert({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
      <AlertCircleIcon aria-hidden="true" />
      <AlertDescription className="text-destructive">{message}</AlertDescription>
    </Alert>
  );
}

export function SubmitButton({
  pending,
  children,
  pendingLabel,
  className,
  variant,
  disabled,
}: {
  pending: boolean;
  children: ReactNode;
  pendingLabel: string;
  className?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  disabled?: boolean;
}) {
  return (
    <Button
      type="submit"
      size="lg"
      variant={variant}
      disabled={pending || disabled}
      className={cn("h-10 w-full text-[0.9rem]", className)}
    >
      {pending ? (
        <>
          <Loader2Icon aria-hidden="true" className="animate-spin" />
          <span>{pendingLabel}</span>
        </>
      ) : (
        children
      )}
    </Button>
  );
}

interface FieldProps extends Omit<ComponentProps<"input">, "id"> {
  label: string;
  name: string;
  error?: string;
  hint?: ReactNode;
  /** element shown at the end of the label row (e.g. a link) */
  labelAside?: ReactNode;
  /** control rendered inside the input, at its end (e.g. a visibility toggle) */
  endAdornment?: ReactNode;
}

export function TextField({ label, name, error, hint, labelAside, endAdornment, className, ...props }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  // The hint is replaced by the error while one is shown: only reference what is rendered.
  const describedBy = error ? errorId : hint ? hintId : undefined;
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {labelAside}
      </div>
      <div className="relative">
        <Input
          id={id}
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn("h-10 bg-card px-3 text-[0.95rem] md:text-[0.9rem]", endAdornment ? "pe-11" : null, className)}
          {...props}
        />
        {endAdornment && <div className="absolute inset-y-0 end-1.5 flex items-center">{endAdornment}</div>}
      </div>
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function PasswordField({ toggleLabel = "Show password", ...props }: Omit<FieldProps, "type" | "endAdornment"> & { /** the visibility toggle's label, localised by the form */ toggleLabel?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      endAdornment={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          // A toggle keeps one label; its pressed state says whether the password is visible.
          aria-label={toggleLabel}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          className="text-muted-foreground hover:text-foreground"
        >
          {visible ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
        </Button>
      }
    />
  );
}

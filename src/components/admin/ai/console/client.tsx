"use client";
/**
 * Console → AI client plumbing (P7 AI; ai.md AI-§K.2; docs/STORE-SAAS.md §B.7, §I.8): `useConsoleAction` runs an action,
 * opens the focus-trapped step-up sheet on a `step_up` answer and retries once verified, and turns a refusal into one
 * English sentence (`ai.console.code.*`); `Status` shows it inline next to the control (role status / alert);
 * `RetryButton` re-renders a panel that failed. Every state change of a write is announced once.
 */
import { LoaderCircleIcon, RotateCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition, type ReactNode } from "react";
import { StepUpSheet } from "@/components/admin/common/step-up-sheet";
import { Button } from "@/components/ui/button";
import type { ConsoleOutcome } from "@/lib/ai/platform/console-write";
import { t, type MessageVars } from "@/lib/i18n/admin";
import type { ActionResult } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";

const c = (key: string, vars?: MessageVars): string => t(key, vars, "en");

export function RetryButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => start(() => router.refresh())} disabled={pending}>
      {pending ? <LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden /> : <RotateCwIcon className="size-3.5" aria-hidden />}
      {c("ai.console.retry")}
    </Button>
  );
}

export type Said = { tone: "ok" | "error"; text: string } | null;

/** One sentence for an action answer (a seam failure or a console refusal). */
export function sayOf<T>(r: ActionResult<ConsoleOutcome<T>>, okText?: string): Said {
  if (!r.ok) {
    if (r.error === "invalid") return { tone: "error", text: c("ai.console.code.invalid") };
    if (r.error === "read_only") return { tone: "error", text: c("ai.console.code.read_only") };
    if (r.error === "forbidden" || r.error === "not_found") return { tone: "error", text: c("ai.console.code.forbidden") };
    return { tone: "error", text: c("ai.console.code.server") };
  }
  if (!r.data.ok) return { tone: "error", text: c(`ai.console.code.${r.data.code}`, { detail: r.data.detail ?? "" }) };
  return okText ? { tone: "ok", text: okText } : null;
}

/**
 * Runs `fn(input)`; a `step_up` answer opens the sheet and the same call is retried after the code. `sheet` must be
 * rendered by the caller once.
 */
type Runner = <T>(call: () => Promise<ActionResult<ConsoleOutcome<T>>>, onDone?: (r: ActionResult<ConsoleOutcome<T>>) => void) => Promise<void>;

export function useConsoleAction() {
  const [pending, setPending] = useState(false);
  const [stepUp, setStepUp] = useState(false);
  // the call a step-up interrupted, handed the runner back once verified (no self-reference inside `run`)
  const retry = useRef<((go: Runner) => void) | null>(null);
  const router = useRouter();

  const run: Runner = useCallback(
    async <T,>(call: () => Promise<ActionResult<ConsoleOutcome<T>>>, onDone?: (r: ActionResult<ConsoleOutcome<T>>) => void): Promise<void> => {
      setPending(true);
      try {
        const r = await call();
        if (!r.ok && r.error === "step_up") {
          retry.current = (go) => void go(call, onDone);
          setStepUp(true);
          return;
        }
        onDone?.(r);
        if (r.ok && r.data.ok) router.refresh();
      } catch {
        onDone?.({ ok: false, error: "server" });
      } finally {
        setPending(false);
      }
    },
    [router],
  );

  const sheet = (
    <StepUpSheet
      open={stepUp}
      surface="console"
      onClose={() => {
        setStepUp(false);
        retry.current = null;
      }}
      onVerified={() => {
        setStepUp(false);
        const again = retry.current;
        retry.current = null;
        again?.(run);
      }}
    />
  );
  return { run, pending, sheet };
}

/** The answer of the last write, inline; an empty live region (no height) until there is one. */
export function Status({ said, className }: { said: Said; className?: string }) {
  if (!said) return <p role="status" aria-live="polite" className="sr-only" />;
  return (
    <p role={said.tone === "error" ? "alert" : "status"} aria-live="polite" className={cn("text-xs", said.tone === "error" ? "text-destructive" : "text-success-ink", className)}>
      {said.text}
    </p>
  );
}

export function Spinner({ on }: { on: boolean }) {
  return on ? <LoaderCircleIcon className="size-3.5 animate-spin text-muted-foreground" aria-hidden /> : null;
}

/** A labelled number input of the console (tabular, 36 px). */
export function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  placeholder,
  disabled,
  hint,
}: {
  id: string;
  label: string;
  value: number | "";
  onChange(v: number | ""): void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  placeholder?: string;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <div className="mt-1 flex h-9 items-center rounded-md border bg-background px-2.5 focus-within:ring-2 focus-within:ring-ring">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          className="h-full w-full min-w-0 bg-transparent text-sm tabular-nums outline-none disabled:opacity-60"
          value={value}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        />
        {suffix ? <span className="ms-2 shrink-0 text-xs text-muted-foreground">{suffix}</span> : null}
      </div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/** A labelled native select (keyboard-native, 36 px). */
export function SelectField<V extends string>({ id, label, value, options, onChange, disabled }: { id: string; label: string; value: V; options: { value: V; label: string }[]; onChange(v: V): void; disabled?: boolean }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <select id={id} className="mt-1 h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as V)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

"use client";
/**
 * The Purchase trigger as three cards with their consequence in plain words (operations.md OPE-§20.7, §20.2, OD18):
 * radio semantics (one tab stop, arrow keys move and select, mirrored in RTL), the stored choice marked "Current".
 */
import { CheckIcon, PackageCheckIcon, PhoneCallIcon, ShoppingBagIcon } from "lucide-react";
import { useId, useRef, type KeyboardEvent } from "react";
import { useT } from "@/lib/i18n/admin/client";
import type { PurchaseTrigger } from "@/lib/pixels/server-events-shared";
import { cn } from "@/lib/utils";

export const TRIGGER_ORDER: readonly PurchaseTrigger[] = ["order", "confirmed", "delivered"];
const ICON = { order: ShoppingBagIcon, confirmed: PhoneCallIcon, delivered: PackageCheckIcon } as const;

export function TriggerCards({ value, saved, onChange, disabled }: { value: PurchaseTrigger; saved: PurchaseTrigger; onChange: (v: PurchaseTrigger) => void; disabled: boolean }) {
  const t = useT();
  const legendId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const rtl = e.currentTarget.closest("[dir]")?.getAttribute("dir") === "rtl";
    const next = e.key === "ArrowDown" || e.key === (rtl ? "ArrowLeft" : "ArrowRight");
    const prev = e.key === "ArrowUp" || e.key === (rtl ? "ArrowRight" : "ArrowLeft");
    if (!next && !prev) return;
    e.preventDefault();
    const j = (i + (next ? 1 : -1) + TRIGGER_ORDER.length) % TRIGGER_ORDER.length;
    onChange(TRIGGER_ORDER[j]!);
    refs.current[j]?.focus();
  }

  return (
    <div className="grid gap-3">
      <p id={legendId} className="text-sm font-medium">
        {t("int.px.trigger.legend")}
      </p>
      <div role="radiogroup" aria-labelledby={legendId} className="grid gap-2.5 md:grid-cols-3">
        {TRIGGER_ORDER.map((k, i) => {
          const selected = value === k;
          const Icon = ICON[k];
          return (
            <button
              key={k}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(k)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "relative grid content-start gap-2.5 rounded-2xl p-4 text-start ring-1 transition-[box-shadow,background-color] duration-200 ring-inset outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70",
                selected ? "bg-brand/[0.06] ring-brand/45" : "ring-foreground/10 hover:ring-foreground/20",
              )}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl transition-colors duration-200", selected ? "bg-brand text-brand-foreground" : "bg-foreground/[0.06] text-foreground/70")}>
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold tracking-[-0.01em]">{t(`int.px.trigger.${k}.title`)}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full transition-[opacity,transform] duration-200 motion-reduce:transition-none",
                    selected ? "scale-100 bg-brand text-brand-foreground opacity-100" : "scale-50 opacity-0",
                  )}
                >
                  <CheckIcon className="size-3" strokeWidth={3} />
                </span>
              </span>
              <span className="text-[0.8125rem] leading-relaxed text-pretty text-muted-foreground">{t(`int.px.trigger.${k}.body`)}</span>
              {saved === k && <span className="text-xs font-medium text-foreground/60">{t("int.px.trigger.current")}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

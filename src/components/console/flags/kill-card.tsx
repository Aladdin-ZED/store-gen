"use client";
/**
 * One kill switch (platform.md PLA-§12.1, PD29, PD43): name, the one-sentence effect, the state as text and icon
 * (Normal / Stopped; for `platform_read_only` Off / Read-only on), the last change (who, when, reason) and the history
 * (last 20). The toggle opens the KillSheet with the preview the page read; staff without `kill.manage` read only.
 *
 *   <KillCard card={card} preview={preview ?? null} />
 */
import { ChevronDownIcon, CircleCheckIcon, OctagonXIcon } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n/admin/client";
import type { KillSwitchCard, KillSwitchPreview } from "@/lib/platform/flags";
import { cn } from "@/lib/utils";
import { Ago } from "../ago";
import { button } from "../queue/decision-dialogs";
import { TINT_INK, TINT_SOFT } from "../tints";
import { KillSheet } from "./kill-sheet";

export function KillCard({ card, preview }: { card: KillSwitchCard; preview: KillSwitchPreview | null }) {
  const t = useT();
  const [open, setOpen] = useState(0);
  const [history, setHistory] = useState(false);
  const name = t(card.name);
  const Icon = card.tripped ? OctagonXIcon : CircleCheckIcon;
  const tint = card.tripped ? "crimson" : card.key === "platform_read_only" ? "neutral" : "emerald";
  const who = (e: NonNullable<KillSwitchCard["last"]>) => e.by?.name ?? t("console.feed.actor.system");

  return (
    <article aria-labelledby={`kill-${card.key}`} className={cn("flex flex-col gap-3 rounded-[var(--r-card)] bg-card px-4 py-4 shadow-[inset_0_0_0_1px_var(--c-hairline)]", card.tripped && "shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--c-danger-ink)_40%,transparent)]")}>
      <header className="flex min-w-0 items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h2 id={`kill-${card.key}`} className="text-[14px] font-semibold tracking-[-0.006em]">
            {name}
          </h2>
          <bdi dir="ltr" className="truncate text-start font-mono text-[11px] text-muted-foreground">
            {card.key}
          </bdi>
        </div>
        <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium", TINT_INK[tint])} style={{ background: TINT_SOFT[tint] }}>
          <Icon aria-hidden="true" className="size-3.5" />
          {t(`console.kill.state.${card.state}`)}
        </span>
      </header>
      <p className="text-[12.5px] leading-[1.5] text-muted-foreground">{t(card.effect)}</p>

      <div className="grid gap-0.5 border-t border-[var(--c-hairline)] pt-3 text-[12px]">
        {card.last ? (
          <>
            <span>
              {t("console.kill.last_by", { name: who(card.last) })} · <Ago iso={card.last.at} className="num" />
            </span>
            {card.last.reason && <span className="line-clamp-2 text-muted-foreground">{card.last.reason}</span>}
          </>
        ) : (
          <span className="text-muted-foreground">{t("console.kill.never_changed")}</span>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        {card.history.length > 0 ? (
          <button type="button" aria-expanded={history} onClick={() => setHistory((h) => !h)} className="inline-flex items-center gap-1 rounded-[4px] text-[12px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:min-h-11">
            {t("console.kill.history", { count: card.history.length })}
            <ChevronDownIcon aria-hidden="true" className={cn("size-3.5 transition-transform duration-[var(--dur-1)]", history && "rotate-180")} />
          </button>
        ) : (
          <span />
        )}
        {preview && (
          <button type="button" onClick={() => setOpen((n) => n + 1)} className={cn(button.base, preview.tripping ? button.danger : button.secondary)}>
            {t(`console.kill.toggle.${preview.tripping ? "trip" : "restore"}.${card.key === "platform_read_only" ? "read_only" : "switch"}`)}
          </button>
        )}
      </div>

      {history && (
        <ol className="grid gap-2 border-t border-[var(--c-hairline)] pt-3">
          {card.history.map((h, i) => (
            <li key={`${h.at}-${i}`} className="grid gap-0.5 text-[12px]">
              <span className="flex flex-wrap items-center gap-x-1.5">
                <span className="font-medium">{h.to === null ? "—" : t(`console.kill.state.${stateOf(card.key, h.to)}`)}</span>
                <span className="text-muted-foreground">
                  · {who(h)} · <Ago iso={h.at} className="num" />
                </span>
              </span>
              {h.reason && <span className="text-muted-foreground">{h.reason}</span>}
            </li>
          ))}
        </ol>
      )}
      {open > 0 && preview && <KillSheet key={open} preview={preview} name={name} onClose={() => setOpen(0)} />}
    </article>
  );
}

/** the state word of a value (`*_enabled` true = normal; `platform_read_only` true = read-only on) */
function stateOf(key: string, value: boolean): "normal" | "stopped" | "off" | "read_only_on" {
  if (key === "platform_read_only") return value ? "read_only_on" : "off";
  return value ? "normal" : "stopped";
}

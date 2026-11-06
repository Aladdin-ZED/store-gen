"use client";
/**
 * The top bar's "Design check" toggle (P6 DESIGN; design.md DES-§15.1): opens the right-rail panel; its badge counts
 * the blocking items (tabular, hidden at 0). The aria label says the count, so the badge is never the only signal.
 */
import { ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { TipButton } from "../ui";
import { useDesignCheck } from "./check-context";

export function DesignCheckButton() {
  const t = useT();
  const check = useDesignCheck();
  if (!check) return null;
  const n = check.model?.blocking ?? 0;
  const label = n ? `${t("design.check.open")} · ${t("design.check.badge", { count: n })}` : t("design.check.open");
  return (
    <TipButton label={label} aria-pressed={check.open} onClick={() => check.setOpen(!check.open)} className={cn("relative", check.open && "bg-muted text-foreground")}>
      <ShieldCheck />
      {n ? (
        <span aria-hidden="true" className="absolute -end-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-background tabular-nums">
          {n > 9 ? "9+" : n}
        </span>
      ) : null}
    </TipButton>
  );
}

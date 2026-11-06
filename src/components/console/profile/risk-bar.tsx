"use client";
/**
 * The order risk distribution (platform.md PLA-§7.3 strip 4, §7.4): one bar of three bands, 0-29 / 30-69 / ≥ 70,
 * widths by count, each band named with its count and the n of the window (never colour alone, PLA-§4.7 rule 8).
 *
 *   <RiskBar mix={{ low: 120, check: 30, high: 6, n: 156 }} />
 */
import { useT } from "@/lib/i18n/admin/client";
import { TINT_INK, TINT_SOFT, TINT_STROKE, type Tint } from "../tints";

const BANDS: { key: "low" | "check" | "high"; tint: Tint }[] = [
  { key: "low", tint: "emerald" },
  { key: "check", tint: "yellow" },
  { key: "high", tint: "crimson" },
];

export function RiskBar({ mix }: { mix: { low: number; check: number; high: number; n: number } }) {
  const t = useT();
  if (mix.n === 0) return <p className="text-[12.5px] text-muted-foreground">{t("console.risk_bar.empty")}</p>;
  return (
    <div className="grid gap-1.5">
      <div className="flex h-2 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={t("console.risk_bar.label", { low: mix.low, check: mix.check, high: mix.high, n: mix.n })}>
        {BANDS.map((b) =>
          mix[b.key] > 0 ? <span key={b.key} className="h-full" style={{ flexGrow: mix[b.key], flexBasis: 0, background: TINT_SOFT[b.tint], boxShadow: `inset 0 -2px 0 ${TINT_STROKE[b.tint]}` }} /> : null,
        )}
      </div>
      <p className="num flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground" aria-hidden="true">
        {BANDS.map((b) => (
          <span key={b.key} className={b.key === "high" && mix.high > 0 ? TINT_INK[b.tint] : undefined}>
            {t(`console.risk_bar.${b.key}`, { count: mix[b.key] })}
          </span>
        ))}
        <span className="ms-auto">{t("console.risk_bar.n", { n: mix.n })}</span>
      </p>
    </div>
  );
}

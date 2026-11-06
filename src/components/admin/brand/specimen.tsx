"use client";
/**
 * The brand kit's live specimen (P6 DESIGN; design.md DES-§12.2, DES-§12.7). Updates within one `--dur-2` of a change:
 * the store name in the display face in Latin (32 px) and Arabic (34 px; above the Latin line in `ar`), a 36 px
 * button, the price of the store's latest page through the money formatter (no row without one: never an invented
 * number), one 200 × 120 card with the depth recipe, and the four swatches as squares on a light and a dark row.
 * `compact` is the phone's collapsed 56 px strip (the name and the swatches).
 */
import { useMemo } from "react";
import { DARK_GROUND, LIGHT_GROUND } from "@/lib/design/brand-kit";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { formatMoney } from "@/lib/markets/money";
import { fromCents } from "@/lib/page/money";
import { contrast, fromOklch } from "@/lib/theme/color";
import { fontStack } from "@/lib/theme/fonts";
import { cn } from "@/lib/utils";
import type { BrandKitView, PairingCard } from "./types";

/** The traditional Arabic specimen line (the abjad order): a type sample, not a claim. */
const AR_SPECIMEN = "أبجد هوز حطي";

export const inkOn = (hex: string) => (contrast("#ffffff", hex) >= contrast("#141414", hex) ? "#ffffff" : "#141414");

/** The neutral tint swatch: the chosen hue at the low chroma neutrals use. */
export const neutralSwatch = (hue: number | null) => (hue === null ? null : fromOklch({ l: 0.9, c: 0.025, h: hue }));

export function Specimen({ view, storeName, pairing, compact = false, className }: { view: BrandKitView; storeName: string; pairing: PairingCard | null; compact?: boolean; className?: string }) {
  const t = useT();
  const locale = useAdminLocale();
  const c = view.brand.colors;
  const accent = c.accent;
  const swatches = useMemo(() => [c.accent, c.pop, neutralSwatch(c.neutralHue), c.base === "dark" ? DARK_GROUND : c.base ? LIGHT_GROUND : null], [c.accent, c.pop, c.neutralHue, c.base]);
  const display = pairing ? fontStack(pairing.display) : undefined;
  const displayAr = pairing ? fontStack(pairing.displayAr) : undefined;
  const price = view.price ? formatMoney(fromCents(view.price.cents), view.price.currency, locale) : null;
  const latin = (
    <p dir="auto" className={cn("truncate leading-[1.1] tracking-[-0.02em]", compact ? "text-[17px]" : "text-[28px] lg:text-[26px] xl:text-[32px]")} style={{ fontFamily: display, fontWeight: pairing?.displayWeight ?? 600 }}>
      {storeName}
    </p>
  );
  const arabic = compact ? null : (
    <p dir="rtl" lang="ar" className="truncate text-[30px] leading-[1.35] lg:text-[28px] xl:text-[34px]" style={{ fontFamily: displayAr, fontWeight: pairing?.displayWeightAr ?? 600 }}>
      {AR_SPECIMEN}
    </p>
  );
  const row = (ground: string, size: string) => (
    <div className={cn("flex items-center gap-2 rounded-lg px-3 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.07)]", compact ? "h-10" : "h-12 lg:h-20")} style={{ background: ground }}>
      {swatches.map((s, i) => (
        <span
          key={i}
          aria-hidden
          className={cn("shrink-0 rounded-md", size, s ? "" : "border border-dashed")}
          style={s ? { background: s, boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.06)" } : { borderColor: ground === LIGHT_GROUND ? "rgb(0 0 0 / 0.18)" : "rgb(255 255 255 / 0.22)" }}
        />
      ))}
    </div>
  );

  if (compact) {
    return (
      <div className={cn("flex h-14 items-center gap-3 rounded-xl border bg-card px-3", className)} aria-label={t("brand.specimen")}>
        <div className="min-w-0 flex-1">{latin}</div>
        <div className="flex gap-1.5">
          {swatches.map((s, i) => (
            <span key={i} aria-hidden className={cn("size-6 rounded-md", s ? "" : "border border-dashed")} style={s ? { background: s } : undefined} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <section aria-label={t("brand.specimen")} className={cn("grid gap-3 rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)] lg:gap-4 xl:p-5", className)}>
      <div className="grid gap-1">
        {locale === "ar" ? (
          <>
            {arabic}
            {latin}
          </>
        ) : (
          <>
            {latin}
            {arabic}
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="inline-flex h-9 items-center rounded-lg px-4 text-[13px] font-semibold"
          style={accent ? { background: accent, color: inkOn(accent) } : { background: "var(--foreground)", color: "var(--background)" }}
        >
          {t("brand.specimen.button")}
        </span>
        {price ? (
          <span className="text-[17px] font-semibold tabular-nums" dir="auto">
            {price}
          </span>
        ) : null}
      </div>
      <div
        aria-hidden
        className="hidden h-[120px] w-[200px] max-w-full content-end gap-2 rounded-xl border bg-background p-3 lg:grid lg:w-full xl:w-[200px]"
        style={{ boxShadow: "0 1px 1px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.18)" }}
      >
        <span className="h-10 rounded-md" style={{ background: c.pop ?? neutralSwatch(c.neutralHue) ?? "var(--muted)" }} />
        <span className="h-2 w-3/4 rounded-full bg-foreground/80" />
        <span className="h-2 w-1/2 rounded-full" style={{ background: accent ?? "var(--muted-foreground)" }} />
      </div>
      {/* phone: the two grounds side by side (the 200 px card); desktop: two 80 px rows */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
        {row(LIGHT_GROUND, "size-6 sm:size-8 xl:size-10")}
        {row(DARK_GROUND, "size-6 sm:size-8 xl:size-10")}
      </div>
    </section>
  );
}

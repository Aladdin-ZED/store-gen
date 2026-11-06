"use client";
/**
 * The brand kit's OKLCH picker (P6 DESIGN; design.md DES-§12.4, DES-§12.7, DS17, H34 / V37, UX-17). Lightness,
 * chroma and hue sliders plus a hex field, all `dir="ltr"` (LTR isolates in `ar`). The hue track shows the owner's
 * forbidden band (25-75° at chroma > 0.06) as an opaque hatched, non-selectable range, and for the accent and pop
 * roles the gold band (75-95° at chroma > 0.10) as a second one: a drag into a band stops at its nearest edge. A hex
 * typed into a band is sent as typed: the server's `nearestAllowed` moves it and the kit shows the before / after.
 * The value is committed on release, on blur and on Enter (saves on blur, DES-§12.2).
 */
import { useEffect, useId, useState } from "react";
import { cleanHex } from "@/lib/design/brand-kit";
import { useT } from "@/lib/i18n/admin/client";
import { fromOklch, toOklch } from "@/lib/theme/color";
import { cn } from "@/lib/utils";

interface Lch {
  l: number;
  c: number;
  h: number;
}

const BAND = { from: 25, to: 75, chroma: 0.06 };
const GOLD = { from: 75, to: 95, chroma: 0.1 };

/** The forbidden hue ranges at this chroma for this role. */
export function blockedRanges(c: number, gold: boolean): [number, number][] {
  const out: [number, number][] = [];
  if (c > BAND.chroma) out.push([BAND.from, BAND.to]);
  if (gold && c > GOLD.chroma) out.push([GOLD.from, GOLD.to]);
  return out;
}

/** A hue moved to the nearest edge of the band it falls in (bands touching each other merge). */
export function clampHue(h: number, ranges: [number, number][]): number {
  if (!ranges.length) return h;
  const lo = Math.min(...ranges.map((r) => r[0]));
  const hi = Math.max(...ranges.map((r) => r[1]));
  if (h <= lo || h >= hi) return h;
  return h - lo < hi - h ? lo - 1 : hi + 1;
}

const HATCH = "repeating-linear-gradient(135deg, var(--muted) 0 3px, var(--border) 3px 6px)";
/**
 * Track stops as gamut-mapped hex from the engine's own conversion (never a CSS colour function the browser would
 * clip, which can drift a strong gold toward amber): the track shows exactly the colours the slider can store.
 */
const stops = (n: number, at: (k: number) => Lch) => Array.from({ length: n + 1 }, (_, i) => fromOklch(at(i / n))).join(", ");
/** A stop inside a blocked band takes the nearest allowed edge, so no blended band colour shows past the hatch. */
const outside = (h: number, ranges: [number, number][]) => {
  if (!ranges.length) return h;
  const a = Math.min(...ranges.map((r) => r[0]));
  const b = Math.max(...ranges.map((r) => r[1]));
  return h > a - 1 && h < b + 1 ? (h - a < b - h ? a - 1 : b + 1) : h;
};
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const fromHex = (hex: string): Lch => {
  const o = toOklch(hex);
  return { l: r3(o.l), c: r3(o.c), h: Math.round(o.h * 10) / 10 };
};

function Slider({ label, value, min, max, step, onInput, onCommit, track, bands, format }: { label: string; value: number; min: number; max: number; step: number; onInput(v: number): void; onCommit(): void; track: string; bands?: [number, number][]; format(v: number): string }) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium">
          {label}
        </label>
        <span className="font-mono text-[12px] text-muted-foreground tabular-nums" dir="ltr">
          {format(value)}
        </span>
      </div>
      <div className="relative h-11" dir="ltr">
        <div aria-hidden className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 overflow-hidden rounded-full" style={{ background: track, boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.08)" }}>
          {bands?.map(([a, b]) => (
            <span key={`${a}-${b}`} className="absolute inset-y-0" style={{ left: `${((a - min) / (max - min)) * 100}%`, width: `${((b - a) / (max - min)) * 100}%`, background: HATCH }} />
          ))}
        </div>
        <input
          id={id}
          type="range"
          dir="ltr"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onInput(Number(e.target.value))}
          onPointerUp={onCommit}
          onKeyUp={(e) => {
            if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End" || e.key === "PageUp" || e.key === "PageDown") onCommit();
          }}
          onBlur={onCommit}
          className="brand-range absolute inset-0 h-11 w-full cursor-pointer appearance-none bg-transparent"
        />
      </div>
    </div>
  );
}

export function OklchPicker({ value, gold, onCommit, disabled }: { value: string | null; gold: boolean; onCommit(hex: string): void; disabled?: boolean }) {
  const t = useT();
  const hexId = useId();
  const [lch, setLch] = useState<Lch>(() => (value ? fromHex(value) : { l: 0.55, c: 0.12, h: 160 }));
  const [hex, setHex] = useState(value ?? "");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!value) return;
    setLch(fromHex(value));
    setHex(value);
    setDirty(false);
  }, [value]);
  const ranges = blockedRanges(lch.c, gold);
  const current = fromOklch(lch);
  const set = (next: Partial<Lch>) => {
    const merged = { ...lch, ...next };
    const h = clampHue(merged.h, blockedRanges(merged.c, gold));
    const n = { ...merged, h };
    setLch(n);
    setHex(fromOklch(n));
    setDirty(true);
  };
  const commit = () => {
    if (!dirty || disabled) return;
    setDirty(false);
    onCommit(current);
  };
  const commitHex = () => {
    const h = cleanHex(hex);
    if (!h || h === value) return;
    setLch(fromHex(h));
    onCommit(h);
  };
  return (
    <fieldset disabled={disabled} className="grid gap-3 rounded-xl border bg-background/60 p-3">
      <div className="flex items-end gap-3">
        <span aria-hidden className="size-11 shrink-0 rounded-lg" style={{ background: current, boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.08)" }} />
        <div className="grid flex-1 gap-1.5">
          <label htmlFor={hexId} className="text-[13px] font-medium">
            {t("brand.colors.hex")}
          </label>
          <input
            id={hexId}
            dir="ltr"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={hex}
            maxLength={7}
            onChange={(e) => setHex(e.target.value)}
            onBlur={commitHex}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitHex();
              }
            }}
            className="h-11 w-full rounded-lg border bg-background px-3 font-mono text-[14px] uppercase tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>
      <Slider label={t("brand.colors.lightness")} value={lch.l} min={0.2} max={0.95} step={0.01} onInput={(l) => set({ l })} onCommit={commit} track={`linear-gradient(to right, ${stops(8, (k) => ({ l: 0.2 + k * 0.75, c: lch.c, h: lch.h }))})`} format={(v) => `${Math.round(v * 100)}%`} />
      <Slider label={t("brand.colors.chroma")} value={lch.c} min={0} max={0.3} step={0.005} onInput={(c) => set({ c })} onCommit={commit} track={`linear-gradient(to right, ${stops(8, (k) => ({ l: lch.l, c: k * 0.3, h: lch.h }))})`} format={(v) => v.toFixed(3)} />
      <Slider label={t("brand.colors.hue")} value={lch.h} min={0} max={360} step={1} onInput={(h) => set({ h })} onCommit={commit} track={`linear-gradient(to right, ${stops(72, (k) => ({ l: lch.l, c: lch.c, h: outside(k * 360, ranges) }))})`} bands={ranges} format={(v) => `${Math.round(v)}°`} />
      {ranges.length ? <p className="text-[12px] text-muted-foreground">{t("brand.colors.band")}</p> : null}
    </fieldset>
  );
}

/** A swatch button (44 px target) for the "From your logo / photos" rows. */
export function SwatchButton({ hex, label, onPick, selected }: { hex: string; label: string; onPick(): void; selected?: boolean }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={label}
      aria-pressed={selected}
      className={cn("grid size-11 place-items-center rounded-lg border transition-[box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring", selected && "ring-2 ring-foreground")}
    >
      <span aria-hidden className="size-8 rounded-md" style={{ background: hex, boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.08)" }} />
    </button>
  );
}

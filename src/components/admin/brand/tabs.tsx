"use client";
/**
 * The four tabs of the brand kit (P6 DESIGN; design.md DES-§12.2, DES-§12.4, DES-§12.5, DES-§12.7, DES-§20.4, DS45).
 * Each tab is a form column of fields with the label above the input (never a placeholder as a label); a field being
 * saved shows "Saving…" beside its label, never a spinner; an error shows inline under the field.
 */
import { Check, Lock, LockOpen, Upload, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { brandEmpty, DARK_GROUND, LIGHT_GROUND } from "@/lib/design/brand-kit";
import type { MessageKey } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { iconSource } from "@/lib/logo/favicon";
import { gridMonogram, svgDataUri } from "@/lib/logo/monogram-grid";
import { fontFaceCss, fontPreloads, fontStack } from "@/lib/theme/fonts";
import { cn } from "@/lib/utils";
import { OklchPicker, SwatchButton } from "./color-picker";
import { inkOn, neutralSwatch } from "./specimen";
import type { BrandKitView, LogoSlot, PairingCard } from "./types";

export type FieldState = { saving?: boolean; error?: string | null };

export function Field({ label, hint, state, children, aside, id }: { label: ReactNode; hint?: ReactNode; state?: FieldState; children: ReactNode; aside?: ReactNode; id?: string }) {
  const t = useT();
  return (
    <div className="grid gap-2" role="group" aria-labelledby={id}>
      <div className="flex min-h-6 items-center justify-between gap-3">
        <p id={id} className="text-[13px] font-medium">
          {label}
          {state?.saving ? (
            <span className="ms-2 text-[12px] font-normal text-muted-foreground" aria-live="polite">
              {t("brand.saving")}
            </span>
          ) : null}
        </p>
        {aside}
      </div>
      {hint ? <p className="-mt-1 text-[13px] leading-snug text-muted-foreground">{hint}</p> : null}
      {children}
      {state?.error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

export function LockToggle({ on, onChange, disabled, label }: { on: boolean; onChange(on: boolean): void; disabled?: boolean; label: string }) {
  const t = useT();
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        on ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {on ? <Lock className="size-3.5" aria-hidden /> : <LockOpen className="size-3.5" aria-hidden />}
      {on ? t("brand.locked") : t("brand.lock")}
    </button>
  );
}

const EmptyLine = ({ children }: { children: ReactNode }) => <p className="rounded-xl border border-dashed px-4 py-3 text-[14px] leading-snug text-muted-foreground">{children}</p>;

/* ------------------------------------------------------------------ */
/* Logo                                                                */
/* ------------------------------------------------------------------ */

const ACCEPT = "image/png,image/webp,image/jpeg,image/avif";
const MAX_BYTES = 8 * 1024 * 1024;

export function monogramSvg(name: string, vibe: string, accent: string | null): string {
  const ground = accent ?? "#262626";
  return gridMonogram({ name, vibe, enclosure: "rounded", caps: "butt", glyph: "dot", ground, ink: inkOn(ground) }).svg;
}

function LogoPreviews({ view, storeName }: { view: BrandKitView; storeName: string }) {
  const t = useT();
  const primary = view.logos.primary;
  const icon = iconSource(view.logos.mark ?? null, primary ?? null);
  const iconUrl = icon === "mark" ? view.logos.mark?.url : icon === "logo" ? primary?.url : svgDataUri(monogramSvg(storeName, view.topVibes[0] ?? "maison", view.brand.colors.accent));
  const onDark = view.logos.inverse?.url ?? primary?.url;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <figure className="grid gap-1.5">
        <div className="grid h-28 place-items-center rounded-xl border px-6" style={{ background: LIGHT_GROUND }}>
          {primary?.url ? <img src={primary.url} alt="" className="max-h-16 max-w-full object-contain" /> : null}
        </div>
        <figcaption className="text-[12px] text-muted-foreground">{t("brand.logo.onLight")}</figcaption>
      </figure>
      <figure className="grid gap-1.5">
        <div className="grid h-28 place-items-center rounded-xl border px-6" style={{ background: DARK_GROUND }}>
          {onDark ? <img src={onDark} alt="" className="max-h-16 max-w-full object-contain" /> : null}
        </div>
        <figcaption className="text-[12px] text-muted-foreground">{t("brand.logo.onDark")}</figcaption>
      </figure>
      <figure className="grid gap-1.5">
        <div className="flex h-14 items-center gap-2 rounded-xl border bg-muted/50 px-3">
          <span className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-t-lg bg-background px-2.5 text-[12px] shadow-[0_-1px_0_var(--border)]">
            {iconUrl ? <img src={iconUrl} alt="" width={16} height={16} className="size-4 shrink-0 rounded-[3px] object-contain" /> : null}
            <span className="truncate" dir="auto">
              {storeName}
            </span>
          </span>
        </div>
        <figcaption className="text-[12px] text-muted-foreground">{t("brand.logo.favicon")}</figcaption>
      </figure>
      <figure className="grid gap-1.5">
        <div className="flex h-14 items-center gap-3 rounded-xl border bg-muted/50 px-3">
          <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-background shadow-[inset_0_0_0_1px_var(--border)]">
            {iconUrl ? <img src={iconUrl} alt="" className={cn("object-contain", icon === "monogram" ? "size-10" : "size-8")} /> : null}
          </span>
          <span className="truncate text-[13px] font-medium" dir="auto">
            {storeName}
          </span>
        </div>
        <figcaption className="text-[12px] text-muted-foreground">{t("brand.logo.avatar")}</figcaption>
      </figure>
    </div>
  );
}

function UploadButton({ label, onFile, disabled, primary = false }: { label: string; onFile(f: File): void; disabled?: boolean; primary?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        className={cn(
          "inline-flex h-11 items-center gap-2 rounded-lg px-4 text-[14px] font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
          primary ? "bg-foreground text-background hover:bg-foreground/90" : "border bg-background hover:bg-muted",
        )}
      >
        <Upload className="size-4" aria-hidden />
        {label}
      </button>
      <input
        ref={ref}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
    </>
  );
}

export function LogoTab({ view, storeName, canEdit, state, onUpload, onRemove, uploadAvailable }: { view: BrandKitView; storeName: string; canEdit: boolean; state: Partial<Record<LogoSlot, FieldState>>; onUpload(slot: LogoSlot, file: File): void; onRemove(slot: LogoSlot): void; uploadAvailable: boolean }) {
  const t = useT();
  const [drag, setDrag] = useState(false);
  const empty = brandEmpty(view.brand).logo;
  const ids = { primary: useId(), mark: useId(), inverse: useId() };
  if (empty) {
    return (
      <Field id={ids.primary} label={t("brand.logo.primary")} state={state.primary}>
        <div
          onDragOver={(e) => {
            if (!canEdit) return;
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f && canEdit) onUpload("primary", f);
          }}
          className={cn("grid justify-items-center gap-4 rounded-2xl border border-dashed px-6 py-8 text-center transition-colors duration-150", drag && "border-foreground bg-muted/60")}
        >
          <img src={svgDataUri(monogramSvg(storeName, view.topVibes[0] ?? "maison", view.brand.colors.accent))} alt="" width={72} height={72} className="size-[72px]" />
          <p className="max-w-[40ch] text-[14px] leading-snug text-pretty">{t("brand.logo.empty")}</p>
          {canEdit && uploadAvailable ? <UploadButton primary label={t("brand.logo.upload")} onFile={(f) => onUpload("primary", f)} disabled={state.primary?.saving} /> : null}
          <p className="text-[12px] text-muted-foreground">{t("brand.logo.drop")}</p>
        </div>
      </Field>
    );
  }
  const slot = (key: "mark" | "inverse", label: MessageKey, hint: MessageKey) => {
    const v = view.logos[key];
    return (
      <Field id={ids[key]} label={t(label)} hint={t(hint)} state={state[key]}>
        <div className="flex items-center gap-3">
          <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border" style={{ background: key === "inverse" ? DARK_GROUND : LIGHT_GROUND }}>
            {v?.url ? <img src={v.url} alt="" className="max-h-10 max-w-10 object-contain" /> : null}
          </span>
          {canEdit && uploadAvailable ? <UploadButton label={v ? t("brand.logo.replace") : t("brand.logo.upload")} onFile={(f) => onUpload(key, f)} disabled={state[key]?.saving} /> : null}
          {canEdit && v ? (
            <button type="button" onClick={() => onRemove(key)} className="inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="size-4" aria-hidden />
              {t("brand.logo.remove")}
            </button>
          ) : null}
        </div>
      </Field>
    );
  };
  return (
    <div className="grid gap-7">
      <Field
        id={ids.primary}
        label={t("brand.logo.primary")}
        state={state.primary}
        aside={
          canEdit ? (
            <div className="flex gap-1">
              {uploadAvailable ? <UploadButton label={t("brand.logo.replace")} onFile={(f) => onUpload("primary", f)} disabled={state.primary?.saving} /> : null}
              <button type="button" onClick={() => onRemove("primary")} className="inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="size-4" aria-hidden />
                {t("brand.logo.remove")}
              </button>
            </div>
          ) : null
        }
      >
        <LogoPreviews view={view} storeName={storeName} />
        {view.contrast.dark && !view.logos.inverse ? <p className="rounded-lg bg-[var(--warn)]/12 px-3 py-2 text-[13px] text-[var(--warn-ink)]">{t("brand.logo.contrast")}</p> : null}
        {view.contrast.light ? <p className="rounded-lg bg-[var(--warn)]/12 px-3 py-2 text-[13px] text-[var(--warn-ink)]">{t("brand.logo.contrastLight")}</p> : null}
      </Field>
      {slot("mark", "brand.logo.mark", "brand.logo.markHint")}
      {slot("inverse", "brand.logo.inverse", "brand.logo.inverseHint")}
    </div>
  );
}

/** The client-side refusals before an upload (the server refuses the same files). */
export function logoFileProblem(f: File): MessageKey | null {
  if (f.type === "image/svg+xml" || /\.svg$/i.test(f.name)) return "brand.logo.svg";
  if (!ACCEPT.split(",").includes(f.type)) return "brand.logo.svg";
  if (f.size > MAX_BYTES) return "brand.logo.tooLarge";
  return null;
}

/* ------------------------------------------------------------------ */
/* Colours                                                             */
/* ------------------------------------------------------------------ */

export interface MovedNote {
  role: "accent" | "pop";
  from: string;
  to: string;
}

function MovedColour({ note }: { note: MovedNote }) {
  const t = useT();
  return (
    <div role="status" className="grid gap-2 rounded-xl border bg-muted/40 p-3">
      <div className="flex items-center gap-3" dir="ltr">
        <span className="grid justify-items-center gap-1">
          {/* the request is never painted: it sat in the band (no orange anywhere, owner rule), so it shows hatched */}
          <span className="size-10 rounded-lg border" style={{ background: "repeating-linear-gradient(135deg, var(--muted) 0 3px, var(--border) 3px 6px)" }} aria-hidden />
          <span className="font-mono text-[11px] text-muted-foreground uppercase line-through">{note.from}</span>
        </span>
        <span aria-hidden className="text-muted-foreground">
          →
        </span>
        <span className="grid justify-items-center gap-1">
          <span className="size-10 rounded-lg" style={{ background: note.to }} aria-hidden />
          <span className="font-mono text-[11px] uppercase">{note.to}</span>
        </span>
      </div>
      <p className="text-[13px] leading-snug">{t("brand.colors.moved")}</p>
    </div>
  );
}

export function ColorsTab({
  view,
  canEdit,
  state,
  moved,
  onColor,
  onLock,
  orangeRequested,
}: {
  view: BrandKitView;
  canEdit: boolean;
  state: Partial<Record<"accent" | "pop" | "neutral" | "base", FieldState>>;
  moved: MovedNote | null;
  onColor(role: "accent" | "pop" | "neutral" | "base", value: string | number | null): void;
  onLock(role: "accent" | "pop" | "neutral" | "base", on: boolean): void;
  orangeRequested: boolean;
}) {
  const t = useT();
  const c = view.brand.colors;
  const empty = brandEmpty(view.brand).colors;
  const ids = { accent: useId(), pop: useId(), neutral: useId(), base: useId() };
  const role = (key: "accent" | "pop", label: MessageKey, hint: MessageKey) => (
    <Field id={ids[key]} label={t(label)} hint={t(hint)} state={state[key]} aside={<LockToggle on={c.locks.includes(key)} disabled={!canEdit || !c[key]} onChange={(on) => onLock(key, on)} label={`${t(label)}: ${t("brand.lock")}`} />}>
      {moved?.role === key ? <MovedColour note={moved} /> : null}
      <OklchPicker value={c[key]} gold onCommit={(hex) => onColor(key, hex)} disabled={!canEdit} />
      {canEdit && c[key] ? (
        <button type="button" onClick={() => onColor(key, null)} className="justify-self-start text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {t("brand.colors.clear")}
        </button>
      ) : null}
    </Field>
  );
  const picks = (title: MessageKey, list: readonly string[]) =>
    list.length ? (
      <Field label={t(title)}>
        <div className="flex flex-wrap gap-1.5">
          {list.map((hex) => (
            <SwatchButton key={hex} hex={hex} label={`${t("brand.colors.useAccent")} ${hex}`} selected={c.accent === hex} onPick={() => canEdit && onColor("accent", hex)} />
          ))}
        </div>
      </Field>
    ) : null;
  return (
    <div className="grid gap-7">
      {empty ? <EmptyLine>{t("brand.colors.empty")}</EmptyLine> : null}
      {orangeRequested ? <p className="text-[13px] text-muted-foreground">{t("brand.colors.orangeSetting")}</p> : null}
      {picks("brand.colors.fromLogo", c.fromLogo)}
      {picks("brand.colors.fromPhotos", view.photoSwatches)}
      {role("accent", "brand.colors.accent", "brand.colors.accentHint")}
      {role("pop", "brand.colors.pop", "brand.colors.popHint")}
      <Field id={ids.neutral} label={t("brand.colors.neutral")} hint={t("brand.colors.neutralHint")} state={state.neutral} aside={<LockToggle on={c.locks.includes("neutral")} disabled={!canEdit || c.neutralHue === null} onChange={(on) => onLock("neutral", on)} label={`${t("brand.colors.neutral")}: ${t("brand.lock")}`} />}>
        <NeutralHue value={c.neutralHue} disabled={!canEdit} onCommit={(h) => onColor("neutral", h)} />
      </Field>
      <Field id={ids.base} label={t("brand.colors.base")} state={state.base} aside={<LockToggle on={c.locks.includes("base")} disabled={!canEdit || c.base === null} onChange={(on) => onLock("base", on)} label={`${t("brand.colors.base")}: ${t("brand.lock")}`} />}>
        <div role="radiogroup" aria-labelledby={ids.base} className="grid grid-cols-3 gap-2">
          {(["light", "tinted", "dark"] as const).map((b) => (
            <button
              key={b}
              type="button"
              role="radio"
              aria-checked={c.base === b}
              disabled={!canEdit}
              onClick={() => onColor("base", c.base === b ? null : b)}
              className={cn("grid h-[52px] grid-cols-[20px_1fr] items-center gap-2 rounded-xl border px-3 text-start text-[13px] font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring", c.base === b ? "border-foreground bg-muted/60" : "hover:bg-muted/40")}
            >
              <span aria-hidden className="size-5 rounded-md border" style={{ background: b === "dark" ? DARK_GROUND : b === "tinted" ? (neutralSwatch(c.neutralHue ?? 160) ?? LIGHT_GROUND) : LIGHT_GROUND }} />
              {t(`brand.colors.base.${b}`)}
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}

function NeutralHue({ value, onCommit, disabled }: { value: number | null; onCommit(h: number | null): void; disabled?: boolean }) {
  const t = useT();
  const id = useId();
  const [h, setH] = useState(value ?? 160);
  useEffect(() => {
    if (value !== null) setH(value);
  }, [value]);
  const stops = Array.from({ length: 25 }, (_, i) => neutralSwatch(i * 15)).join(", ");
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-3">
        <span aria-hidden className="size-11 shrink-0 rounded-lg border" style={{ background: value === null ? "transparent" : (neutralSwatch(h) ?? undefined) }} />
        <div className="relative h-11 flex-1" dir="ltr">
          <div aria-hidden className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full" style={{ background: `linear-gradient(to right, ${stops})`, boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.08)" }} />
          <input
            id={id}
            aria-label={t("brand.colors.hue")}
            type="range"
            dir="ltr"
            min={0}
            max={360}
            step={1}
            value={h}
            disabled={disabled}
            onChange={(e) => setH(Number(e.target.value))}
            onPointerUp={() => onCommit(h)}
            onKeyUp={(e) => e.key.startsWith("Arrow") && onCommit(h)}
            className="brand-range absolute inset-0 h-11 w-full cursor-pointer appearance-none bg-transparent"
          />
        </div>
      </div>
      {value !== null && !disabled ? (
        <button type="button" onClick={() => onCommit(null)} className="justify-self-start text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {t("brand.colors.clear")}
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Type                                                                */
/* ------------------------------------------------------------------ */

const PAGE = 12;

/** One card's faces, loaded only once the card is in the viewport (UX-32). */
function useInView<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

function PairingCardView({ p, chosen, canEdit, onPick, storeName }: { p: PairingCard; chosen: boolean; canEdit: boolean; onPick(): void; storeName: string }) {
  const t = useT();
  const [ref, seen] = useInView<HTMLButtonElement>();
  const css = useMemo(() => (seen ? fontFaceCss([p.display, p.displayAr], "ar", "/") : ""), [seen, p.display, p.displayAr]);
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={chosen}
      disabled={!canEdit && !chosen}
      onClick={onPick}
      className={cn("grid gap-2 rounded-xl border p-4 text-start transition-[border-color,background-color] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring", chosen ? "border-foreground bg-muted/50" : "hover:bg-muted/40")}
    >
      {css ? <style>{css}</style> : null}
      <span className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[24px] leading-tight" dir="auto" style={{ fontFamily: seen ? fontStack(p.display) : undefined, fontWeight: p.displayWeight }}>
          {storeName}
        </span>
        {chosen ? <Check className="size-4 shrink-0" aria-label={t("brand.type.chosen")} /> : null}
      </span>
      <span dir="rtl" lang="ar" className="truncate text-[22px] leading-snug" style={{ fontFamily: seen ? fontStack(p.displayAr) : undefined, fontWeight: p.displayWeightAr }}>
        أبجد هوز حطي
      </span>
      <span className="text-[12px] font-medium text-muted-foreground" dir="ltr">
        {p.families.display} / {p.families.displayAr}
      </span>
      <span className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">{p.note}</span>
    </button>
  );
}

export function TypeTab({ view, pairings, canEdit, state, storeName, onPick, onLock }: { view: BrandKitView; pairings: readonly PairingCard[]; canEdit: boolean; state: FieldState | undefined; storeName: string; onPick(id: string | null): void; onLock(on: boolean): void }) {
  const t = useT();
  const locale = useAdminLocale();
  const [shown, setShown] = useState(PAGE);
  const chosenId = view.brand.fonts.pairing;
  const ordered = useMemo(() => {
    const rank = (p: PairingCard) => {
      const i = view.topVibes.findIndex((v) => v === p.archetype || p.alsoFits.includes(v));
      return i < 0 ? 99 : i;
    };
    const rest = pairings.filter((p) => p.id !== chosenId).sort((a, b) => rank(a) - rank(b));
    const chosen = pairings.find((p) => p.id === chosenId);
    return chosen ? [chosen, ...rest] : rest;
  }, [pairings, chosenId, view.topVibes]);
  // ≤ 4 preloaded files: the display faces of the first two top-vibe pairings, Latin and Arabic
  const preloads = useMemo(() => {
    const all = ordered.slice(0, 2).flatMap((p) => [...fontPreloads([p.display], locale === "ar" ? "fr" : locale, "/"), ...fontPreloads([p.displayAr], "ar", "/")]);
    return all.filter((l, i) => all.findIndex((x) => x.href === l.href) === i).slice(0, 4);
  }, [ordered, locale]);
  return (
    <Field
      label={t("brand.tab.type")}
      state={state}
      aside={chosenId ? <LockToggle on={view.brand.fonts.locked} disabled={!canEdit} onChange={onLock} label={`${t("brand.tab.type")}: ${t("brand.lock")}`} /> : null}
    >
      {preloads.map((l) => (
        <link key={l.href} rel="preload" as="font" type={l.type} href={l.href} crossOrigin="anonymous" />
      ))}
      {!chosenId ? <EmptyLine>{t("brand.type.empty")}</EmptyLine> : null}
      <div className="grid gap-2.5">
        {ordered.slice(0, shown).map((p) => (
          <PairingCardView key={`${p.archetype}:${p.id}`} p={p} chosen={p.id === chosenId} canEdit={canEdit} storeName={storeName} onPick={() => canEdit && onPick(p.id === chosenId ? null : p.id)} />
        ))}
      </div>
      {shown < ordered.length ? (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="h-11 justify-self-start rounded-lg border px-4 text-[14px] font-medium hover:bg-muted">
          {t("brand.type.more")}
        </button>
      ) : null}
    </Field>
  );
}

/* ------------------------------------------------------------------ */
/* Voice                                                               */
/* ------------------------------------------------------------------ */

export const REGISTERS = ["plain", "warm", "precise", "bold", "poetic-restrained"] as const;

export function VoiceTab({ view, canEdit, state, wordsHref, onRegister, onDarija }: { view: BrandKitView; canEdit: boolean; state: Partial<Record<"register" | "darija", FieldState>>; wordsHref: string | null; onRegister(r: (typeof REGISTERS)[number] | null): void; onDarija(d: "none" | "cta" | "light"): void }) {
  const t = useT();
  const ids = { register: useId(), darija: useId() };
  const reg = view.voice.register;
  return (
    <div className="grid gap-7">
      {!reg ? <EmptyLine>{t("brand.voice.empty")}</EmptyLine> : null}
      <Field id={ids.register} label={t("brand.voice.register")} state={state.register}>
        <div role="radiogroup" aria-labelledby={ids.register} className="grid gap-2">
          {REGISTERS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reg === r}
              disabled={!canEdit}
              onClick={() => onRegister(reg === r ? null : r)}
              className={cn("grid gap-1 rounded-xl border px-4 py-3 text-start transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring", reg === r ? "border-foreground bg-muted/50" : "hover:bg-muted/40")}
            >
              <span className="flex items-center justify-between gap-2 text-[14px] font-semibold">
                {t(`design.chip.voice.${r}`)}
                {reg === r ? <Check className="size-4" aria-hidden /> : null}
              </span>
              <span className="text-[14px] leading-snug text-muted-foreground" dir="auto">
                {t(`brand.voice.example.${r}`)}
              </span>
            </button>
          ))}
        </div>
      </Field>
      <Field id={ids.darija} label={t("brand.voice.darija")} state={state.darija}>
        <div role="radiogroup" aria-labelledby={ids.darija} className="grid grid-cols-3 gap-2">
          {(["none", "cta", "light"] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={view.voice.darija === d}
              disabled={!canEdit}
              onClick={() => onDarija(d)}
              className={cn("h-[52px] rounded-xl border px-2 text-[13px] font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring", view.voice.darija === d ? "border-foreground bg-muted/60" : "hover:bg-muted/40")}
            >
              {t(`brand.voice.darija.${d}`)}
            </button>
          ))}
        </div>
      </Field>
      {wordsHref ? (
        <a href={wordsHref} className="inline-flex h-11 items-center justify-self-start text-[14px] font-medium underline underline-offset-4 hover:text-muted-foreground">
          {t("brand.voice.words")}
        </a>
      ) : null}
    </div>
  );
}

"use client";
/**
 * The welcome flow's first two screens (P2 SHELL; platform.md PLA-§22.2 `photos` and `details` rows, PD23; UX-01):
 *
 * - `PhotosStep`: the large drop zone (1 to 5 photos, click to pick, camera capture on phones) and "Start without
 *   photos". Dropping photos moves straight on to the details: they upload while the owner types.
 * - `PhotoStrip`: the photos above the details form, each one's upload state (progress, failed with Try again,
 *   remove) and the "Add a photo" tile while fewer than five.
 * - `DetailsForm`: the category chips with the suggested one marked (a tap is required), the product name with "Use
 *   suggestion" (never filled for the owner), the price (numeric keypad, currency suffix), the price before (optional,
 *   kept only when higher) and one optional fact.
 *
 * Honesty (PD23, owner rule 4): nothing here fills a price, a name or a fact for the owner; a suggestion needs a tap.
 */
import { AlertCircleIcon, CameraIcon, ImagePlusIcon, Loader2Icon, PlusIcon, RotateCcwIcon, SparklesIcon, XIcon } from "lucide-react";
import { useId, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/admin/client";
import type { MessageKey } from "@/lib/i18n/admin";
import { PRODUCT_CATEGORIES, type ProductCategory } from "@/lib/page/schema";
import { cn } from "@/lib/utils";
import { FOCUS_RING, TOUCH } from "@/components/admin/common/ui-classes";
import type { DetailsDraft, DetailsErrorKey, DetailsField } from "./flow-logic";
import type { UploadFailure, UploadedPhoto } from "./photo-upload";

export const PHOTOS_MAX = 5;
const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif";

/** One photo of the step: uploading (a local preview), done (the library's thumbnail) or failed. */
export interface PhotoSlot {
  key: string;
  state: "uploading" | "done" | "failed";
  /** 0..1 of the transfer */
  progress: number;
  previewUrl: string | null;
  photo: UploadedPhoto | null;
  error: UploadFailure | null;
}

const FAILURE_KEY: Record<UploadFailure, MessageKey> = {
  quota: "onboarding.photos.quota",
  too_large: "onboarding.photos.too_large",
  not_image: "onboarding.photos.not_image",
  failed: "onboarding.photos.failed",
};

/** The files of a drop or a pick that are images (a dropped folder or a PDF is left out). */
const imagesOf = (list: FileList | null) => [...(list ?? [])].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));

/** The two hidden inputs: the picker and, on phones, the camera. */
function PhotoInputs({ onFiles, pickRef, cameraRef, multiple }: { onFiles(files: File[]): void; pickRef: RefObject<HTMLInputElement | null>; cameraRef: RefObject<HTMLInputElement | null>; multiple: boolean }) {
  const take = (e: ChangeEvent<HTMLInputElement>) => {
    onFiles(imagesOf(e.target.files));
    e.target.value = "";
  };
  return (
    <>
      <input ref={pickRef} type="file" accept={ACCEPT} multiple={multiple} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={take} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={take} />
    </>
  );
}

export function PhotosStep({ onFiles, onSkip, busy }: { onFiles(files: File[]): void; onSkip(): void; busy: boolean }) {
  const t = useT();
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    onFiles(imagesOf(e.dataTransfer.files));
  };
  return (
    <div className="grid gap-6">
      <PhotoInputs onFiles={onFiles} pickRef={pickRef} cameraRef={cameraRef} multiple />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={cn(
          "adm-surface relative grid min-h-[340px] place-items-center overflow-hidden px-6 py-10 text-center transition-[box-shadow,background-color] duration-200 sm:min-h-[380px]",
          over && "bg-primary/[0.04] ring-2 ring-primary",
        )}
      >
        <div aria-hidden="true" className="adm-dots pointer-events-none absolute inset-0 opacity-70" />
        <div className="relative grid max-w-[380px] justify-items-center gap-5">
          <span className="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <ImagePlusIcon className="size-7" aria-hidden="true" />
          </span>
          <div className="grid gap-2">
            <h2 className="text-balance text-[1.35rem] font-semibold tracking-tight sm:text-[1.5rem]">{over ? t("onboarding.photos.drop_here") : t("onboarding.photos.title")}</h2>
            <p className="text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">{t("onboarding.photos.hint")}</p>
          </div>
          <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
            <Button type="button" size="lg" className={cn("h-12 rounded-full px-6 text-[0.95rem]", FOCUS_RING)} onClick={() => pickRef.current?.click()} disabled={busy}>
              <ImagePlusIcon aria-hidden="true" />
              {t("onboarding.photos.pick")}
            </Button>
            <Button type="button" size="lg" variant="outline" className={cn("h-12 rounded-full px-6 text-[0.95rem] md:hidden", FOCUS_RING)} onClick={() => cameraRef.current?.click()} disabled={busy}>
              <CameraIcon aria-hidden="true" />
              {t("onboarding.photos.camera")}
            </Button>
          </div>
        </div>
      </div>
      <div className="flex justify-center">
        <Button type="button" variant="ghost" className={cn("h-11 rounded-full px-5 text-muted-foreground hover:text-foreground", FOCUS_RING)} onClick={onSkip} disabled={busy}>
          {t("onboarding.photos.skip")}
        </Button>
      </div>
    </div>
  );
}

/** The photos above the details: each upload's state, and the tile that adds one more. */
export function PhotoStrip({ slots, onFiles, onRemove, onRetry }: { slots: readonly PhotoSlot[]; onFiles(files: File[]): void; onRemove(key: string): void; onRetry(key: string): void }) {
  const t = useT();
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploading = slots.filter((s) => s.state === "uploading").length;
  const failed = slots.find((s) => s.state === "failed");
  return (
    <div className="grid gap-2.5">
      <PhotoInputs onFiles={onFiles} pickRef={pickRef} cameraRef={cameraRef} multiple />
      <ul className="flex flex-wrap gap-2.5" aria-label={t("onboarding.photos.count", { count: slots.length })}>
        {slots.map((s, i) => (
          <li key={s.key} className="adm-fade relative size-[72px] shrink-0" style={{ "--i": i } as CSSProperties}>
            <div className={cn("size-full overflow-hidden rounded-xl bg-muted ring-1 ring-border", s.state === "failed" && "ring-destructive/60")}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL or the library thumbnail */}
              {s.photo?.thumbUrl || s.previewUrl ? <img src={s.photo?.thumbUrl ?? s.previewUrl ?? ""} alt="" className={cn("size-full object-cover", s.state === "uploading" && "opacity-60")} /> : null}
            </div>
            {s.state === "uploading" && (
              <span className="absolute inset-x-1.5 bottom-1.5 h-1 overflow-hidden rounded-full bg-background/70">
                <span className="block h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${Math.max(8, Math.round(s.progress * 100))}%` }} />
              </span>
            )}
            {s.state === "failed" && (
              <button type="button" onClick={() => onRetry(s.key)} aria-label={t("onboarding.photos.retry")} title={t("onboarding.photos.retry")} className={cn("absolute inset-0 grid place-items-center rounded-xl bg-background/70 text-destructive", FOCUS_RING)}>
                <RotateCcwIcon className="size-5" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onRemove(s.key)}
              aria-label={t("onboarding.photos.remove")}
              title={t("onboarding.photos.remove")}
              className={cn("absolute -end-2 -top-2 grid size-7 place-items-center rounded-full bg-foreground text-background shadow-sm ring-2 ring-background after:absolute after:-inset-2 after:content-['']", FOCUS_RING)}
            >
              <XIcon className="size-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
        {slots.length < PHOTOS_MAX && (
          <li className="size-[72px] shrink-0">
            <button
              type="button"
              onClick={() => pickRef.current?.click()}
              aria-label={t("onboarding.photos.add")}
              title={t("onboarding.photos.add")}
              className={cn("grid size-full place-items-center rounded-xl text-muted-foreground ring-1 ring-border ring-inset transition-colors duration-150 hover:bg-muted hover:text-foreground", FOCUS_RING)}
            >
              <PlusIcon className="size-5" aria-hidden="true" />
            </button>
          </li>
        )}
      </ul>
      <p className="min-h-5 text-[0.8rem] text-muted-foreground" aria-live="polite">
        {uploading > 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
            {t("onboarding.photos.uploading", { count: uploading })}
          </span>
        ) : failed?.error ? (
          <span className="inline-flex items-center gap-1.5 text-destructive">
            <AlertCircleIcon className="size-3.5" aria-hidden="true" />
            {t(FAILURE_KEY[failed.error])}
          </span>
        ) : slots.length ? (
          t("onboarding.photos.count", { count: slots.length })
        ) : null}
      </p>
    </div>
  );
}

/** The categories shown before "More categories": the common COD ones, the suggested and the chosen one first. */
const COMMON: readonly ProductCategory[] = ["beauty", "skincare", "fragrance", "fashion", "bags", "jewelry", "watches", "health", "kitchen", "home", "kids", "gadgets"];

const categoryKey = (c: ProductCategory) => `shell.category.${c.replace("-", "_")}` as MessageKey;

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[0.85rem] font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="text-[0.8rem] text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="text-[0.8rem] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL = "h-12 rounded-xl text-base md:h-11 md:text-[0.95rem]";

/** A money field: the numeric keypad, the currency as a suffix on the end side, Latin digits left to right. */
function MoneyInput({ id, value, onChange, currency, invalid }: { id: string; value: string; onChange(v: string): void; currency: string; invalid: boolean }) {
  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        autoComplete="off"
        dir="ltr"
        aria-invalid={invalid || undefined}
        aria-describedby={`${id}-msg`}
        className={cn(CONTROL, "pe-16 text-start tabular-nums rtl:text-end")}
      />
      <span className="pointer-events-none absolute inset-y-0 end-4 flex items-center text-[0.85rem] font-medium text-muted-foreground">{currency}</span>
    </div>
  );
}

export interface DetailsFormProps {
  value: DetailsDraft;
  onChange(next: DetailsDraft): void;
  errors: Partial<Record<DetailsField, DetailsErrorKey | MessageKey>>;
  suggestedCategory: ProductCategory | null;
  suggestedName: string | null;
  /** P7's analyze is running: the quiet "Refining the suggestions" chip, never a blocking spinner */
  refining: boolean;
  currency: string;
}

export function DetailsForm({ value: v, onChange, errors, suggestedCategory, suggestedName, refining, currency }: DetailsFormProps) {
  const t = useT();
  const uid = useId();
  const [all, setAll] = useState(false);
  const set = (patch: Partial<DetailsDraft>) => onChange({ ...v, ...patch });
  const lead = [suggestedCategory, v.category as ProductCategory | null].filter((c): c is ProductCategory => !!c && (PRODUCT_CATEGORIES as readonly string[]).includes(c));
  const shown = all ? PRODUCT_CATEGORIES : [...new Set([...lead, ...COMMON])];
  const err = (f: DetailsField) => (errors[f] ? t(errors[f]) : undefined);
  const nameSuggestion = suggestedName && suggestedName.trim() && suggestedName.trim() !== v.productName.trim() ? suggestedName.trim() : null;

  return (
    <div className="grid gap-7">
      <fieldset className="grid gap-3">
        <legend className="mb-3 flex w-full items-center justify-between gap-3">
          <span className="text-[0.85rem] font-medium">{t("onboarding.category.title")}</span>
          {refining && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[0.75rem] text-muted-foreground">
              <SparklesIcon className="size-3" aria-hidden="true" />
              {t("onboarding.refining")}
            </span>
          )}
        </legend>
        <div role="radiogroup" aria-label={t("onboarding.category.title")} aria-describedby={`${uid}-cat-msg`} className="flex flex-wrap gap-2">
          {shown.map((c) => {
            const on = v.category === c;
            const suggested = c === suggestedCategory;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set({ category: c })}
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[0.9rem] ring-1 transition-[background-color,color,box-shadow] duration-150 ring-inset max-md:h-11",
                  on ? "bg-foreground text-background ring-foreground" : suggested ? "bg-primary/[0.06] text-foreground ring-primary/40 hover:bg-primary/10" : "text-foreground ring-border hover:bg-muted",
                  FOCUS_RING,
                )}
              >
                {t(categoryKey(c))}
                {suggested && !on && <span className="rounded-full bg-primary/15 px-1.5 py-px text-[0.7rem] font-medium text-primary">{t("onboarding.category.suggested")}</span>}
              </button>
            );
          })}
          <button type="button" onClick={() => setAll((a) => !a)} aria-expanded={all} className={cn("inline-flex h-10 items-center rounded-full px-3 text-[0.9rem] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline max-md:h-11", FOCUS_RING)}>
            {all ? t("onboarding.category.fewer") : t("onboarding.category.more")}
          </button>
        </div>
        <p id={`${uid}-cat-msg`} className={cn("text-[0.8rem]", errors.category ? "text-destructive" : "text-muted-foreground")} role={errors.category ? "alert" : undefined}>
          {errors.category ? t(errors.category) : t("onboarding.category.hint")}
        </p>
      </fieldset>

      <Field id={`${uid}-name`} label={t("onboarding.product_name")} error={err("productName")}>
        <Input id={`${uid}-name`} value={v.productName} onChange={(e) => set({ productName: e.target.value })} maxLength={120} autoComplete="off" aria-invalid={!!errors.productName || undefined} aria-describedby={`${uid}-name-msg`} className={CONTROL} />
        {nameSuggestion && (
          <button type="button" onClick={() => set({ productName: nameSuggestion })} className={cn("inline-flex min-h-9 max-w-full items-center gap-1.5 justify-self-start rounded-full bg-muted px-3 text-[0.8rem] text-foreground hover:bg-muted/70", TOUCH, FOCUS_RING)}>
            <SparklesIcon className="size-3 shrink-0 text-primary" aria-hidden="true" />
            <span className="shrink-0 font-medium">{t("onboarding.use_suggestion")}</span>
            <span className="truncate text-muted-foreground">{nameSuggestion}</span>
          </button>
        )}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id={`${uid}-price`} label={t("onboarding.price")} hint={t("onboarding.price_hint", { currency })} error={err("priceMinor")}>
          <MoneyInput id={`${uid}-price`} value={v.price} onChange={(price) => set({ price })} currency={currency} invalid={!!errors.priceMinor} />
        </Field>
        <Field id={`${uid}-before`} label={t("onboarding.compare_at")} hint={t("onboarding.compare_hint")} error={err("compareAtMinor")}>
          <MoneyInput id={`${uid}-before`} value={v.compareAt} onChange={(compareAt) => set({ compareAt })} currency={currency} invalid={!!errors.compareAtMinor} />
        </Field>
      </div>

      <Field id={`${uid}-fact`} label={t("onboarding.fact")} hint={t("onboarding.fact_hint")}>
        <Input id={`${uid}-fact`} value={v.fact} onChange={(e) => set({ fact: e.target.value })} maxLength={160} autoComplete="off" aria-describedby={`${uid}-fact-msg`} className={CONTROL} />
      </Field>
    </div>
  );
}

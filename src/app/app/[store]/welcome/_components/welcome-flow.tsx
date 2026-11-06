"use client";
/**
 * The onboarding wow flow in the browser (P2 SHELL; platform.md PLA-§22.2, UX-01, PD23, PD59, PD68; core D59, §A.2):
 * photos → details → reveal → contact; the done step is the server's (`./done-step.tsx`). The page resumes on the saved
 * step with the saved draft, photos and typed price (`onboarding` setting); the browser keeps only conveniences in
 * its own storage (the photos picked and the fields typed before the first save, the photos' palettes), never
 * anything the flow needs to be right.
 *
 * Writes go through `welcome/actions.ts` with the shell's error map (`useActionError`): the limit sheet for a quota,
 * the step-up sheet, the toasts. Nothing here publishes, and the flow works for a pending store.
 *
 * P7's `useAiTask("analyze")` runs once the photos are in and only offers suggestions (a highlighted category, "Use
 * suggestion" on the name), which need a tap and never block typing; its P0b stub answers `disabled`, so today the
 * suggestions are the store's own category only. The local-AI consent card never shows here (PLA-§22.2).
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InfoIcon, Loader2Icon } from "lucide-react";
import { reportRevealAction, saveOnboardingContactAction, saveOnboardingDetailsAction, skipOnboardingAction, useDirectionAction as chooseDirectionAction } from "../actions";
import type { RevealDirections } from "@/components/generate/reveal/RevealFolds";
import { useLimitSheet } from "@/components/admin/shell/limit-sheet";
import { useStore } from "@/components/admin/shell/store-context";
import { useActionError } from "@/components/admin/shell/use-action-error";
import { FOCUS_RING } from "@/components/admin/common/ui-classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { AiPolicy } from "@/lib/ai/policy";
import { useAiTask, useDeviceInfo } from "@/lib/ai/router/client";
import { useT } from "@/lib/i18n/admin/client";
import type { MessageKey } from "@/lib/i18n/admin";
import { PRODUCT_CATEGORIES, type Locale, type Market, type ProductCategory } from "@/lib/page/schema";
import { cn } from "@/lib/utils";
import type { RevealContext, RevealDraft } from "./directions-adapter";
import { canSkip, detailsErrors, keptCompareAt, nextView, parsePrice, previousView, priceText, progressOf, reachedStep, typedWhatsapp, type DetailsDraft, type DetailsField, type FlowStep, type SavedStep } from "./flow-logic";
import { paletteFromUrl, photoFactsOf, PhotoUploadError, uploadPhoto, type UploadedPhoto } from "./photo-upload";
import { DetailsForm, PHOTOS_MAX, PhotosStep, PhotoStrip, type PhotoSlot } from "./step-photos";
import { RevealStep } from "./step-reveal";
import { WelcomeHeader } from "./welcome-header";

export interface WelcomeDraft {
  category: string | null;
  productName: string | null;
  priceMinor: number | null;
  compareAtMinor: number | null;
  fact: string | null;
}

export interface WelcomeFlowProps {
  view: FlowStep;
  saved: SavedStep;
  hasPage: boolean;
  /** the reveal was already reported (the server keeps the first) */
  revealed: boolean;
  draft: WelcomeDraft;
  /** the draft's photos, the store's own library files */
  photos: { id: string; thumbUrl: string | null; width: number; height: number }[];
  suggestedCategory: ProductCategory | null;
  /** the language the pages are written in (the store's first page locale) */
  pageLocale: Locale;
  market: Market;
  /** the store's reveal seed (`revealSeed(brandSeed)`) */
  seedBase: number;
  /** the account's phone, masked ("+212 6•• ••• •34"); null without one */
  phoneMasked: string | null;
  /** the store's WhatsApp number as saved */
  whatsapp: string | null;
  /** the store's media gauge, for the limit sheet of a quota answer */
  mediaQuota: { used: number; limit: number } | null;
  aiPolicy: AiPolicy;
}

const isCategory = (v: unknown): v is ProductCategory => typeof v === "string" && (PRODUCT_CATEGORIES as readonly string[]).includes(v);

/** The browser's convenience copy (never the source of truth): photos and typed fields before the first save. */
type Local = { photos: UploadedPhoto[]; details: DetailsDraft | null };
const localKey = (storeId: string, viewerId: string) => `sg:welcome:${storeId}:${viewerId}`;
function readLocal(key: string): Local | null {
  try {
    const raw = window.localStorage.getItem(key);
    const v = raw ? (JSON.parse(raw) as Local) : null;
    return v && Array.isArray(v.photos) ? v : null;
  } catch {
    return null;
  }
}
function writeLocal(key: string, v: Local | null): void {
  try {
    if (v) window.localStorage.setItem(key, JSON.stringify(v));
    else window.localStorage.removeItem(key);
  } catch {
    // storage blocked or full: the flow works without it
  }
}

const slotOf = (p: UploadedPhoto): PhotoSlot => ({ key: p.id, state: "done", progress: 1, previewUrl: null, photo: p, error: null });

export function WelcomeFlow(p: WelcomeFlowProps) {
  const t = useT();
  const router = useRouter();
  const store = useStore();
  const actions = useActionError();
  const limits = useLimitSheet();
  const [view, setView] = useState<FlowStep>(p.view);
  const [saved, setSaved] = useState<SavedStep>(p.saved);
  const [hasPage, setHasPage] = useState(p.hasPage);
  const [busy, setBusy] = useState(false);
  const key = localKey(store.id, store.viewerId);

  /* ---- photos ---- */
  const [slots, setSlots] = useState<PhotoSlot[]>(() => p.photos.map((ph) => slotOf({ ...ph, palette: null, cutout: false })));
  const files = useRef(new Map<string, File>());
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const owned = urls.current;
    return () => owned.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  /* ---- details ---- */
  const [details, setDetails] = useState<DetailsDraft>({
    category: p.draft.category,
    productName: p.draft.productName ?? "",
    price: priceText(p.draft.priceMinor),
    compareAt: priceText(p.draft.compareAtMinor),
    fact: p.draft.fact ?? "",
  });
  const [errors, setErrors] = useState<Partial<Record<DetailsField, MessageKey>>>({});
  const [savedDraft, setSavedDraft] = useState<RevealDraft | null>(() =>
    isCategory(p.draft.category) && p.draft.productName && p.draft.priceMinor !== null
      ? { category: p.draft.category, productName: p.draft.productName, priceMinor: p.draft.priceMinor, compareAtMinor: p.draft.compareAtMinor, fact: p.draft.fact, assetIds: p.photos.map((ph) => ph.id) }
      : null,
  );

  // the convenience copy: palettes of the saved photos, and the photos and fields of a draft not saved yet
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const local = readLocal(key);
    if (!local) return;
    const byId = new Map(local.photos.map((ph) => [ph.id, ph]));
    const timer = setTimeout(() => {
      setSlots((cur) => {
        const merged = cur.map((s) => (s.photo && byId.has(s.photo.id) ? slotOf({ ...s.photo, ...byId.get(s.photo.id)!, thumbUrl: s.photo.thumbUrl ?? byId.get(s.photo.id)!.thumbUrl }) : s));
        // nothing saved yet: the photos picked before the tab closed come back
        return p.draft.productName === null && !cur.length ? local.photos.slice(0, PHOTOS_MAX).map(slotOf) : merged;
      });
      if (p.draft.productName === null && local.details) setDetails(local.details);
    }, 0);
    return () => clearTimeout(timer);
  }, [key, p.draft.productName]);

  const donePhotos = useMemo(() => slots.flatMap((s) => (s.state === "done" && s.photo ? [s.photo] : [])), [slots]);
  const uploading = slots.some((s) => s.state === "uploading");
  useEffect(() => {
    if (view === "contact" || view === "done") return;
    writeLocal(key, { photos: donePhotos, details: savedDraft ? null : details });
  }, [key, donePhotos, details, savedDraft, view]);

  const quotaSheet = useCallback(
    (numbers: { used: number; limit: number } | null) => {
      const q = numbers ?? p.mediaQuota;
      if (q && limits) limits.open({ kind: "quota", metric: "media_bytes", used: Math.max(q.used, q.limit), limit: q.limit });
    },
    [limits, p.mediaQuota],
  );

  const startUpload = useCallback(
    (slotKey: string, file: File) => {
      uploadPhoto(store.handle, file, {
        onProgress: (ratio) => setSlots((cur) => cur.map((s) => (s.key === slotKey ? { ...s, progress: ratio } : s))),
      }).then(
        (photo) => {
          files.current.delete(slotKey);
          // the same file twice (deduped by the library) is one photo
          setSlots((cur) => (cur.some((s) => s.photo?.id === photo.id && s.key !== slotKey) ? cur.filter((s) => s.key !== slotKey) : cur.map((s) => (s.key === slotKey ? { ...s, state: "done", progress: 1, photo } : s))));
        },
        (err: unknown) => {
          const reason = err instanceof PhotoUploadError ? err.reason : "failed";
          setSlots((cur) => cur.map((s) => (s.key === slotKey ? { ...s, state: "failed", error: reason } : s)));
          if (reason === "quota") quotaSheet(err instanceof PhotoUploadError ? err.quota : null);
        },
      );
    },
    [store.handle, quotaSheet],
  );

  const addFiles = useCallback(
    (list: File[]) => {
      const room = PHOTOS_MAX - slots.length;
      const take = list.slice(0, Math.max(0, room));
      if (list.length > room) actions.show({ ok: false, error: "invalid", message: "onboarding.photos.too_many" }, { toastInvalid: true });
      if (!take.length) return;
      const fresh = take.map((file): PhotoSlot => {
        const url = URL.createObjectURL(file);
        urls.current.add(url);
        const slotKey = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        files.current.set(slotKey, file);
        return { key: slotKey, state: "uploading", progress: 0, previewUrl: url, photo: null, error: null };
      });
      setSlots((cur) => [...cur, ...fresh]);
      fresh.forEach((s) => startUpload(s.key, files.current.get(s.key)!));
      // the details are shown while the uploads finish (PLA-§22.2)
      if (view === "photos") setView(nextView("photos"));
    },
    [slots.length, actions, startUpload, view],
  );
  const removeSlot = (slotKey: string) => {
    files.current.delete(slotKey);
    setSlots((cur) => cur.filter((s) => s.key !== slotKey));
  };
  const retrySlot = (slotKey: string) => {
    const file = files.current.get(slotKey);
    if (!file) return removeSlot(slotKey);
    setSlots((cur) => cur.map((s) => (s.key === slotKey ? { ...s, state: "uploading", progress: 0, error: null } : s)));
    startUpload(slotKey, file);
  };

  /* ---- P7's analyze (suggestions only; the stub answers "disabled") ---- */
  const device = useDeviceInfo();
  const analyze = useAiTask("analyze", { handle: store.handle, policy: p.aiPolicy, device });
  const [suggested, setSuggested] = useState<{ category: ProductCategory | null; name: string | null }>({ category: p.suggestedCategory, name: null });
  const analysed = useRef<string>("");
  const runAnalyze = analyze.run;
  useEffect(() => {
    if (view !== "details" || uploading || !donePhotos.length) return;
    const ids = donePhotos.map((ph) => ph.id).join(",");
    if (analysed.current === ids) return;
    analysed.current = ids;
    void runAnalyze({ assetIds: donePhotos.map((ph) => ph.id), locale: p.pageLocale }, { surface: "onboarding", locale: p.pageLocale }).then((out) => {
      if (!out.ok || !out.value || typeof out.value !== "object") return;
      const v = out.value as { category?: unknown; productName?: unknown; name?: unknown };
      const name = typeof v.productName === "string" ? v.productName : typeof v.name === "string" ? v.name : null;
      setSuggested((cur) => ({ category: isCategory(v.category) ? v.category : cur.category, name: name ? name.slice(0, 120) : cur.name }));
    });
  }, [view, uploading, donePhotos, runAnalyze, p.pageLocale]);

  /* ---- steps ---- */
  const reached = reachedStep(saved, view);
  const goBack = previousView(view, reached, hasPage);
  const go = useCallback((next: FlowStep) => {
    setView(next);
    window.scrollTo({ top: 0 });
  }, []);

  const saveDetails = async () => {
    const found = detailsErrors(details);
    setErrors(found);
    if (Object.keys(found).length || uploading) return;
    const priceMinor = parsePrice(details.price)!;
    const input = {
      category: details.category,
      productName: details.productName.trim(),
      priceMinor,
      compareAtMinor: keptCompareAt(priceMinor, details.compareAt.trim() ? parsePrice(details.compareAt) : null),
      fact: details.fact.trim() || null,
      assetIds: donePhotos.map((ph) => ph.id),
    };
    setBusy(true);
    const res = await actions.run(() => saveOnboardingDetailsAction(input));
    setBusy(false);
    if (!res.ok) {
      const field = (res.items as readonly { field?: string }[] | undefined)?.find((i) => i.field)?.field as DetailsField | undefined;
      if (res.error === "invalid" && res.message) setErrors(field ? { [field]: res.message } : { productName: res.message });
      return;
    }
    const d = res.data.draft;
    if (isCategory(d.category) && d.productName && d.priceMinor !== null) setSavedDraft({ category: d.category, productName: d.productName, priceMinor: d.priceMinor, compareAtMinor: d.compareAtMinor, fact: d.fact, assetIds: d.assetIds });
    setSaved(res.data.step);
    go(nextView("details"));
  };

  // the reveal's context: the main photo's palette (read in the browser, or again from the library thumbnail)
  const revealPhotos = useMemo(() => {
    const ids = savedDraft?.assetIds ?? [];
    return ids.flatMap((id) => donePhotos.find((ph) => ph.id === id) ?? []);
  }, [savedDraft, donePhotos]);
  const revealContext = useCallback(async (): Promise<Omit<RevealContext, "seedBase">> => {
    const main = revealPhotos[0];
    const palette = main ? (main.palette ?? (main.thumbUrl ? await paletteFromUrl(main.thumbUrl) : null)) : null;
    return { palette, photos: photoFactsOf(revealPhotos), locale: p.pageLocale, market: p.market };
  }, [revealPhotos, p.pageLocale, p.market]);

  const [rebuild, setRebuild] = useState(0);
  const chooseDesign = useCallback(
    async (directionKey: string, directions: RevealDirections): Promise<boolean> => {
      const res = await actions.run(() => chooseDirectionAction({ directionKey, directions: directions.map((d) => ({ id: d.id, label: d.label.slice(0, 40), doc: d.doc })) }));
      if (!res.ok) {
        // the saved price is not the one in these designs (another tab): make them again from the saved draft
        if (res.message === "onboarding.price_changed") setRebuild((n) => n + 1);
        return false;
      }
      setHasPage(true);
      setSaved("contact");
      go(nextView("reveal"));
      return true;
    },
    [actions, go],
  );
  const painted = useCallback(
    (paintedAt: string) => {
      if (p.revealed) return;
      void reportRevealAction({ paintedAt });
    },
    [p.revealed],
  );

  /* ---- contact ---- */
  const [useOwn, setUseOwn] = useState(p.phoneMasked !== null && !p.whatsapp);
  const [whatsapp, setWhatsapp] = useState(p.whatsapp ?? "");
  const [contactError, setContactError] = useState<MessageKey | null>(null);
  const saveContact = async () => {
    setContactError(null);
    if (!useOwn && !whatsapp.trim()) return setContactError("shell.field.e164");
    setBusy(true);
    const res = await actions.run(() => saveOnboardingContactAction(useOwn ? { useSignupPhone: true } : { whatsapp: typedWhatsapp(whatsapp, p.market) }));
    if (!res.ok) {
      setBusy(false);
      if (res.error === "invalid") setContactError(res.message ?? "shell.field.e164");
      return;
    }
    writeLocal(key, null);
    // the done step is the server's: the dashboard blocks of this store
    router.replace(store.href("/welcome"));
    router.refresh();
  };

  const skip = async () => {
    setBusy(true);
    const res = await actions.run(() => skipOnboardingAction());
    if (!res.ok) return setBusy(false);
    writeLocal(key, null);
    router.replace(store.href(""));
  };

  const title: Partial<Record<FlowStep, MessageKey>> = { details: "onboarding.details.title", reveal: "onboarding.reveal.title", contact: "onboarding.contact.title" };
  const lead: Partial<Record<FlowStep, MessageKey>> = { details: "onboarding.details.lead", reveal: "onboarding.reveal.lead", contact: "onboarding.contact.hint" };
  const wide = view === "reveal";

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <WelcomeHeader progress={progressOf(view)} onSkip={canSkip(view, hasPage) ? skip : null} busy={busy} />
      <main className={cn("mx-auto w-full flex-1 px-4 pt-8 pb-28 sm:px-8 sm:pt-12", wide ? "max-w-[1320px]" : "max-w-[620px]")}>
        <div key={view} className="adm-fade grid gap-7">
          {title[view] && (
            <div className="grid gap-2">
              <h1 className="text-balance text-[1.6rem] leading-tight font-semibold tracking-tight sm:text-[1.85rem]">{t(title[view])}</h1>
              {lead[view] && <p className="max-w-[60ch] text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">{t(lead[view])}</p>}
            </div>
          )}

          {view === "photos" && <PhotosStep onFiles={addFiles} onSkip={() => go(nextView("photos"))} busy={busy} />}

          {view === "details" && (
            <>
              <PhotoStrip slots={slots} onFiles={addFiles} onRemove={removeSlot} onRetry={retrySlot} />
              <DetailsForm value={details} onChange={setDetails} errors={errors} suggestedCategory={suggested.category} suggestedName={suggested.name} refining={analyze.state.status === "running"} currency={store.currency} />
            </>
          )}

          {view === "reveal" && savedDraft && <RevealStep draft={savedDraft} context={revealContext} seedBase={p.seedBase} onUse={chooseDesign} onPainted={painted} onBack={goBack ? () => go(goBack) : null} rebuild={rebuild} />}

          {view === "contact" && (
            <div className="grid gap-6">
              {p.phoneMasked && (
                <label className="adm-surface flex cursor-pointer items-center justify-between gap-4 px-4 py-3.5">
                  {/* the masked number is isolated left to right inside the sentence (LRI … PDI), so ar keeps its order */}
                  <span className="text-[0.95rem] leading-snug">{t("onboarding.contact.use_phone", { phone: `\u2066${p.phoneMasked}\u2069` })}</span>
                  {/* ui/switch moves its thumb with a physical translate: kept left to right until CCR r1-p2-9 §2 lands */}
                  <span dir="ltr" className="inline-flex shrink-0">
                    <Switch checked={useOwn} onCheckedChange={(on) => setUseOwn(on)} />
                  </span>
                </label>
              )}
              {!useOwn && (
                <div className="grid gap-1.5">
                  <label htmlFor="welcome-whatsapp" className="text-[0.85rem] font-medium">
                    {t("onboarding.contact.whatsapp")}
                  </label>
                  <Input
                    id="welcome-whatsapp"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    dir="ltr"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder={t("onboarding.contact.placeholder")}
                    aria-invalid={!!contactError || undefined}
                    aria-describedby="welcome-whatsapp-msg"
                    className="h-12 rounded-xl text-start text-base tabular-nums md:h-11 md:text-[0.95rem] rtl:text-end"
                  />
                  {contactError && (
                    <p id="welcome-whatsapp-msg" role="alert" className="text-[0.8rem] text-destructive">
                      {t(contactError)}
                    </p>
                  )}
                </div>
              )}
              <p className="flex items-start gap-2 text-[0.85rem] leading-relaxed text-muted-foreground">
                <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {t("onboarding.fee_note")}
              </p>
            </div>
          )}
        </div>
      </main>

      {(view === "details" || view === "contact") && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/70 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
          <div className="mx-auto flex w-full max-w-[620px] items-center justify-between gap-3 px-4 py-3 sm:px-8">
            {goBack && view !== "contact" ? (
              <Button type="button" variant="ghost" className={cn("h-12 rounded-full px-5 text-muted-foreground hover:text-foreground", FOCUS_RING)} onClick={() => go(goBack)} disabled={busy}>
                {t("onboarding.back")}
              </Button>
            ) : (
              <span />
            )}
            <Button
              type="button"
              size="lg"
              className={cn("h-12 min-w-[148px] rounded-full px-7 text-[0.95rem]", FOCUS_RING)}
              disabled={busy || (view === "details" && uploading)}
              onClick={() => void (view === "details" ? saveDetails() : saveContact())}
            >
              {busy ? (
                <>
                  <Loader2Icon className="animate-spin" aria-hidden="true" />
                  {t("onboarding.saving")}
                </>
              ) : view === "details" && uploading ? (
                t("onboarding.photos.uploading", { count: slots.filter((s) => s.state === "uploading").length })
              ) : view === "contact" ? (
                t("onboarding.contact.finish")
              ) : (
                t("onboarding.continue")
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

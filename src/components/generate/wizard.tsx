"use client";
/**
 * The generator wizard: photos → on-device analysis → product details → offers (what the page
 * sells: products, offers, look — docs/OFFERS.md §H.2) → three art-directed directions (with the
 * page's ad tracking answer) → a draft page in the builder.
 *
 * Everything runs in the admin's browser: photos are downscaled and color-read locally, the local
 * AI (src/lib/ai) reads, cuts out and writes, and the pure generator (src/lib/generator) builds the
 * PageDocs. The server only stores uploads and, at the end, the chosen page with its alternatives.
 */
import { ArrowLeftIcon, ArrowRightIcon, RotateCcwIcon, SparklesIcon } from "lucide-react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { createFromDirectionsAction } from "@/app/app/[store]/generate/actions";
import { storePixelSummaryAction } from "@/lib/pixels/actions";
import { ConfirmDialog } from "@/components/admin/common/confirm-dialog";
import { PageHeader } from "@/components/admin/common/page-header";
import { runAction } from "@/components/admin/lib/action-result";
import { useOpenedOnce, usePrefetchOnIdle } from "@/components/admin/lib/lazy";
import { loadFocal } from "@/components/admin/media/focal/focal-client";
import { uploadMedia } from "@/components/admin/media/media-client";
import type { PickedAsset } from "@/components/admin/media/MediaPicker";
import { loadMediaPicker, MediaPicker } from "@/components/admin/on-demand";
import type { VariantPhoto } from "@/components/admin/variants";
import { preloadLandingPreview } from "@/components/preview";
import { Button } from "@/components/ui/button";
import { AiCopy, vibeHint, type Analysis } from "@/lib/ai/copy-schema";
import { AiError, getAi, useAi, type ClassifyResult } from "@/lib/ai/client";
import type { CopyRequest } from "@/lib/ai/prompts";
import type { GenerateInput } from "@/lib/generator";
import { getMarket } from "@/lib/markets/info";
import { parseFocus } from "@/lib/media/focus";
import { comboDisplay, suggestOffers } from "@/components/admin/offers";
import { removeItem, type PhotoInfo, type PhotoSource } from "@/components/admin/items";
import { feature } from "@/lib/page/features";
import { isChoiceGroup, LIMITS, MAIN_ITEM_ID, PageDocObject, type Archetype, type Item, type Market, type Offer, type OfferDisplay, type Offers } from "@/lib/page/schema";
import { cleanVariants, leadPhotoId, relocalizeVariants, suggestPresets } from "@/lib/page/variant-presets";
import { whatsappDigits } from "@/lib/render/config";
import type { AssetRowLike, StoreInfo } from "@/landing/context";
import { loadGeneratorKit, useGeneratorKit } from "./kit-loader";
import { PAGE_LOCALES, type PageLocale } from "./labels";
import { AiChip, StepFooter, StepRail, stepMotion } from "./parts";
import { bestCutoutCandidate, fetchImage, MAX_INPUT_MB, paletteOfBlob, preparePhoto } from "./photos";
import { focalPoint, initialState, loadState, newSeed, photoAssetFrom, photosKey, reducer, saveState, clearState, toAssetRef, toAssetRow, toPhotoInfo, type Photo, type Step } from "./state";
import { StepAnalysis, type JobState } from "./step-analysis";
import { MAX_FACTS, parsePrice, StepDetails } from "./step-details";
import { StepDirections, type CopyState } from "./step-directions";
import { StepOffers } from "./step-offers";
import { StepPhotos } from "./step-photos";
import { pixelTracking, type PixelStore } from "./tracking";
import { WIZARD_LEAD, WIZARD_TITLE, WizardSkeleton } from "./skeleton";
import { purgeForeignDrafts } from "@/components/admin/lib/drafts";
import { useStore } from "@/components/admin/shell/store-context";

export interface GenerateWizardProps {
  /** Settings → AI */
  ai: { enabled: boolean; tier: "lite" | "full"; bgRemoval: boolean };
  /** Settings → Defaults */
  defaults: { locale: PageLocale; market: Market; currency: string; shippingFee: number; deliveryText: string | null };
  /** Settings → Store (preview header/footer, WhatsApp button) */
  store: StoreInfo;
  /** preview rows of the store's own assets (logo) */
  storeAssets: Readonly<Record<string, AssetRowLike>>;
  canUpload: boolean;
  /** the user may add new pixel ids (owners: settings.write) in "Ad tracking for this page" */
  canCreatePixels?: boolean;
}

const MAX_PHOTOS = 12;
/** The written copy of this tab, per store (GEN-03); the single-tenant key is only cleared. */
/** per store and member, like the wizard (`owner` = `<storeId>:<userId>`, ./state.ts) */
const copyStorageKey = (owner: string) => `sg:${owner}:generate:copy:v1`;
const LEGACY_COPY_KEY = "cod-studio:generate:copy:v1";

/** Code-split parts fetched once the first step is idle: the generator, the page renderer of the
 *  direction previews and the library picker are all ready long before the user needs them. */
const PREFETCH = [loadGeneratorKit, async () => preloadLandingPreview(), loadMediaPicker];

const noopSubscribe = () => () => {};

/** Renders only in the browser: the wizard restores its session state on first render. */
export function GenerateWizard(props: GenerateWizardProps) {
  const client = useSyncExternalStore(noopSubscribe, () => true, () => false);
  // hydration renders the skeleton first: its header already made the entrance, so the real one
  // takes its place without rising again (a client-side visit has no skeleton and animates)
  const [afterSkeleton] = useState(() => !client);
  // reduced motion (OS setting): springs, blurs, sweeps and scan bands settle instantly, fades stay
  return <MotionConfig reducedMotion="user">{client ? <Wizard {...props} afterSkeleton={afterSkeleton} /> : <WizardSkeleton />}</MotionConfig>;
}

/** Runs async tasks with at most `limit` in flight (uploads: two parallel transfers). */
function taskQueue(limit: number) {
  const waiting: (() => Promise<void>)[] = [];
  let active = 0;
  const pump = () => {
    while (active < limit && waiting.length) {
      const task = waiting.shift()!;
      active++;
      void task().finally(() => {
        active--;
        pump();
      });
    }
  };
  return {
    push(task: () => Promise<void>) {
      waiting.push(task);
      pump();
    },
  };
}

const newKey = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const IDLE: JobState = { status: "idle" };

/** AI jobs the wizard runs; each can be stopped on its own (the others keep their place in the queue). */
type JobName = "classify" | "analysis" | "cutout" | "copy";

/** Friendly message for a failed AI job; null when the job was cancelled on purpose. */
function aiMessage(err: unknown): string | null {
  if (err instanceof AiError) {
    switch (err.code) {
      case "CANCELLED":
        return null;
      case "NO_WEBGPU":
        return "This browser can't run the language model (WebGPU is needed).";
      case "OOM":
        return "The graphics card ran out of memory. Close other tabs and try again, or choose the lite model in Settings → AI.";
      case "MODEL_LOAD":
        return "The model couldn't be downloaded. Check the connection and try again.";
      case "INVALID_OUTPUT":
        return "The model's answer wasn't usable this time. Try again.";
      case "NO_FOREGROUND":
        return "No product was found in this photo. Try a photo where the product is clearly in view.";
      case "DISABLED":
        return "Local AI is switched off in Settings → AI.";
      default:
        return err.message || "Something went wrong.";
    }
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

/**
 * The on-device copy for the current facts. `copy` is the last finished text: it stays on the
 * pages while a new version is written, and when that rewrite fails or is stopped. Kept for this
 * tab (a minute of on-device writing is worth keeping across reloads).
 */
interface CopyJob {
  key: string;
  status: "running" | "done" | "error" | "cancelled";
  copy?: AiCopy;
  error?: string;
}
function loadCopy(owner: string): CopyJob | null {
  try {
    sessionStorage.removeItem(LEGACY_COPY_KEY);
    const raw = JSON.parse(sessionStorage.getItem(copyStorageKey(owner)) ?? "null") as { key?: unknown; copy?: unknown } | null;
    const copy = AiCopy.safeParse(raw?.copy);
    return typeof raw?.key === "string" && raw.key.length < 4000 && copy.success ? { key: raw.key, status: "done", copy: copy.data } : null;
  } catch {
    return null;
  }
}
function saveCopy(owner: string, job: CopyJob | null) {
  try {
    if (job?.copy) sessionStorage.setItem(copyStorageKey(owner), JSON.stringify({ key: job.key, copy: job.copy }));
    else if (!job) sessionStorage.removeItem(copyStorageKey(owner));
  } catch {
    // storage unavailable: the copy is simply rewritten next time
  }
}

/** Vibe hint for the theme engine from SigLIP scores: the top vibe, plus the runner-up when close. */
function classifyVibe(c: ClassifyResult | null): string | null {
  if (!c) return null;
  const vibes = Object.entries(c.scores)
    .filter(([k]) => k.startsWith("vibe:"))
    .sort((a, b) => b[1] - a[1]);
  const [first, second] = vibes;
  if (!first) return c.vibe;
  const a = first[0].slice(5);
  return second && second[1] >= first[1] * 0.7 ? `${a} ${second[0].slice(5)}` : a;
}

function Wizard({ ai: aiSettings, defaults, store, storeAssets, canUpload, canCreatePixels = false, afterSkeleton }: GenerateWizardProps & { afterSkeleton: boolean }) {
  const router = useRouter();
  const storeView = useStore();
  // the drafts of this tab are the member's own in this store (GEN-03, §E.6): another member's go first
  const owner = `${storeView.id}:${storeView.viewerId}`;
  const ai = useAi({ enabled: aiSettings.enabled, maxTier: aiSettings.tier });
  /** the process-wide AI manager: stable functions for the jobs below (the hook is for display) */
  const manager = getAi();
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    purgeForeignDrafts(storeView.id, storeView.viewerId);
    return loadState(owner) ?? initialState({ locale: defaults.locale, market: defaults.market, aiCopy: aiSettings.enabled });
  });
  const { details } = state;

  const blobs = useRef(new Map<string, Blob>());
  const objectUrls = useRef(new Set<string>());
  /** photos removed while still being read or uploaded (their pending work is dropped) */
  const removed = useRef(new Set<string>());
  /** in-flight uploads by photo key (removing a photo stops its transfer) */
  const uploadCtl = useRef(new Map<string, AbortController>());
  /** photos on the page, counted synchronously (two quick drops must not exceed the limit) */
  const photoCount = useRef(state.photos.length);
  /** one abort controller per AI job */
  const controllers = useRef<Partial<Record<JobName, AbortController>>>({});
  /** the deep look in flight: the copywriter waits for it, since it briefs the copy */
  const analysisRun = useRef<Promise<Analysis | null> | null>(null);
  /** photo set / facts the automatic jobs already started for (never restarted in a loop) */
  const auto = useRef<{ classify: string | null; analysis: string | null; copy: string | null }>({ classify: null, analysis: null, copy: null });
  /** the page was created: nothing more to save, no second submit */
  const finished = useRef(false);
  const [picker, setPicker] = useState(false);
  const pickerMounted = useOpenedOnce(picker);
  usePrefetchOnIdle(PREFETCH);
  // a failed load is retried on the next step change or "Try again" (a new seed)
  // loaded from the Offers step on: the directions are ready the moment they are asked for
  const generator = useGeneratorKit(state.step >= 3, `${state.step >= 3 ? 3 : state.step}:${state.seedBase}`);
  const [confirmReset, setConfirmReset] = useState(false);
  const [jobs, setJobs] = useState<{ classify: JobState; analysis: JobState; cutout: JobState }>({ classify: IDLE, analysis: IDLE, cutout: IDLE });
  const setJob = useCallback((name: "classify" | "analysis" | "cutout", job: JobState) => setJobs((j) => ({ ...j, [name]: job })), []);
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({});
  const [creating, setCreating] = useState<number | null>(null);
  const [styleOffset, setStyleOffset] = useState(0);
  const [copyJob, setCopyJob] = useState<CopyJob | null>(() => loadCopy(owner));
  /** the store's ad pixels (ids and flags, never a token), read once for the Details step */
  const [pixelStore, setPixelStore] = useState<PixelStore>({ summary: null, failed: false });
  useEffect(() => {
    let alive = true;
    storePixelSummaryAction()
      .then((res) => {
        if (alive) setPixelStore(res.ok ? { summary: res.data, failed: false } : { summary: null, failed: true });
      })
      .catch(() => {
        if (alive) setPixelStore({ summary: null, failed: true });
      });
    return () => {
      alive = false;
    };
  }, []);

  /* ---- persistence & cleanup ---- */

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!finished.current) saveState(owner, state);
    }, 300);
    return () => window.clearTimeout(t);
  }, [owner, state]);
  useEffect(() => saveCopy(owner, copyJob), [owner, copyJob]);
  useEffect(() => {
    photoCount.current = state.photos.length;
  }, [state.photos.length]);

  useEffect(() => {
    const urls = objectUrls.current;
    const running = controllers.current;
    return () => {
      for (const u of urls) URL.revokeObjectURL(u);
      urls.clear();
      // leaving the generator: stop this page's jobs and free GPU memory
      for (const c of Object.values(running)) c?.abort();
      manager.release();
    };
  }, [manager]);

  /** Fresh abort signal for a job (stops the previous run of the same job). */
  const startJob = useCallback((name: JobName) => {
    controllers.current[name]?.abort();
    const ctl = new AbortController();
    controllers.current[name] = ctl;
    return ctl.signal;
  }, []);
  /** Whether `signal` belongs to the latest run of a job (older runs must not touch its status). */
  const isCurrent = useCallback((name: JobName, signal: AbortSignal) => controllers.current[name]?.signal === signal, []);

  /* ---- derived ---- */

  const ready = useMemo(() => state.photos.filter((p): p is Photo & { asset: NonNullable<Photo["asset"]> } => p.status === "ready" && !!p.asset), [state.photos]);
  const main = ready.find((p) => p.key === state.mainKey) ?? ready[0] ?? null;
  const ordered = useMemo(() => (main ? [main, ...ready.filter((p) => p.key !== main.key)] : ready), [main, ready]);
  const setKey = photosKey(ordered);
  const uploading = state.photos.filter((p) => p.status === "preparing" || p.status === "uploading" || p.status === "processing").length;

  const classify = state.classify?.key === setKey ? state.classify.result : null;
  const analysis = state.analysis?.key === setKey ? state.analysis.result : null;
  const mainIsCutout = !!main?.asset.alpha;
  const cutoutSourceKey = bestCutoutCandidate(ready, state.mainKey);
  const cutoutSource = ready.find((p) => p.key === cutoutSourceKey) ?? null;
  const cutoutAsset = state.cutout?.use ? state.cutout.asset : mainIsCutout && main ? main.asset : null;
  const palette = (state.cutout?.use ? state.cutout.palette : null) ?? main?.palette ?? null;

  // every photo's crop data, once per tab (the photo tiles read the same shared cache): rows uploaded
  // before the subject analysis existed are analysed (and stored) on that read, so the previews and
  // the generator see every photo's subject; a team default framing point reaches the new page
  const focusAsked = useRef(new Set<string>());
  useEffect(() => {
    for (const a of [...ready.map((p) => p.asset), ...(state.cutout ? [state.cutout.asset] : [])]) {
      if (focusAsked.current.has(a.id)) continue;
      focusAsked.current.add(a.id);
      void loadFocal(a.id)
        .then((info) => {
          const focus = parseFocus(info.focus);
          const focal = focalPoint(info.saved);
          if ((focus && !a.focus) || focal?.x !== a.focal?.x || focal?.y !== a.focal?.y) dispatch({ type: "photoFocus", id: a.id, focus, focal });
        })
        .catch(() => undefined);
    }
  }, [ready, state.cutout]);

  /** the uploaded photos the options can link to (main first), with their palettes for color suggestions */
  const variantPhotos = useMemo<VariantPhoto[]>(
    () => ordered.map((p) => ({ ref: toAssetRef(p.asset, p.name.slice(0, 200)), url: p.asset.thumbUrl ?? p.asset.url ?? p.preview, palette: p.palette })),
    [ordered],
  );
  const lead = useMemo(() => {
    const id = leadPhotoId(details.variants);
    if (!id) return null;
    const option = details.variants.filter(isChoiceGroup).flatMap((g) => g.options).find((o) => o.image?.id === id);
    const photo = ready.find((p) => p.asset.id === id);
    return option && photo ? { label: option.label, url: photo.asset.thumbUrl ?? photo.asset.url ?? photo.preview } : null;
  }, [details.variants, ready]);

  const tier = ai.capabilities?.tier ?? null;
  const aiOn = aiSettings.enabled && ai.status !== "off";
  const llm = aiOn && tier !== null && tier !== "off";
  const aiVibe = vibeHint(analysis) ?? classifyVibe(classify);

  const sameMarket = details.market === defaults.market;
  const currency = sameMarket ? defaults.currency : getMarket(details.market).currency;
  const price = parsePrice(details.price);
  const name = details.name.replace(/\s+/g, " ").trim();
  const facts = useMemo(() => details.facts.map((f) => f.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, MAX_FACTS), [details.facts]);
  const deliveryText = sameMarket ? defaults.deliveryText : null;
  /** presets the product probably needs (category + its words) and colors the photo reading saw: hints only */
  const variantSuggest = useMemo(
    () => ({ presets: suggestPresets(details.category, `${name} ${facts.join(" ")}`), colors: analysis?.colorsDescribed ?? [] }),
    [details.category, name, facts, analysis],
  );

  /* ---- photos ---- */

  const [uploads] = useState(() => taskQueue(2));

  const upload = useCallback(
    (key: string, blob: Blob, fileName: string) => {
      uploads.push(async () => {
        if (removed.current.has(key)) return;
        const ctl = new AbortController();
        uploadCtl.current.set(key, ctl);
        dispatch({ type: "patchPhoto", key, patch: { status: "uploading", progress: 0, error: undefined } });
        try {
          const { asset } = await uploadMedia(blob, {
            name: fileName,
            signal: ctl.signal,
            onProgress: (r) => dispatch({ type: "patchPhoto", key, patch: r >= 1 ? { status: "processing", progress: 1 } : { progress: r } }),
          });
          const photoAsset = photoAssetFrom(asset);
          if (!photoAsset) throw new Error("The server didn't return an image.");
          if (!removed.current.has(key)) dispatch({ type: "uploaded", key, asset: photoAsset });
        } catch (err) {
          if (!ctl.signal.aborted) dispatch({ type: "patchPhoto", key, patch: { status: "error", error: err instanceof Error ? err.message : "Upload failed." } });
        } finally {
          if (uploadCtl.current.get(key) === ctl) uploadCtl.current.delete(key);
        }
      });
    },
    [uploads],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const room = MAX_PHOTOS - photoCount.current;
      if (room <= 0) {
        toast.message(`Up to ${MAX_PHOTOS} photos per page.`);
        return;
      }
      const added: Photo[] = [];
      for (const file of files.slice(0, room)) {
        if (file.type && !file.type.startsWith("image/")) {
          toast.error(`${file.name} isn't a photo.`);
          continue;
        }
        if (file.size > MAX_INPUT_MB * 1024 * 1024) {
          toast.error(`${file.name} is larger than ${MAX_INPUT_MB} MB.`);
          continue;
        }
        const key = newKey();
        const preview = URL.createObjectURL(file);
        objectUrls.current.add(preview);
        added.push({ key, name: file.name.slice(0, 200), preview, status: "preparing", progress: 0, width: 0, height: 0, palette: null, asset: null });
        void preparePhoto(file)
          .then((prep) => {
            if (removed.current.has(key)) return;
            blobs.current.set(key, prep.blob);
            dispatch({ type: "patchPhoto", key, patch: { width: prep.width, height: prep.height, palette: prep.palette } });
            upload(key, prep.blob, file.name);
          })
          .catch((err: unknown) => dispatch({ type: "patchPhoto", key, patch: { status: "error", error: err instanceof Error ? err.message : "This photo couldn't be read." } }));
      }
      if (files.length > room) toast.message(`Up to ${MAX_PHOTOS} photos per page — ${files.length - room} skipped.`);
      photoCount.current += added.length;
      if (added.length) dispatch({ type: "addPhotos", photos: added });
    },
    [upload],
  );

  const retry = useCallback(
    (key: string) => {
      const blob = blobs.current.get(key);
      const photo = state.photos.find((p) => p.key === key);
      if (!blob || !photo) {
        toast.error("Add this photo again.");
        return;
      }
      upload(key, blob, photo.name);
    },
    [state.photos, upload],
  );

  const remove = useCallback(
    (key: string) => {
      const photo = state.photos.find((p) => p.key === key);
      if (photo?.preview && objectUrls.current.has(photo.preview)) {
        URL.revokeObjectURL(photo.preview);
        objectUrls.current.delete(photo.preview);
      }
      blobs.current.delete(key);
      removed.current.add(key);
      uploadCtl.current.get(key)?.abort();
      photoCount.current = Math.max(0, photoCount.current - 1);
      dispatch({ type: "removePhoto", key });
    },
    [state.photos],
  );

  const pickFromLibrary = useCallback(
    (picked: PickedAsset) => {
      const asset = photoAssetFrom(picked);
      if (!asset) {
        toast.error("Pick a photo — videos can be added in the builder.");
        return;
      }
      if (state.photos.some((p) => p.asset?.id === asset.id)) {
        toast.message("This photo is already on the page.");
        return;
      }
      if (photoCount.current >= MAX_PHOTOS) {
        toast.message(`Up to ${MAX_PHOTOS} photos per page.`);
        return;
      }
      const key = newKey();
      photoCount.current += 1;
      dispatch({
        type: "addPhotos",
        photos: [{ key, name: picked.alt || "Library photo", preview: asset.thumbUrl ?? asset.url, status: "ready", progress: 1, width: asset.width, height: asset.height, palette: null, asset }],
      });
      const src = asset.thumbUrl ?? asset.url;
      if (src) {
        void fetchImage(src)
          .then(paletteOfBlob)
          .then((p) => dispatch({ type: "patchPhoto", key, patch: { palette: p } }))
          .catch(() => undefined);
      }
    },
    [state.photos],
  );

  /** Pixels of a photo for the AI (local copy, else the library rendition). */
  const blobOf = useCallback(async (p: Photo): Promise<Blob> => {
    const cached = blobs.current.get(p.key);
    if (cached) return cached;
    const src = p.asset?.url ?? p.asset?.thumbUrl;
    if (!src) throw new Error("This photo isn't uploaded yet.");
    const blob = await fetchImage(src);
    blobs.current.set(p.key, blob);
    return blob;
  }, []);

  /* ---- AI: reading, deep look, cutout ---- */

  const runClassify = useCallback(async () => {
    if (!ordered.length) return;
    const key = setKey;
    auto.current.classify = key;
    const signal = startJob("classify");
    setJob("classify", { status: "running" });
    try {
      const images = await Promise.all(ordered.slice(0, 3).map(blobOf));
      const result = await manager.classify(images, { signal });
      dispatch({ type: "classified", key, result });
      setJob("classify", { status: "done" });
    } catch (err) {
      // a newer run of the same job owns the status now
      if (!isCurrent("classify", signal)) return;
      const message = aiMessage(err);
      setJob("classify", message ? { status: "error", error: message } : IDLE);
    }
  }, [ordered, setKey, blobOf, manager, setJob, startJob, isCurrent]);

  const runAnalysis = useCallback(() => {
    if (!ordered.length) return;
    const key = setKey;
    auto.current.analysis = key;
    const signal = startJob("analysis");
    setJob("analysis", { status: "running" });
    // never rejects: a failed or stopped deep look resolves to null
    const run = (async (): Promise<Analysis | null> => {
      try {
        const images = await Promise.all(ordered.slice(0, 2).map(blobOf));
        const result = await manager.analyze(images, { signal });
        dispatch({ type: "analyzed", key, result });
        setJob("analysis", { status: "done" });
        return result;
      } catch (err) {
        const message = aiMessage(err);
        if (isCurrent("analysis", signal)) setJob("analysis", message ? { status: "error", error: message } : IDLE);
        return null;
      }
    })();
    analysisRun.current = run;
    void run.finally(() => {
      if (analysisRun.current === run) analysisRun.current = null;
    });
  }, [ordered, setKey, blobOf, manager, setJob, startJob, isCurrent]);

  const runCutout = useCallback(async () => {
    const source = cutoutSource;
    if (!source) return;
    const signal = startJob("cutout");
    setJob("cutout", { status: "running" });
    try {
      const cut = await manager.removeBackground(await blobOf(source), { signal });
      const base = source.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 80) || "product";
      const [{ asset }, cutPalette] = await Promise.all([
        uploadMedia(cut, { name: `${base}-cutout.${cut.type === "image/png" ? "png" : "webp"}`, cutout: true, sourceAssetId: source.asset.id, signal }),
        paletteOfBlob(cut),
      ]);
      const photoAsset = photoAssetFrom(asset);
      if (!photoAsset) throw new Error("The cutout couldn't be saved.");
      dispatch({ type: "setCutout", cutout: { asset: photoAsset, sourceKey: source.key, palette: cutPalette, use: true } });
      setJob("cutout", { status: "done" });
    } catch (err) {
      if (!isCurrent("cutout", signal)) return;
      const message = aiMessage(err);
      setJob("cutout", signal.aborted ? IDLE : message ? { status: "error", error: message } : IDLE);
    }
  }, [cutoutSource, blobOf, manager, setJob, startJob, isCurrent]);

  /* ---- AI copy ---- */

  // what the copy is written from (a deep look finishing later keeps the copy; "Write again" redoes it)
  const copyKey = JSON.stringify([name, details.category, price, facts, details.locale, details.market, deliveryText]);
  const wantCopy = details.aiCopy && llm;
  /** the copywriter will load the vision-language model anyway: let it study the photos first */
  const autoLook = wantCopy;
  const detailsValid = name.length > 0 && Number.isFinite(price) && price > 0;

  const runCopy = useCallback(async () => {
    const key = copyKey;
    auto.current.copy = key;
    // a new copy job replaces the previous one only (photo jobs keep their place)
    const signal = startJob("copy");
    setCopyJob((prev) => ({ key, status: "running", ...(prev?.key === key && prev.copy ? { copy: prev.copy } : {}) }));
    try {
      // the deep look briefs the copywriter: let one in flight finish first (the worker runs one job at a time anyway)
      const fresh = analysisRun.current ? await analysisRun.current : null;
      if (signal.aborted) throw new AiError("CANCELLED");
      const request: CopyRequest = {
        locale: details.locale,
        market: details.market,
        product: { name: name.slice(0, 120), category: details.category, price, currency, facts: facts.map((f) => f.slice(0, 200)) },
        analysis: fresh ?? analysis,
        deliveryText,
      };
      const res = await manager.writeCopy(request, { signal });
      setCopyJob((prev) => (prev?.key === key ? { key, status: "done", copy: res.copy } : prev));
    } catch (err) {
      if (!isCurrent("copy", signal)) return;
      const message = aiMessage(err);
      setCopyJob((prev) => (prev?.key === key ? { ...prev, status: message ? "error" : "cancelled", ...(message ? { error: message } : {}) } : prev));
    }
  }, [copyKey, startJob, isCurrent, details.locale, details.market, details.category, name, price, currency, facts, analysis, deliveryText, manager]);

  const stopCopy = useCallback(() => {
    controllers.current.copy?.abort();
    setCopyJob((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
  }, []);

  const kit = generator.kit;
  /** wa.me digits of the store number ("06…" completed with the store country) */
  const storeWhatsapp = useMemo(() => whatsappDigits(store.whatsapp, store.country ?? "MA"), [store.whatsapp, store.country]);
  const merged = useMemo(() => {
    if (!kit || !wantCopy || copyJob?.key !== copyKey || !copyJob.copy) return null;
    // the library base is read exactly like the generator's own copy: the catalog category plus the
    // product's words pick the family and its facets (a girl's prayer abaya filed under kids gets
    // modest-wear lines for prayer and for girls), and no line sends a store without a number to WhatsApp
    const library = kit.libraryCopy({
      category: details.category,
      keywords: kit.productKeywords({ name: name.slice(0, 120) }, facts),
      locale: details.locale,
      market: details.market,
      seed: state.seedBase,
      productName: name,
      deliveryText,
      hasWhatsapp: !!storeWhatsapp,
    });
    return kit.mergeAiCopy(library, copyJob.copy, { locale: details.locale, productName: name, facts, price, deliveryText });
  }, [kit, wantCopy, copyJob, copyKey, details.category, details.locale, details.market, state.seedBase, name, facts, price, deliveryText, storeWhatsapp]);

  const usable = !!merged && !merged.rejected.includes("*");
  const job = copyJob?.key === copyKey ? copyJob : null;
  const copyState: CopyState = !wantCopy
    ? { state: "library" }
    : job?.status === "running"
      ? { state: "running", previous: usable }
      : usable
        ? { state: "ai", kept: merged.rejected.length, ...(job?.status === "error" ? { note: `The new version couldn't be written (${job.error ?? "error"}) — this one stays.` } : {}) }
        : merged
          ? { state: "error", message: "The AI copy didn't pass the honesty checks." }
          : job?.status === "error"
            ? { state: "error", message: job.error ?? "The copy couldn't be written." }
            : { state: "idle" };

  /* ---- directions ---- */

  /**
   * The product as the generator reads it (validated there with the Product schema). Its options
   * reach every direction as typed; when they are linked to photos, the first linked option's photo
   * is the main one (see onDetails), so it leads `images` and the hero.
   */
  const variants = useMemo(() => cleanVariants(details.variants), [details.variants]);
  const product = useMemo(
    () => ({
      name: name.slice(0, 120),
      price,
      category: details.category,
      images: ordered.map((p) => toAssetRef(p.asset, name.slice(0, 200))),
      ...(cutoutAsset ? { cutout: toAssetRef(cutoutAsset, name.slice(0, 200)) } : {}),
      // the generator's v1 product takes choice groups; combined options and fields reach the page with the items
      variants: variants.filter(isChoiceGroup),
    }),
    [name, price, details.category, ordered, cutoutAsset, variants],
  );

  /* ---- offers (what the page sells) ---- */

  const several = feature("MULTI_ITEM") && details.sells === "several";
  const pageItems = useMemo<Item[]>(() => {
    const leadItem: Item = {
      id: MAIN_ITEM_ID,
      name: several ? (details.lead.name.trim() || name).slice(0, 120) : "",
      ...(several && details.lead.short ? { short: details.lead.short } : {}),
      images: several ? details.lead.images : [],
      price: Number.isFinite(price) && price > 0 ? price : 0,
      groups: variants,
      soldOut: false,
    };
    return several ? [leadItem, ...details.extraItems] : [leadItem];
  }, [several, details.lead, details.extraItems, name, price, variants]);
  const offersDoc = useMemo(
    () => ({ items: pageItems, currency, offers: { bundles: [] as Offer[] } as Offers, product: { name, category: details.category, images: [] }, locale: details.locale }),
    [pageItems, currency, name, details.category, details.locale],
  );
  const autoOffers = useMemo(() => suggestOffers(offersDoc, { rules: feature("RULES") }), [offersDoc]);
  const shownOffers = details.offers ?? autoOffers;
  const chosenOffers = useMemo(() => {
    const on = shownOffers.filter((o) => !details.offersOff.includes(o.id));
    return on.length ? on : shownOffers.slice(0, 1);
  }, [shownOffers, details.offersOff]);
  /** the wizard's products / offers replace the generator's (else it suggests its own packs, titled in the page language) */
  const ownOffers = several || details.offers !== null || details.offersOff.length > 0 || variants.some((g) => !isChoiceGroup(g));
  /** the page's photos for the item wells, crops and offer visuals */
  const wizardPhotos = useMemo<PhotoSource>(() => {
    const list: PhotoInfo[] = ordered.map((p) => ({ ref: toAssetRef(p.asset, name.slice(0, 200)), url: p.asset.thumbUrl ?? p.asset.url ?? p.preview, large: p.asset.url ?? p.preview, width: p.asset.width, height: p.asset.height }));
    const byId = new Map(list.map((x) => [x.ref.id, x]));
    return { photos: list, info: (id: string) => byId.get(id) ?? null };
  }, [ordered, name]);
  const palettes = useMemo(() => Object.fromEntries(ordered.map((p) => [p.asset.id, p.palette])), [ordered]);
  const onItems = useCallback(
    (next: Item[]) => {
      const [first, ...rest] = next;
      if (!first) return;
      const patch: Partial<typeof details> = {
        lead: { name: first.name, ...(first.short ? { short: first.short } : {}), images: first.images },
        extraItems: rest.slice(0, LIMITS.items - 1),
      };
      // edited offers follow deleted products (their lines go, empty offers go)
      if (details.offers) {
        const ids = new Set(next.map((x) => x.id));
        let state2: { items: Item[]; offers: Offers } = { items: pageItems, offers: { bundles: details.offers, display: { picker: "stack", fill: "auto", selection: "soft", media: "auto", density: "comfortable" }, extras: [], showPerUnit: true, showSavings: "both", shippingFee: 0, urgency: {} } };
        for (const it of pageItems) {
          if (ids.has(it.id)) continue;
          const res = removeItem(state2, it.id);
          if (res) state2 = res;
        }
        patch.offers = state2.offers.bundles;
      }
      dispatch({ type: "details", patch });
    },
    [details.offers, pageItems],
  );
  /** "Auto": each direction keeps its archetype's pick; a combo applies to every direction */
  const lookDisplay = useCallback((archetype: Archetype, bundles: readonly Offer[]): OfferDisplay | null => (details.look === "auto" ? null : comboDisplay(details.look, archetype, bundles)), [details.look]);
  /**
   * Styles for "Other styles", best first: the generator's mood-aware ranking (photo, category, AI
   * vibe and the product's own words). A calm or modest product only gets the quiet languages, so
   * cycling never forces a prayer abaya into playground, kinetic, souk or garage.
   */
  const ranked = useMemo<Archetype[]>(() => {
    if (!kit || state.step !== 4 || !detailsValid) return [];
    try {
      return kit.rankDirections({ product, palette, aiVibe, facts }).map((r) => r.archetype);
    } catch {
      return [];
    }
  }, [kit, state.step, detailsValid, product, palette, aiVibe, facts]);
  const styles = useMemo<Archetype[] | undefined>(() => {
    if (styleOffset === 0 || ranked.length < 4) return undefined;
    const out: Archetype[] = [];
    for (let i = 0; out.length < 3 && i < ranked.length; i++) {
      const a = ranked[(styleOffset * 3 + i) % ranked.length]!;
      if (!out.includes(a)) out.push(a);
    }
    return out;
  }, [styleOffset, ranked]);

  const pageCopy = usable ? merged.copy : null;
  /**
   * What the library knows about each photo (size, transparency, the upload's subject analysis), by
   * asset id: the generator picks the hero photo and places frames and garment pins by subject (a
   * group shot is not the one details are pinned on; pins never land on a face).
   */
  const photoInfos = useMemo(() => {
    const list = ordered.map((p) => toPhotoInfo(p.asset));
    if (cutoutAsset && !list.some((x) => x.id === cutoutAsset.id)) list.push(toPhotoInfo(cutoutAsset));
    return list;
  }, [ordered, cutoutAsset]);
  /**
   * The page's ad pixels: the Directions step's explicit answer (per-page pixels), else — until it
   * ships — every store pixel the owner left ticked in Details.
   */
  const pagePixels = feature("PAGE_PIXELS");
  const tracking = useMemo(() => {
    if (pagePixels) return details.tracking ? (details.tracking.kind === "none" ? { none: true as const } : details.tracking.tracking) : null;
    return pixelTracking(pixelStore.summary, details.pixelsOff);
  }, [pagePixels, details.tracking, pixelStore.summary, details.pixelsOff]);
  const input = useMemo<GenerateInput | null>(() => {
    if (state.step !== 4 || !ordered.length || !detailsValid) return null;
    // given → used verbatim by the generator (GN); the wizard also applies them to each direction below
    const look = details.look !== "auto" ? comboDisplay(details.look, "field", chosenOffers) : null;
    const own = { ...(ownOffers ? { items: pageItems, offers: chosenOffers } : {}), ...(look ? { display: look } : {}) };
    return {
      ...own,
      product,
      palette,
      aiVibe,
      ...(pageCopy ? { copy: { [details.locale]: pageCopy } } : {}),
      facts,
      locale: details.locale,
      market: details.market,
      seedBase: state.seedBase,
      shippingFee: sameMarket ? defaults.shippingFee : 0,
      deliveryText,
      currency,
      // null without a usable number: no floating button, no "we answer on WhatsApp" promises
      whatsapp: storeWhatsapp,
      // the store identity is known here ("" = no name yet): a store without a real name gets no
      // giant footer wordmark and no signed founder note; a named store keeps them
      store: { name: store.name },
      photos: photoInfos,
      // the store pixels the owner kept (unread store → none here; the save adds the store's)
      ...(tracking ? { tracking } : {}),
      ...(styles ? { archetypes: styles } : {}),
    } as GenerateInput;
  }, [state.step, state.seedBase, ordered.length, detailsValid, product, details.locale, details.market, palette, aiVibe, pageCopy, facts, sameMarket, defaults.shippingFee, deliveryText, currency, storeWhatsapp, store.name, photoInfos, tracking, styles, ownOffers, pageItems, chosenOffers, details.look]);

  const built = useMemo(() => {
    if (!input) return { directions: null, error: null };
    // the generator is code-split: the directions show their loading state until it is in
    if (!kit) return { directions: null, error: generator.error };
    try {
      const directions = kit.generateDirections(input).map((d) => {
        // the wizard's products, offers and look, used verbatim (validated) whatever the generator did with them
        if (!ownOffers && details.look === "auto") return d;
        const doc = { ...d.doc, items: ownOffers ? pageItems : d.doc.items, offers: { ...d.doc.offers, bundles: ownOffers ? chosenOffers : d.doc.offers.bundles } };
        const display = lookDisplay(doc.theme.archetype, doc.offers.bundles);
        if (display) doc.offers = { ...doc.offers, display };
        const checked = PageDocObject.safeParse(doc);
        if (!checked.success) {
          console.warn("[generate] the wizard's offers don't fit this direction", checked.error.issues.slice(0, 3));
          return d;
        }
        return { ...d, doc: checked.data };
      });
      return { directions, error: null };
    } catch (err) {
      return { directions: null, error: err instanceof Error ? err.message : "Unknown error." };
    }
  }, [input, kit, generator.error, ownOffers, pageItems, chosenOffers, details.look, lookDisplay]);

  const previewAssets = useMemo(() => {
    const out: Record<string, AssetRowLike> = { ...storeAssets };
    for (const p of ready) out[p.asset.id] = toAssetRow(p.asset);
    if (state.cutout) out[state.cutout.asset.id] = toAssetRow(state.cutout.asset);
    return out;
  }, [storeAssets, ready, state.cutout]);

  const chooseDirection = useCallback(
    async (index: number) => {
      const directions = built.directions;
      if (!directions || finished.current) return;
      // one save at a time (a double click must not create two pages)
      finished.current = true;
      // keep whatever copy is on screen; a running copy job would only slow the save down
      if (copyState.state === "running") stopCopy();
      setCreating(index);
      const res = await runAction(
        createFromDirectionsAction({
          name,
          chosen: index,
          directions: directions.map((d) => ({ archetype: d.archetype, label: d.label, doc: d.doc })),
          // the merchant's facts become the page's attested facts: the checklist and the publish gate read them (ENGP-8)
          facts,
          // the page's tracking answer (or the Details step's store-pixel ticks) is final
          ...((pagePixels ? !!details.tracking : !!pixelStore.summary) ? { pixels: "chosen" as const } : {}),
        }),
        { success: "Page created — opening the builder" },
      );
      if (!res) {
        finished.current = false;
        setCreating(null);
        return;
      }
      clearState(owner);
      setCopyJob(null);
      router.push(storeView.href(`/pages/${res.id}/edit`));
    },
    [built.directions, copyState.state, stopCopy, name, facts, router, storeView, owner, pixelStore.summary, pagePixels, details.tracking],
  );

  /* ---- navigation ---- */

  /** several products: every product named and priced; at least one offer */
  const offersIssue = several && pageItems.some((it) => !it.name.trim()) ? "Name every product." : several && pageItems.some((it) => !(it.price > 0)) ? "Give every product a price." : !chosenOffers.length ? "Keep at least one offer." : null;
  const canContinue: Record<Step, boolean> = {
    0: ready.length > 0 && uploading === 0,
    1: true,
    2: detailsValid,
    3: detailsValid && !offersIssue,
    4: false,
  };
  /** "Create page" waits for the page's ad tracking answer (per-page pixels) */
  const trackingGate = pagePixels && !details.tracking ? "Choose the ad tracking for this page first." : null;

  const validateDetails = useCallback(() => {
    const next: { name?: string; price?: string } = {};
    if (!name) next.name = "Give the product a name.";
    if (!(Number.isFinite(price) && price > 0)) next.price = details.price.trim() ? "Enter a price like 199 or 249.90." : "Enter the price.";
    else if (price > 10_000_000) next.price = "That price is too high.";
    setErrors(next);
    return !next.name && !next.price;
  }, [name, price, details.price]);

  const goto = useCallback(
    (step: Step) => {
      if (step >= 3 && !validateDetails()) {
        dispatch({ type: "goto", step: 2 });
        return;
      }
      if (step > 0 && !ready.length) return;
      dispatch({ type: "goto", step });
      window.scrollTo({ top: 0, behavior: "smooth" });
      // past the analysis: when the AI will write the copy, its model studies the photos meanwhile
      // (same download, and the brief makes better copy) while the merchant types the facts
      if (step >= 2 && autoLook && !analysis && jobs.analysis.status !== "running" && auto.current.analysis !== setKey) runAnalysis();
    },
    [validateDetails, ready.length, autoLook, analysis, jobs.analysis.status, setKey, runAnalysis],
  );

  // arriving on a step starts its AI work once: photo reading (step 2), copywriting (step 4);
  // also after a reload, and again only when the photos or the facts change
  useEffect(() => {
    if (state.step !== 1 || !aiOn || !ordered.length || classify || jobs.classify.status === "running" || auto.current.classify === setKey) return;
    const t = window.setTimeout(() => void runClassify(), 0);
    return () => window.clearTimeout(t);
  }, [state.step, aiOn, ordered.length, classify, jobs.classify.status, setKey, runClassify]);

  useEffect(() => {
    if (state.step !== 4 || !wantCopy || !detailsValid || !ordered.length || copyJob?.key === copyKey || auto.current.copy === copyKey) return;
    const t = window.setTimeout(() => void runCopy(), 0);
    return () => window.clearTimeout(t);
  }, [state.step, wantCopy, detailsValid, ordered.length, copyJob?.key, copyKey, runCopy]);

  const canGo = (s: Step) => creating === null && (s <= state.reached || (s === state.step + 1 && canContinue[state.step])) && (s === 0 || ready.length > 0);

  const reset = () => {
    for (const p of state.photos) removed.current.add(p.key);
    for (const ctl of uploadCtl.current.values()) ctl.abort();
    for (const ctl of Object.values(controllers.current)) ctl?.abort();
    for (const u of objectUrls.current) URL.revokeObjectURL(u);
    objectUrls.current.clear();
    blobs.current.clear();
    analysisRun.current = null;
    auto.current = { classify: null, analysis: null, copy: null };
    photoCount.current = 0;
    clearState(owner);
    setCopyJob(null);
    setJobs({ classify: IDLE, analysis: IDLE, cutout: IDLE });
    setErrors({});
    setStyleOffset(0);
    dispatch({ type: "reset", state: initialState({ locale: defaults.locale, market: defaults.market, aiCopy: aiSettings.enabled }) });
  };

  /* ---- render ---- */

  const stepStatus = (() => {
    switch (state.step) {
      case 0:
        return uploading
          ? `${uploading} photo${uploading === 1 ? "" : "s"} uploading…`
          : ready.length
            ? `${ready.length} photo${ready.length === 1 ? "" : "s"} ready`
            : "Add at least one photo to continue";
      case 1:
        return ai.status === "busy" || ai.status === "loading" ? "The AI keeps working while you continue" : "Every reading here is a suggestion — you decide next";
      case 2:
        return [
          `${facts.length} fact${facts.length === 1 ? "" : "s"}`,
          ...(variants.length ? [`${variants.length} option group${variants.length === 1 ? "" : "s"}`] : []),
          PAGE_LOCALES.find((l) => l.value === details.locale)?.hint ?? "",
        ].join(" · ");
      case 3:
        return offersIssue ?? `${pageItems.length} product${pageItems.length === 1 ? "" : "s"} · ${chosenOffers.length} offer${chosenOffers.length === 1 ? "" : "s"}`;
      default:
        return "Pick the closest to your brand — everything stays editable";
    }
  })();

  return (
    <>
      <PageHeader
        still={afterSkeleton}
        title={WIZARD_TITLE}
        description={WIZARD_LEAD}
        actions={
          <>
            <AiChip ai={ai} />
            {(state.photos.length > 0 || name) && (
              <Button variant="ghost" className="h-9 rounded-full px-3.5 text-muted-foreground" disabled={creating !== null} onClick={() => setConfirmReset(true)}>
                <RotateCcwIcon />
                Start over
              </Button>
            )}
          </>
        }
      >
        <StepRail step={state.step} canGo={canGo} onGo={goto} />
      </PageHeader>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={state.step} {...stepMotion}>
          {state.step === 0 && (
            <StepPhotos
              photos={state.photos}
              mainKey={state.mainKey}
              canUpload={canUpload}
              onFiles={addFiles}
              onLibrary={() => setPicker(true)}
              onRemove={remove}
              onSetMain={(key) => dispatch({ type: "setMain", key })}
              onRetry={retry}
            />
          )}
          {state.step === 1 && (
            <StepAnalysis
              ai={ai}
              aiEnabled={aiOn}
              bgRemoval={aiSettings.bgRemoval}
              tier={tier}
              main={main}
              palette={palette}
              category={details.category}
              onCategory={(category) => dispatch({ type: "details", patch: { category, categoryTouched: true } })}
              classify={classify}
              classifyJob={jobs.classify}
              onClassify={() => void runClassify()}
              analysis={analysis}
              analysisJob={jobs.analysis}
              onAnalyze={runAnalysis}
              autoLook={autoLook}
              cutout={state.cutout}
              cutoutSource={cutoutSource}
              mainIsCutout={mainIsCutout}
              cutoutJob={jobs.cutout}
              onCutout={() => void runCutout()}
              onUseCutout={(use) => dispatch({ type: "useCutout", use })}
            />
          )}
          {state.step === 2 && (
            <StepDetails
              details={details}
              onChange={(change) => {
                // another page language: the options' preset names, color names and volumes follow it
                const patch = change.locale && change.locale !== details.locale && !change.variants ? { ...change, variants: relocalizeVariants(details.variants, details.locale, change.locale) } : change;
                // linking a photo to the first option makes it the main photo: the hero shows the
                // first color (only when that link changes; picking another main photo stays possible)
                if (patch.variants) {
                  const next = leadPhotoId(patch.variants);
                  const photo = next && next !== leadPhotoId(details.variants) ? ready.find((p) => p.asset.id === next) : null;
                  if (photo && photo.key !== main?.key) dispatch({ type: "setMain", key: photo.key });
                }
                dispatch({ type: "details", patch });
                if (patch.name !== undefined || patch.price !== undefined) setErrors((e) => ({ ...e, ...(patch.name !== undefined ? { name: undefined } : {}), ...(patch.price !== undefined ? { price: undefined } : {}) }));
              }}
              currency={currency}
              main={main}
              cutoutUrl={cutoutAsset ? (cutoutAsset.thumbUrl ?? cutoutAsset.url) : null}
              suggested={analysis?.category ?? classify?.category ?? null}
              errors={errors}
              variantPhotos={variantPhotos}
              variantSuggest={variantSuggest}
              lead={lead}
              pixels={pixelStore}
              copywriter={{
                available: llm,
                note: !aiOn
                  ? "Local AI is switched off in Settings → AI — the hand-written copy library writes the page."
                  : tier === null
                    ? "Checking what this device can run…"
                    : tier === "off"
                      ? "This browser can't run the language model — the hand-written copy library writes the page."
                      : `Qwen3.5 ${tier === "full" ? "2B" : "0.8B"} writes every text in about a minute, checked for invented numbers and claims. The directions appear right away and update when it's done.`,
              }}
            />
          )}
          {state.step === 3 && (
            <StepOffers
              details={details}
              onChange={(patch) => dispatch({ type: "details", patch })}
              items={pageItems}
              onItems={onItems}
              offers={shownOffers}
              auto={details.offers === null}
              currency={currency}
              locale={details.locale}
              productName={name}
              productImages={product.images}
              photos={wizardPhotos}
              palettes={palettes}
              shippingFee={sameMarket ? defaults.shippingFee : 0}
            />
          )}
          {state.step === 4 && (
            <StepDirections
              tracking={pagePixels ? { value: details.tracking, onChange: (tracking) => dispatch({ type: "details", patch: { tracking } }), canCreate: canCreatePixels } : null}
              gate={trackingGate}
              directions={built.directions}
              error={built.error}
              assets={previewAssets}
              store={store}
              seedBase={state.seedBase}
              creating={creating}
              onUse={(i) => void chooseDirection(i)}
              onRegenerate={() => dispatch({ type: "reseed", seed: newSeed() })}
              onOtherStyles={() => setStyleOffset((o) => (o + 1) % Math.max(1, Math.ceil(ranked.length / 3)))}
              canOtherStyles={ranked.length >= 4}
              ai={ai}
              copy={copyState}
              onStopCopy={stopCopy}
              onRetryCopy={() => void runCopy()}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <StepFooter
        sticky={state.step < 4}
        status={stepStatus}
        back={
          state.step > 0 ? (
            <Button variant="ghost" className="h-10 rounded-full px-4" disabled={creating !== null} onClick={() => goto((state.step - 1) as Step)}>
              <ArrowLeftIcon />
              Back
            </Button>
          ) : null
        }
        next={
          state.step < 3 ? (
            <Button className="h-10 rounded-full px-5" disabled={!canContinue[state.step]} onClick={() => goto((state.step + 1) as Step)}>
              Continue
              <ArrowRightIcon />
            </Button>
          ) : state.step === 3 ? (
            <Button variant="brand" className="h-10 rounded-full px-5" disabled={!canContinue[3]} onClick={() => goto(4)}>
              <SparklesIcon />
              Design 3 directions
            </Button>
          ) : null
        }
      />

      {pickerMounted && <MediaPicker open={picker} onOpenChange={setPicker} onPick={pickFromLibrary} accept="image" allowUpload={canUpload} title="Add product photos" />}
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Start over?"
        description="The photos stay in your media library; the facts, analysis and directions of this draft are cleared."
        confirmLabel="Start over"
        icon={<RotateCcwIcon />}
        onConfirm={() => {
          reset();
          return true;
        }}
      />
    </>
  );
}

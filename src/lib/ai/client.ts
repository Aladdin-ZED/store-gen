/**
 * Local AI client — a singleton that owns the AI module worker, plus the `useAi()` React hook.
 * Browser only: nothing touches `window` until a function is called.
 *
 *   const ai = useAi({ enabled: settings.enabled, maxTier: settings.tier });
 *   ai.status            "off" | "idle" | "loading" | "ready" | "busy" | "error"
 *   ai.capabilities      { webgpu, f16, tier } once detected
 *   ai.progress          { stage, loaded?, total? } while a model downloads or works
 *   await ai.classify(photos)          → { category, vibe, scores }   (SigLIP, works without WebGPU)
 *   await ai.analyze(photos)           → Analysis                    (Qwen3.5, needs WebGPU)
 *   await ai.writeCopy(copyRequest)    → { locale, copy: AiCopy }    (validate + merge with mergeAiCopy)
 *   await ai.removeBackground(photo)   → trimmed WebP Blob with alpha
 *   await ai.rewrite(fieldRewriteInput) → { variants }  (AI-05: 3 strings ≤ the field's max; run copy.field's finalize)
 *   ai.cancel()                        rejects every running job with AiError("CANCELLED")
 *   await getAi().cacheStats()         → { total, byRepo } bytes in this browser's model cache
 *   await getAi().clearCache()         cancel + release + delete the model cache
 *
 * Every job function takes an optional `{ signal }`: aborting it cancels that job only (the others
 * keep their place in the worker's queue).
 *
 * Errors are AiError with a stable `code` ("NO_WEBGPU", "OOM", "CANCELLED", "MODEL_LOAD"…).
 *
 * R1 (P7 AI; ai.md AI-§A.6, GEN-13): `configure({ workerName })` names the worker after the platform's brand
 * (`policy.workerName`; "cod-studio-ai" when no policy is passed); `rewrite` is worker v2's field rewrite job; the
 * router's local provider (src/lib/ai/provider/local.ts) adapts this manager to the ladder without changing it, and
 * `cancelStoreAiJobs` (src/lib/ai/router/client.ts) calls `cancel()` + `release()` on a store switch and at sign-out.
 */
import { useEffect, useSyncExternalStore } from "react";
import type { Analysis, AiCopy } from "./copy-schema";
import { detectCapabilities, requestPersistentStorage, type AiCapabilities } from "./capabilities";
import { AiError, type AiErrorCode, type AiStage, type AiTier, type ClassifyResult, type FromWorker, type ToWorker, type WorkerTask } from "./protocol";
import { AI_CACHE_NAME, repoOfCacheUrl } from "./models";
import type { CopyLocale } from "./prompts";
import type { FieldRewriteInput, FieldRewriteOut } from "./schema/tasks/copy-field";

export { AiError, type AiErrorCode, type AiStage, type AiTier, type ClassifyResult } from "./protocol";
export { AI_CACHE_NAME, AI_MODELS, AI_MODEL_REPOS, AI_RUNTIME_BUCKET } from "./models";
export type { AiCapabilities } from "./capabilities";

export type AiStatus = "off" | "idle" | "loading" | "ready" | "busy" | "error";

export interface AiProgress {
  stage: AiStage;
  loaded?: number;
  total?: number;
}

export interface AiCopyResult {
  locale: CopyLocale;
  copy: AiCopy;
}

export interface AiClientSettings {
  /** Settings → AI → enabled */
  enabled: boolean;
  /** highest tier the admin allows (the device may still get "lite" or "off") */
  maxTier: Exclude<AiTier, "off">;
  /** GEN-13: the worker's name (`policy.workerName`); today's name when absent */
  workerName?: string;
}

/** The worker's name before GEN-13 (an old caller without a policy keeps it). */
export const DEFAULT_WORKER_NAME = "cod-studio-ai";

export interface AiState {
  status: AiStatus;
  capabilities: AiCapabilities | null;
  progress: AiProgress | null;
  error: { code: AiErrorCode; message: string } | null;
  enabled: boolean;
}

/** Bytes of model files in this browser's cache, per Hugging Face repo ("runtime" = ONNX Runtime files). */
export interface AiCacheStats {
  total: number;
  byRepo: Record<string, number>;
}

/** Per-job options. */
export interface AiRunOptions {
  /** aborting cancels this job only (rejects with AiError "CANCELLED") */
  signal?: AbortSignal;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: AiError) => void;
  /** detaches the abort listener */
  cleanup?: () => void;
}

class AiManager {
  private state: AiState = { status: "idle", capabilities: null, progress: null, error: null, enabled: true };
  private readonly listeners = new Set<() => void>();
  private worker: Worker | null = null;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private settings: AiClientSettings = { enabled: true, maxTier: "lite" };
  private detecting: Promise<AiCapabilities> | null = null;
  private finishedOnce = false;

  /* ---- store ---- */

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;

  private set(patch: Partial<AiState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  private refreshStatus() {
    let status: AiStatus;
    if (!this.settings.enabled) status = "off";
    else if (this.pending.size > 0) status = this.state.progress?.stage.startsWith("load-") ? "loading" : "busy";
    else if (this.state.error) status = "error";
    else status = this.finishedOnce ? "ready" : "idle";
    if (status !== this.state.status) this.set({ status });
  }

  /* ---- setup ---- */

  /** the name the next worker gets (GEN-13) */
  get workerName(): string {
    return this.settings.workerName?.trim() || DEFAULT_WORKER_NAME;
  }

  configure(settings: Partial<AiClientSettings>) {
    const next = { ...this.settings, ...settings };
    // a new name applies to the next worker; an idle one is replaced now (a running job keeps its worker)
    if (next.workerName !== this.settings.workerName && this.worker && this.pending.size === 0) {
      this.worker.terminate();
      this.worker = null;
    }
    const changed = next.enabled !== this.settings.enabled || next.maxTier !== this.settings.maxTier;
    this.settings = next;
    this.set({ enabled: next.enabled });
    if (!changed) return this.refreshStatus();
    if (!next.enabled) this.cancel();
    this.detecting = null;
    if (typeof window !== "undefined") void this.capabilities();
    this.refreshStatus();
  }

  /** Detect (once per settings change) what this device can run, and tell the worker. */
  capabilities(): Promise<AiCapabilities> {
    this.detecting ??= detectCapabilities(this.settings.maxTier).then((caps) => {
      this.set({ capabilities: caps });
      this.worker?.postMessage({ type: "configure", webgpu: caps.webgpu, f16: caps.f16, tier: caps.tier } satisfies ToWorker);
      return caps;
    });
    return this.detecting;
  }

  private ensureWorker(caps: AiCapabilities): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./worker/ai.worker.ts", import.meta.url), { type: "module", name: this.settings.workerName?.trim() || DEFAULT_WORKER_NAME });
    worker.onmessage = (e: MessageEvent<FromWorker>) => this.onMessage(e.data);
    worker.onerror = (e) => {
      e.preventDefault();
      // the worker script itself failed (bundle/CSP problem): fail everything and start fresh next time
      this.failAll("MODEL_LOAD", e.message || "The AI worker could not start.");
      worker.terminate();
      if (this.worker === worker) this.worker = null;
    };
    worker.postMessage({ type: "configure", webgpu: caps.webgpu, f16: caps.f16, tier: caps.tier } satisfies ToWorker);
    this.worker = worker;
    void requestPersistentStorage().then((persisted) => {
      if (this.state.capabilities) this.set({ capabilities: { ...this.state.capabilities, persisted } });
    });
    return worker;
  }

  private onMessage(msg: FromWorker) {
    const job = this.pending.get(msg.id);
    if (msg.type === "progress") {
      if (job) {
        this.set({ progress: { stage: msg.stage, loaded: msg.loaded, total: msg.total } });
        this.refreshStatus();
      }
      return;
    }
    if (!job) return;
    this.pending.delete(msg.id);
    job.cleanup?.();
    this.finishedOnce = true;
    if (msg.type === "result") {
      this.set({ error: null, progress: this.pending.size ? this.state.progress : null });
      job.resolve(msg.result);
    } else {
      this.set({ error: msg.code === "CANCELLED" ? null : { code: msg.code, message: msg.message }, progress: this.pending.size ? this.state.progress : null });
      job.reject(new AiError(msg.code, msg.message));
    }
    this.refreshStatus();
  }

  private failAll(code: AiErrorCode, message: string) {
    for (const [, job] of this.pending) {
      job.cleanup?.();
      job.reject(new AiError(code, message));
    }
    this.pending.clear();
    this.set({ progress: null, error: code === "CANCELLED" ? null : { code, message } });
    this.refreshStatus();
  }

  private async run<T>(task: WorkerTask, opts: AiRunOptions = {}): Promise<T> {
    if (typeof window === "undefined") throw new AiError("UNKNOWN", "The local AI runs in the browser only.");
    if (!this.settings.enabled) throw new AiError("DISABLED", "Local AI is switched off in Settings.");
    const caps = await this.capabilities();
    if ((task.task === "analyze" || task.task === "copy" || task.task === "rewrite") && caps.tier === "off") {
      throw new AiError("NO_WEBGPU", caps.note ?? "This device cannot run the local language model.");
    }
    const { signal } = opts;
    if (signal?.aborted) throw new AiError("CANCELLED", "Cancelled.");
    const worker = this.ensureWorker(caps);
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const job: Pending = { resolve: resolve as (v: unknown) => void, reject };
      if (signal) {
        const onAbort = () => this.cancelJob(id);
        signal.addEventListener("abort", onAbort, { once: true });
        job.cleanup = () => signal.removeEventListener("abort", onAbort);
      }
      this.pending.set(id, job);
      this.set({ error: null });
      this.refreshStatus();
      worker.postMessage({ type: "run", id, ...task } satisfies ToWorker);
    });
  }

  /** Cancel one job: the worker stops it at its next checkpoint, the caller gets "CANCELLED" now. */
  private cancelJob(id: number) {
    const job = this.pending.get(id);
    if (!job) return;
    this.worker?.postMessage({ type: "cancel", id } satisfies ToWorker);
    this.pending.delete(id);
    job.cleanup?.();
    job.reject(new AiError("CANCELLED", "Cancelled."));
    // the progress shown belongs to the job that is running; drop it when nothing else waits
    if (!this.pending.size) this.set({ progress: null });
    this.refreshStatus();
  }

  /* ---- public API ---- */

  classify = (images: Blob[], opts?: AiRunOptions) => this.run<ClassifyResult>({ task: "classify", images }, opts);
  analyze = (images: Blob[], opts?: AiRunOptions) => this.run<Analysis>({ task: "analyze", images }, opts);
  /** `input` is a CopyRequest (validated in the worker); result must go through mergeAiCopy */
  writeCopy = (input: unknown, opts?: AiRunOptions) => this.run<AiCopyResult>({ task: "copy", input: input as never }, opts);
  removeBackground = (image: Blob, opts?: AiRunOptions) => this.run<Blob>({ task: "removeBackground", image }, opts);
  /** AI-05: three rewrites of one field (validated in the worker; the caller runs copy.field's finalize on them) */
  rewrite = (input: FieldRewriteInput, opts?: AiRunOptions) => this.run<FieldRewriteOut>({ task: "rewrite", input }, opts);

  cancel = () => {
    for (const id of this.pending.keys()) this.worker?.postMessage({ type: "cancel", id } satisfies ToWorker);
    this.failAll("CANCELLED", "Cancelled.");
  };

  /** Free GPU memory held by models (e.g. when leaving the generator). */
  release = () => {
    this.worker?.postMessage({ type: "release" } satisfies ToWorker);
  };

  /** Sizes of the cached model files (null when this browser has no Cache Storage, e.g. plain http). */
  cacheStats = async (): Promise<AiCacheStats | null> => {
    if (typeof caches === "undefined") return null;
    // caches.open() would create an empty bucket: only look when it exists
    if (!(await caches.has(AI_CACHE_NAME))) return { total: 0, byRepo: {} };
    const cache = await caches.open(AI_CACHE_NAME);
    const stats: AiCacheStats = { total: 0, byRepo: {} };
    for (const req of await cache.keys()) {
      const res = await cache.match(req);
      if (!res) continue;
      let size = Number(res.headers.get("content-length"));
      if (!Number.isFinite(size) || size <= 0) size = (await res.blob()).size;
      const repo = repoOfCacheUrl(req.url);
      stats.byRepo[repo] = (stats.byRepo[repo] ?? 0) + size;
      stats.total += size;
    }
    return stats;
  };

  /**
   * Remove every downloaded model from this browser: running jobs are cancelled and loaded models
   * released first. Resolves false when the browser refuses (or has no Cache Storage).
   */
  clearCache = async (): Promise<boolean> => {
    this.cancel();
    this.release();
    if (typeof caches === "undefined") return false;
    try {
      await caches.delete(AI_CACHE_NAME);
      return true;
    } catch {
      return false;
    }
  };
}

/** The client type (for components that receive it as a prop). */
export type AiClient = AiManager;

let manager: AiManager | null = null;

/** The process-wide AI manager (lazy). */
export function getAi(): AiManager {
  manager ??= new AiManager();
  return manager;
}

/** The manager when one exists (a store switch must not create one just to cancel nothing). */
export function peekAi(): AiManager | null {
  return manager;
}

const SERVER_STATE: AiState = { status: "idle", capabilities: null, progress: null, error: null, enabled: true };

export interface UseAi extends AiState {
  capabilities: AiCapabilities | null;
  classify: (images: Blob[], opts?: AiRunOptions) => Promise<ClassifyResult>;
  analyze: (images: Blob[], opts?: AiRunOptions) => Promise<Analysis>;
  writeCopy: (input: unknown, opts?: AiRunOptions) => Promise<AiCopyResult>;
  removeBackground: (image: Blob, opts?: AiRunOptions) => Promise<Blob>;
  rewrite: (input: FieldRewriteInput, opts?: AiRunOptions) => Promise<FieldRewriteOut>;
  cancel: () => void;
}

/**
 * React binding. Pass the admin's AI settings when you have them (Settings → AI); without them the
 * AI is enabled with the lite tier as the ceiling.
 */
export function useAi(settings?: Partial<AiClientSettings>): UseAi {
  const ai = getAi();
  const state = useSyncExternalStore(ai.subscribe, ai.getState, () => SERVER_STATE);
  const enabled = settings?.enabled;
  const maxTier = settings?.maxTier;
  const workerName = settings?.workerName;
  useEffect(() => {
    ai.configure({ ...(enabled === undefined ? {} : { enabled }), ...(maxTier ? { maxTier } : {}), ...(workerName ? { workerName } : {}) });
    void ai.capabilities();
  }, [ai, enabled, maxTier, workerName]);
  return {
    ...state,
    classify: ai.classify,
    analyze: ai.analyze,
    writeCopy: ai.writeCopy,
    removeBackground: ai.removeBackground,
    rewrite: ai.rewrite,
    cancel: ai.cancel,
  };
}

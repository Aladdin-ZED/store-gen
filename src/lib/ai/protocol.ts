/**
 * Message protocol between the AI client (main thread) and the AI module worker.
 * Plain structured-clone data only (Blobs travel without copying the pixels).
 */
import type { ProductCategory } from "@/lib/page/schema";
import type { Vibe } from "./copy-schema";
import type { CopyRequest } from "./prompts";
import type { AiFailCode } from "./provider/types";
import type { FieldRewriteInput } from "./schema/tasks/copy-field";

/** The device's local-AI tier (ai.md AI-§A.3): off = no local model, lite = Qwen 0.8B, full = Qwen 2B. */
export type DeviceTier = "off" | "lite" | "full";
/** @deprecated R1 name is `DeviceTier`; kept one release for the R1.0 importers (AI-§A.3) */
export type AiTier = DeviceTier;

export type AiErrorCode =
  /** the browser/GPU cannot run the language model */
  | "NO_WEBGPU"
  /** the GPU or tab ran out of memory (try the lite tier, close tabs) */
  | "OOM"
  | "CANCELLED"
  /** a model could not be downloaded or compiled */
  | "MODEL_LOAD"
  /** the model answered something unusable twice */
  | "INVALID_OUTPUT"
  /** background removal found no product in the photo */
  | "NO_FOREGROUND"
  /** local AI switched off in Settings → AI */
  | "DISABLED"
  | "UNKNOWN";

export type AiStage =
  | "load-classifier"
  | "classify"
  | "load-vlm"
  | "analyze"
  | "write"
  | "load-matting"
  | "matting";

export interface ClassifyResult {
  category: ProductCategory;
  vibe: Vibe;
  /** label → score (0..1): "category:skincare", "vibe:natural"… */
  scores: Record<string, number>;
}

export type WorkerTask =
  | { task: "classify"; images: Blob[] }
  | { task: "analyze"; images: Blob[] }
  | { task: "copy"; input: CopyRequest }
  | { task: "removeBackground"; image: Blob }
  /** AI-05 (worker v2): a `FieldRewriteInput`, validated in the worker; answers `{ variants: string[3] }` */
  | { task: "rewrite"; input: FieldRewriteInput };

export type ToWorker =
  | { type: "configure"; webgpu: boolean; f16: boolean; tier: AiTier }
  | ({ type: "run"; id: number } & WorkerTask)
  | { type: "cancel"; id: number }
  /** free every model (GPU memory) — e.g. when leaving the generator */
  | { type: "release" };

export type FromWorker =
  | { type: "progress"; id: number; stage: AiStage; loaded?: number; total?: number }
  | { type: "result"; id: number; result: unknown }
  | { type: "error"; id: number; code: AiErrorCode; message: string };

export class AiError extends Error {
  readonly code: AiErrorCode;
  constructor(code: AiErrorCode, message?: string) {
    super(message || code);
    this.name = "AiError";
    this.code = code;
  }
}

/** Map any thrown value to a stable error code (GPU/WASM errors come as free text). */
export function errorCode(err: unknown): AiErrorCode {
  if (err instanceof AiError) return err.code;
  const msg = String((err as { message?: unknown })?.message ?? err).toLowerCase();
  if (/out of memory|\boom\b|failed to allocate|allocation failed|device (was )?lost|gpudevice.*lost|memory access out of bounds|maximum buffer size/.test(msg)) return "OOM";
  if (/webgpu|no available backend|adapter/.test(msg)) return "NO_WEBGPU";
  if (/fetch|network|404|could not locate|failed to load|unsupported model|protobuf|load model/.test(msg)) return "MODEL_LOAD";
  return "UNKNOWN";
}

/**
 * The worker's error codes on the provider contract's failure codes (AI-§A.3: 1:1, so the local rung answers the same
 * `AiFailure` as the server rung). `NO_FOREGROUND` (matting found no product) is an unusable output.
 */
export const AI_ERROR_FAIL_CODE: Readonly<Record<AiErrorCode, AiFailCode>> = {
  NO_WEBGPU: "device_unsupported",
  OOM: "oom",
  CANCELLED: "cancelled",
  MODEL_LOAD: "model_load",
  INVALID_OUTPUT: "invalid_output",
  NO_FOREGROUND: "invalid_output",
  DISABLED: "disabled",
  UNKNOWN: "unknown",
};

/** The failure code of anything the local worker threw. */
export function failCodeOf(err: unknown): AiFailCode {
  return AI_ERROR_FAIL_CODE[errorCode(err)];
}

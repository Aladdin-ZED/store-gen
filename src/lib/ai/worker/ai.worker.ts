/**
 * Local AI module worker — everything runs in the admin's browser (models come from the Hugging Face
 * CDN once, then from the browser cache).
 *
 *   classify          SigLIP zero-shot (webgpu fp16, else wasm q8): category + visual vibe, instant
 *   analyze           Qwen3.5 VLM (2B full / 0.8B lite, WebGPU), JSON-schema constrained
 *   copy              Qwen3.5, JSON-schema constrained, one call per locale, retried once greedily
 *   removeBackground  BiRefNet_lite (webgpu fp32), ISNet (wasm fp32) fallback; de-hazed, trimmed WebP
 *   rewrite           (worker v2, AI-05) Qwen3.5, greedy, ≤ 160 new tokens, exactly 3 variants ≤ the field's max
 *
 * Every request is validated at this boundary (CopyRequest v2, FieldRewriteInput): an old cached bundle and an old
 * caller keep working because every v2 field is optional (AI-§A.6).
 *
 * One job runs at a time (ONNX Runtime serializes sessions anyway). Models that are not needed for
 * the next job are released before a big one loads, so an 8 GB laptop does not run out of memory.
 */
import {
  AutoModel,
  AutoProcessor,
  InterruptableStoppingCriteria,
  Qwen3_5ForConditionalGeneration,
  RawImage,
  TextStreamer,
  env,
  pipeline,
  type ProgressInfo,
  type Tensor,
} from "@huggingface/transformers";
import { StructuredOutputProcessor } from "@huggingface/transformers-structured-output";
import { AI_COPY_JSON_SCHEMA, ANALYSIS_JSON_SCHEMA, AiCopy, AnalysisRaw, VIBES, rewriteVariantsSpec, toAnalysis } from "../copy-schema";
import { coverage, padBox, refineAlpha } from "../matte";
import { AI_CACHE_NAME, AI_MODELS } from "../models";
import { ANALYZE_PROMPT, CopyRequest, copyPrompt } from "../prompts";
import { rewritePrompt } from "../prompts/copy.field/l1";
import { FieldRewriteInputZ } from "../schema/tasks/inputs";
import { AiError, errorCode, type AiStage, type AiTier, type ClassifyResult, type FromWorker, type ToWorker } from "../protocol";
import { CATEGORY_PROMPTS, CATEGORY_TEMPLATE, VIBE_PROMPTS, VIBE_TEMPLATE } from "../taxonomy";
import { PRODUCT_CATEGORIES, type ProductCategory } from "@/lib/page/schema";

env.allowLocalModels = false;
env.useBrowserCache = true;
// the bucket Settings → Local AI measures and clears (getAi().cacheStats() / clearCache())
env.cacheKey = AI_CACHE_NAME;

const MODELS = AI_MODELS;

/* ------------------------------------------------------------------ */
/* Narrow views of the library objects we use                         */
/* ------------------------------------------------------------------ */

interface Disposable {
  dispose(): Promise<unknown> | unknown;
}
type ZeroShot = Disposable &
  ((image: RawImage, labels: string[], opts: { hypothesis_template: string }) => Promise<{ label: string; score: number }[]>);
interface ChatProcessor {
  tokenizer: unknown;
  apply_chat_template(messages: unknown[], opts: Record<string, unknown>): string;
  batch_decode(t: Tensor, opts: { skip_special_tokens: boolean }): string[];
  (text: string, images?: RawImage | RawImage[]): Promise<Record<string, Tensor> & { input_ids: Tensor }>;
}
interface Generator extends Disposable {
  generate(opts: Record<string, unknown>): Promise<Tensor>;
}
interface Segmenter extends Disposable {
  sessions: Record<string, { inputNames: string[]; outputNames: string[] }>;
  (inputs: Record<string, Tensor>): Promise<Record<string, Tensor>>;
}
type ImageProcessor = (image: RawImage) => Promise<{ pixel_values: Tensor }>;

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

let gpu = { webgpu: false, f16: false };
let tier: AiTier = "off";

let siglip: Promise<ZeroShot> | null = null;
let vlm: Promise<{ processor: ChatProcessor; model: Generator; tier: AiTier }> | null = null;
let matting: Promise<{ model: Segmenter; processor: ImageProcessor; device: "webgpu" | "wasm" }> | null = null;

interface Job {
  cancelled: boolean;
  stop?: () => void;
}
const jobs = new Map<number, Job>();
let queue: Promise<unknown> = Promise.resolve();

const post = (m: FromWorker) => self.postMessage(m);
const progress = (id: number, stage: AiStage, loaded?: number, total?: number) => post({ type: "progress", id, stage, loaded, total });

function checkCancelled(id: number) {
  if (jobs.get(id)?.cancelled) throw new AiError("CANCELLED");
}

/** Download progress → aggregated bytes for the job. */
function loadProgress(id: number, stage: AiStage) {
  return (p: ProgressInfo) => {
    if (p.status === "progress_total") progress(id, stage, p.loaded, p.total);
    else if (p.status === "initiate") progress(id, stage);
  };
}

async function release(which: "siglip" | "vlm" | "matting") {
  const holder = which === "siglip" ? siglip : which === "vlm" ? vlm : matting;
  if (!holder) return;
  if (which === "siglip") siglip = null;
  if (which === "vlm") vlm = null;
  if (which === "matting") matting = null;
  try {
    const loaded = await holder;
    if ("dispose" in loaded && typeof loaded.dispose === "function") await loaded.dispose();
    else if ("model" in loaded) await loaded.model.dispose();
  } catch {
    // a model that failed to load has nothing to free
  }
}

/* ------------------------------------------------------------------ */
/* Classify (SigLIP)                                                   */
/* ------------------------------------------------------------------ */

function loadSiglip(id: number): Promise<ZeroShot> {
  if (siglip) return siglip;
  const onGpu = gpu.webgpu && gpu.f16;
  siglip = pipeline("zero-shot-image-classification", MODELS.siglip, {
    device: onGpu ? "webgpu" : "wasm",
    dtype: onGpu ? "fp16" : "q8",
    progress_callback: loadProgress(id, "load-classifier"),
  }).then((p) => p as unknown as ZeroShot);
  siglip.catch(() => {
    siglip = null;
  });
  return siglip;
}

async function classify(id: number, images: Blob[]): Promise<ClassifyResult> {
  if (!images.length) throw new AiError("INVALID_OUTPUT", "No photo to classify.");
  const clf = await loadSiglip(id);
  checkCancelled(id);
  progress(id, "classify");
  const catKeys = PRODUCT_CATEGORIES as readonly ProductCategory[];
  const catLabels = catKeys.map((k) => CATEGORY_PROMPTS[k]);
  const vibeLabels = VIBES.map((k) => VIBE_PROMPTS[k]);
  const scores: Record<string, number> = {};
  const used = images.slice(0, 3);
  for (const blob of used) {
    const img = await RawImage.fromBlob(blob);
    const cats = await clf(img, catLabels, { hypothesis_template: CATEGORY_TEMPLATE });
    const vibes = await clf(img, vibeLabels, { hypothesis_template: VIBE_TEMPLATE });
    for (const r of cats) {
      const k = catKeys[catLabels.indexOf(r.label)];
      if (k) scores[`category:${k}`] = (scores[`category:${k}`] ?? 0) + r.score / used.length;
    }
    for (const r of vibes) {
      const k = VIBES[vibeLabels.indexOf(r.label)];
      if (k) scores[`vibe:${k}`] = (scores[`vibe:${k}`] ?? 0) + r.score / used.length;
    }
    checkCancelled(id);
  }
  const best = (prefix: string) =>
    Object.entries(scores)
      .filter(([k]) => k.startsWith(prefix))
      .sort((a, b) => b[1] - a[1])[0]?.[0]
      .slice(prefix.length);
  const category = (best("category:") ?? "other") as ProductCategory;
  const vibe = (best("vibe:") ?? "minimal") as ClassifyResult["vibe"];
  return { category, vibe, scores };
}

/* ------------------------------------------------------------------ */
/* Vision-language model (Qwen3.5)                                     */
/* ------------------------------------------------------------------ */

function loadVlm(id: number) {
  if (tier === "off" || !gpu.webgpu) throw new AiError("NO_WEBGPU", "This browser or GPU cannot run the local language model.");
  if (vlm) return vlm;
  const want = tier;
  const modelId = MODELS.vlm[want === "full" ? "full" : "lite"];
  vlm = (async () => {
    // free the other models first: the VLM is by far the biggest
    await Promise.all([release("matting"), release("siglip")]);
    const onProgress = loadProgress(id, "load-vlm");
    const processor = (await AutoProcessor.from_pretrained(modelId, { progress_callback: onProgress })) as unknown as ChatProcessor;
    const model = (await Qwen3_5ForConditionalGeneration.from_pretrained(modelId, {
      device: "webgpu",
      dtype: gpu.f16
        ? { embed_tokens: "q4", vision_encoder: "fp16", decoder_model_merged: "q4" }
        : { embed_tokens: "q4", vision_encoder: "q4", decoder_model_merged: "q4" },
      progress_callback: onProgress,
    })) as unknown as Generator;
    // precompute the constraint engine's vocabulary tables once
    StructuredOutputProcessor.warmup(processor.tokenizer as Parameters<typeof StructuredOutputProcessor.warmup>[0]);
    return { processor, model, tier: want };
  })();
  vlm.catch(() => {
    vlm = null;
  });
  return vlm;
}

/** Fit an image inside size×size, both sides multiples of 28 (Qwen patch 14 × merge 2). */
async function forVision(blob: Blob, size = 448): Promise<RawImage> {
  const img = await RawImage.fromBlob(blob);
  const scale = Math.min(1, size / Math.max(img.width, img.height));
  const w = Math.max(56, Math.round((img.width * scale) / 28) * 28);
  const h = Math.max(56, Math.round((img.height * scale) / 28) * 28);
  return img.resize(w, h);
}

async function generateJson(
  id: number,
  stage: AiStage,
  opts: { prompt: string; schema: Record<string, unknown>; images: RawImage[]; maxNewTokens: number; creative: boolean },
): Promise<unknown> {
  const { processor, model } = await loadVlm(id);
  checkCancelled(id);
  const content = [...opts.images.map(() => ({ type: "image" })), { type: "text", text: opts.prompt }];
  const text = processor.apply_chat_template([{ role: "user", content }], { add_generation_prompt: true, enable_thinking: false });
  const inputs = opts.images.length ? await processor(text, opts.images.length === 1 ? opts.images[0] : opts.images) : await processor(text);
  // stateful constraint: a fresh one per generation
  const constraint = new StructuredOutputProcessor(processor.tokenizer as ConstructorParameters<typeof StructuredOutputProcessor>[0], {
    type: "json_schema",
    json_schema: opts.schema as never,
  });
  const stopper = new InterruptableStoppingCriteria();
  const job = jobs.get(id);
  if (job) job.stop = () => stopper.interrupt();
  // progress against the usual answer length (the token cap is rarely reached); never shows 100 % early
  const expected = Math.max(1, Math.round(opts.maxNewTokens * 0.6));
  let tokens = 0;
  const streamer = new TextStreamer(processor.tokenizer as ConstructorParameters<typeof TextStreamer>[0], {
    skip_prompt: true,
    token_callback_function: () => {
      tokens++;
      if (tokens % 6 === 0) progress(id, stage, Math.min(tokens, Math.floor(expected * 0.97)), expected);
    },
  });
  progress(id, stage, 0, expected);
  const out = await model.generate({
    ...inputs,
    max_new_tokens: opts.maxNewTokens,
    logits_processor: constraint,
    stopping_criteria: stopper,
    streamer,
    ...(opts.creative ? { do_sample: true, temperature: 0.7, top_p: 0.8, top_k: 20, repetition_penalty: 1.05 } : { do_sample: false }),
  });
  checkCancelled(id);
  const promptLength = inputs.input_ids.dims.at(-1) ?? 0;
  const [decoded] = processor.batch_decode(out.slice(null, [promptLength, out.dims.at(-1) ?? promptLength]), { skip_special_tokens: true });
  return JSON.parse(decoded ?? "");
}

async function analyze(id: number, images: Blob[]) {
  if (!images.length) throw new AiError("INVALID_OUTPUT", "No photo to analyze.");
  const visuals = await Promise.all(images.slice(0, 2).map((b) => forVision(b)));
  for (const creative of [false, true]) {
    try {
      const raw = await generateJson(id, "analyze", { prompt: ANALYZE_PROMPT, schema: ANALYSIS_JSON_SCHEMA, images: visuals, maxNewTokens: 260, creative });
      const parsed = AnalysisRaw.safeParse(raw);
      if (parsed.success) return toAnalysis(parsed.data);
    } catch (err) {
      if (errorCode(err) !== "UNKNOWN" || err instanceof AiError) throw err;
      // JSON.parse failure (cut-off output): retry once
    }
  }
  throw new AiError("INVALID_OUTPUT", "The model's analysis was unusable.");
}

async function writeCopy(id: number, input: unknown) {
  const req = CopyRequest.safeParse(input);
  if (!req.success) throw new AiError("INVALID_OUTPUT", "Invalid copy request.");
  const prompt = copyPrompt(req.data);
  // Arabic needs more tokens for the same text
  const maxNewTokens = req.data.locale === "ar" ? 2300 : 1800;
  // creative first, then one greedy retry (validate with zod, retry once)
  for (const creative of [true, false]) {
    try {
      const raw = await generateJson(id, "write", { prompt, schema: AI_COPY_JSON_SCHEMA, images: [], maxNewTokens, creative });
      const parsed = AiCopy.safeParse(raw);
      if (parsed.success) return { locale: req.data.locale, copy: parsed.data };
    } catch (err) {
      if (errorCode(err) !== "UNKNOWN" || err instanceof AiError) throw err;
    }
  }
  throw new AiError("INVALID_OUTPUT", "The model's copy was unusable.");
}

/** AI-05 (`copy.field@l1`): one greedy constrained call, ≤ 160 new tokens; the caller runs copy.field's finalize. */
const REWRITE_MAX_NEW_TOKENS = 160;

async function rewrite(id: number, input: unknown) {
  const req = FieldRewriteInputZ.safeParse(input);
  if (!req.success) throw new AiError("INVALID_OUTPUT", "Invalid rewrite request.");
  const spec = rewriteVariantsSpec(req.data.max);
  let raw: unknown;
  try {
    raw = await generateJson(id, "write", { prompt: rewritePrompt(req.data), schema: spec.json, images: [], maxNewTokens: REWRITE_MAX_NEW_TOKENS, creative: false });
  } catch (err) {
    if (errorCode(err) !== "UNKNOWN" || err instanceof AiError) throw err;
    // cut off at the token cap (JSON.parse failed): greedy decoding would give the same answer again
    throw new AiError("INVALID_OUTPUT", "The model's rewrite was cut off.");
  }
  const parsed = spec.zod.safeParse(raw);
  if (!parsed.success) throw new AiError("INVALID_OUTPUT", "The model's rewrite was unusable.");
  return { variants: parsed.data.variants };
}

/* ------------------------------------------------------------------ */
/* Background removal                                                  */
/* ------------------------------------------------------------------ */

function loadMatting(id: number, forceWasm = false) {
  if (matting) return matting;
  matting = (async () => {
    await release("vlm");
    const onProgress = loadProgress(id, "load-matting");
    if (gpu.webgpu && !forceWasm) {
      try {
        const model = (await AutoModel.from_pretrained(MODELS.matting.webgpu, { device: "webgpu", dtype: "fp32", progress_callback: onProgress })) as unknown as Segmenter;
        const processor = (await AutoProcessor.from_pretrained(MODELS.matting.webgpu, { progress_callback: onProgress })) as unknown as ImageProcessor;
        return { model, processor, device: "webgpu" as const };
      } catch {
        // stock graph not supported by this GPU → WASM fallback below
      }
    }
    const model = (await AutoModel.from_pretrained(MODELS.matting.wasm, { device: "wasm", dtype: "fp32", progress_callback: onProgress })) as unknown as Segmenter;
    const processor = (await AutoProcessor.from_pretrained(MODELS.matting.wasm, { progress_callback: onProgress })) as unknown as ImageProcessor;
    return { model, processor, device: "wasm" as const };
  })();
  matting.catch(() => {
    matting = null;
  });
  return matting;
}

async function predictMask(m: { model: Segmenter; processor: ImageProcessor }, image: RawImage): Promise<RawImage> {
  const { pixel_values } = await m.processor(image);
  const session = m.model.sessions.model ?? Object.values(m.model.sessions)[0];
  const inputName = session?.inputNames[0] ?? "pixel_values";
  const out = await m.model({ [inputName]: pixel_values });
  let mask = out.output_image ?? out[session?.outputNames[0] ?? ""] ?? Object.values(out)[0];
  if (!mask) throw new AiError("NO_FOREGROUND", "The matting model returned no mask.");
  while (mask.dims.length > 3) mask = mask.squeeze(0);
  const data = mask.data as Float32Array;
  let outOfRange = false;
  for (let i = 0; i < data.length; i += 97) if (data[i]! < -0.001 || data[i]! > 1.001) outOfRange = true;
  // logits → probabilities only when the model did not apply the sigmoid itself
  const probs = outOfRange ? mask.sigmoid() : mask;
  const small = RawImage.fromTensor(probs.mul(255).to("uint8"));
  return small.resize(image.width, image.height);
}

async function removeBackground(id: number, blob: Blob): Promise<Blob> {
  const image = await RawImage.fromBlob(blob);
  let m = await loadMatting(id);
  checkCancelled(id);
  progress(id, "matting");
  let mask: RawImage;
  try {
    mask = await predictMask(m, image);
  } catch (err) {
    if (m.device !== "webgpu" || err instanceof AiError) throw err;
    // the WebGPU graph compiled but failed at run time on this GPU → WASM
    await release("matting");
    m = await loadMatting(id, true);
    mask = await predictMask(m, image);
  }
  checkCancelled(id);
  const rgba = image.clone().rgba().putAlpha(mask);
  // view over the image's own buffer (a plain ArrayBuffer): no copy of a full-resolution photo
  const px = new Uint8ClampedArray(rgba.data.buffer as ArrayBuffer, rgba.data.byteOffset, rgba.data.length);
  const box = refineAlpha(px, rgba.width, rgba.height);
  if (!box || coverage(box, rgba.width, rgba.height) < 0.004) throw new AiError("NO_FOREGROUND", "No product was found in this photo.");
  const crop = padBox(box, rgba.width, rgba.height);
  const full = new OffscreenCanvas(rgba.width, rgba.height);
  full.getContext("2d")!.putImageData(new ImageData(px, rgba.width, rgba.height), 0, 0);
  const canvas = new OffscreenCanvas(crop.w, crop.h);
  canvas.getContext("2d")!.drawImage(full, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  const webp = await canvas.convertToBlob({ type: "image/webp", quality: 0.92 });
  return webp.type === "image/webp" ? webp : canvas.convertToBlob({ type: "image/png" });
}

/* ------------------------------------------------------------------ */
/* Dispatch                                                            */
/* ------------------------------------------------------------------ */

self.onmessage = (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  if (msg.type === "configure") {
    const tierChanged = msg.tier !== tier;
    gpu = { webgpu: msg.webgpu, f16: msg.f16 };
    tier = msg.tier;
    // queued behind the running job: a generation in progress keeps its model until it ends
    if (tierChanged) queue = queue.then(() => release("vlm"));
    return;
  }
  if (msg.type === "cancel") {
    const job = jobs.get(msg.id);
    if (job) {
      job.cancelled = true;
      job.stop?.();
    }
    return;
  }
  if (msg.type === "release") {
    queue = queue.then(() => Promise.all([release("siglip"), release("vlm"), release("matting")]));
    return;
  }
  const { id } = msg;
  jobs.set(id, { cancelled: false });
  queue = queue.then(async () => {
    try {
      checkCancelled(id);
      let result: unknown;
      if (msg.task === "classify") result = await classify(id, msg.images);
      else if (msg.task === "analyze") result = await analyze(id, msg.images);
      else if (msg.task === "copy") result = await writeCopy(id, msg.input);
      else if (msg.task === "rewrite") result = await rewrite(id, msg.input);
      else result = await removeBackground(id, msg.image);
      post({ type: "result", id, result });
    } catch (err) {
      const code = jobs.get(id)?.cancelled ? "CANCELLED" : errorCode(err);
      // after an out-of-memory error the GPU state is unreliable: start clean next time
      if (code === "OOM") await Promise.all([release("vlm"), release("matting"), release("siglip")]);
      post({ type: "error", id, code, message: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300) });
    } finally {
      jobs.delete(id);
    }
  });
};

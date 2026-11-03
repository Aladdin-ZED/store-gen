import "server-only";
/**
 * Stage outputs over 64 KB (P7 AI; ai.md AI-§B.13 step 2; docs/STORE-SAAS.md §G.7 `DATA_DIR/ai/<storeId>/`, §H.11
 * 30-day retention): `DATA_DIR/ai/<storeId>/<jobId>/<stage>.json`, referenced by `ai_jobs.result.outputs[stage] =
 * { ref }` (and `result.outputRef` for the last one). The path rule is §G.7's `dataPath`: ids must be 26-character
 * Crockford ids, no `..`, no absolute segment; CCR r1-p7-10 switches these helpers to `dataPath("ai", …)` from
 * src/lib/storage/paths.ts (P8) at the merge. Without `DATA_DIR` (a dev machine) the output stays in the row.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** `ai_jobs.result` keeps a stage output inline up to this size (AI-§B.13 step 2). */
export const RESULT_INLINE_MAX_BYTES = 64 * 1024;

const ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const STAGE_RE = /^[a-z]+(?::[0-9]{1,2})?$/;

function dataDir(): string | null {
  const d = process.env.DATA_DIR?.trim();
  return d && path.isAbsolute(d) ? d : null;
}

/** The relative path of a blob ("ai/<storeId>/<jobId>/<stage>.json"); throws on a bad id or stage. */
export function aiBlobPath(storeId: string, jobId: string, stage: string): string {
  if (!ID_RE.test(storeId) || !ID_RE.test(jobId) || !STAGE_RE.test(stage)) throw new Error("ai blob: bad id or stage");
  return `ai/${storeId}/${jobId}/${stage.replace(":", "-")}.json`;
}

const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v ?? null), "utf8");

/**
 * The value a job row keeps for one stage output: the output itself up to 64 KB, else `{ ref }` once the blob is
 * written. Without `DATA_DIR` the output stays inline whatever its size.
 */
export async function keepStageOutput(storeId: string, jobId: string, stage: string, output: unknown): Promise<{ value: unknown; ref: string | null }> {
  const root = dataDir();
  if (bytes(output) <= RESULT_INLINE_MAX_BYTES || !root) return { value: output, ref: null };
  const rel = aiBlobPath(storeId, jobId, stage);
  const abs = path.join(root, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, JSON.stringify(output), "utf8");
  return { value: { ref: rel }, ref: rel };
}

/** A blob's content (the job view's reader); null when it is gone. */
export async function readStageBlob(rel: string): Promise<unknown> {
  const root = dataDir();
  if (!root || !/^ai\/[0-9A-HJKMNP-TV-Z]{26}\/[0-9A-HJKMNP-TV-Z]{26}\/[a-z]+(?:-[0-9]{1,2})?\.json$/.test(rel)) return null;
  try {
    return JSON.parse(await readFile(path.join(root, rel), "utf8")) as unknown;
  } catch {
    return null;
  }
}

/** Deletes a job's blob folder (retention, purge); a missing folder is fine. */
export async function removeJobBlobs(storeId: string, jobId: string): Promise<void> {
  const root = dataDir();
  if (!root || !ID_RE.test(storeId) || !ID_RE.test(jobId)) return;
  await rm(path.join(root, "ai", storeId, jobId), { recursive: true, force: true });
}

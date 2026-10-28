/**
 * The on-device tasks' shapes (AI-03; ai.md AI-§A.6): `classify` (SigLIP) and `removeBackground` (matting), run by the
 * local worker only. Types only, browser values (Blobs travel without copying the pixels).
 */
export type { ClassifyResult } from "../../protocol";

export interface ClassifyInput {
  images: Blob[];
}

export interface RemoveBackgroundInput {
  image: Blob;
}

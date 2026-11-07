"use client";
/**
 * The Director review container (ai.md AI-19, AI-§A.8; design.md DES-§8.9 button; R2, S7 AI DATA owns
 * `src/components/builder/ai/**`). The contract step (C2-C) froze the hook S1 STOREFRONT mounts in the store page
 * editor (home and page kinds) and the maintainer mounts in P6's landing Design check panel: it runs the `critique.doc`
 * task over design's kind-aware digest (`gateInputFor` → `renderDigest`, raster tiles of the current doc) and answers
 * the props of P7's presentational `<DirectorReview>` (src/components/builder/ai/director-review.tsx, unchanged).
 * Fixes are design `RepairOp`s applied through the editor's `apply` (one undoable edit per fix).
 * Contract body until S7 merges: `enabled: false` (the R2 flag `critique.doc` is not live), so `<DirectorReview>`
 * renders nothing and the deterministic Design check stays the only rung. A new file (S7 may move the hook into
 * director-review.tsx and re-export it here); no R1 screen mounts it.
 */
import type { AiPolicy } from "@/lib/ai/policy";
import type { RepairOp } from "@/lib/design/gates/repair";
import type { PageDoc, ThemeSpec } from "@/lib/page/schema";
import type { PageKind, StorePageDoc } from "@/storefront/schema";
import type { DirectorReviewProps } from "./director-review";

export interface UseDirectorReviewOptions {
  handle: string;
  doc: PageDoc | StorePageDoc;
  kind: PageKind;
  /** the compiled theme when the doc's own is not the one rendered (store pages: `getStoreTheme`) */
  theme?: ThemeSpec;
  policy: AiPolicy;
  /** apply the ops of one fix as one undoable edit */
  apply(ops: RepairOp[]): void;
}

/** The `<DirectorReview>` props for a doc. S7 (contract body: disabled). */
export function useDirectorReview(opts: UseDirectorReviewOptions): Omit<DirectorReviewProps, "className"> {
  void opts;
  return { enabled: false, running: false, fixes: null, onReview: () => undefined, onApply: () => undefined, onApplyAll: () => undefined };
}

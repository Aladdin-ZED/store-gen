"use client";
/**
 * Result hooks of the R2 AI jobs (ai.md AI-11, DG-18 / DES-§13.16, SF-12; core §H.12; R2, S7 AI DATA owns
 * `src/lib/ai/**`). The contract step (C2-C) froze the three hooks other tracks mount before S7 merges, each polling
 * `GET /api/app/<h>/ai/jobs/<id>` (P7's `useAiJob`, 2 s, visibility-aware) and answering the job's result validated by
 * the frozen zod, plus an undo token for the mount's Undo toast:
 *   - `useStoreBlueprintJob`: S1 STOREFRONT's storefront overview (`StoreBlueprintSchema`, src/lib/catalog/blueprint.ts);
 *   - `useLogoSystemJob`: S2 BRAND & LOGO's designer tab (`LogoConceptParams[]`, src/lib/logo/params.ts; S2's engine
 *     renders them, raw model SVG never reaches storage);
 *   - `useCatalogFromPhotosJob`: S1's from-photos review screen (`ProductProposal[]`, src/lib/catalog/from-photos.server.ts).
 * Contract bodies until S7 merges: the idle state (no job polled, no result), so a mount renders its "instant" path.
 * A new file (S7 may re-export the hooks from src/lib/ai/router/client.ts); no R1 screen mounts them.
 */
import type { ProductProposal } from "@/lib/catalog/from-photos.server";
import type { StoreBlueprint } from "@/lib/catalog/blueprint";
import type { LogoConceptParams } from "@/lib/logo/params";
import type { AiJobPoll } from "./client";

/** The state of one polled AI job and its validated result. */
export interface AiJobResultState<T> {
  job: AiJobPoll | null;
  done: boolean;
  /** the validated result when `done` and the job succeeded; null otherwise (an invalid result is a failed job) */
  result: T | null;
  /** the token the mount's Undo toast passes back (null until applied) */
  undo: string | null;
  cancel(): Promise<void>;
}

const idle = <T,>(): AiJobResultState<T> => ({ job: null, done: false, result: null, undo: null, cancel: async () => undefined });

/** The deep store blueprint job (`store_blueprint`). S7 (contract body: idle). */
export function useStoreBlueprintJob(handle: string, jobId: string | null): AiJobResultState<StoreBlueprint> {
  void handle;
  void jobId;
  return idle<StoreBlueprint>();
}

/** The logo concepts job (`logo_system`). S7 (contract body: idle). */
export function useLogoSystemJob(handle: string, jobId: string | null): AiJobResultState<LogoConceptParams[]> {
  void handle;
  void jobId;
  return idle<LogoConceptParams[]>();
}

/** The catalog-from-photos job (`catalog_from_photos`, > 6 photos). S7 (contract body: idle). */
export function useCatalogFromPhotosJob(handle: string, jobId: string | null): AiJobResultState<ProductProposal[]> {
  void handle;
  void jobId;
  return idle<ProductProposal[]>();
}

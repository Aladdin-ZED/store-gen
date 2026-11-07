import "server-only";
/**
 * The wizard's generation feedback (ai.md AI-12 (5), AI-19 R2, AI-D35; R2, S7 AI DATA owns `src/lib/ai/**`). The R2
 * contract step (C2-E) froze the input and the signature for the maintainer's seam in P6's
 * `createFromDirectionsAction` (src/app/app/[store]/generate/actions.ts): after the page is created, with the
 * action's optional `ai` block, R2 only, never throwing. S7's body: `linkAiRuns(scope, runIds, { kind: "page", id })`,
 * `generation_source` on the generation versions matched by checksum and `critic_picks` on the chosen one, the
 * `shown` + `chosen` / `not_chosen` `ai_feedback` rows, idempotent per page (page + kind + genome). Contract body
 * until S7 merges: nothing.
 */
import { z } from "zod";
import type { Actor, WriteScope } from "@/lib/tenancy/types";

/** The `ai` block of `createFromDirectionsAction`'s input (≤ 12 run ids, ≤ 6 directions, critic picks ≤ 2 KB). */
export const GenerationFeedbackInput = z.object({
  source: z.enum(["instant", "director", "deep"]),
  runIds: z.array(z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/)).max(12),
  /** `page_versions.critic_picks` of the chosen direction (AI-§M.1 `CriticPicks`; S7 validates the shape) */
  criticPicks: z
    .unknown()
    .refine((v) => JSON.stringify(v ?? null).length <= 2_048, { error: "critic picks over 2 KB" })
    .optional(),
  directions: z
    .array(
      z.object({
        /** the direction doc's checksum (the generation version it matches) */
        checksum: z.string().regex(/^[a-f0-9]{16,64}$/),
        genomeId: z.string().max(26).optional(),
        slot: z.number().int().min(0).max(5),
      }),
    )
    .max(6),
});
export type GenerationFeedbackInput = z.infer<typeof GenerationFeedbackInput>;

/** Record what the wizard showed and what the member chose (S7; contract body: nothing). */
export async function recordGenerationFeedback(scope: WriteScope, actor: Actor, pageId: string, input: GenerationFeedbackInput): Promise<void> {
  void scope;
  void actor;
  void pageId;
  void input;
}

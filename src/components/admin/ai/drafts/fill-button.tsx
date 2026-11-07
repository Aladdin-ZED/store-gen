"use client";
/**
 * The AI drafts entry buttons (ai.md AI-09 SEO / alt, AI-10 translations; R2, S7 AI DATA owns
 * `src/components/admin/ai/**`). The contract step (C2-C) froze their props for S1 STOREFRONT's catalog list (and the
 * landing pages list): they queue `seo.fill` / `translate` drafts through Batches and link to `/settings/ai/drafts`;
 * drafts are never applied silently. `TranslateButton` is offered only for targets with a per-locale slot (policies
 * through `savePolicies`, products and collections through their 0006 `i18n` columns); with Cloud AI off it reads
 * "Translation needs Cloud AI" with the settings link (never a disabled teaser) and creates no draft.
 * Contract bodies until S7 merges: render nothing (`null`). No R1 screen mounts them.
 */
import type { ReactElement } from "react";

/** S7 (stub: renders nothing). `ids` = the selected products or pages (≤ 200). */
export function FillSeoButton(p: { target: "product" | "page"; ids: readonly string[] }): ReactElement | null {
  void p;
  return null;
}

/** S7 (stub: renders nothing). `ids` = the selected products or collections; [] for the store's policies. */
export function TranslateButton(p: { target: "product" | "collection" | "policies"; ids: readonly string[] }): ReactElement | null {
  void p;
  return null;
}

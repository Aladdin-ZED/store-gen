import "server-only";
/**
 * The draft design hook (P6 DESIGN; design.md DES-§8.7 save row, DES-§22; P0b, CCR P6-8): the builder's `saveDraft`
 * (src/lib/editor/pages.server.ts) awaits it after the draft is validated and written, in warn mode: a failure is
 * swallowed there and never fails a save. P6 recomputes the draft's q, slop and GateSummary on the server whatever
 * the client sends, and marks the store's health dirty on the Q 70 / slop 3 crossings (DES-§8.11). The signature is
 * frozen (src/lib/contracts/r1-p0b-render.ts).
 *
 * Until P6 merges: a no-op.
 */
import type { PageDoc } from "@/lib/page/schema";
import type { WriteScope } from "@/lib/tenancy/types";

export async function recordDraftDesign(scope: WriteScope, pageId: string, doc: PageDoc): Promise<void> {
  void scope;
  void pageId;
  void doc;
}

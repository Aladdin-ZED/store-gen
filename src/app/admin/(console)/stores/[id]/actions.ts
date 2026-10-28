"use server";
/**
 * Store profile actions of the console (P1 CONSOLE; platform.md PLA-§7, §10.2, §M.1, PD56; docs/STORE-SAAS.md §B.8;
 * P0b: CCR P2-8). A platform action file (`scripts/qa/tenancy-check.ts` reads every "use server" file under
 * src/app/admin/(console)/ as one, CCR X-1): every export returns `platformAction(`, so a tenant session is refused by
 * the seam, and P1 adds each action's tenant-session refusal case to its tenancy-cases/platform.ts.
 *
 *   await addImpersonationNoteAction({ storeId, text });       // the impersonation ribbon's Note (P2's ImpersonationRibbon)
 *
 * P0b stub: the track replaces the body, never the signature (src/lib/contracts/r1-p0b-platform.ts).
 */
import { platformAction } from "@/lib/platform/seam";
import type { ActionResult } from "@/lib/tenancy/types";

/**
 * stores.notes: `text` ≤ 300 chars. P1 writes one `platform_notes` row of kind `note` for the store (`author_id` = the
 * staff member, never a tenant row) and audits `platform.note.added`. P0b stub: throws inside the seam, which answers
 * the typed failure (a tenant session is refused before the body).
 */
export async function addImpersonationNoteAction(input: { storeId: string; text: string }): Promise<ActionResult<{ id: string }>> {
  return platformAction("stores.notes", async () => {
    void input;
    throw new Error("not implemented: P1 addImpersonationNoteAction");
  });
}

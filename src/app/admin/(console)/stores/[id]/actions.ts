"use server";
/**
 * Store profile actions of the console (P1 CONSOLE; platform.md PLA-§7, §10.2, §M.1, PD56; docs/STORE-SAAS.md §B.8;
 * P0b: CCR P2-8). A platform action file (`scripts/qa/tenancy-check.ts` reads every "use server" file under
 * src/app/admin/(console)/ as one, CCR X-1): every export returns `platformAction(`, so a tenant session is refused by
 * the seam, and P1 adds each action's tenant-session refusal case to its tenancy-cases/platform.ts.
 *
 *   await addImpersonationNoteAction({ storeId, text });       // the impersonation ribbon's Note (P2's ImpersonationRibbon)
 *
 * The signature is frozen (src/lib/contracts/r1-p0b-platform.ts); the body is P1's.
 */
import { FieldsError } from "@/lib/auth/errors";
import { addNote } from "@/lib/platform/notes";
import { platformAction } from "@/lib/platform/seam";
import type { ActionResult } from "@/lib/tenancy/types";

/**
 * stores.notes: `text` ≤ 300 chars. One `platform_notes` row of kind `note` for the store (`author_id` = the staff
 * member, never a tenant row) through src/lib/platform/notes.ts `addNote`, audited `platform.note.added`; a tenant
 * session is refused by the seam before the body.
 */
export async function addImpersonationNoteAction(input: { storeId: string; text: string }): Promise<ActionResult<{ id: string }>> {
  return platformAction("stores.notes", async (ctx) => {
    const text = typeof input?.text === "string" ? input.text.trim() : "";
    if (!text || text.length > 300) throw new FieldsError({ text: "console.notes.invalid" });
    return addNote(ctx, { storeId: input.storeId, body: text, kind: "note" });
  });
}

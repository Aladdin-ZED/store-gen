"use server";
/**
 * Actions of Connect → WhatsApp, the click-to-chat templates (operations.md OPE-§M.3 P5 rows, §22.2, OPE-§L
 * "Templates"; core §E.2). Templates and quick replies sit under `callcenter.configure` (OPE Q.3e), so a manager edits
 * them too; the Cloud API connection (R3) is `integrations.manage`.
 *
 *   saveTemplateAction(input)   callcenter.configure   the store's (or one page's) override of a slot; a parse error
 *                               comes back as data with its field and position (`at`, the character offset)
 *   resetTemplateAction(slot)   callcenter.configure   back to the built-in text
 *   deleteQuickReplyAction(id)  callcenter.configure   removes one quick reply (kind `custom`)
 *   previewTemplateAction(id)   callcenter.configure   the live preview's values on one order of this store (phone
 *                               masked; customer fields masked under "view as store")
 *
 * A page id of another store answers `not_found`, like a missing one (core §E.3).
 */
import { z } from "zod";
import { revalidateStore } from "@/lib/admin-data/shell";
import { TEMPLATE_LOCALES } from "@/lib/integrations/whatsapp/builtins";
import { templatePreview, type TemplatePreview } from "@/lib/integrations/whatsapp/screen.server";
import { deleteQuickReply, resetTemplate, saveTemplate, TEMPLATE_CHANNELS, type SaveTemplateResult } from "@/lib/integrations/whatsapp/templates.server";
import { SeamError, storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";

const PAGE = "/integrations/whatsapp" as const;

const Slot = z.object({
  channel: z.enum(TEMPLATE_CHANNELS),
  kind: z.string().min(1).max(40),
  locale: z.enum(TEMPLATE_LOCALES),
  pageId: z.string().max(26).nullable().optional(),
});

/** Save an override (the template language's errors are data: `{ ok: false, error, field, at }`). */
export async function saveTemplateAction(input: unknown): Promise<ActionResult<SaveTemplateResult>> {
  return storeAction("callcenter.configure", async (ctx) => {
    const r = await saveTemplate(ctx.scope, input, { userId: ctx.user.id });
    if (!r.ok && r.error === "not_found") throw new SeamError("not_found");
    if (r.ok) revalidateStore(ctx.store.handle, PAGE);
    return r;
  });
}

/** Reset a slot to its built-in text (drafts stay). */
export async function resetTemplateAction(slot: z.input<typeof Slot>): Promise<ActionResult<{ deleted: number }>> {
  return storeAction("callcenter.configure", async (ctx) => {
    const r = await resetTemplate(ctx.scope, Slot.parse(slot));
    if (r.notFound) throw new SeamError("not_found");
    revalidateStore(ctx.store.handle, PAGE);
    return { deleted: r.deleted };
  });
}

const RowId = z.string().regex(/^[0-9A-Za-z]{26}$/);
const OrderId = z.string().min(1).max(20);

/** Remove one quick reply (another store's id answers not_found). */
export async function deleteQuickReplyAction(id: string): Promise<ActionResult<{ deleted: true }>> {
  return storeAction("callcenter.configure", async (ctx) => {
    if (!(await deleteQuickReply(ctx.scope, RowId.parse(id)))) throw new SeamError("not_found");
    revalidateStore(ctx.store.handle, PAGE);
    return { deleted: true as const };
  });
}

/** The preview's variable values on one order of this store, in the three template locales (stored facts only). */
export async function previewTemplateAction(orderId: string): Promise<ActionResult<TemplatePreview>> {
  return storeAction("callcenter.configure", async (ctx) => {
    const p = await templatePreview(ctx.scope, OrderId.parse(orderId), { firstName: ctx.user.name || null });
    if (!p) throw new SeamError("not_found");
    return p;
  });
}

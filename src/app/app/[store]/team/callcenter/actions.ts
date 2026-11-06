"use server";
/**
 * `/app/<h>/team/callcenter` server actions (P4 CALL CENTER; operations.md OPE-§5.5, §6.2, §7.4, §M.3 team rows, OD57,
 * OD63, OPS-28; core D73). Every body is `return storeAction(…)`; each writes the `ops` key or the store's
 * `call_script` rows and nothing else (no `store`, no `policies`), marks Store Health dirty where the key changed and
 * audits `callcenter.*`. The calling window alone is `saveCallingWindowAction` (src/lib/callcenter/window-actions.ts),
 * which P3's "After the order" card shares.
 *
 *   saveOpsSettingsAction       ladder, retries, lease, rescue, assignment, targets, aliases (and the window, savedAt)
 *   openCallsNowAction          `openOverrideUntil = now + 2 h`; audit `callcenter.calls_opened`
 *   saveWindowOverridesAction   ≤ 4 dated schedules, non-overlapping, ISO weekday keys
 *   saveScriptAction            the active script of (page or every page, language), validated as a ScriptDoc
 *   resetScriptAction           back to the built-in script of that language
 *   approveScriptDraftAction    an AI draft → active, the previous active row → archived
 *   discardScriptDraftAction    an AI draft → archived
 *   scriptPreviewAction         the variables of the editor's live preview (read; the latest order of the page, masked,
 *                               or a "Preview sample" from its lead item and price)
 */
import { z } from "zod";
import { revalidateStore } from "@/lib/admin-data/shell";
import { isScriptLocale } from "@/lib/callcenter/script";
import { approveScriptDraft, discardScriptDraft, openCallsNow, resetScript, saveOpsSettings, saveScript, saveWindowOverrides } from "@/lib/callcenter/settings.server";
import { scriptPreviewValues } from "@/lib/callcenter/settings-view.server";
import { storeAction } from "@/lib/tenancy/seam";

const TemplateId = z.string().regex(/^[0-9A-Z]{26}$/, { error: "Unknown script." });

const refresh = (handle: string) => revalidateStore(handle, "/team/callcenter", "/queue/board");

/** callcenter.configure: the call-centre settings (the ops key only). */
export async function saveOpsSettingsAction(input: unknown) {
  return storeAction("callcenter.configure", async (ctx) => {
    const res = await saveOpsSettings(ctx, input);
    if (res.ok) refresh(ctx.store.handle);
    return res;
  });
}

/** callcenter.configure: "Open calls now" for the next two hours. */
export async function openCallsNowAction() {
  return storeAction("callcenter.configure", async (ctx) => {
    const res = await openCallsNow(ctx);
    if (res.ok) refresh(ctx.store.handle);
    return res;
  });
}

/** callcenter.configure: the dated schedules (Ramadan hours, a holiday week). */
export async function saveWindowOverridesAction(input: unknown) {
  return storeAction("callcenter.configure", async (ctx) => {
    const res = await saveWindowOverrides(ctx, input);
    if (res.ok) refresh(ctx.store.handle);
    return res;
  });
}

/** callcenter.configure: save the script of a page (or every page) in one language. */
export async function saveScriptAction(input: unknown) {
  return storeAction("callcenter.configure", async (ctx) => {
    const res = await saveScript(ctx, input);
    if (res.ok) refresh(ctx.store.handle);
    return res;
  });
}

/** callcenter.configure: "Reset to built-in". */
export async function resetScriptAction(input: unknown) {
  return storeAction("callcenter.configure", async (ctx) => {
    const res = await resetScript(ctx, input);
    if (res.ok) refresh(ctx.store.handle);
    return res;
  });
}

/** callcenter.configure: approve a suggested script (agents only ever see active rows). */
export async function approveScriptDraftAction(id: string) {
  return storeAction("callcenter.configure", async (ctx) => {
    const res = await approveScriptDraft(ctx, TemplateId.parse(id));
    if (res.ok) refresh(ctx.store.handle);
    return res;
  });
}

/** callcenter.configure: discard a suggested script (it never reaches an agent). */
export async function discardScriptDraftAction(id: string) {
  return storeAction("callcenter.configure", async (ctx) => {
    const res = await discardScriptDraft(ctx, TemplateId.parse(id));
    if (res.ok) refresh(ctx.store.handle);
    return res;
  });
}

const PreviewInput = z.strictObject({ pageId: z.string().regex(/^[0-9A-Z]{26}$/).nullable(), locale: z.string() });

/** callcenter.configure: the live preview's variables (a read; another store's page answers source "none"). */
export async function scriptPreviewAction(input: unknown) {
  return storeAction("callcenter.configure", async (ctx) => {
    const parsed = PreviewInput.safeParse(input);
    if (!parsed.success || !isScriptLocale(parsed.data.locale)) return { ok: false as const, error: "invalid" };
    return { ok: true as const, data: await scriptPreviewValues(ctx, parsed.data.pageId, parsed.data.locale) };
  });
}

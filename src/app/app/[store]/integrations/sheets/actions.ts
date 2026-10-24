"use server";
/**
 * The store's own Google export key (store setting `export_key`, docs/STORE-SAAS.md §D.10; EXP-03): the only key a
 * PHP export of the store may carry. Write-only: the key is saved and deleted here, never shown again (the card
 * names the account and key id, so the owner knows what to delete in Google Cloud). integrations.manage.
 */
import { z } from "zod";
import { fail } from "@/lib/admin-data/action";
import { revalidateStore } from "@/lib/admin-data/shell";
import { auditIn, settingsActor } from "@/lib/admin-data/store-audit";
import { exportKeyInfo, exportKeyState, INVALID_EXPORT_KEY, parseServiceAccountKey, type ExportKeyInfo } from "@/lib/export/service-account";
import { setStoreSetting } from "@/lib/settings";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";

const KeyInput = z.string().max(30_000, { error: "This file is too large to be a service-account key." });

/** Save (or replace) the store's export key from the pasted JSON file (or its base64 form). */
export async function saveExportKeyAction(raw: string): Promise<ActionResult<ExportKeyInfo>> {
  return storeAction("integrations.manage", async ({ scope, actor, store }) => {
    const sa = parseServiceAccountKey(KeyInput.parse(raw));
    if (!sa) fail(INVALID_EXPORT_KEY);
    const state = exportKeyState(sa);
    if (!state.key) fail(state.problem!);
    await setStoreSetting(
      scope,
      "export_key",
      { clientEmail: sa!.client_email, privateKey: sa!.private_key, privateKeyId: sa!.private_key_id ?? null, setAt: new Date().toISOString() },
      settingsActor(actor),
    );
    await auditIn(scope, actor, "integrations.export_key.set", { meta: { email: sa!.client_email, keyId: sa!.private_key_id ?? null } });
    revalidateStore(store.handle, "/integrations/sheets");
    return exportKeyInfo(scope);
  });
}

/** Forget the store's export key (exports already made keep theirs: the owner deletes it in Google Cloud). */
export async function deleteExportKeyAction(): Promise<ActionResult<ExportKeyInfo>> {
  return storeAction("integrations.manage", async ({ scope, actor, store }) => {
    const before = await exportKeyInfo(scope);
    await setStoreSetting(scope, "export_key", { clientEmail: null, privateKey: null, privateKeyId: null, setAt: null }, settingsActor(actor));
    if (before.set) await auditIn(scope, actor, "integrations.export_key.removed", { meta: { email: before.email, keyId: before.keyId } });
    revalidateStore(store.handle, "/integrations/sheets");
    return exportKeyInfo(scope);
  });
}

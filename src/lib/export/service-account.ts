import "server-only";
/**
 * The Google key a PHP export may carry in cod-private/config.php (docs/STORE-SAAS.md §D.10 `export_key`, §F.10;
 * EXP-03).
 *
 * Only the STORE's own export key is ever embedded (store setting `export_key`, encrypted and bound to the store),
 * never a platform key: neither the app's own (GOOGLE_SA_JSON_B64, Editor on every store's sheet) nor a
 * platform-wide export key. Whoever holds an export ZIP or the hosting's files can read and rewrite the whole
 * orders sheet with the key inside; a store's own key is stopped by deleting it in Google Cloud the moment an
 * export leaks, and nothing else breaks.
 */
import { z } from "zod";
import { getStoreSetting, type StoreSettingValue } from "@/lib/settings";
import { loadServiceAccount } from "@/lib/sheets/client";
import type { StoreScope } from "@/lib/tenancy/types";

const ServiceAccountKey = z.object({
  client_email: z.string().email().max(254),
  private_key: z.string().min(100).max(20_000).includes("PRIVATE KEY"),
  private_key_id: z.string().max(200).optional(),
});
export type ServiceAccountKey = z.infer<typeof ServiceAccountKey>;

export interface ExportKey {
  /** minimal service-account JSON (type, client_email, private_key, private_key_id), base64 */
  b64: string;
  email: string;
  /** Google's key id (private_key_id) — what to delete in Google Cloud; null when the JSON has none */
  keyId: string | null;
}

export type ExportKeyState = { key: ExportKey; problem: null } | { key: null; problem: string };

export const NO_EXPORT_KEY =
  "To include a key, add a Google service-account key used only for PHP exports in Settings → Google Sheets (shared as Editor with your sheet). The platform's own key is never put in a ZIP: a leaked copy could then only be stopped by breaking the sync of every store.";

export const SAME_AS_APP_KEY =
  "This key belongs to the platform's own service account (the one that syncs the stores' sheets). Create a second service account in Google Cloud for your exports and use its key.";

export const INVALID_EXPORT_KEY = "This is not a valid Google service-account key. Paste the whole JSON file you downloaded from Google Cloud.";

/** A pasted key: the JSON file's text, or the same JSON base64-encoded on one line. Null when it is not a key. */
export function parseServiceAccountKey(raw: string): ServiceAccountKey | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const r = ServiceAccountKey.safeParse(JSON.parse(text.startsWith("{") ? text : Buffer.from(text, "base64").toString("utf8")));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

const sameKey = (a: string, b: string) => a.replace(/\s+/g, "") === b.replace(/\s+/g, "");

/** The app's own service account, or null when it has no (valid) key: nothing to collide with. */
function appServiceAccount(): { client_email: string; private_key: string; private_key_id?: string } | null {
  try {
    return loadServiceAccount();
  } catch {
    return null;
  }
}

/**
 * A key as an export may embed it, or why it may not: the app's own account (same e-mail, private key or key id)
 * is refused, so a leaked export can always be stopped without stopping the platform's sync.
 */
export function exportKeyState(sa: ServiceAccountKey | null): ExportKeyState {
  if (!sa) return { key: null, problem: NO_EXPORT_KEY };
  const app = appServiceAccount();
  if (
    app &&
    (app.client_email.toLowerCase() === sa.client_email.toLowerCase() ||
      sameKey(app.private_key, sa.private_key) ||
      (!!app.private_key_id && app.private_key_id === sa.private_key_id))
  ) {
    return { key: null, problem: SAME_AS_APP_KEY };
  }
  const json = JSON.stringify({
    type: "service_account",
    client_email: sa.client_email,
    private_key: sa.private_key,
    ...(sa.private_key_id ? { private_key_id: sa.private_key_id } : {}),
  });
  return { key: { b64: Buffer.from(json, "utf8").toString("base64"), email: sa.client_email, keyId: sa.private_key_id ?? null }, problem: null };
}

type StoredKey = StoreSettingValue<"export_key">;

/** The stored setting as a service-account key (null when unset or incomplete). */
export function storedKey(s: StoredKey): ServiceAccountKey | null {
  if (!s.clientEmail || !s.privateKey) return null;
  const r = ServiceAccountKey.safeParse({ client_email: s.clientEmail, private_key: s.privateKey, ...(s.privateKeyId ? { private_key_id: s.privateKeyId } : {}) });
  return r.success ? r.data : null;
}

/** The store's export key as an export may embed it, or why it may not (none set, or the platform's own). */
export async function storeExportKey(scope: StoreScope): Promise<ExportKeyState> {
  return exportKeyState(storedKey(await getStoreSetting(scope, "export_key", { fresh: true })));
}

/** What the settings card shows about the store's key: never the key, only which one it is. */
export interface ExportKeyInfo {
  set: boolean;
  email: string | null;
  keyId: string | null;
  setAt: string | null;
}

export async function exportKeyInfo(scope: StoreScope): Promise<ExportKeyInfo> {
  const s = await getStoreSetting(scope, "export_key");
  const key = storedKey(s);
  return { set: !!key, email: key?.client_email ?? null, keyId: key?.private_key_id ?? null, setAt: s.setAt };
}

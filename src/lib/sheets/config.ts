import "server-only";
/**
 * The store's connected sheet (store setting "sheets", docs/STORE-SAAS.md §D.10; SHT-01). A value missing any
 * coordinate reads as "not connected". Each store has its own; nothing here reads another store's.
 *
 * Connecting a sheet a store does not already use needs the ownership proof (./connect.ts, SHT-09): `pending`
 * holds the proof awaiting verification (the code's sha256, never the code). Store #1's sheet connected before
 * R1.0 stays connected as it is (OPE-§19.2: the legacy binding).
 */
import { getStoreSetting, setStoreSetting, type SettingsActor, type StoreSettingValue } from "@/lib/settings";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import { sheetUrl } from "./format";

export interface SheetsConfig {
  url: string;
  spreadsheetId: string;
  sheetId: number;
  sheetTitle: string;
  /** ISO datetime of the last successful connect */
  connectedAt: string | null;
  enabled: boolean;
  /** statuses set in the sheet flow back to the store's orders */
  pull: boolean;
}

type Stored = StoreSettingValue<"sheets">;
export type SheetsProof = NonNullable<Stored["pending"]>;

async function stored(scope: StoreScope): Promise<Stored> {
  return getStoreSetting(scope, "sheets", { fresh: true });
}

function configOf(s: Stored): SheetsConfig | null {
  if (!s.spreadsheetId || s.sheetId === undefined || !s.sheetTitle) return null;
  return {
    url: s.url ?? sheetUrl(s.spreadsheetId, s.sheetId),
    spreadsheetId: s.spreadsheetId,
    sheetId: s.sheetId,
    sheetTitle: s.sheetTitle,
    connectedAt: s.connectedAt ?? null,
    enabled: s.enabled,
    pull: s.pull,
  };
}

/** The store's connected sheet, or null. */
export async function getSheetsConfig(scope: StoreScope): Promise<SheetsConfig | null> {
  return configOf(await stored(scope));
}

/** Connected and enabled → the target to write to; null otherwise. */
export async function activeSheet(scope: StoreScope): Promise<SheetsConfig | null> {
  const cfg = await getSheetsConfig(scope);
  return cfg?.enabled ? cfg : null;
}

/** The ownership proof awaiting verification (null when none, or expired). */
export async function pendingProof(scope: StoreScope, now = Date.now()): Promise<SheetsProof | null> {
  const p = (await stored(scope)).pending;
  return p && Date.parse(p.expiresAt) > now ? p : null;
}

/** Save the store's connected sheet; a pending proof is cleared (the connection it was for is done or replaced). */
export async function saveSheetsConfig(
  scope: WriteScope,
  cfg: { spreadsheetId: string; sheetId: number; sheetTitle: string; enabled: boolean; connectedAt?: string | null; pull?: boolean },
  actor: SettingsActor,
): Promise<SheetsConfig> {
  const prev = await stored(scope);
  const value = {
    url: sheetUrl(cfg.spreadsheetId, cfg.sheetId),
    spreadsheetId: cfg.spreadsheetId,
    sheetId: cfg.sheetId,
    sheetTitle: cfg.sheetTitle,
    connectedAt: cfg.connectedAt ?? new Date().toISOString(),
    enabled: cfg.enabled,
    pull: cfg.pull ?? prev.pull,
    pending: null,
  };
  await setStoreSetting(scope, "sheets", value, actor);
  return configOf(value as Stored)!;
}

/** Record (or clear, with null) the ownership proof of a connection; the connected sheet, if any, is kept. */
export async function savePendingProof(scope: WriteScope, pending: SheetsProof | null, actor: SettingsActor): Promise<void> {
  const prev = await stored(scope);
  await setStoreSetting(scope, "sheets", { ...prev, pending }, actor);
}

/**
 * Pause / resume appending orders to (and pulling statuses from) the store's sheet. Orders keep queuing
 * as "pending" while paused; admin status edits are still written to rows already in the sheet.
 */
export async function setSheetsEnabled(scope: WriteScope, enabled: boolean, actor: SettingsActor): Promise<SheetsConfig | null> {
  const cfg = await getSheetsConfig(scope);
  if (!cfg) return null;
  return saveSheetsConfig(scope, { ...cfg, enabled }, actor);
}

/** Forget the store's sheet (and any pending proof). */
export async function disconnectSheet(scope: WriteScope, actor: SettingsActor): Promise<void> {
  await setStoreSetting(scope, "sheets", { enabled: false, pending: null }, actor);
}

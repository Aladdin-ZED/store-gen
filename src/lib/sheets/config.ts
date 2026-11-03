import "server-only";
/**
 * The store's connected sheet (store setting "sheets", docs/STORE-SAAS.md §D.10; SHT-01). A value missing any
 * coordinate reads as "not connected". Each store has its own; nothing here reads another store's.
 *
 * Connecting a sheet a store does not already use needs the ownership proof (./connect.ts, SHT-09): `pending`
 * holds the proof awaiting verification (the code's sha256, never the code). Store #1's sheet connected before
 * R1.0 stays connected as it is (OPE-§19.2: the legacy binding).
 *
 * R1 (OPE-§19.2, TENANCY-MAP §7.7): `sheet_bindings` makes one spreadsheet one store's. `saveSheetsConfig` claims the
 * binding of the sheet it saves (`claimSheetBinding`: INSERT IGNORE, then the store's own row must be there), so a
 * saved config is always a bound one; a spreadsheet bound to another store throws `SheetBindingConflict` and saves
 * nothing. Its callers have established the ownership first (the proof, a reconnect of the store's own sheet, the
 * legacy binding). `sheetBound` is the check every push and pull makes: an unbound config reads as "not connected".
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sheetBindings } from "@/lib/db/schema";
import { getStoreSetting, setStoreSetting, type SettingsActor, type StoreSettingValue } from "@/lib/settings";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
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

/* ------------------------------------------------------------------ */
/* bindings (sheet_bindings: one spreadsheet, one store)               */
/* ------------------------------------------------------------------ */

/** The spreadsheet is bound to another store: nothing was saved (the routes answer the generic refusal, OPE-§19.3). */
export class SheetBindingConflict extends Error {
  readonly code = "binding_conflict";
  constructor() {
    super("This sheet can't be connected. Create a new Google Sheet for this store.");
    this.name = "SheetBindingConflict";
  }
}

const USER_ID_RE = /^[0-9A-Z]{26}$/;

/** Is `spreadsheetId` bound to this store? (Another store's binding reads as no, like a missing one.) */
export async function sheetBound(scope: StoreScope, spreadsheetId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: sheetBindings.spreadsheetId })
    .from(sheetBindings)
    .where(whereStore(sheetBindings, scope, eq(sheetBindings.spreadsheetId, spreadsheetId)))
    .limit(1);
  return !!row;
}

/**
 * Bind `spreadsheetId` to the store (idempotent; the caller has proved the ownership). A spreadsheet already bound to
 * another store throws `SheetBindingConflict`: the INSERT IGNORE then leaves no row of this store.
 */
export async function claimSheetBinding(scope: WriteScope, spreadsheetId: string, actor: SettingsActor | null, method: "code" | "legacy" = "code"): Promise<void> {
  const verifiedBy = actor && actor.kind !== "system" && USER_ID_RE.test(actor.id) ? actor.id : null;
  await db.insert(sheetBindings).ignore().values(storeValues(scope, { spreadsheetId, method, verifiedAt: new Date(), verifiedBy }));
  if (!(await sheetBound(scope, spreadsheetId))) throw new SheetBindingConflict();
}

/** Drop the store's binding of `spreadsheetId` (disconnect): the sheet may then be proved by another store. */
export async function releaseSheetBinding(scope: WriteScope, spreadsheetId: string): Promise<void> {
  await db.delete(sheetBindings).where(whereStore(sheetBindings, scope, eq(sheetBindings.spreadsheetId, spreadsheetId)));
}

/* ------------------------------------------------------------------ */
/* config                                                              */
/* ------------------------------------------------------------------ */

/**
 * Save the store's connected sheet; a pending proof is cleared (the connection it was for is done or replaced). The
 * sheet's binding is claimed first (`claimSheetBinding`): another store's spreadsheet throws `SheetBindingConflict`.
 */
export async function saveSheetsConfig(
  scope: WriteScope,
  cfg: { spreadsheetId: string; sheetId: number; sheetTitle: string; enabled: boolean; connectedAt?: string | null; pull?: boolean },
  actor: SettingsActor,
): Promise<SheetsConfig> {
  await claimSheetBinding(scope, cfg.spreadsheetId, actor);
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
 * as "pending" while paused; admin status edits are still written to rows already in the sheet. Only the switch
 * changes: no binding is claimed (a sheet not bound to the store stays unbound, so it is still never written).
 */
export async function setSheetsEnabled(scope: WriteScope, enabled: boolean, actor: SettingsActor): Promise<SheetsConfig | null> {
  const prev = await stored(scope);
  if (!configOf(prev)) return null;
  const value = { ...prev, enabled, pending: null };
  await setStoreSetting(scope, "sheets", value, actor);
  return configOf(value as Stored);
}

/**
 * Forget the store's sheet (and any pending proof) and release its binding (OPE-§19.3 step 6): `sheets = { enabled:
 * false }`. Answers the sheet that was connected (null: none). ./connect.ts `disconnectSheet` audits around it.
 */
export async function clearSheetsConfig(scope: WriteScope, actor: SettingsActor): Promise<SheetsConfig | null> {
  const prev = await stored(scope);
  await setStoreSetting(scope, "sheets", { enabled: false, pending: null }, actor);
  if (prev.spreadsheetId) await releaseSheetBinding(scope, prev.spreadsheetId);
  return configOf(prev);
}

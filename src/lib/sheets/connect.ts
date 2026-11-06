import "server-only";
/**
 * Connecting a store's Google Sheet with an ownership proof (docs/STORE-SAAS.md TENANCY-MAP §7.7, OPE-§19.2, §19.3;
 * SHT-09; core §B.7, §E.8, §F.5). The platform's one service account can open every sheet any store ever shared with
 * it, so a pasted link proves nothing: a store connects a new spreadsheet only after putting a one-time code in the
 * spreadsheet's name or a tab's name. Never a cell: the rows of an orders tab carry what shoppers typed, so another
 * store could plant the code there by ordering from the owner's page (T4 review, SHT-09).
 *
 *   const r = await startSheetConnect(scope, url, actor, { currency, stepUp });  // "proof": show r.code · "connected": done
 *   const v = await verifySheetConnect(scope, actor, { currency, stepUp });       // the code is in a title → connected
 *   await disconnectSheet(scope, actor);                                          // the binding goes, the orders stay
 *
 * One spreadsheet belongs to at most one store (`sheet_bindings`, primary key `spreadsheet_id`):
 * - start: the store's own binding (or its pre-0005 sheet, bound on the spot as `legacy`) reconnects without a proof;
 *   a spreadsheet another store holds answers the one generic refusal, `SheetBindingConflict` ("This sheet can't be
 *   connected. Create a new Google Sheet for this store."), with no hint of which store and before any Google call:
 *   every start makes the same reads (the store's own row, then its own INSERT IGNORE probe, rolled back), so the
 *   refusal costs what a code costs; any other spreadsheet answers a code (its sha256 kept 24 h in `sheets.pending`);
 * - verify: one metadata read (the spreadsheet's title and its tab titles, no cell), the code found → the binding
 *   INSERT first (a store that won a race for the same spreadsheet makes this one the generic refusal), then
 *   `connectSheet` (the "Commandes" tab, its header, formats and the status dropdown of every OPE-§3.3 label), the
 *   setting (`enabled`, `pull`), the proof cleared, the store's previous spreadsheet released (Google refusing the
 *   setup gives a binding this verify created back, and the proof stays pending);
 * - disconnect: the binding deleted, `sheets = { enabled: false }`; the orders keep their `sheet_status`. It needs no
 *   feature (it makes no Google call and only lets go: a store paused or downgraded can still free its spreadsheet).
 *
 * Start and verify need the feature `sheets` (off while the store is pending and under the `sheets_sync_enabled` kill
 * switch); connect and verify are secret writes under `integrations.manage`, so the routes demand a fresh step-up
 * (§B.7) and pass its method to `integrations.sheets.connected` (`meta.stepUp`, §F.5 rev 4). The routes and actions
 * rate-limit the three with `s:<sid>:sheets:connect:<uid>` (10 per hour, `CONNECT_BUCKET`). Each connect or
 * disconnect marks the store's health dirty.
 */
import { eq } from "drizzle-orm";
import { auditIn, settingsActor } from "@/lib/admin-data/store-audit";
import { db } from "@/lib/db/client";
import { sheetBindings } from "@/lib/db/schema";
import { recordIntegrationStatus } from "@/lib/integrations/status";
import { errorSummary } from "@/lib/orders/log";
import { markHealthDirty } from "@/lib/platform/health-snapshot";
import { assertFeature } from "@/lib/tenancy/entitlements";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
import type { Actor, StoreScope, WriteScope } from "@/lib/tenancy/types";
import { ensureLegacyBinding } from "./bind-legacy";
import { gapi } from "./client";
import { claimSheetBinding, clearSheetsConfig, getSheetsConfig, pendingProof, releaseSheetBinding, saveSheetsConfig, savePendingProof, SheetBindingConflict, sheetBound, type SheetsConfig } from "./config";
import { parseSheetUrl } from "./format";
import { connectSheet, SheetLinkInvalid, type ConnectResult } from "./orders-sheet";
import { PROOF_TTL_MS, newProofCode, proofFound, proofHash } from "./proof";


/** `s:<sid>:sheets:connect:<uid>`: start, verify and disconnect together (core §E.8). */
export const CONNECT_BUCKET = { name: "sheets:connect", limit: 10, windowSec: 3600 } as const;

/** Why a proof could not be checked (French, like every Sheets message of the R1.0 panel). */
export class SheetsProofError extends Error {
  constructor(readonly code: "no_proof" | "code_missing") {
    super(
      code === "no_proof"
        ? "Aucune vérification en cours, ou le code a expiré. Collez à nouveau le lien de la feuille pour obtenir un nouveau code."
        : "Le code n'est pas encore dans le nom de la feuille ni dans celui d'un onglet. Ajoutez-le (en haut à gauche, ou en renommant un onglet), puis cliquez sur Vérifier.",
    );
    this.name = "SheetsProofError";
  }
}

export type StartConnect =
  | { kind: "proof"; code: string; expiresAt: string }
  | { kind: "connected"; result: ConnectResult; sheet: SheetsConfig };

export interface VerifiedConnect {
  result: ConnectResult;
  sheet: SheetsConfig;
}

/** The method of the fresh step-up that let the member connect (§F.5 rev 4 `meta.stepUp`). */
export type ConnectStepUp = "totp" | "password";

/* ------------------------------------------------------------------ */
/* bindings                                                            */
/* ------------------------------------------------------------------ */

/**
 * Does another store hold `spreadsheetId`? The store's own INSERT IGNORE inside a transaction that is always rolled
 * back: 0 rows means the key exists (this store's own row was ruled out before), and no other store's row is read.
 */
async function heldElsewhere(scope: WriteScope, spreadsheetId: string): Promise<boolean> {
  let taken = false;
  await db
    .transaction(async (tx) => {
      const [res] = await tx.insert(sheetBindings).ignore().values(storeValues(scope, { spreadsheetId, method: "code" as const, verifiedAt: new Date(), verifiedBy: null }));
      taken = res.affectedRows === 0;
      throw new ProbeDone();
    })
    .catch((err: unknown) => {
      if (!(err instanceof ProbeDone)) throw err;
    });
  return taken;
}

class ProbeDone extends Error {
  constructor() {
    super("probe rolled back");
  }
}

/** The store's own binding of `spreadsheetId` (another store's row reads as none). */
async function ownBinding(scope: StoreScope, spreadsheetId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: sheetBindings.spreadsheetId })
    .from(sheetBindings)
    .where(whereStore(sheetBindings, scope, eq(sheetBindings.spreadsheetId, spreadsheetId)))
    .limit(1);
  return !!row;
}

/* ------------------------------------------------------------------ */
/* connect                                                             */
/* ------------------------------------------------------------------ */

/** Find or create the orders tab, save the store's sheet (enabled, pulling back), release the previous one, audit. */
async function connectAndSave(
  scope: WriteScope,
  spreadsheetId: string,
  actor: Actor,
  opts: { currency: string; knownSheetId?: number | null; stepUp: ConnectStepUp },
  proof: boolean,
): Promise<VerifiedConnect> {
  const prev = await getSheetsConfig(scope);
  const result = await connectSheet(spreadsheetId, { knownSheetId: opts.knownSheetId ?? null, currency: opts.currency });
  const sheet = await saveSheetsConfig(scope, { spreadsheetId: result.spreadsheetId, sheetId: result.sheetId, sheetTitle: result.sheetTitle, enabled: true, pull: true }, settingsActor(actor));
  // the store moved to another spreadsheet: the old one is free for whoever proves it next
  if (prev && prev.spreadsheetId !== result.spreadsheetId) await releaseSheetBinding(scope, prev.spreadsheetId);
  await auditIn(scope, actor, "integrations.sheets.connected", { meta: { created: result.created, proof, stepUp: opts.stepUp } });
  await markHealthDirty(scope.storeId).catch((err: unknown) => console.error("[sheets] markHealthDirty:", errorSummary(err)));
  return { result, sheet };
}

/**
 * Start connecting `url` (see the header). Throws SheetLinkInvalid for a link that is not a Google Sheet,
 * SheetBindingConflict for a spreadsheet another store holds, EntitlementError when the feature is off, and the Google
 * errors of connectSheet on a reconnect.
 */
export async function startSheetConnect(scope: WriteScope, url: string, actor: Actor, opts: { currency: string; stepUp: ConnectStepUp }): Promise<StartConnect> {
  await assertFeature(scope, "sheets");
  const link = parseSheetUrl(url);
  if (!link.ok) throw new SheetLinkInvalid(link.error);
  const current = await getSheetsConfig(scope);
  // a store connected before 0005 holds no row yet: its own spreadsheet is bound on the spot (when no store holds it)
  if (current?.spreadsheetId === link.spreadsheetId) await ensureLegacyBinding(scope);
  if (await ownBinding(scope, link.spreadsheetId)) {
    // the tab the store already writes to is reused as it is; the tab a link points at never is (it may hold other data)
    const knownSheetId = current?.spreadsheetId === link.spreadsheetId ? current.sheetId : null;
    const done = await connectAndSave(scope, link.spreadsheetId, actor, { currency: opts.currency, knownSheetId, stepUp: opts.stepUp }, false);
    return { kind: "connected", ...done };
  }
  if (await heldElsewhere(scope, link.spreadsheetId)) throw new SheetBindingConflict();
  const code = newProofCode();
  const expiresAt = new Date(Date.now() + PROOF_TTL_MS).toISOString();
  await savePendingProof(scope, { spreadsheetId: link.spreadsheetId, sheetId: link.gid, codeHash: proofHash(code), expiresAt }, settingsActor(actor));
  return { kind: "proof", code, expiresAt };
}

interface SpreadsheetTitles {
  properties?: { title?: string };
  sheets?: { properties?: { title?: string } }[];
}

/** The spreadsheet's own title and every tab title (one metadata read; never a cell). */
async function proofTitles(spreadsheetId: string): Promise<string[]> {
  const fields = encodeURIComponent("properties(title),sheets(properties(title))");
  const meta = await gapi<SpreadsheetTitles>(`/${encodeURIComponent(spreadsheetId)}?fields=${fields}`, {}, { maxRetries: 2 });
  return [meta.properties?.title, ...(meta.sheets ?? []).map((t) => t.properties?.title)].filter((t): t is string => typeof t === "string");
}

/**
 * Check the pending proof (see the header). Throws SheetsProofError (none pending or expired, code not found),
 * SheetBindingConflict (another store bound the spreadsheet first; the proof is dropped), EntitlementError, and the
 * Google errors (403 when the sheet isn't shared with the service account as Editor).
 */
export async function verifySheetConnect(scope: WriteScope, actor: Actor, opts: { currency: string; stepUp: ConnectStepUp }): Promise<VerifiedConnect> {
  await assertFeature(scope, "sheets");
  const pending = await pendingProof(scope);
  if (!pending) throw new SheetsProofError("no_proof");
  if (!proofFound([await proofTitles(pending.spreadsheetId)], pending.codeHash)) throw new SheetsProofError("code_missing");
  const held = await sheetBound(scope, pending.spreadsheetId);
  try {
    // the binding first: of two stores proving one spreadsheet, the second INSERT finds the key and is refused
    await claimSheetBinding(scope, pending.spreadsheetId, settingsActor(actor), "code");
  } catch (err) {
    if (err instanceof SheetBindingConflict) await savePendingProof(scope, null, settingsActor(actor));
    throw err;
  }
  try {
    return await connectAndSave(scope, pending.spreadsheetId, actor, { currency: opts.currency, stepUp: opts.stepUp }, true);
  } catch (err) {
    // Google refused the setup (not shared as Editor, …): a binding this verify created is given back, so no row
    // outlives a connection that never happened; the proof stays pending for the next try
    if (!held && (await getSheetsConfig(scope))?.spreadsheetId !== pending.spreadsheetId) {
      await releaseSheetBinding(scope, pending.spreadsheetId).catch((e: unknown) => console.error("[sheets] release:", errorSummary(e)));
    }
    throw err;
  }
}

/**
 * Forget the store's sheet: the binding is deleted (another store may prove the spreadsheet afterwards),
 * `sheets = { enabled: false }`, the `sheets` status row `off`, the audit row `integrations.sheets.disconnected`. The
 * orders keep their `sheet_status`. Answers false when no sheet was connected.
 */
export async function disconnectSheet(scope: WriteScope, actor: Actor, opts: { stepUp?: ConnectStepUp | null } = {}): Promise<boolean> {
  const prev = await clearSheetsConfig(scope, settingsActor(actor));
  if (!prev) return false;
  await recordIntegrationStatus(scope, { kind: "sheets", outcome: "off" }).catch((err: unknown) => console.error("[sheets] status:", errorSummary(err)));
  await auditIn(scope, actor, "integrations.sheets.disconnected", { meta: opts.stepUp ? { stepUp: opts.stepUp } : {} });
  await markHealthDirty(scope.storeId).catch((err: unknown) => console.error("[sheets] markHealthDirty:", errorSummary(err)));
  return true;
}

/** Is the store's connected spreadsheet bound to it (the Sheets screen's "connected" means both)? */
export async function sheetConnected(scope: StoreScope): Promise<boolean> {
  const cfg = await getSheetsConfig(scope);
  return !!cfg && (await sheetBound(scope, cfg.spreadsheetId));
}

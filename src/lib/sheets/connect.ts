import "server-only";
/**
 * Connecting a store's Google Sheet with an ownership proof (docs/STORE-SAAS.md TENANCY-MAP §7.7, OPE-§19.3;
 * SHT-09). The platform's one service account can open every sheet any store ever shared with it, so a pasted
 * link proves nothing: a store connects a new spreadsheet only after typing a one-time code into its first rows.
 *
 *   const r = await startSheetConnect(scope, url, actor, { currency });   // "proof": show r.code · "connected": done
 *   const v = await verifySheetConnect(scope, actor, { currency });        // the code is in the sheet → connected
 *
 * The spreadsheet the store already uses reconnects without a proof (store #1's sheet of before R1.0 included,
 * OPE-§19.2). Nothing about the spreadsheet (title, tabs) is read or shown before the proof passes. R1 product
 * (P5) adds the `sheet_bindings` row, so one spreadsheet belongs to at most one store.
 */
import { auditIn, settingsActor } from "@/lib/admin-data/store-audit";
import type { Actor, WriteScope } from "@/lib/tenancy/types";
import { gapi } from "./client";
import { getSheetsConfig, pendingProof, saveSheetsConfig, savePendingProof, type SheetsConfig } from "./config";
import { a1, parseSheetUrl } from "./format";
import { connectSheet, SheetLinkInvalid, type ConnectResult } from "./orders-sheet";
import { PROOF_RANGE, PROOF_TTL_MS, newProofCode, proofFound, proofHash } from "./proof";

/** Why a proof could not be checked (French, like every Sheets message of the panel). */
export class SheetsProofError extends Error {
  constructor(readonly code: "no_proof" | "code_missing") {
    super(
      code === "no_proof"
        ? "Aucune vérification en cours, ou le code a expiré. Collez à nouveau le lien de la feuille pour obtenir un nouveau code."
        : "Le code n'est pas encore dans la feuille. Tapez-le dans une cellule de la première ligne, puis cliquez sur Vérifier.",
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

/** Find or create the orders tab, save the store's sheet, audit. */
async function connectAndSave(scope: WriteScope, spreadsheetId: string, actor: Actor, opts: { currency: string; knownSheetId?: number | null }, proof: boolean): Promise<VerifiedConnect> {
  const result = await connectSheet(spreadsheetId, { knownSheetId: opts.knownSheetId ?? null, currency: opts.currency });
  const sheet = await saveSheetsConfig(scope, { spreadsheetId: result.spreadsheetId, sheetId: result.sheetId, sheetTitle: result.sheetTitle, enabled: true }, settingsActor(actor));
  await auditIn(scope, actor, "integrations.sheets.connected", { meta: { created: result.created, proof } });
  return { result, sheet };
}

/**
 * Start connecting `url`. The store's current spreadsheet reconnects at once; any other answers a one-time code
 * (valid 24 h) to type into the sheet. Throws SheetLinkInvalid for a link that is not a Google Sheet, and the
 * Google errors of connectSheet on a reconnect.
 */
export async function startSheetConnect(scope: WriteScope, url: string, actor: Actor, opts: { currency: string }): Promise<StartConnect> {
  const link = parseSheetUrl(url);
  if (!link.ok) throw new SheetLinkInvalid(link.error);
  const current = await getSheetsConfig(scope);
  if (current?.spreadsheetId === link.spreadsheetId) {
    const done = await connectAndSave(scope, link.spreadsheetId, actor, { currency: opts.currency, knownSheetId: current.sheetId }, false);
    return { kind: "connected", ...done };
  }
  const code = newProofCode();
  const expiresAt = new Date(Date.now() + PROOF_TTL_MS).toISOString();
  await savePendingProof(scope, { spreadsheetId: link.spreadsheetId, sheetId: link.gid, codeHash: proofHash(code), expiresAt }, settingsActor(actor));
  return { kind: "proof", code, expiresAt };
}

interface SpreadsheetTabs {
  sheets?: { properties?: { sheetId?: number; title?: string } }[];
}

/** The first rows of the linked tab (the first tab when the link named none, or a tab that is gone). */
async function proofCells(spreadsheetId: string, sheetId: number | null): Promise<unknown[][]> {
  const sid = `/${encodeURIComponent(spreadsheetId)}`;
  const meta = await gapi<SpreadsheetTabs>(`${sid}?fields=${encodeURIComponent("sheets(properties(sheetId,title))")}`, {}, { maxRetries: 2 });
  const tabs = (meta.sheets ?? []).map((s) => s.properties).filter((p): p is { sheetId: number; title: string } => typeof p?.sheetId === "number" && typeof p.title === "string");
  const tab = tabs.find((t) => t.sheetId === sheetId) ?? tabs[0];
  if (!tab) return [];
  const r = await gapi<{ values?: unknown[][] }>(`${sid}/values/${encodeURIComponent(a1(tab.title, PROOF_RANGE))}`, {}, { maxRetries: 2 });
  return r.values ?? [];
}

/**
 * Check the pending proof: the code is in the first rows of the sheet → the orders tab is set up, the sheet is
 * the store's and the proof is cleared. Throws SheetsProofError (none pending or expired, code not found) and the
 * Google errors (403 when the sheet isn't shared with the service account).
 */
export async function verifySheetConnect(scope: WriteScope, actor: Actor, opts: { currency: string }): Promise<VerifiedConnect> {
  const pending = await pendingProof(scope);
  if (!pending) throw new SheetsProofError("no_proof");
  if (!proofFound(await proofCells(pending.spreadsheetId, pending.sheetId), pending.codeHash)) throw new SheetsProofError("code_missing");
  return connectAndSave(scope, pending.spreadsheetId, actor, { currency: opts.currency }, true);
}

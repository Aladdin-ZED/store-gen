import "server-only";
/**
 * Connecting a store's Google Sheet with an ownership proof (docs/STORE-SAAS.md TENANCY-MAP §7.7, OPE-§19.3;
 * SHT-09). The platform's one service account can open every sheet any store ever shared with it, so a pasted
 * link proves nothing: a store connects a new spreadsheet only after putting a one-time code in the spreadsheet's
 * name or a tab's name. Never a cell: the rows of an orders tab carry what shoppers typed, so another store could
 * plant the code there by ordering from the owner's page (T4 review, SHT-09).
 *
 *   const r = await startSheetConnect(scope, url, actor, { currency });   // "proof": show r.code · "connected": done
 *   const v = await verifySheetConnect(scope, actor, { currency });        // the code is in the sheet → connected
 *
 * The spreadsheet the store already uses reconnects without a proof (store #1's sheet of before R1.0 included,
 * OPE-§19.2). Nothing about the spreadsheet is shown before the proof passes (its titles are read only to look for
 * the code), and no cell is ever read for it. R1 product (P5) adds the `sheet_bindings` row, so one spreadsheet
 * belongs to at most one store.
 *
 * Every connect is a secret write under integrations.manage: the routes demand a fresh step-up (§B.7, SEC-17) and
 * the `integrations.sheets.connected` row names its method (`meta.stepUp`, §F.5 rev 4).
 */
import { auditIn, settingsActor } from "@/lib/admin-data/store-audit";
import type { Actor, WriteScope } from "@/lib/tenancy/types";
import { gapi } from "./client";
import { getSheetsConfig, pendingProof, saveSheetsConfig, savePendingProof, type SheetsConfig } from "./config";
import { parseSheetUrl } from "./format";
import { connectSheet, SheetLinkInvalid, type ConnectResult } from "./orders-sheet";
import { PROOF_TTL_MS, newProofCode, proofFound, proofHash } from "./proof";

/** Why a proof could not be checked (French, like every Sheets message of the panel). */
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

/** Find or create the orders tab, save the store's sheet, audit. */
async function connectAndSave(
  scope: WriteScope,
  spreadsheetId: string,
  actor: Actor,
  opts: { currency: string; knownSheetId?: number | null; stepUp: ConnectStepUp },
  proof: boolean,
): Promise<VerifiedConnect> {
  const result = await connectSheet(spreadsheetId, { knownSheetId: opts.knownSheetId ?? null, currency: opts.currency });
  const sheet = await saveSheetsConfig(scope, { spreadsheetId: result.spreadsheetId, sheetId: result.sheetId, sheetTitle: result.sheetTitle, enabled: true }, settingsActor(actor));
  await auditIn(scope, actor, "integrations.sheets.connected", { meta: { created: result.created, proof, stepUp: opts.stepUp } });
  return { result, sheet };
}

/**
 * Start connecting `url`. The store's current spreadsheet reconnects at once; any other answers a one-time code
 * (valid 24 h) to put in the spreadsheet's name or a tab's name. Throws SheetLinkInvalid for a link that is not a
 * Google Sheet, and the Google errors of connectSheet on a reconnect.
 */
export async function startSheetConnect(scope: WriteScope, url: string, actor: Actor, opts: { currency: string; stepUp: ConnectStepUp }): Promise<StartConnect> {
  const link = parseSheetUrl(url);
  if (!link.ok) throw new SheetLinkInvalid(link.error);
  const current = await getSheetsConfig(scope);
  if (current?.spreadsheetId === link.spreadsheetId) {
    const done = await connectAndSave(scope, link.spreadsheetId, actor, { currency: opts.currency, knownSheetId: current.sheetId, stepUp: opts.stepUp }, false);
    return { kind: "connected", ...done };
  }
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
 * Check the pending proof: the code is in the spreadsheet's name or a tab's name → the orders tab is set up, the
 * sheet is the store's and the proof is cleared. Throws SheetsProofError (none pending or expired, code not found)
 * and the Google errors (403 when the sheet isn't shared with the service account).
 */
export async function verifySheetConnect(scope: WriteScope, actor: Actor, opts: { currency: string; stepUp: ConnectStepUp }): Promise<VerifiedConnect> {
  const pending = await pendingProof(scope);
  if (!pending) throw new SheetsProofError("no_proof");
  if (!proofFound([await proofTitles(pending.spreadsheetId)], pending.codeHash)) throw new SheetsProofError("code_missing");
  return connectAndSave(scope, pending.spreadsheetId, actor, { currency: opts.currency, stepUp: opts.stepUp }, true);
}

"use server";
/**
 * Actions of Connect → Google Sheets (operations.md OPE-§M.3 P5 rows, §19.3, §19.5, §19.8; core §E.2, §B.7, §E.8,
 * §F.5). Every body is `return storeAction(permission, fn, opts)`: the store comes from the signed request path, never
 * from the browser, and every id is the store's own (another store's id answers what a missing one answers).
 *
 *   startSheetConnectAction(url)    integrations.manage · sheets · `sheets:connect` 10/h · fresh step-up
 *   verifySheetConnectAction()      integrations.manage · sheets · `sheets:connect` · fresh step-up
 *   disconnectSheetAction()         integrations.manage · `sheets:connect` (no feature: a paused store may let go)
 *   setSheetsEnabledAction(on)      integrations.manage · sheets           Pause / Resume
 *   setSheetsPullAction(on)         integrations.manage · sheets           "Bring status changes back from the sheet"
 *   syncSheetNowAction()            integrations.manage · sheets · `sheets:sync` 12/10 min   Sync now
 *   repairSheetAction({ add })      integrations.manage · sheets · `sheets:sync`   header formats, dropdown, headers
 *   requeueSheetRowAction(orderId)  integrations.manage · sheets           the drawer's Send again
 *   saveExportKeyAction(json)       integrations.manage · php_export · fresh step-up (write-only)
 *   deleteExportKeyAction()         integrations.manage · php_export
 *
 * `integrations.manage` is sensitive (§A.3.1): the seam refuses it under impersonation and audits its use. Refusals
 * are `{ ok: false, error, message }` with the plain-words explanation of the Sheets library (`explain()`), or a
 * message key of the integrations catalog (`int.err.*`, `int.sheets.refused`).
 */
import { z } from "zod";
import { fail } from "@/lib/admin-data/action";
import { revalidateStore } from "@/lib/admin-data/shell";
import { auditIn, settingsActor } from "@/lib/admin-data/store-audit";
import { exportKeyInfo, exportKeyState, INVALID_EXPORT_KEY, parseServiceAccountKey, type ExportKeyInfo } from "@/lib/export/service-account";
import { setStoreSetting } from "@/lib/settings";
import {
  CONNECT_BUCKET,
  disconnectSheet,
  explain,
  REPAIR_HEADERS,
  repairSheet,
  RepairError,
  requeueSheetRow,
  scheduleSheetPush,
  serviceAccountEmail,
  setSheetsEnabled,
  setSheetsPull,
  SheetBindingConflict,
  SheetLinkInvalid,
  SheetsConfigError,
  sheetsConfigProblem,
  SheetsError,
  SheetsProofError,
  startSheetConnect,
  SYNC_BUCKET,
  syncSheetNow,
  verifySheetConnect,
  type RepairResult,
  type SheetsConfig,
  type SheetsPushResult,
} from "@/lib/sheets";
import { EntitlementError } from "@/lib/tenancy/entitlements";
import { requireStepUp, SeamError, storeAction } from "@/lib/tenancy/seam";
import type { ActionResult, WriteCtx } from "@/lib/tenancy/types";

const PAGE = "/integrations/sheets" as const;
const OrderId = z.string().trim().min(3).max(40);
const KeyInput = z.string().max(30_000, { error: "This file is too large to be a service-account key." });

/** The Sheets screen and the screens that show the queue's health. */
const refresh = (handle: string) => revalidateStore(handle, PAGE, "/integrations", "/orders", "");

/** The platform's service account must be usable before any Google call (the console sets it, ADM-35). */
function assertConfigured(): void {
  const problem = sheetsConfigProblem();
  if (problem) fail(explain(problem, serviceAccountEmail()));
}

/** A connect step's failure in plain words: the generic refusal, the link's problem, the proof's, Google's. */
function connectFailure(err: unknown): never {
  if (err instanceof SheetBindingConflict) fail("int.sheets.refused");
  if (err instanceof SheetsProofError) fail(err.message);
  if (err instanceof SheetLinkInvalid || err instanceof SheetsConfigError) fail(explain(err, serviceAccountEmail()));
  if (err instanceof EntitlementError || err instanceof SeamError) throw err;
  // Google's own refusal (not shared, deleted, Excel file…): the owner's words, with the e-mail to share with
  if (err instanceof SheetsError) fail(explain(err, serviceAccountEmail()));
  throw err;
}

export type StartConnectResult =
  | { kind: "proof"; code: string; expiresAt: string; serviceAccountEmail: string | null }
  | { kind: "connected"; created: boolean; spreadsheetTitle: string; sheet: SheetsConfig };

/** Step 1 of connecting (OPE-§19.3): the store's own sheet reconnects at once; any other answers the proof's code. */
export async function startSheetConnectAction(url: string): Promise<ActionResult<StartConnectResult>> {
  return storeAction(
    "integrations.manage",
    async (ctx) => {
      // a secret write under integrations.manage: a fresh step-up, named on the audit row (§B.7, §F.5 rev 4)
      const stepUp = requireStepUp(ctx);
      const link = z.string().trim().min(1, { error: "Paste the link of your Google Sheet." }).max(2000).parse(url);
      assertConfigured();
      try {
        const r = await startSheetConnect(ctx.scope, link, ctx.actor, { currency: ctx.store.currency, stepUp });
        if (r.kind === "proof") return { kind: "proof", code: r.code, expiresAt: r.expiresAt, serviceAccountEmail: serviceAccountEmail() };
        // orders that queued while no sheet was connected go out now
        scheduleSheetPush(ctx.scope);
        refresh(ctx.store.handle);
        return { kind: "connected", created: r.result.created, spreadsheetTitle: r.result.spreadsheetTitle, sheet: r.sheet };
      } catch (err) {
        connectFailure(err);
      }
    },
    { feature: "sheets", rate: CONNECT_BUCKET },
  );
}

export type VerifyConnectResult =
  | { kind: "connected"; created: boolean; spreadsheetTitle: string; sheet: SheetsConfig }
  /** the proof is not done yet: none pending (or expired), or the code is not in a title yet (the screen says which) */
  | { kind: "waiting"; reason: SheetsProofError["code"]; message: string };

/** Step 2 (OPE-§19.3): the code is in the spreadsheet's or a tab's name → the sheet is the store's. */
export async function verifySheetConnectAction(): Promise<ActionResult<VerifyConnectResult>> {
  return storeAction(
    "integrations.manage",
    async (ctx) => {
      const stepUp = requireStepUp(ctx);
      assertConfigured();
      try {
        const r = await verifySheetConnect(ctx.scope, ctx.actor, { currency: ctx.store.currency, stepUp });
        scheduleSheetPush(ctx.scope);
        refresh(ctx.store.handle);
        return { kind: "connected" as const, created: r.result.created, spreadsheetTitle: r.result.spreadsheetTitle, sheet: r.sheet };
      } catch (err) {
        // a step of the proof, not a failure: the screen keeps the code on screen and says what is missing
        if (err instanceof SheetsProofError) return { kind: "waiting" as const, reason: err.code, message: err.message };
        connectFailure(err);
      }
    },
    { feature: "sheets", rate: CONNECT_BUCKET },
  );
}

/** Disconnect: the binding goes (another store may prove the spreadsheet later), the orders keep their sheet status. */
export async function disconnectSheetAction(): Promise<ActionResult<{ disconnected: boolean }>> {
  return storeAction(
    "integrations.manage",
    async (ctx) => {
      const disconnected = await disconnectSheet(ctx.scope, ctx.actor);
      refresh(ctx.store.handle);
      return { disconnected };
    },
    { rate: CONNECT_BUCKET },
  );
}

/** Pause / Resume (OPE-§19.8): orders keep queuing while paused; resuming pushes the backlog. */
export async function setSheetsEnabledAction(enabled: boolean): Promise<ActionResult<SheetsConfig>> {
  return storeAction(
    "integrations.manage",
    async (ctx) => {
      const sheet = await setSheetsEnabled(ctx.scope, z.boolean().parse(enabled), settingsActor(ctx.actor));
      if (!sheet) fail("int.err.sheets_not_connected");
      if (sheet!.enabled) scheduleSheetPush(ctx.scope);
      refresh(ctx.store.handle);
      return sheet!;
    },
    { feature: "sheets" },
  );
}

/** "Bring status changes back from the sheet" (OPE-§19.6, §19.8). */
export async function setSheetsPullAction(pull: boolean): Promise<ActionResult<SheetsConfig>> {
  return storeAction(
    "integrations.manage",
    async (ctx) => {
      const sheet = await setSheetsPull(ctx.scope, z.boolean().parse(pull), settingsActor(ctx.actor));
      if (!sheet) fail("int.err.sheets_not_connected");
      refresh(ctx.store.handle);
      return sheet!;
    },
    { feature: "sheets" },
  );
}

export interface SyncNowResult {
  appended: number;
  updated: number;
  pulled: number;
  failed: number;
  /** why the run made no call (not connected, paused, the breaker…), null when it ran */
  skipped: SheetsPushResult["skipped"];
  /** the owner's plain-words explanation of a failed or limited run */
  message: string | null;
}

/** Sync now: one manual run (3 calls, failed orders skip their backoff, the pull whatever its window says). */
async function syncNow(ctx: WriteCtx): Promise<SyncNowResult> {
  const r = await syncSheetNow(ctx.scope);
  refresh(ctx.store.handle);
  return { appended: r.appended, updated: r.updated, pulled: r.pulled, failed: r.failed, skipped: r.skipped, message: r.message };
}

export async function syncSheetNowAction(): Promise<ActionResult<SyncNowResult>> {
  return storeAction("integrations.manage", (ctx) => syncNow(ctx), { feature: "sheets", rate: SYNC_BUCKET });
}

const RepairInput = z.object({ add: z.array(z.enum(REPAIR_HEADERS)).max(REPAIR_HEADERS.length).default([]) });

/** Repair sheet (OPE-§19.8 rev 3): header formats and the status dropdown again, plus the optional headers ticked. */
export type RepairOutcome = ({ repaired: true } & RepairResult) | { repaired: false; reason: RepairError["code"]; message: string };

/**
 * A repair the sheet's state stops (not connected, the tab gone, a header row of another tool, too wide, Google
 * busy) answers `{ repaired: false, reason, message }` as data: the card shows it in place, next to the button.
 */
export async function repairSheetAction(input: z.input<typeof RepairInput>): Promise<ActionResult<RepairOutcome>> {
  return storeAction(
    "integrations.manage",
    async (ctx) => {
      const { add } = RepairInput.parse(input ?? {});
      assertConfigured();
      try {
        const r = await repairSheet(ctx.scope, { add });
        refresh(ctx.store.handle);
        return { repaired: true as const, ...r };
      } catch (err) {
        if (err instanceof RepairError) return { repaired: false as const, reason: err.code, message: `int.err.repair_${err.code}` };
        connectFailure(err);
      }
    },
    { feature: "sheets", rate: SYNC_BUCKET },
  );
}

/** The order drawer's "Send again" (OPE-§19.5 step 7): the store's own order goes back to the sheet's queue. */
export async function requeueSheetRowAction(orderId: string): Promise<ActionResult<{ queued: true }>> {
  return storeAction(
    "integrations.manage",
    async (ctx) => {
      if (!(await requeueSheetRow(ctx.scope, OrderId.parse(orderId), ctx.actor))) throw new SeamError("not_found");
      refresh(ctx.store.handle);
      return { queued: true as const };
    },
    { feature: "sheets" },
  );
}

/* ------------------------------------------------------------------ */
/* the store's export key (EXP-03; write-only)                         */
/* ------------------------------------------------------------------ */

/**
 * Save (or replace) the store's export key from the pasted JSON file (or its base64 form): the only key a PHP export
 * of the store may carry (store setting `export_key`, §D.10). Never shown again: the card names the account and the
 * key id, so the owner knows what to delete in Google Cloud. A fresh step-up (§B.7, SEC-17).
 */
export async function saveExportKeyAction(raw: string): Promise<ActionResult<ExportKeyInfo>> {
  return storeAction(
    "integrations.manage",
    async (ctx) => {
      const { scope, actor, store } = ctx;
      const stepUp = requireStepUp(ctx);
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
      await auditIn(scope, actor, "integrations.export_key.set", { meta: { email: sa!.client_email, keyId: sa!.private_key_id ?? null, stepUp } });
      revalidateStore(store.handle, PAGE);
      return exportKeyInfo(scope);
    },
    { feature: "php_export" },
  );
}

/** Forget the store's export key (exports already made keep theirs: the owner deletes it in Google Cloud). */
export async function deleteExportKeyAction(): Promise<ActionResult<ExportKeyInfo>> {
  return storeAction(
    "integrations.manage",
    async ({ scope, actor, store }) => {
      const before = await exportKeyInfo(scope);
      await setStoreSetting(scope, "export_key", { clientEmail: null, privateKey: null, privateKeyId: null, setAt: null }, settingsActor(actor));
      if (before.set) await auditIn(scope, actor, "integrations.export_key.removed", { meta: { email: before.email, keyId: before.keyId } });
      revalidateStore(store.handle, PAGE);
      return exportKeyInfo(scope);
    },
    { feature: "php_export" },
  );
}

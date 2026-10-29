import "server-only";
/**
 * Google Sheets integration public API (server only). Every function that touches a store's sheet or orders
 * takes the store's scope (docs/STORE-SAAS.md §E.3; SHT-01 … SHT-11). R1 (P5): the push runner (./push.ts:
 * `pushStore`, `scheduleSheetPush`, the `sheets.push` slot) and the bindings (./config.ts); the R1.0 names of
 * ./sync.ts stay as a facade over them.
 */
export {
  SheetsError,
  SheetsConfigError,
  isSheetsConfigured,
  sheetsConfigProblem,
  serviceAccountEmail,
  loadServiceAccount,
  getAccessToken,
  signJwt,
} from "./client";
export { parseSheetUrl, cleanText, toSheetsSerial, sheetUrl, type ParsedSheetLink, type SheetLinkError } from "./format";
export {
  TAB,
  TAB_TITLES,
  headerUsable,
  COLUMNS,
  connectSheet,
  verifySheet,
  appendRows,
  readStatuses,
  readOrderRows,
  explain,
  statusLabel,
  statusFromLabel,
  setupRequests,
  SheetLinkInvalid,
  type ConnectResult,
} from "./orders-sheet";
export {
  getSheetsConfig,
  activeSheet,
  pendingProof,
  saveSheetsConfig,
  savePendingProof,
  setSheetsEnabled,
  disconnectSheet,
  sheetBound,
  claimSheetBinding,
  releaseSheetBinding,
  SheetBindingConflict,
  type SheetsConfig,
  type SheetsProof,
} from "./config";
export {
  pushStore,
  scheduleSheetPush,
  runSheetsPushTick,
  sheetsBreakerUntil,
  type PushOptions,
  type PushSkip,
  type PushStop,
  type PushTrigger,
  type SheetsPushResult,
  type SheetsTickReport,
} from "./push";
export { startSheetConnect, verifySheetConnect, SheetsProofError, type StartConnect, type VerifiedConnect } from "./connect";
export { PROOF_TTL_MS, newProofCode, proofFound, proofHash } from "./proof";
export {
  syncPendingOrders,
  pullStatuses,
  pushOrderStatus,
  syncHealth,
  syncStores,
  syncResultOf,
  selectSyncBatch,
  orderToRow,
  type SyncResult,
  type SyncOptions,
  type PullResult,
  type PushStatusResult,
  type StoresSyncReport,
} from "./sync";

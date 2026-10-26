import "server-only";
/**
 * Google Sheets integration public API (server only). Every function that touches a store's sheet or orders
 * takes the store's scope (docs/STORE-SAAS.md §E.3; SHT-01 … SHT-11).
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
  type SheetsConfig,
  type SheetsProof,
} from "./config";
export { startSheetConnect, verifySheetConnect, SheetsProofError, type StartConnect, type VerifiedConnect } from "./connect";
export { PROOF_TTL_MS, newProofCode, proofFound, proofHash } from "./proof";
export {
  syncPendingOrders,
  pullStatuses,
  pushOrderStatus,
  syncHealth,
  syncStores,
  orderToRow,
  type SyncResult,
  type SyncOptions,
  type PullResult,
  type PushStatusResult,
  type StoresSyncReport,
} from "./sync";

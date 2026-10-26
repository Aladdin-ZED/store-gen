import "server-only";
/**
 * Media public API (server only). Key/URL conventions live in ./keys (isomorphic contract). Every asset function takes
 * the store's scope (docs/STORE-SAAS.md §E.3, §G.4); file reads by key (./store) serve the public media route and
 * the exporter, which resolve the asset in the store first.
 */
export { processUpload, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MAX_PIXELS } from "./process";
export type { ProcessOptions, UploadResult } from "./process";
export {
  getAsset,
  getAssetsByIds,
  listAssets,
  deleteAsset,
  hasDerivedAssets,
  setAssetTags,
  assetToJson,
  videoSource,
  videoKey,
  ASSET_ID_RE,
  VIDEO_KEY_RE,
  VIDEO_MIME,
} from "./assets";
export type { AssetRecord, AssetJson, AssetPage, ListAssetsInput, VideoFormat } from "./assets";
export {
  getMediaFile,
  getMediaMeta,
  peekMediaMeta,
  peekMediaFile,
  mediaBodyCached,
  openMediaRange,
  streamMediaRange,
  mediaCacheStats,
  MediaBusyError,
  CHUNK_SIZE,
  MAX_CACHED_FILE,
} from "./store";
export type { MediaFile, MediaFileMeta } from "./store";
export { MediaError } from "./errors";
export { QuotaError, quotaKind, type MediaStore } from "./quota";
export { FOCUS_VERSION, parseFocus } from "./focus";
export { ensureFocus, ensureFocusMany, focusIsCurrent } from "./ensure-focus";
export type { EnsureManyOptions } from "./ensure-focus";
export type { AssetFocus, Box as FocusBox, KeepRegion, FocusKind } from "./focus";
export type { MediaErrorCode } from "./errors";
export { sniff } from "./sniff";
export * from "./keys";

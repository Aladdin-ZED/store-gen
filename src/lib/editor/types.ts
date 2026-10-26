/**
 * Builder data contracts shared by the server (bootstrap + actions) and the client (store, UI).
 * Plain JSON shapes only — everything here crosses the server-action boundary.
 */
import type { AssetRowLike, StoreInfo } from "@/landing/context";
import type { PageDoc } from "@/lib/page/schema";
import type { GateItem } from "@/lib/tenancy/types";
import type { CheckContextData } from "./check-context";

export type PageStatus = "draft" | "published" | "archived";
/** `pages.kind` (§D.2): only `landing` until R2's storefront kinds */
export type PageKind = "landing" | "home" | "product" | "collection" | "page" | "policy" | "search" | "cart" | "checkout" | "not_found";
export type VersionKind = "generation" | "save" | "publish" | "restore" | "import" | "autosave";

export const VERSION_KINDS: readonly VersionKind[] = ["generation", "save", "publish", "restore", "import", "autosave"];

export interface EditorPageMeta {
  id: string;
  kind: PageKind;
  name: string;
  slug: string;
  status: PageStatus;
  publishedVersionId: string | null;
  /** epoch ms of pages.updated_at — the optimistic-concurrency token of the draft */
  updatedAt: number;
}

export interface VersionSummary {
  id: string;
  kind: VersionKind;
  label: string | null;
  /** epoch ms */
  createdAt: number;
  author: string | null;
  starred: boolean;
}

/** Asset row as the preview needs it (+ palette for "derive colors from the photos"). */
export interface EditorAsset extends AssetRowLike {
  palette?: unknown;
}

export interface EditorUser {
  id: string;
  name: string;
  canWrite: boolean;
  canPublish: boolean;
  canExport: boolean;
  canUpload: boolean;
}

/** Store identity facts the pre-publish checklist needs (Settings → Store). */
export interface StoreHealth {
  hasLegalName: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  hasAddress: boolean;
}

export interface EditorBootstrap {
  page: EditorPageMeta;
  doc: PageDoc;
  /** the draft equals the published version (no unpublished changes) */
  draftIsLive: boolean;
  assets: Record<string, EditorAsset>;
  store: StoreInfo;
  storeHealth: StoreHealth;
  /** the checklist's store facts (LAN Q15); the browser adds the clock, the pixels and the store's links */
  check: CheckContextData;
  versions: VersionSummary[];
  hasMoreVersions: boolean;
  user: EditorUser;
  /** Settings → AI: local AI on/off, background removal, highest model tier allowed */
  ai: { enabled: boolean; bgRemoval: boolean; tier: "lite" | "full" };
  /** human notes about repairs made while opening the draft */
  notices: string[];
}

export type ActionErrorCode =
  | "auth"
  | "forbidden"
  | "invalid"
  | "not_found"
  | "conflict"
  | "too_large"
  | "slug_taken"
  | "slug_reserved"
  | "publish_failed"
  /** the publish gates refused (§M.1): `items` lists every refusal and note */
  | "budget_blocked"
  | "honesty_blocked"
  | "design_blocked"
  | "server";

export interface ActionFailure {
  ok: false;
  error: ActionErrorCode;
  message: string;
  /** conflict: the server's current updatedAt */
  serverUpdatedAt?: number;
  /** publish_failed / invalid: details for the checklist */
  issues?: { path: string; message: string; sectionId?: string }[];
  /** *_blocked: the gates' items, one row each in the publish dialog (§M.1 rule 2) */
  items?: GateItem[];
}

export type ActionResult<T extends object = object> = ({ ok: true } & T) | ActionFailure;

/** Largest draft accepted by saveDraft, in UTF-8 bytes of its JSON (server actions are capped at 1 MB per request). */
export const MAX_DOC_BYTES = 900_000;

/** UTF-8 size of a value's JSON (Arabic text takes 2 bytes per letter); Infinity when it can't be serialized. */
export function jsonBytes(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? 0 : new TextEncoder().encode(json).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

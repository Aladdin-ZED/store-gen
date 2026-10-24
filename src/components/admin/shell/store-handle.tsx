/**
 * Which store the dashboard on screen belongs to, for the browser clients that call the store's API
 * (`/api/app/<handle>/…`, docs/STORE-SAAS.md §C.6 `apiHref`): the media library, the picker, the framing data and
 * the builder's uploads are plain functions shared by many components, so they read the handle from the document
 * rather than through props.
 *
 *   <StoreHandleMeta handle={ctx.store.handle} />        // server layout (hoisted into <head> by React)
 *   fetch(apiHref(requireStoreHandle(), "/media"))       // browser, at call time
 *
 * Under /app/<handle>/… the path names the store too; the meta wins (the legacy /admin panel and builder are store
 * #1's and carry it). Pure and isomorphic: nothing runs at import time.
 */
import { HANDLE_RE } from "@/lib/tenancy/handles";

export const STORE_HANDLE_META = "sg-store";

/** The `<meta name="sg-store">` of a dashboard layout (nothing when the store isn't known). */
export function StoreHandleMeta({ handle }: { handle: string | null | undefined }) {
  return handle && HANDLE_RE.test(handle) ? <meta name={STORE_HANDLE_META} content={handle} /> : null;
}

/** The handle of the store on screen, or null (server side, or a page outside a store's dashboard). */
export function currentStoreHandle(): string | null {
  if (typeof document === "undefined") return null;
  const meta = document.querySelector<HTMLMetaElement>(`meta[name="${STORE_HANDLE_META}"]`)?.content ?? "";
  if (HANDLE_RE.test(meta)) return meta;
  const fromPath = /^\/app\/([^/?#]+)/.exec(window.location.pathname)?.[1] ?? "";
  return HANDLE_RE.test(fromPath) ? fromPath : null;
}

/** The handle of the store on screen; throws (a message the caller shows) outside a store's dashboard. */
export function requireStoreHandle(): string {
  const handle = currentStoreHandle();
  if (!handle) throw new Error("This screen isn't linked to a store. Reload the page and try again.");
  return handle;
}

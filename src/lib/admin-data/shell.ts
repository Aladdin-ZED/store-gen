import "server-only";
/**
 * Server half of the store dashboard's shell (docs/STORE-SAAS.md §I.1, §I.4): what the `[store]` layout hands its
 * client components about the store on screen, the store switcher's rows, and the `revalidatePath` targets of a
 * store's screens (`appHref`, never an `/admin` literal; TENANCY-MAP ADM-37).
 */
import { revalidatePath } from "next/cache";
import type { StoreClientInfo } from "@/components/admin/shell/store-context";
import { listMemberships, type MembershipSummary } from "@/lib/auth/landing";
import { STORE_PERMISSION_KEYS } from "@/lib/auth/permissions";
import { logError } from "@/lib/orders/log";
import { isHandle } from "@/lib/tenancy/handles";
import type { StoreCtx, StoreRow } from "@/lib/tenancy/types";
import { appHref, storeUrl } from "@/lib/urls";

/** The store's public home without a trailing slash (P: "<platform origin>/s/<h>", S: "https://<h>.<root>"). */
export function liveBaseOf(store: Pick<StoreRow, "id" | "handle" | "primaryDomain">): string {
  return storeUrl(store, "/").replace(/\/+$/, "");
}

/** The serializable store context of the dashboard's client components (the grants are the seam's `ctx.can`). */
export function storeClientInfo(ctx: StoreCtx): StoreClientInfo {
  const { store } = ctx;
  return {
    id: store.id,
    handle: store.handle,
    name: store.name,
    mode: store.mode,
    status: store.status,
    role: ctx.membership.role,
    viewerId: ctx.user.id,
    grants: STORE_PERMISSION_KEYS.filter((p) => ctx.can(p)),
    liveBase: liveBaseOf(store),
    timeZone: store.timezone,
    currency: store.currency,
  };
}

/** The switcher's other stores (T2's `listMemberships`); null while it can't answer, so the switcher shows this store only. */
export async function switcherMemberships(userId: string): Promise<MembershipSummary[] | null> {
  try {
    return await listMemberships(userId);
  } catch (err) {
    // T2's stub throws until its merge; a real failure is logged and only hides the other stores
    if (!(err instanceof Error && err.message.startsWith("not implemented"))) logError("shell:memberships", err);
    return null;
  }
}

/**
 * Revalidates screens of one store: `revalidateStore(handle, "/orders", "")` (the dashboard is ""). A `layout`
 * entry revalidates everything below it (`{ path: "/settings", type: "layout" }`).
 */
export function revalidateStore(handle: string, ...paths: (`/${string}` | "" | { path: `/${string}` | ""; type: "layout" })[]): void {
  for (const p of paths) {
    if (typeof p === "string") revalidatePath(appHref(handle, p));
    else revalidatePath(appHref(handle, p.path), p.type);
  }
}

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/**
 * A plain 307 from a store's alias URL to one of its screens (`/pages/new` → `/generate`). As a page, an alias sits
 * inside the dashboard's loading boundary: Next has streamed the shell when `redirect()` runs, so it answers 200 and
 * redirects on the client, and a document load fetches the target twice. A route handler answers before anything
 * streams: one 307. The handle is only checked and echoed into the path; the target's own guard decides (sign-in,
 * 404). An invalid handle gets a 404.
 */
export function storeAliasRedirect(handle: string, path: `/${string}`): Response {
  if (!isHandle(handle)) return new Response(null, { status: 404, headers: NO_STORE });
  return new Response(null, { status: 307, headers: { Location: appHref(handle, path), ...NO_STORE } });
}

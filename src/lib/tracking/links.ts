import "server-only";
/**
 * Signed tracking links (P3 LANDING; landing.md LAN-§9.1; docs/STORE-SAAS.md §K.2 P0): `storePath(store, "/track") +
 * "?o=<id>&s=<exp base36>.<sig>"`, valid 90 days, with the core's `signTrackLink` (src/lib/tenancy/public.ts, T3) and
 * verified by `resolveOrderForTracking`. Used by the thank-you's "Track my order", the `{tracking_link}` template
 * variable (P5) and the `track_link` template.
 *
 *   signedTrackPath(store, "CMD-7K3Q9X")   "/s/atlas/track?o=CMD-7K3Q9X&s=lq3k9z0.Ab…" (P mode; "/track?…" on its own host)
 *   trackUrl(store, "CMD-7K3Q9X")          the same, absolute (`storeUrl`): for messages sent outside the page
 *
 * A link names one store: `s` is signed with the store's id, so A's link under B's address answers 404.
 */
import { signTrackLink } from "@/lib/tenancy/public";
import { storePath, storeUrl, type StoreAddress } from "@/lib/urls";

/** "?o=<id>&s=<signed>" of an order of `store` (signed now, valid 90 days). */
export function trackQuery(store: { id: string }, orderId: string, now?: number): string {
  return `?o=${encodeURIComponent(orderId)}&s=${encodeURIComponent(signTrackLink(store.id, orderId, now))}`;
}

export function signedTrackPath(store: StoreAddress & { id: string }, orderId: string): string {
  return storePath(store, "/track") + trackQuery(store, orderId);
}

/** The absolute signed link (`storeUrl`), for templates and messages that leave the page. */
export function trackUrl(store: StoreAddress & { id: string }, orderId: string): string {
  return storeUrl(store, "/track") + trackQuery(store, orderId);
}

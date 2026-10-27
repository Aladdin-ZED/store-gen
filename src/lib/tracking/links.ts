import "server-only";
/**
 * Signed tracking links (P3 LANDING; landing.md LAN-§9.1; docs/STORE-SAAS.md §K.2 P0): `storePath(store, "/track") +
 * "?o=<id>&s=<exp base36>.<sig>"`, valid 90 days, with the core's `signTrackLink` (src/lib/tenancy/public.ts, T3) and
 * verified by `resolveOrderForTracking`. Used by the thank-you's "Track my order", the `{tracking_link}` template
 * variable (P5) and the `track_link` template. Typed stub frozen at P0: the `/track` page itself ships with P3, so no
 * link is handed out before it exists. P3 adds the absolute `trackUrl(store, orderId)` here.
 */
import type { StoreAddress } from "@/lib/urls";

export function signedTrackPath(store: StoreAddress & { id: string }, orderId: string): string {
  void store;
  void orderId;
  throw new Error("not implemented: P3 signedTrackPath");
}

import "server-only";
/**
 * The store-mode switch plan (P3 LANDING; landing.md LAN-§4; docs/STORE-SAAS.md §A.2 mode-switch safeguards, LAN Q34,
 * §K.2 P0): P2's `store.mode` action calls it before a switch to `store` and lists the live landing pages with their
 * 7-day views ("These pages receive visits: keep them on?"). A switch never unpublishes a page. Typed stub frozen at P0.
 */
import type { StoreScope } from "@/lib/tenancy/types";

export async function landingModeSwitchPlan(scope: StoreScope): Promise<{ livePages: number; views7d: number; suggestInStoreMode: boolean }> {
  void scope;
  throw new Error("not implemented: P3 landingModeSwitchPlan");
}

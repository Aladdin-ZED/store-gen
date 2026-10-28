"use client";
/**
 * The two slots of P2's `AddressCard` (P3 LANDING; platform.md PLA-§22.10.2, PD61; SF-01 and SF-05 of PLA-§1.5,
 * UX-05; P0b CCR P2-9), on the store dashboard and on the onboarding done step:
 *   - `TestOrderSlot`: P3's "Open a test order" (a test link minted through P3's action; disabled with
 *     `shell.address.after_publish` while the page is not live);
 *   - `CampaignSlot`: the link to P3's new-campaign route (hidden without `campaigns.write`).
 * P3 merges after P2, so P2 mounts these stubs.
 *
 * P0b stubs: both render nothing (nothing of P2 mints a test token). The props are frozen
 * (src/lib/contracts/r1-p0b-design.ts); P3 replaces the bodies.
 */
import type { ReactElement } from "react";

export function TestOrderSlot(p: { pageId: string | null; live: boolean }): ReactElement | null {
  void p;
  return null;
}

export function CampaignSlot(): ReactElement | null {
  return null;
}

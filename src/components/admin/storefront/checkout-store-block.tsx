"use client";
/**
 * The "Boutique" block of Settings → Checkout & delivery (storefront.md STO-§23.1, STO-§15.1; S1 STOREFRONT owns this
 * file in R2). The R2 contract step (C2-E) froze its props and mounted it once in landing's checkout settings screen
 * (src/app/app/[store]/settings/checkout/page.tsx) when `releaseOn("R2")` and the store mode allows the storefront.
 * S1's body edits the `checkout.store` block (buy model, fallback fee, WhatsApp alternative) through its own action
 * (`checkout.write`, audit `store.settings.updated` key `checkout`, a `catalog_version` bump). Stub until S1 merges:
 * renders nothing (`null`). No R1 screen mounts it.
 */
import type { ReactElement } from "react";
import type { CheckoutStore } from "@/lib/settings/keys/checkout-store";

export interface CheckoutStoreBlockProps {
  /** the stored block, else its defaults */
  value: CheckoutStore;
  /** `checkout.write` and not read-only */
  canWrite: boolean;
  /** the store currency (the fallback fee's unit) */
  currency: string;
  /** a store WhatsApp number exists (the WhatsApp alternative needs one) */
  hasWhatsapp: boolean;
}

/** S1 (stub: renders nothing). */
export function CheckoutStoreBlock(props: CheckoutStoreBlockProps): ReactElement | null {
  void props;
  return null;
}

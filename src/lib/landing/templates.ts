/**
 * Landing's shopper texts on the server (P3 LANDING; landing.md LAN-§8.1, §24.2; docs/STORE-SAAS.md §K.2 P0). Typed stub
 * frozen at P0: `waConfirmText` fills the `customer_confirm` template (`{order_id}` `{offer}` `{total}` `{name}`) from
 * the stored order, for the agent's "Send confirmation link" quick reply, the kit preview and the parity test (the
 * browser's `assist-ty` output equals it for the same order).
 */
import type { z } from "zod";
import type { OrderRow } from "@/lib/orders/hooks";
import type { Locale } from "@/lib/page/schema";
import type { StoreConfirmation } from "@/lib/settings/keys/store";
import type { StoreRow } from "@/lib/tenancy/types";

export function waConfirmText(store: StoreRow & { confirmation: z.output<typeof StoreConfirmation> }, order: OrderRow, locale: Locale): string {
  void store;
  void order;
  void locale;
  throw new Error("not implemented: P3 waConfirmText");
}

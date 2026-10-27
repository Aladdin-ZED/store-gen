/**
 * The template language of call scripts, WhatsApp and Telegram texts (P5 INTEGRATIONS; operations.md OPE-§7.1, OD24;
 * docs/STORE-SAAS.md §K.2 P0, OPE Q.8). `renderTemplate` is pure and isomorphic; `orderTemplateValues` reads the
 * store's facts on the server and every value comes from a stored fact (owner rule: never invented). Typed stubs
 * frozen at P0; P5 adds `parseTemplate` here.
 *
 *   "{var}" inserts a variable; "[[ … ]]" is an optional block dropped when any variable inside it is empty;
 *   "{{" and "}}" are literal braces. No other syntax, no expressions. Unknown variables fail validation at save.
 */
import type { OrderRow } from "@/lib/orders/hooks";
import type { Locale } from "@/lib/page/schema";
import type { StoreScope } from "@/lib/tenancy/types";

/** rev 3 (OD55, OD49): the last three are appended, additive for P3's kit */
export const TEMPLATE_VARS = [
  "customer_first_name",
  "order_id",
  "product",
  "offer_label",
  "units_text",
  "qty",
  "total",
  "shipping_text",
  "city",
  "address",
  "landmark",
  "eta_text",
  "store_name",
  "agent_first_name",
  "confirm_number",
  "confirm_hours",
  "upsell_title",
  "upsell_price",
  "tracking_link",
  "order_count_today",
  "carrier_label",
  "carrier_tracking",
  "ship_after_date",
] as const;
export type TemplateVar = (typeof TEMPLATE_VARS)[number];

/** Pure, isomorphic: fills the variables, drops an optional block with an empty variable, unescapes braces. */
export function renderTemplate(src: string, values: Partial<Record<TemplateVar, string>>): string {
  void src;
  void values;
  throw new Error("not implemented: P5 renderTemplate");
}

/** The order's variables in the viewer's template locale (OPE-§7.1 table); a variable without a stored fact is absent. */
export async function orderTemplateValues(scope: StoreScope, order: OrderRow, viewer: { firstName: string | null; locale: Locale }): Promise<Partial<Record<TemplateVar, string>>> {
  void scope;
  void order;
  void viewer;
  throw new Error("not implemented: P5 orderTemplateValues");
}

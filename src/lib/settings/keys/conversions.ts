/**
 * Store setting `conversions` (docs/STORE-SAAS.md §D.10, operations.md OPE-§2.9 / §20; owner: operations, P5): when
 * the server Purchase fires and which custom events go out (IN-02, R-D23).
 */
import { z } from "zod";
import { id26 } from "../fields";

const Trigger = z.enum(["order", "confirmed", "delivered"]);

export const ConversionsSetting = z.object({
  purchaseTrigger: Trigger.default("order"),
  /** page id → trigger (≤ 200) */
  pageOverrides: z
    .record(id26, Trigger)
    .refine((o) => Object.keys(o).length <= 200, { error: "Too many pages." })
    .default({}),
  /** Meta ConfirmedOrder / DeliveredOrder */
  customEvents: z.boolean().default(true),
  /** OD16 */
  manualOrders: z.boolean().default(false),
});
export type ConversionsSetting = z.output<typeof ConversionsSetting>;

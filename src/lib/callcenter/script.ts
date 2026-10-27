/**
 * The call script document (P4 CALL CENTER; operations.md OPE-§7.2, RA §4.5; docs/STORE-SAAS.md §K.2 P0). Frozen at
 * P0 because P3's Campaign Kit compiles the store's script into the kit (`CompileKitInput.templates.script`,
 * LAN-§13.3). Step texts are templates of P5's language (src/lib/integrations/templates.ts). P4 adds
 * `CompiledScript` and `compileScript` here.
 */
import { z } from "zod";

export const ScriptDoc = z.object({
  v: z.literal(1),
  steps: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9_]{1,20}$/),
        title: z.string().min(1).max(40),
        /** template */
        say: z.string().max(400),
        /** tick boxes, e.g. "Landmark noted" */
        checks: z.array(z.string().max(60)).max(4).default([]),
        /** "upsell": only when upsell_* are non-empty */
        when: z.enum(["always", "upsell"]).default("always"),
        action: z.enum(["none", "add_upsell", "edit_address"]).default("none"),
      }),
    )
    .min(1)
    .max(12),
  /** rev 2 (RA §4.5): objection answers shown as chips under the script; ≤ 6 */
  objections: z
    .array(
      z.object({
        id: z.enum(["price", "trust", "delivery_time", "think", "cheaper_elsewhere", "wrong_size"]),
        /** template; may use eta_text, total, confirm_number, store_name; never a claim the store did not state */
        say: z.string().max(300),
      }),
    )
    .max(6)
    .default([]),
});
export type ScriptDoc = z.output<typeof ScriptDoc>;

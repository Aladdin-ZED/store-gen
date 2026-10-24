/**
 * Store setting `telegram` (docs/STORE-SAAS.md §D.10, operations.md OPE-§21.1; secret; owner: operations, P5): the
 * store's bot token and chat (IN-04). The token rule is the PHP export's (order.php).
 */
import { z } from "zod";

export const TelegramSetting = z.object({
  enabled: z.boolean().default(false),
  botToken: z
    .string()
    .regex(/^[0-9]{5,15}:[A-Za-z0-9_-]{20,80}$/)
    .nullable()
    .default(null),
  chatId: z
    .string()
    .regex(/^-?[0-9]{3,20}$|^@[A-Za-z0-9_]{4,64}$/)
    .nullable()
    .default(null),
  /** customer fields in messages */
  pii: z.enum(["masked", "full"]).default("masked"),
});
export type TelegramSetting = z.output<typeof TelegramSetting>;

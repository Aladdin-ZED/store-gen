/** The tabs of `/finance` (P4 CALL CENTER), in a plain module so the server page and the client view share them. */
export const FIN_TABS = ["breakeven", "costs", "ads"] as const;
export type FinTab = (typeof FIN_TABS)[number];

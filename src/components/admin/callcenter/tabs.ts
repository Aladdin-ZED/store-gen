/** The tabs of `/team/callcenter` (P4 CALL CENTER), in a plain module so the server page and the client view share them. */
export const CC_TABS = ["hours", "retries", "scripts", "cities"] as const;
export type CcTab = (typeof CC_TABS)[number];

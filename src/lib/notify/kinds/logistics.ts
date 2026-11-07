/**
 * Notification kinds of the logistics file (S4 LOGISTICS, operations.md OPE-§P).
 * Extension file (docs/STORE-SAAS.md §K.3, §K.4), created empty at the R2 contract step (C2-D) and imported by
 * src/lib/notify/registry.ts (NOTIFICATION_KINDS); the track fills it and never edits the registry.
 */
import type { NotificationKindDef } from "../registry";

export const kinds: NotificationKindDef[] = [];

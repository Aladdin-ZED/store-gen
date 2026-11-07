/**
 * Order hooks of the money file (S3 MONEY, operations.md OPE-§P).
 * Extension file (docs/STORE-SAAS.md §K.3, §K.4), created empty at the R2 contract step (C2-D) and imported by
 * src/lib/orders/hooks.ts (ORDER_HOOKS); the track fills it and never edits the registry.
 */
import type { OrderHook } from "../hooks";

export const hooks: OrderHook[] = [];

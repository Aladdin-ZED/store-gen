/**
 * ⌘K server search providers (docs/STORE-SAAS.md §I.3, LAN Q18). Each track contributes
 * `src/lib/admin-data/search/<track>.ts` exporting `provider: SearchProvider` (P3: WA- refs and leads; P4: orders by id
 * or phone and customers; P6: pages by design tags), imported by P2's src/lib/admin-data/search.ts (the
 * `/api/app/<h>/search` route). Each provider has a 120 ms budget, searches one store through its scope, returns
 * customer fields through maskIfImpersonation and honours the agent's own-queue restriction.
 */
import type { StoreRole } from "@/lib/auth/permissions";
import type { MessageKey, StoreScope } from "@/lib/tenancy/types";

export interface SearchHit {
  id: string;
  kind: string; // one of the provider's kinds
  title: string; // already masked where it carries customer data
  subtitle?: string;
  /** an in-app path under /app/<h> (appHref) */
  href: string;
  /** a group label for the palette */
  group?: MessageKey;
}

export interface SearchProvider {
  id: string; // the track
  kinds: string[]; // "order", "customer", "lead", "page"…
  search(scope: StoreScope, q: string, viewer: { userId: string; role: StoreRole }): Promise<SearchHit[]>;
}

/** Each provider's budget; a slower one is dropped from the answer. */
export const SEARCH_BUDGET_MS = 120;

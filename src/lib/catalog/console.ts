import "server-only";
/**
 * The platform console's view of a store's catalog (S1 STOREFRONT owns this file in R2). The contract step (C2-C)
 * froze `catalogForConsole(scope)` for S6 PLATFORM UX's "Catalog & pages" tab of the store profile (PLA-§22.6):
 * read-only totals and lists, integer minor units, test data excluded. `null` = the store has no catalog to show (the
 * tab renders an honest "No catalog" line, never zeros). Stub until S1 merges: null. No R1 path calls it.
 */
import type { StoreScope } from "@/lib/tenancy/types";

export interface CatalogConsoleView {
  totals: { products: number; collections: number; outOfStock: number };
  products: {
    id: string;
    title: string;
    status: string;
    priceMinCents: number;
    priceMaxCents: number;
    currency: string;
    stock: "in" | "low" | "out" | "untracked";
    updatedAt: string;
  }[];
  collections: { id: string; title: string; products: number }[];
}

/** The store's catalog for the console, or null. S1 (stub: null). */
export async function catalogForConsole(scope: StoreScope): Promise<CatalogConsoleView | null> {
  void scope;
  return null;
}

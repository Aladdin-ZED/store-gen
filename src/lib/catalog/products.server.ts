import "server-only";
/**
 * Product repositories and actions (storefront.md STO-§4.5; server-only, the scope first, core §E.3). Track S1
 * STOREFRONT owns this file in R2 and writes every body (`checkProductDoc` → `assertOwned` → `deriveProduct` → one
 * transaction with the `catalog_version` bump → `syncAssetRefs` → audit). The contract step (C2-C) froze the functions
 * other tracks call before S1 merges:
 *   - `createProduct(ctx, { facts })`: S6 PLATFORM UX's store-mode onboarding reveal (`useDirectionAction`, core §A.2 /
 *     §K.4, OPS-14, PLA Q3.8; status draft, audit `store.catalog.product_created` with `{ via: "onboarding" }`);
 *   - `listProducts`, `getProductsByIds`, `saveProduct(…, expectedRev)`: S7 AI DATA applying AI-09 SEO / alt drafts and
 *     reading products for the blueprint (compare-and-set on `products.rev`, never a silent overwrite).
 * Writes take a `WriteCtx` (D71, ENGC-6: write capability is a type). Stubs until S1 merges: every function throws
 * `NotBuiltYet("S1", …)`. No R1 path calls them (no product exists before R2).
 */
import { notBuiltYet } from "@/lib/contracts/not-built";
import type { ProductRow, products } from "@/lib/db/schema";
import type { Locale, ProductCategory } from "@/lib/page/schema";
import type { StoreScope, WriteCtx } from "@/lib/tenancy/types";
import type { OptionGroupProposal } from "./from-photos.server";

export type ProductStatus = (typeof products.$inferSelect)["status"];

/** A product as the lists show it: the row without its JSON documents. */
export type ProductListRow = Omit<ProductRow, "doc" | "content" | "seo" | "searchText">;

export interface ProductQuery {
  status?: ProductStatus[];
  collectionId?: string;
  stock?: "out" | "low" | "counted";
  q?: string;
  sort?: "position" | "updated" | "name" | "price";
  cursor?: string;
  /** ≤ 100 */
  limit?: number;
}

/** The editor's save payload (validated server-side: `checkProductDoc`, the content and SEO schemas). */
export interface ProductInput {
  doc: unknown;
  content: unknown;
  seo: unknown;
  stock: unknown;
  slug: string;
  tags?: string[];
  primaryCollectionId?: string | null;
  collectionIds?: string[];
}

/** What onboarding's typed step collected (PLA-§22.2); the price is the owner's, never proposed. */
export interface ProductFacts {
  name: string;
  priceCents: number;
  compareAtCents?: number;
  /** 1-12, assertOwned */
  assetIds: string[];
  category: ProductCategory;
  locale: Locale;
  facts?: { text: string; ticked: true }[];
  variants?: OptionGroupProposal[];
}

/** A page of the store's products (STO-§4.5). S1 (stub: NotBuiltYet). */
export async function listProducts(scope: StoreScope, q: ProductQuery): Promise<{ rows: ProductListRow[]; next: string | null; total: number }> {
  void scope;
  void q;
  return notBuiltYet("S1", "listProducts");
}

/** ≤ 200 ids of this store, in no particular order; ids of another store or unknown ids are absent. S1 (stub: NotBuiltYet). */
export async function getProductsByIds(scope: StoreScope, ids: readonly string[]): Promise<ProductRow[]> {
  void scope;
  void ids;
  return notBuiltYet("S1", "getProductsByIds");
}

/**
 * Create a product: the editor's `ProductInput`, or onboarding's `{ facts }` (a one-item, one-offer doc at
 * `priceCents` through `checkProductDoc`; status draft; the `products` gauge charged). S1 (stub: NotBuiltYet).
 */
export async function createProduct(ctx: WriteCtx, input: ProductInput | { facts: ProductFacts }): Promise<ProductRow> {
  void ctx;
  void input;
  return notBuiltYet("S1", "createProduct");
}

/** Save with compare-and-set on `products.rev` (0 rows → `conflict`). S1 (stub: NotBuiltYet). */
export async function saveProduct(
  ctx: WriteCtx,
  id: string,
  input: ProductInput,
  expectedRev: string,
): Promise<{ ok: true; row: ProductRow } | { ok: false; conflict: { rev: string; updatedBy: string | null; updatedAt: Date } }> {
  void ctx;
  void id;
  void input;
  void expectedRev;
  return notBuiltYet("S1", "saveProduct");
}

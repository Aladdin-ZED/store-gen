/**
 * Store document builders (storefront.md STO-§11, STO-§11.5; pure). Track S1 STOREFRONT owns this file in R2 and
 * writes the bodies (`defaultTemplate` for every store page kind, the home = `expandHome` of the default storyline;
 * `homeFromBlueprint` = the blueprint's slots validated by `StorePageDoc` + `checkHomeDoc`, invalid slots dropped and
 * listed). The contract step (C2-C) froze the two builders S7 AI DATA's blueprint critique stage calls to obtain the
 * docs it reviews without writing anything (with `productAsPageDoc` for the PDP, src/lib/catalog/schema.ts).
 * Stubs until S1 merges: both throw `NotBuiltYet("S1", …)`. No R1 path calls them.
 */
import { notBuiltYet } from "@/lib/contracts/not-built";
import type { StoreRow } from "@/lib/tenancy/types";
import type { StoreBlueprint } from "@/lib/catalog/blueprint";
import type { StorePageDoc, StorePageKind } from "@/storefront/schema";
import type { CatalogShape } from "@/storefront/types";

/** The default template doc of a store page kind for this catalogue shape. S1 (stub: NotBuiltYet). */
export function defaultTemplate(kind: StorePageKind, shape: CatalogShape, store: StoreRow): StorePageDoc {
  void kind;
  void shape;
  void store;
  return notBuiltYet("S1", "defaultTemplate");
}

/** The `@home` doc a blueprint compiles to (what `applyStoreBlueprint` would save), with the dropped slots. S1 (stub: NotBuiltYet). */
export function homeFromBlueprint(bp: StoreBlueprint, shape: CatalogShape, store: StoreRow): { doc: StorePageDoc; dropped: string[] } {
  void bp;
  void shape;
  void store;
  return notBuiltYet("S1", "homeFromBlueprint");
}

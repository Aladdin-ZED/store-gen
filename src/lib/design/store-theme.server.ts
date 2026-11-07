import "server-only";
/**
 * The store theme (design.md DES-§2.3, DES-§11.4, DES-§11.5; storefront.md STO-§8.4; request STO-R19). Track S2 BRAND &
 * LOGO owns this file and the `store_themes` lifecycle in R2 (draft → preview → activate → roll back; only S2 writes
 * the table). The contract step (C2-C) froze the three functions other tracks call before S2 merges:
 *   - `getStoreTheme(scope, register)`: S1 STOREFRONT's store render (the compiled `BuiltTheme` of the ACTIVE row for
 *     that register; S2's theme-preview seam applies here, so every store render reads the theme through it);
 *   - `activeThemeFor(scope)`: the render wiring of DES-R4 (`effectiveTheme` for `theme_mode` store / campaign pages);
 *   - `writeThemeDraft(scope, actor, input)`: S1's `setThemeDraft` (onboarding, source "onboarding") and
 *     `applyStoreBlueprint` (sources "generation" / "blueprint"); those sources always INSERT a new draft version, only
 *     S2's own "brand" source amends the open draft.
 *
 * Contract bodies until S2 merges (no `store_themes` row exists before S2):
 *   - `getStoreTheme`: STO-§8.4's stated stand-in, so S1 can build: the theme of the store's most recently published
 *     landing page, else the archetype default for the store's category (`themeFromProduct`, no palette, seed 0),
 *     built for the store's default locale; `register` is not applied yet (the clamps are S2's `compileRegister`);
 *   - `activeThemeFor`: null (no active store theme);
 *   - `writeThemeDraft`: throws `NotBuiltYet("S2", "writeThemeDraft")` (a draft needs S2's compiled `theme_spec`).
 * No R1 path calls them: store pages and the onboarding store branch exist only with `releaseOn("R2")`.
 */
import { and, desc, eq } from "drizzle-orm";
import { notBuiltYet } from "@/lib/contracts/not-built";
import { db } from "@/lib/db/client";
import { pages, pageVersions, stores } from "@/lib/db/schema";
import { Locale, ProductCategory, type ThemeSpec } from "@/lib/page/schema";
import { whereStore } from "@/lib/tenancy/sql";
import type { Actor, StoreScope, WriteScope } from "@/lib/tenancy/types";
import { buildTheme, themeFromProduct } from "@/lib/theme";
import type { BuiltTheme } from "@/lib/theme/types";
import { isLandingDoc } from "@/storefront/schema";
import type { Register } from "@/storefront/kinds";
import type { LogoSystem } from "@/lib/logo/params";
import type { BrandGenome, BrandLocks } from "./brand";

/** What a draft version is written from (DES-§11.4 step 1-2). */
export interface ThemeDraftInput {
  genome: BrandGenome;
  source: "onboarding" | "generation" | "blueprint" | "brand";
  /** the history line, e.g. "Accent changed" (≤ 200) */
  note?: string | null;
  logo?: LogoSystem | null;
}

/** The compiled theme of the store for one register (contract body: STO-§8.4's stand-in, see the header). */
export async function getStoreTheme(scope: StoreScope, register: Register): Promise<BuiltTheme> {
  void register;
  const [latest] = await db
    .select({ doc: pageVersions.doc })
    .from(pages)
    .innerJoin(pageVersions, and(eq(pageVersions.id, pages.publishedVersionId), eq(pageVersions.storeId, pages.storeId)))
    .where(whereStore(pages, scope, eq(pages.status, "published"), eq(pages.kind, "landing")))
    .orderBy(desc(pageVersions.createdAt))
    .limit(1);
  if (latest && isLandingDoc(latest.doc)) return buildTheme(latest.doc.theme, latest.doc.locale);
  const [store] = await db.select({ category: stores.category, locale: stores.defaultLocale }).from(stores).where(eq(stores.id, scope.storeId)).limit(1);
  const category = ProductCategory.safeParse(store?.category).data ?? "other";
  const locale = Locale.safeParse(store?.locale).data ?? "fr";
  const spec: ThemeSpec = themeFromProduct({ category, palette: null, seed: 0 });
  return buildTheme(spec, locale);
}

/** The active store theme's spec and locks, or null (contract body: null, no active row before S2). */
export async function activeThemeFor(scope: StoreScope): Promise<{ version: number; spec: ThemeSpec; locks: BrandLocks } | null> {
  void scope;
  return null;
}

/** Write a draft `store_themes` version (never activates). S2 (stub: NotBuiltYet). */
export async function writeThemeDraft(scope: WriteScope, actor: Actor, input: ThemeDraftInput): Promise<{ version: number }> {
  void scope;
  void actor;
  void input;
  return notBuiltYet("S2", "writeThemeDraft");
}

/**
 * FROZEN CONTRACT: written by the R2 contract step (C2-B1, maintainer; docs/STORE-SAAS.md §K.4, storefront.md
 * STO-§27.1, STO ENGP-27 "four frozen files"). Owning track: S1 STOREFRONT builds the store on it; design's gate
 * adapter, the publish path and the core read it. A track never edits this file: a change goes through a CCR to the
 * maintainer (docs/saas/ccr/README.md) and is re-frozen in src/lib/contracts/r2-contract.ts.
 *
 * `StorePageDoc` v1 (STO-§6.2): the document of the eight store page kinds, stored in `pages.draft` /
 * `page_versions.doc` beside the landing `PageDoc` v2 (which is not touched). Isomorphic and pure.
 *
 *  - `storeDocIssues` checks the kind rules of ./kinds.ts (STO-§6.1 "Extra rules"): unique ids, the section count,
 *    the singletons, the first section, the store sections and grid sources a kind allows, `bind` only where the kind
 *    takes bound landing sections, no landing section on a kind without landing use. The section-level rules that
 *    need S1's registries (a landing type's eligibility, a section's data against its own schema, the one-bento
 *    budget) are S1's `storeSectionIssue` / `storeDocExtraIssues` (./sections/check.ts), called from here, so the
 *    frozen parse and the editor agree on one rule set.
 *  - `readPageDoc(kind, raw)` is the discriminated read of `pages.draft` / `page_versions.doc` (request STO-R2, lint
 *    L11): `landing` parses as `PageDoc` (upgrade included), a store kind as `StorePageDoc` of that kind, anything else
 *    is null. `isStorePageDoc` / `isLandingDoc` are the cheap type guards for a value already typed as the union (no
 *    parse: a `StorePageDoc` has `kind`, a `PageDoc` never has).
 */
import { z } from "zod";
import { AssetRef, Locale, PageDoc, SectionInstance } from "@/lib/page/schema";
import { isStoreSectionType, KIND_RULES, SINGLETON_STORE_SECTIONS } from "./kinds";
import { storeDocExtraIssues, storeSectionIssue } from "./sections/check";

export const STORE_PAGE_KINDS = ["home", "product", "collection", "page", "search", "cart", "checkout", "not_found"] as const;
export type StorePageKind = (typeof STORE_PAGE_KINDS)[number];
export const isStorePageKind = (v: unknown): v is StorePageKind => typeof v === "string" && (STORE_PAGE_KINDS as readonly string[]).includes(v);

/** Every `pages.kind` value that holds a document (`policy` is reserved: no page row, STO-§3.1). */
export type PageKind = "landing" | StorePageKind;

/** A row id (ULID, Crockford alphabet: src/lib/db/ids.ts newId). */
export const Ulid = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

/** The store's served policy pages (`/policies/<kind>`, STO-§7.5; core §C.4.1). R2 contract step C2-E. */
export const STORE_POLICY_KINDS = ["privacy", "terms", "shipping", "returns", "contact"] as const;
export type StorePolicyKind = (typeof STORE_POLICY_KINDS)[number];

/**
 * A menu or announcement link, resolved at render by S1's `resolveLinks` (STO-§8.2; frozen at the R2 contract step
 * C2-E for the `storefront` setting's first schema): a dead target (archived, deleted, unpublished) is dropped from the
 * rendered menu and listed as a warning. `url` is https only (external, `rel="noopener"` + `target="_blank"`).
 */
export const LinkRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("home") }),
  z.object({ kind: z.literal("search") }),
  z.object({ kind: z.literal("cart") }),
  z.object({ kind: z.literal("track") }),
  z.object({ kind: z.literal("collection"), id: Ulid }),
  z.object({ kind: z.literal("product"), id: Ulid }),
  z.object({ kind: z.literal("page"), id: Ulid }),
  z.object({ kind: z.literal("landing"), id: Ulid }),
  z.object({ kind: z.literal("policy"), policy: z.enum(STORE_POLICY_KINDS) }),
  z.object({ kind: z.literal("url"), url: z.url({ protocol: /^https$/ }).max(500) }),
]);
export type LinkRef = z.infer<typeof LinkRefSchema>;

export const StoreSectionInstance = SectionInstance.extend({
  /** product context for a landing section on a product-free kind (home, page): the product it talks about */
  bind: z.object({ productId: Ulid }).strict().optional(),
});
export type StoreSectionInstance = z.infer<typeof StoreSectionInstance>;

export const StorePageSeo = z.object({
  title: z.string().max(70).optional(),
  description: z.string().max(170).optional(),
  ogImage: AssetRef.optional(),
  noindex: z.boolean().default(false),
});
export type StorePageSeo = z.infer<typeof StorePageSeo>;

/** The object schema without the kind rules (the editor's partial reads; writes and reads go through StorePageDoc). */
export const StorePageDocBase = z.object({
  v: z.literal(1),
  kind: z.enum(STORE_PAGE_KINDS),
  /** = stores.default_locale in R2 (siblings in R3, STO-§19.7) */
  locale: Locale,
  /** custom pages: the H1 and admin name; templates: unused */
  title: z.string().max(120).default(""),
  sections: z.array(StoreSectionInstance).max(40),
  /** home and custom pages; product / collection SEO comes from their rows */
  seo: StorePageSeo.default(() => ({ noindex: false })),
});
export type StorePageDoc = z.infer<typeof StorePageDocBase>;
export type StorePageDocInput = z.input<typeof StorePageDocBase>;

type Issue = (path: (string | number)[], message: string) => void;

/** The STO-§6.1 "Extra rules" on one document (structural; S1's section rules through ./sections/check.ts). */
export function storeDocIssues(doc: StorePageDoc, c: z.RefinementCtx): void {
  const issue: Issue = (path, message) => c.addIssue({ code: "custom", path, message });
  const rule = KIND_RULES[doc.kind];
  const sections = doc.sections;
  if (sections.length < rule.minSections) issue(["sections"], `A ${doc.kind} page holds at least ${rule.minSections} section(s).`);
  if (sections.length > rule.maxSections) issue(["sections"], `A ${doc.kind} page holds at most ${rule.maxSections} sections.`);
  const ids = new Set<string>();
  const seen = new Map<string, number>();
  sections.forEach((s, i) => {
    if (ids.has(s.id)) issue(["sections", i, "id"], `Duplicate section id "${s.id}".`);
    ids.add(s.id);
    seen.set(s.type, (seen.get(s.type) ?? 0) + 1);
    if (isStoreSectionType(s.type)) {
      if (!rule.store.includes(s.type)) issue(["sections", i, "type"], `"${s.type}" is not allowed on a ${doc.kind} page.`);
      if (s.type === "productGrid") {
        const src = (s.data as { source?: { kind?: unknown } }).source?.kind;
        if (typeof src === "string" && !(rule.gridSources as readonly string[]).includes(src)) issue(["sections", i, "data", "source"], `A product grid on a ${doc.kind} page cannot use "${src}".`);
      }
      if (s.bind) issue(["sections", i, "bind"], "Only a landing section takes a bound product.");
    } else {
      if (rule.landing === "none") issue(["sections", i, "type"], `A ${doc.kind} page holds no landing section.`);
      if (s.bind && rule.landing !== "free+bound") issue(["sections", i, "bind"], `A ${doc.kind} page takes no bound product.`);
    }
    const own = storeSectionIssue(s, doc.kind);
    if (own) issue(["sections", i], own);
  });
  for (const type of SINGLETON_STORE_SECTIONS) if ((seen.get(type) ?? 0) > 1) issue(["sections"], `"${type}" appears more than once.`);
  for (const type of rule.required) if (!seen.has(type)) issue(["sections"], `A ${doc.kind} page needs its "${type}" section.`);
  if (rule.first && sections[0]?.type !== rule.first) issue(["sections", 0], `"${rule.first}" is the first section of a ${doc.kind} page.`);
  for (const x of storeDocExtraIssues(doc)) issue(x.path, x.message);
}

/** Every read and write of a store document: the object schema plus the kind rules. */
export const StorePageDoc = StorePageDocBase.superRefine(storeDocIssues);

/** Discriminated read of `pages.draft` / `page_versions.doc` (request STO-R2). */
export type AnyPageDoc = { kind: "landing"; doc: PageDoc } | { kind: StorePageKind; doc: StorePageDoc };

/**
 * `pages.kind` + the stored JSON → the typed document, or null when the JSON is not a valid document of that kind
 * (a store kind whose doc says another kind is null too). Landing documents go through `PageDoc` (v1 → v2 upgrade and
 * repairs), exactly as the landing readers parse them.
 */
export function readPageDoc(kind: string, raw: unknown): AnyPageDoc | null {
  if (kind === "landing") {
    const r = PageDoc.safeParse(raw);
    return r.success ? { kind: "landing", doc: r.data } : null;
  }
  if (!isStorePageKind(kind)) return null;
  const r = StorePageDoc.safeParse(raw);
  return r.success && r.data.kind === kind ? { kind, doc: r.data } : null;
}

/** A value typed `PageDoc | StorePageDoc` is the store document (it has `kind`; a PageDoc never has). No parse. */
export const isStorePageDoc = (d: PageDoc | StorePageDoc): d is StorePageDoc => typeof (d as { kind?: unknown }).kind === "string";
/** A value typed `PageDoc | StorePageDoc` is the landing document. No parse. */
export const isLandingDoc = (d: PageDoc | StorePageDoc): d is PageDoc => !isStorePageDoc(d);

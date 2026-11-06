/**
 * Legal documents of a landing page (privacy, terms of sale, shipping & returns, contact; `returns` once served).
 *
 *   <LegalBody ctx={ctx} kind="privacy" updatedAt={iso} policy={input} />     (wrapped by LegalDocument in ../document)
 *   legalNav(ctx)                  → [{ kind, label, href }] links to the documents (footers, thank-you page)
 *   legalGaps(ctx)                 → store details still missing ("ICE (15 chiffres)", …) for admin warnings
 *   legalPolicyGaps(ctx, input)    → policy answers still missing ("nombre de jours", …): "answer these in Policies"
 *   legalReviewNotes(ctx)          → the template's lines quoting the law, listed as "needs legal review" (core D39)
 * Styles: ./legal.css (compiled into legalCss by scripts/build-landing-assets.mjs).
 */
import type { RenderContext } from "../types";
import { legalTexts, type LegalTexts } from "./content";
import { gapsOf, reviewNotesOf, type LegalTextKind } from "./model";
import type { LegalPolicyInput } from "./policy";

export { LegalBody, LEGAL_ORDER, legalNav, legalTitle, type LegalBodyProps } from "./LegalBody";
export { contactChannels, displayWhatsapp, legalChrome, legalLang, legalText, legalTexts, RETURNS_SERVED, type LegalLang, type LegalTexts } from "./content";
export type { Block, Inline, LegalChrome, LegalKind, LegalSection, LegalText, LegalTextKind } from "./model";
export { resolveLegalPolicy, type LegalPolicy, type LegalPolicyInput } from "./policy";

const kindsOf = (texts: LegalTexts) => Object.keys(texts) as LegalTextKind[];

/** Every gap (missing store detail) across the documents, in the page language. */
export function legalGaps(ctx: RenderContext): string[] {
  const texts = legalTexts(ctx);
  const out = new Set<string>();
  for (const k of kindsOf(texts)) for (const g of gapsOf(texts[k])) out.add(g);
  return [...out];
}

/** Every policy answer the documents still miss, in the page language (each card unset gives its gaps here). */
export function legalPolicyGaps(ctx: RenderContext, policy: LegalPolicyInput | null): string[] {
  const texts = legalTexts(ctx, policy);
  const out = new Set<string>();
  for (const k of kindsOf(texts)) for (const g of gapsOf(texts[k], "policies")) out.add(g);
  return [...out];
}

/** The lines of the legal template that quote the law, once each, in the page language ("needs legal review"). */
export function legalReviewNotes(ctx: RenderContext): string[] {
  const texts = legalTexts(ctx);
  const out = new Set<string>();
  for (const k of kindsOf(texts)) for (const n of reviewNotesOf(texts[k])) out.add(n);
  return [...out];
}

/**
 * The COD line (landing.md LAN-§3.5 OF7, core §M.2 C2): the reassurance string the order form prints once under its
 * submit, exported for the hero price block (P6 renders it under the hero price, inside the fold). One function, so
 * the two occurrences are always the same words: the form section's own `reassurance`, else the page's
 * `form.reassurance`, else the built-in "Vous ne payez qu'à la réception" of the page language. Pure, isomorphic.
 */
import type { PageDoc } from "@/lib/page/schema";
import { createT } from "../../i18n";

export function codLineFor(doc: PageDoc): string {
  const own = doc.sections.find((s) => s.type === "orderForm")?.data.reassurance;
  return (typeof own === "string" ? own.trim() : "") || doc.form.reassurance?.trim() || createT(doc.locale)("form.reassurance");
}

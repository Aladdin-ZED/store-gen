/**
 * Legal document model — structured, framework-free content rendered by LegalBody.tsx.
 * Text is plain strings (React escapes them); links are built here from validated store data only.
 *
 * Two markers carry what the merchant still owes (landing.md LAN-§3.3, LD29):
 *  - a gap (`ph`) is information the merchant has not given: a store detail (`area: "store"`, Settings → Store) or a
 *    policy answer (`area: "policies"`, Settings → Policies); it renders as a highlighted "to complete" run, never as
 *    a promise;
 *  - `review: true` on a paragraph or callout marks a line of the legal template that quotes the law (the Moroccan
 *    withdrawal right of loi n° 31-08, the legal guarantee): shoppers read it as written, the admin lists it as
 *    "needs legal review" (`reviewNotesOf`).
 */
import type { LegalKind } from "../context";

export type { LegalKind } from "../context";

/**
 * Every document this part writes: the served kinds of `LEGAL_KINDS` plus `returns`, which is served once the
 * maintainer widens `LEGAL_KINDS` (CCR docs/saas/ccr/r1-p3-2.md, P0b P3-4); until then the shipping page carries the
 * returns sections itself.
 */
export type LegalTextKind = LegalKind | "returns";

/** One run of inline content. `ph` = information the merchant still has to provide (shown as a marked gap). */
export type Inline =
  | string
  | { kind: "b"; text: string }
  | { kind: "ph"; label: string; area?: "store" | "policies" }
  | { kind: "link"; text: string; href: string; external?: boolean };

export type Block =
  | { kind: "p"; content: Inline[]; review?: true }
  | { kind: "list"; items: Inline[][] }
  /** label → value ledger (identity, delivery facts) */
  | { kind: "facts"; rows: { label: string; value: Inline[] }[] }
  | { kind: "callout"; icon: "cash-hand" | "shield-check" | "info" | "return" | "truck"; content: Inline[]; review?: true };

export interface LegalSection {
  /** anchor id (ASCII, unique in the document) */
  id: string;
  title: string;
  blocks: Block[];
}

export interface LegalText {
  kind: LegalTextKind;
  title: string;
  /** "in short" lines shown in the hero card */
  summary: Inline[][];
  sections: LegalSection[];
}

/** Page chrome strings of the legal documents. */
export interface LegalChrome {
  kicker: string;
  updated: string;
  toc: string;
  inShort: string;
  back: string;
  questions: string;
  questionsText: string;
  whatsapp: string;
  call: string;
  email: string;
  /** prefix read by screen readers before a gap the merchant must complete */
  todo: string;
  documents: string;
  identity: string;
  cod: string;
}

export const b = (text: string): Inline => ({ kind: "b", text });
/** A store detail the merchant still has to give (Settings → Store). */
export const ph = (label: string): Inline => ({ kind: "ph", label });
/** A policy answer the merchant has not given (Settings → Policies): the visible gap line of LAN-§3.3. */
export const gap = (label: string): Inline => ({ kind: "ph", label, area: "policies" });
export const link = (text: string, href: string, external = false): Inline => ({ kind: "link", text, href, external });
export const p = (...content: Inline[]): Block => ({ kind: "p", content });
/** A line of the legal template quoting the law: shown as written, listed for the merchant as "needs legal review". */
export const law = (...content: Inline[]): Block => ({ kind: "p", content, review: true });
export const list = (...items: Inline[][]): Block => ({ kind: "list", items });
export const callout = (icon: Extract<Block, { kind: "callout" }>["icon"], ...content: Inline[]): Block => ({ kind: "callout", icon, content });

function scanInlines(text: LegalText, visit: (xs: readonly Inline[], block: Block | null) => void): void {
  for (const line of text.summary) visit(line, null);
  for (const s of text.sections) {
    for (const blk of s.blocks) {
      if (blk.kind === "p" || blk.kind === "callout") visit(blk.content, blk);
      else if (blk.kind === "list") blk.items.forEach((x) => visit(x, blk));
      else blk.rows.forEach((r) => visit(r.value, blk));
    }
  }
}

/**
 * Every gap left in a document: the store details by default (admin warnings: "complete your store details"), the
 * policy answers with `area: "policies"` ("answer these in Policies").
 */
export function gapsOf(text: LegalText, area: "store" | "policies" = "store"): string[] {
  const out = new Set<string>();
  scanInlines(text, (xs) => {
    for (const x of xs) if (typeof x !== "string" && x.kind === "ph" && (x.area ?? "store") === area) out.add(x.label);
  });
  return [...out];
}

const plain = (xs: readonly Inline[]) => xs.map((x) => (typeof x === "string" ? x : x.kind === "ph" ? x.label : x.text)).join("");

/** The legal template's lines that quote the law, as plain text: what the admin flags "needs legal review". */
export function reviewNotesOf(text: LegalText): string[] {
  const out: string[] = [];
  scanInlines(text, (xs, block) => {
    if (block && (block.kind === "p" || block.kind === "callout") && block.review) out.push(plain(xs));
  });
  return out;
}

/**
 * Markdown-lite (platform.md PLA-§13.6): the one text format of legal documents, staff notes and (R3) broadcasts.
 * Pure and isomorphic; the output is React elements, never HTML (no `dangerouslySetInnerHTML` anywhere), so a
 * `<script>` in a document is text.
 *
 *   renderMarkdownLite("## Returns\nWithin **7 days**, see [the form](https://example.ma/form).")
 *   renderMarkdownLite(template, { placeholders: { fields: POLICY_TEMPLATE_FIELDS, value: (f) => facts[f] ?? null } })
 *   toPlainText(note)                                              // previews and list cells
 *
 * Allowed: paragraphs (a single line break inside one is kept), `#` / `##` / `###` headings, `-` and `1.` lists,
 * `**bold**`, `*italic*` (nested either way), `` `code` ``, links `[text](https://…)` (https only; `rel="noopener
 * noreferrer nofollow"`, `target="_blank"`; any other scheme renders its text without a link) and, for store templates
 * only, `{{field}}` placeholders of the fields the caller allows (otherwise they stay literal text). A backslash
 * escapes a marker (`\*`). Everything else is text: no raw HTML, no images, no autolinks.
 */
import { Fragment, createElement, type ReactNode } from "react";

export type MdInline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "strong"; c: MdInline[] }
  | { t: "em"; c: MdInline[] }
  | { t: "link"; href: string; c: MdInline[] }
  | { t: "field"; name: string }
  | { t: "br" };
export type MdBlock =
  | { t: "p"; c: MdInline[] }
  | { t: "h"; level: 1 | 2 | 3; c: MdInline[] }
  | { t: "ul"; items: MdInline[][] }
  | { t: "ol"; start: number; items: MdInline[][] };

export interface MarkdownLiteOptions {
  /** store templates only (PLA-§13.6): the `{{field}}` names that are placeholders; others stay literal text */
  placeholders?: { fields: readonly string[]; value?: (field: string) => string | null };
  /** the element `#` renders as (default 2: the page around a document owns its h1) */
  headingBase?: 1 | 2;
}

/** PLA-§L: a legal document body is at most 200,000 characters; anything past it is not rendered. */
export const MARKDOWN_LITE_MAX = 200_000;
/** nested emphasis deeper than this renders as text */
const MAX_DEPTH = 8;
const ESCAPABLE = new Set(["\\", "`", "*", "_", "[", "]", "(", ")", "{", "}", "#", "-", ".", "!"]);
const FIELD_RE = /^[A-Za-z][A-Za-z0-9_.]{0,63}$/;

/* ------------------------------------------------------------------ */
/* Inline                                                              */
/* ------------------------------------------------------------------ */

/** an https URL with no whitespace or control characters, or null */
function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (!/^https:\/\//i.test(url) || /[\s\u0000-\u001f\u007f<>"'`]/.test(url) || url.length > 2_000) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

interface Scan {
  fields: ReadonlySet<string> | null;
  inLink: boolean;
}

/**
 * Inline nodes of one block's text. Each delimiter search that fails is remembered for the rest of this text (the
 * scan only moves forward), so unclosed markers cost one pass each, never a quadratic re-scan.
 */
function parseInline(text: string, scan: Scan, depth: number): MdInline[] {
  if (depth > MAX_DEPTH) return [{ t: "text", v: text }];
  const out: MdInline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ t: "text", v: buf });
    buf = "";
  };
  const failedFrom = new Map<string, number>();
  const find = (kind: string, from: number, search: () => number): number => {
    const failed = failedFrom.get(kind);
    if (failed !== undefined && from >= failed) return -1;
    const at = search();
    if (at === -1) failedFrom.set(kind, from);
    return at;
  };
  const n = text.length;
  let i = 0;
  while (i < n) {
    const ch = text[i]!;
    if (ch === "\\" && i + 1 < n && ESCAPABLE.has(text[i + 1]!)) {
      buf += text[i + 1];
      i += 2;
      continue;
    }
    if (ch === "\n") {
      flush();
      out.push({ t: "br" });
      i++;
      continue;
    }
    if (ch === "`") {
      const end = find("`", i + 1, () => text.indexOf("`", i + 1));
      if (end > i + 1) {
        flush();
        out.push({ t: "code", v: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    } else if (ch === "*" && text[i + 1] === "*") {
      // the closing "**" is the first one not followed by a third "*" ("***x***" = strong(em(x)))
      const end = find("**", i + 2, () => {
        let j = text.indexOf("**", i + 2);
        while (j !== -1 && text[j + 2] === "*") j = text.indexOf("**", j + 1);
        return j;
      });
      if (end > i + 2 && !/\s/.test(text[i + 2]!)) {
        flush();
        out.push({ t: "strong", c: parseInline(text.slice(i + 2, end), scan, depth + 1) });
        i = end + 2;
        continue;
      }
    } else if (ch === "*") {
      // a single "*" closes at the next single "*", stepping over "**…**" pairs inside ("*a **b** c*")
      const end = find("*", i + 1, () => {
        let k = i + 1;
        while (k < n) {
          if (text.startsWith("**", k)) {
            const close = text.indexOf("**", k + 2);
            if (close === -1) return -1;
            k = close + 2;
          } else if (text[k] === "*") return k;
          else k++;
        }
        return -1;
      });
      if (end > i + 1 && !/\s/.test(text[i + 1]!) && !/\s/.test(text[end - 1]!)) {
        flush();
        out.push({ t: "em", c: parseInline(text.slice(i + 1, end), scan, depth + 1) });
        i = end + 1;
        continue;
      }
    } else if (ch === "[" && !scan.inLink) {
      const close = find("]", i + 1, () => text.indexOf("]", i + 1));
      if (close > i && text[close + 1] === "(") {
        const paren = find(")", close + 2, () => text.indexOf(")", close + 2));
        if (paren !== -1) {
          flush();
          const label = parseInline(text.slice(i + 1, close), { ...scan, inLink: true }, depth + 1);
          const href = safeHref(text.slice(close + 2, paren));
          // a refused scheme keeps the words and drops the target
          if (href) out.push({ t: "link", href, c: label });
          else out.push(...label);
          i = paren + 1;
          continue;
        }
      }
    } else if (ch === "{" && text[i + 1] === "{") {
      const end = find("}}", i + 2, () => text.indexOf("}}", i + 2));
      const name = end === -1 ? "" : text.slice(i + 2, end).trim();
      if (end !== -1 && scan.fields && FIELD_RE.test(name) && scan.fields.has(name)) {
        flush();
        out.push({ t: "field", name });
        i = end + 2;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

/* ------------------------------------------------------------------ */
/* Blocks                                                              */
/* ------------------------------------------------------------------ */

const HEADING_RE = /^(#{1,3})[ \t]+(.+?)[ \t#]*$/;
const UL_RE = /^[ \t]{0,3}-[ \t]+(.*)$/;
const OL_RE = /^[ \t]{0,3}(\d{1,6})\.[ \t]+(.*)$/;
const CONTINUATION_RE = /^[ \t]{2,}\S/;

/** The block tree of a source (pure; exported for the selftest and for previews that need the structure). */
export function parseMarkdownLite(src: string, opts: Pick<MarkdownLiteOptions, "placeholders"> = {}): MdBlock[] {
  const scan: Scan = { fields: opts.placeholders ? new Set(opts.placeholders.fields) : null, inLink: false };
  const lines = src.slice(0, MARKDOWN_LITE_MAX).replace(/\r\n?/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  let list: { t: "ul" | "ol"; start: number; items: string[][] } | null = null;
  const closePara = () => {
    if (para.length) blocks.push({ t: "p", c: parseInline(para.join("\n"), scan, 0) });
    para = [];
  };
  const closeList = () => {
    if (!list) return;
    const items = list.items.map((item) => parseInline(item.join("\n"), scan, 0));
    blocks.push(list.t === "ul" ? { t: "ul", items } : { t: "ol", start: list.start, items });
    list = null;
  };
  for (const line of lines) {
    if (line.trim() === "") {
      closePara();
      closeList();
      continue;
    }
    const h = HEADING_RE.exec(line);
    if (h) {
      closePara();
      closeList();
      blocks.push({ t: "h", level: h[1]!.length as 1 | 2 | 3, c: parseInline(h[2]!, scan, 0) });
      continue;
    }
    const ul = UL_RE.exec(line);
    const ol = ul ? null : OL_RE.exec(line);
    if (ul || ol) {
      closePara();
      const kind = ul ? "ul" : "ol";
      if (list && list.t !== kind) closeList();
      list ??= { t: kind, start: ol ? Number(ol[1]) : 1, items: [] };
      list.items.push([(ul ? ul[1] : ol![2])!]);
      continue;
    }
    if (list && CONTINUATION_RE.test(line)) {
      list.items[list.items.length - 1]!.push(line.trim());
      continue;
    }
    closeList();
    para.push(line.trim());
  }
  closePara();
  closeList();
  return blocks;
}

/* ------------------------------------------------------------------ */
/* Output                                                              */
/* ------------------------------------------------------------------ */

function renderInline(nodes: MdInline[], opts: MarkdownLiteOptions, key: string): ReactNode[] {
  return nodes.map((node, i) => {
    const k = `${key}.${i}`;
    switch (node.t) {
      case "text":
        return node.v;
      case "br":
        return createElement("br", { key: k });
      case "code":
        return createElement("code", { key: k }, node.v);
      case "strong":
        return createElement("strong", { key: k }, ...renderInline(node.c, opts, k));
      case "em":
        return createElement("em", { key: k }, ...renderInline(node.c, opts, k));
      case "link":
        return createElement("a", { key: k, href: node.href, rel: "noopener noreferrer nofollow", target: "_blank" }, ...renderInline(node.c, opts, k));
      case "field": {
        const value = opts.placeholders?.value?.(node.name) ?? null;
        return createElement("span", { key: k, "data-field": node.name, className: value === null ? "md-field md-field-empty" : "md-field" }, value ?? `{{${node.name}}}`);
      }
    }
  });
}

/** React elements for a source (PLA-§13.6). Never HTML strings; React escapes every text node and attribute. */
export function renderMarkdownLite(src: string, opts: MarkdownLiteOptions = {}): ReactNode {
  const base = opts.headingBase ?? 2;
  const children = parseMarkdownLite(src, opts).map((block, i) => {
    const k = `b${i}`;
    switch (block.t) {
      case "p":
        return createElement("p", { key: k }, ...renderInline(block.c, opts, k));
      case "h":
        return createElement(`h${Math.min(6, block.level + base - 1)}`, { key: k }, ...renderInline(block.c, opts, k));
      case "ul":
      case "ol":
        return createElement(
          block.t,
          block.t === "ol" && block.start !== 1 ? { key: k, start: block.start } : { key: k },
          ...block.items.map((item, j) => createElement("li", { key: `${k}.${j}` }, ...renderInline(item, opts, `${k}.${j}`))),
        );
    }
  });
  return createElement(Fragment, null, ...children);
}

function inlineText(nodes: MdInline[], opts: MarkdownLiteOptions): string {
  return nodes
    .map((node) => {
      switch (node.t) {
        case "text":
        case "code":
          return node.v;
        case "br":
          return "\n";
        case "field":
          return opts.placeholders?.value?.(node.name) ?? `{{${node.name}}}`;
        default:
          return inlineText(node.c, opts);
      }
    })
    .join("");
}

/** The words of a source without markers, one block per line (previews, list cells, notification bodies). */
export function toPlainText(src: string, opts: Pick<MarkdownLiteOptions, "placeholders"> = {}): string {
  return parseMarkdownLite(src, opts)
    .map((block) => {
      switch (block.t) {
        case "p":
        case "h":
          return inlineText(block.c, opts);
        case "ul":
          return block.items.map((item) => `- ${inlineText(item, opts)}`).join("\n");
        case "ol":
          return block.items.map((item, j) => `${block.start + j}. ${inlineText(item, opts)}`).join("\n");
      }
    })
    .join("\n");
}

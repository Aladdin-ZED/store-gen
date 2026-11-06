/**
 * RichText — renders copy strings with the tiny safe markup (*emphasis*, **strong**, and in block
 * mode paragraphs / line breaks / "- " bullets). Never uses dangerouslySetInnerHTML.
 *
 * *Emphasis* → <em class="lp-em" data-reveal="draw"> made of word boxes (.lp-em__w). base.css
 * switches the treatment with html[data-emphasis]:
 *   swoosh    — one clean underline stroke under the whole emphasis (an SVG slice per word,
 *               drawn on when the em scrolls into view, see emphasis.ts)
 *   highlight — a rounded highlighter block behind each word that wipes in
 *   color     — the section accent (underlined in running text for contrast)
 *   italic    — the emphasis face in italic (Latin serif; the theme switches Arabic to color)
 * Words are separate inline-blocks so long emphasis still wraps on phones. Very long emphasis and
 * tiny UI text (decorate={false}) use the CSS-only `.lp-em--plain` equivalents.
 *
 * `split` wraps every word in .lp-word (with --wi = its index) so a heading can reveal word by word
 * (blur-to-sharp + rise, staggered — DESIGN.md §6). Numeric expressions that must keep their order
 * in Arabic ("24–48", "−30%") are glued and isolated in <bdi> before anything is split.
 *
 * Bidi: word boxes are inline-blocks, and the bidi algorithm sees an inline-block as one neutral
 * object that takes the page's direction. A run of words written the other way (a Latin product name
 * on an Arabic page) would come out in reverse word order — "Abaya de prière" reading "prière de
 * Abaya". So every such run is isolated in its own direction before it is split: an emphasis made
 * only of that run takes the run's direction itself (<em dir="ltr">, its stroke drawn left to right),
 * a run inside a mixed emphasis or a split heading is wrapped in <bdi dir="ltr"> (.lp-em__run), and
 * the stroke keeps flowing with the page across it (its slices are dealt in visual order).
 *
 * Typography (Latin pages): a straight apostrophe between letters becomes the typographic ’; on
 * French pages the space before ! ? ; : » (and after «) becomes a narrow no-break space, so the mark
 * can never be stranded alone at the start of a line ("c'est noté !" → "c’est noté !").
 *
 * Under a look (`doc.theme.look`, design.md DES-§4.5.4, DES-§10.5; T2, T7), and only then, so a document without one
 * keeps its markup byte for byte:
 *  - Arabic: a particle typed as its own word (من في على إلى عن مع و) and a ب / ل / ك clitic typed with a space are
 *    bound to the next word with U+00A0, so no line ends on a particle;
 *  - Arabic: a Latin run inside the text ("Argan Oil Pure 30 ml") is isolated in <bdi dir="ltr"> in plain text too,
 *    its closing sentence punctuation left outside;
 *  - reveals are whole lines: `split` never cuts Arabic into .lp-word boxes, and a look whose reveal scope is "none"
 *    splits nothing (callers keep the word split for Latin display ≥ 48 px inside the heads scope).
 */
import { Fragment, type ReactNode } from "react";
import type { RenderContext } from "../types";
import { SWOOSH_H, swooshSlices } from "./emphasis";
import { inlineText, parseBlocks, parseInline, type InlineNode } from "./markup";
import { cssVars, cx, editAttr, reveal, type RevealKind } from "./util";

export type TextTag =
  | "span"
  | "p"
  | "div"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "strong"
  | "small"
  | "blockquote"
  | "figcaption"
  | "li"
  | "dd"
  | "dt"
  | "label"
  | "cite"
  | "q"
  | "legend";

/** Tags that may only contain phrasing content (no <p>/<ul> inside). */
const PHRASING_ONLY = new Set<TextTag>([
  "span",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "strong",
  "small",
  "label",
  "cite",
  "q",
  "dt",
  "legend",
]);

export interface RichTextProps {
  text: string | null | undefined;
  ctx: RenderContext;
  /** element to render (default: span inline, div in block mode) */
  as?: TextTag;
  /** paragraphs, line breaks and bullet lists */
  block?: boolean;
  className?: string;
  /** data path for click-to-edit in the builder preview */
  editPath?: string;
  id?: string;
  /** reveal kind for the whole text element */
  reveal?: RevealKind | false;
  /** reveal delay (ms) */
  delay?: number;
  /** draw the emphasis decorations (default true). Use false in tiny UI text. */
  decorate?: boolean;
  /**
   * Wrap each word in `.lp-word` (`--wi` = index) and mark the element `.lp-split`, so its reveal
   * runs word by word. Meant for headings; ignored in block mode.
   */
  split?: boolean;
}

/** Emphasis longer than this (chars / words) renders as a CSS-only treatment. */
const DECO_MAX_CHARS = 48;
const DECO_MAX_WORDS = 6;

interface RenderState {
  ctx: RenderContext;
  decorate: boolean;
  /** isolate numeric expressions (RTL pages) */
  rtl: boolean;
  /** stable seed prefix: same text + same field → same strokes on every render */
  seed: string;
  split: boolean;
  /** running word index for `split` (render-local counter) */
  wi: number;
  /** page locale (typographic rules) */
  locale: string;
  /** the document has a look (DES-§4.5.4): particle binding and Latin isolation in Arabic text */
  look: boolean;
}

/** Whether the document is rendered under a look (`doc.theme.look`): the new primitive defaults apply only then. */
export const lookOf = (ctx: Pick<RenderContext, "doc">): boolean => !!ctx.doc.theme.look;

export function RichText(props: RichTextProps): ReactNode {
  const { text, ctx, as, block = false, className, editPath, id, decorate = true } = props;
  if (!text || !text.trim()) return null;
  const look = lookOf(ctx);
  // under a look, reveals are whole lines: never a word split in Arabic, none at all without a reveal scope
  const split = !!props.split && !block && (!look || (ctx.locale !== "ar" && ctx.doc.theme.look?.mo.scope !== "none"));
  const state: RenderState = {
    ctx,
    decorate,
    rtl: ctx.dir === "rtl",
    seed: editPath ?? text.slice(0, 32),
    split,
    wi: 0,
    locale: ctx.locale,
    look,
  };
  const attrs = { id, ...editAttr(ctx, editPath), ...reveal(props.reveal, props.delay) };

  if (!block) {
    const Tag = as ?? "span";
    return (
      <Tag className={cx(split && "lp-split", className) || undefined} {...attrs}>
        {renderNodes(parseInline(text.trim()), state, "i")}
      </Tag>
    );
  }

  const blocks = parseBlocks(text);
  if (blocks.length === 0) return null;
  const only = blocks[0]!;
  if (blocks.length === 1 && only.t === "p" && (!as || PHRASING_ONLY.has(as) || as === "blockquote")) {
    const Tag = as ?? "p";
    return (
      <Tag className={className} {...attrs}>
        {renderNodes(only.c, state, "p")}
      </Tag>
    );
  }
  const Tag = as && !PHRASING_ONLY.has(as) ? as : "div";
  return (
    <Tag className={cx("lp-rt", className)} {...attrs}>
      {blocks.map((b, bi) =>
        b.t === "p" ? (
          <p key={bi}>{renderNodes(b.c, state, `p${bi}`)}</p>
        ) : (
          <ul key={bi} className="lp-rt__list" role="list">
            {b.items.map((item, li) => (
              <li key={li}>{renderNodes(item, state, `l${bi}.${li}`)}</li>
            ))}
          </ul>
        ),
      )}
    </Tag>
  );
}

function renderNodes(source: readonly InlineNode[], state: RenderState, key: string): ReactNode[] {
  const nodes = peelRunPunct(source, pageDir(state));
  // typography first (French no-break spaces before ":" etc. are part of the glued fragment)
  const typed = nodes.map((n, i) => {
    if (typeof n !== "string") return n;
    const t = typeset(n, state.locale);
    // an elision right before an emphasis ("l'*essayer*") is typographic too
    const next = nodes[i + 1];
    return state.locale !== "ar" && next && typeof next !== "string" && next.t === "em" ? t.replace(/(\p{L})'$/u, "$1’") : t;
  });
  const glue = glueAround(typed);
  return typed.map((n, i) => {
    const k = `${key}.${i}`;
    if (typeof n === "string") {
      const v = glue.text[i] ?? n;
      return v ? <Fragment key={k}>{renderText(v, state, k)}</Fragment> : null;
    }
    if (n.t === "br") return <br key={k} />;
    if (n.t === "strong")
      return (
        <strong key={k} className="lp-strong">
          {renderNodes(n.c, state, k)}
        </strong>
      );
    const lead = glue.lead[i];
    const tail = glue.tail[i];
    const em = renderEmphasis(n.c, state, k, !!(lead || tail));
    if (!lead && !tail) return em;
    // text written flush against the emphasis ("و*ساترة*", "l’*essayer*", "*X*:") travels with it: a
    // no-wrap glue box around fragment + emphasis (the emphasis itself still wraps between its words)
    return (
      <span key={k} className="lp-glue">
        {lead ? renderText(lead, state, `${k}.gl`) : null}
        {em}
        {tail ? renderText(tail, state, `${k}.gt`) : null}
      </span>
    );
  });
}

/**
 * Fragments glued to an emphasis: the last word of the text right before it when that text does not
 * end with a breakable space, and the first word of the text right after it when that text does not
 * start with one. Word boxes are atomic inlines, so a line may otherwise break at the box's edge and
 * cut a word in two ("و" | "مريحة"), or leave "," / ":" alone at the start of a line.
 * Returns the trimmed text of every string node, and the lead / tail fragment of every emphasis node.
 */
function glueAround(nodes: readonly InlineNode[]): { text: Record<number, string>; lead: Record<number, string>; tail: Record<number, string> } {
  const text: Record<number, string> = {};
  const lead: Record<number, string> = {};
  const tail: Record<number, string> = {};
  const isEm = (n: InlineNode | undefined) => !!n && typeof n !== "string" && n.t === "em";
  for (let i = 0; i < nodes.length; i++) {
    if (!isEm(nodes[i])) continue;
    const before = nodes[i - 1];
    if (typeof before === "string") {
      const cur = text[i - 1] ?? before;
      const parts = splitWords(cur);
      const last = parts[parts.length - 1];
      if (last && !last.ws) {
        lead[i] = last.v;
        text[i - 1] = cur.slice(0, cur.length - last.v.length);
      }
    }
    const after = nodes[i + 1];
    if (typeof after === "string") {
      const parts = splitWords(after);
      const first = parts[0];
      // a fragment that is itself followed by another emphasis stays its tail (the next one gets no lead)
      if (first && !first.ws) {
        tail[i] = first.v;
        text[i + 1] = after.slice(first.v.length);
      }
    }
  }
  return { text, lead, tail };
}

/**
 * Sentence punctuation closing an emphasis that ends on a word written against the page direction
 * ("رقّة الإطلالة: *Abaya de prière avec Dentelle.*" on an Arabic page) belongs to the page's
 * sentence, not to the Latin run: inside the run's left-to-right box it would sit on the run's right,
 * in the middle of the Arabic line. It moves out of the emphasis, right after it, where it travels
 * with it as a glued tail and lands at the sentence's logical end — exactly where plain text and
 * split headings put it ("*X*." already reads that way).
 */
function peelRunPunct(nodes: readonly InlineNode[], page: Dir): readonly InlineNode[] {
  const other: WordClass = page === "rtl" ? "L" : "R";
  let out: InlineNode[] | null = null;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    let peeled: { em: InlineNode; mark: string } | null = null;
    if (typeof n !== "string" && n.t === "em") {
      const last = n.c[n.c.length - 1];
      const tail = typeof last === "string" ? last.trimEnd() : "";
      const mark = RUN_PUNCT.exec(tail)?.[0] ?? "";
      if (mark && mark.length < tail.length) {
        const body = tail.slice(0, -mark.length);
        const words = splitWords(body).filter((p) => !p.ws);
        const lastWord = words[words.length - 1]?.v;
        if (lastWord && wordClass(lastWord) === other) peeled = { em: { ...n, c: [...n.c.slice(0, -1), body] }, mark };
      }
    }
    if (!peeled) {
      out?.push(n);
      continue;
    }
    out ??= nodes.slice(0, i);
    out.push(peeled.em);
    const next = nodes[i + 1];
    if (typeof next === "string") {
      out.push(peeled.mark + next);
      i++;
    } else out.push(peeled.mark);
  }
  return out ?? nodes;
}

/* ------------------------------------------------------------------ */
/* Numeric isolation & word splitting                                  */
/* ------------------------------------------------------------------ */

/**
 * Numeric expressions with a sign, range, ratio or time ("−30%", "24 – 48", "+212", "1/2", "10:30"),
 * and digit groups split by plain spaces (a phone "06 12 34 56 78", "1 240" typed with a space).
 * On RTL pages they are wrapped in <bdi dir="ltr">: without isolation the bidi algorithm reorders them
 * inside Arabic text ("48–24", "30%−"). The direction must be explicit — a dir=auto isolate without
 * strong letters inherits the page's RTL in current engines and reverses them all the same.
 * Plain numbers and decimals ("249", "4,7") render correctly already and stay bare text.
 */
const NUMERIC =
  /[+\-\u2212]?\d+(?:[.,\u00A0\u202F]\d+| \d+)*(?:\s?[\-\u2010-\u2015/:\u00D7]\s?[+\-\u2212]?\d+(?:[.,]\d+)*)*\s?%?/g;
/** a sign, range, ratio, time, percent — or digit groups split by spaces ("06 12 34 56 78") */
const NEEDS_ISOLATION = /[+\-\u2212\u2010-\u2015/:\u00D7%]|\d[ \u00A0\u202F]\d/;

/**
 * Spaces inside a numeric expression become no-break spaces: "24 – 48" can never wrap (a line
 * ending in "24 –" reads backwards in Arabic) nor be split into separate word boxes.
 */
function glueNumbers(s: string): string {
  if (!/\d/.test(s) || !s.includes(" ")) return s;
  return s
    .replace(NUMERIC, (m) => (NEEDS_ISOLATION.test(m) ? m.replace(/ (?=\S)/g, "\u00A0") : m))
    .replace(RANGE, (m) => (m.includes(" ") ? m.replace(/ /g, "\u00A0") : m));
}

/**
 * A numeric range with its short units ("24–48h", "24 – 48 h", "24 h – 48 h", "24h–48h", "3–5 j"):
 * glueNumbers turns its spaces into no-break spaces (one word: a split heading never separates
 * "24" from "h – 48"), and on a left-to-right page protectRanges sets it unbreakable — a line may
 * break right after an en dash, even before a no-break space (UAX #14 LB12a). A unit is a whole
 * short word: "3–5 jours" may still wrap before "jours".
 */
const RANGE = /\d[\d.,]*(?:[ \u00A0\u202F]?\p{L}{1,3}(?!\p{L}))?[ \u00A0\u202F]?[\u2010-\u2015][ \u00A0\u202F]?\d[\d.,]*(?:[ \u00A0\u202F]?\p{L}{1,3}(?!\p{L}))?/gu;

function protectRanges(s: string, key: string): ReactNode {
  if (!/\d[^\d]{0,5}[‐-―]/u.test(s)) return s;
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of s.matchAll(RANGE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(s.slice(last, at));
    out.push(
      <span key={`${key}.r${i++}`} className="lp-nobr">
        {m[0]}
      </span>,
    );
    last = at + m[0].length;
  }
  if (!out.length) return s;
  if (last < s.length) out.push(s.slice(last));
  return out;
}

function isolateNumbers(s: string, key: string): ReactNode {
  if (!/\d/.test(s)) return s;
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of s.matchAll(NUMERIC)) {
    const v = m[0].trimEnd();
    if (!NEEDS_ISOLATION.test(v)) continue;
    const at = m.index ?? 0;
    if (at > last) out.push(s.slice(last, at));
    out.push(
      <bdi key={`${key}.n${i++}`} className="lp-nobr" dir="ltr">
        {v}
      </bdi>,
    );
    last = at + v.length;
  }
  if (!out.length) return s;
  if (last < s.length) out.push(s.slice(last));
  return out;
}

/**
 * No-break spaces (U+00A0, U+2007 figure, U+202F narrow) are not word breaks: "249 DH" or "24 h"
 * written with one stays inside a single word and never splits across lines.
 */
const NO_BREAK = String.fromCharCode(0xa0, 0x2007, 0x202f);
const isBreakable = (ch: string) => /\s/.test(ch) && !NO_BREAK.includes(ch);

/** Split text into alternating word / breakable-whitespace pieces. */
function splitWords(s: string): { ws: boolean; v: string }[] {
  const out: { ws: boolean; v: string }[] = [];
  for (const ch of s) {
    const ws = isBreakable(ch);
    const last = out[out.length - 1];
    if (last && last.ws === ws) last.v += ch;
    else out.push({ ws, v: ch });
  }
  return out;
}

/** apostrophe between two letters (l'huile, c'est, don't) */
const APOSTROPHE = /(\p{L})'(?=\p{L})/gu;
/** French: a plain space before high punctuation / closing guillemet, after an opening one */
const FR_SPACE_BEFORE = / ([!?;:\u00BB])/g;
const FR_SPACE_AFTER = /\u00AB /g;
const FR_MARKS = /[!?;:\u00AB\u00BB]/;
/** narrow no-break space (U+202F) — splitWords() keeps it inside the word */
const NNBSP = "\u202F";

/** Locale typography on a text run: typographic apostrophes, French no-break punctuation spacing. */
function typeset(s: string, locale: string): string {
  if (locale === "ar") return s;
  let out = s.includes("'") ? s.replace(APOSTROPHE, "$1\u2019") : s;
  if (locale === "fr" && FR_MARKS.test(out)) {
    out = out.replace(FR_SPACE_BEFORE, `${NNBSP}$1`).replace(FR_SPACE_AFTER, `\u00AB${NNBSP}`);
  }
  return out;
}

/**
 * Arabic particles typed as their own word, and the ب / ل / ك clitics typed with a space: the space after one becomes
 * U+00A0 so the particle travels with the next word (DES-§4.5.4 RichText, T2). "و" counts as a particle only alone.
 * A run of particles binds as a chain ("و في الدار"), and a particle that ends a text run binds to the inline node after
 * it (the emphasis of "سهل من *أول* مرة").
 */
const NBSP_CH = String.fromCharCode(0xa0);
const AR_PARTICLE = /(?<=^|[\s («"“])(من|في|على|إلى|عن|مع|و|ب|ل|ك) (?=\S|$)/gu;
const bindParticles = (s: string) => (s.includes(" ") ? s.replace(AR_PARTICLE, `$1${NBSP_CH}`) : s);

/**
 * A plain Arabic text run under a look: each Latin run in its own <bdi dir="ltr"> (T7), the numbers outside the runs
 * isolated as before; sentence punctuation closing a run stays outside it, in the page's sentence.
 */
function isolateRuns(s: string, key: string): ReactNode {
  // every space separates words here, the no-break ones included: a bound particle ("مع Argan") stays outside the
  // Latin run it is glued to, so the run is still found and isolated
  const parts: { ws: boolean; v: string }[] = [];
  for (const ch of s) {
    const ws = /\s/.test(ch);
    const last = parts[parts.length - 1];
    if (last && last.ws === ws) last.v += ch;
    else parts.push({ ws, v: ch });
  }
  const runs = counterRuns(
    parts.map((p) => (p.ws ? "S" : wordClass(p.v))),
    "rtl",
  );
  if (!runs.length) return isolateNumbers(s, key);
  const text = (from: number, to: number) => parts.slice(from, to).map((p) => p.v).join("");
  const out: ReactNode[] = [];
  let i = 0;
  for (const [from, to] of runs) {
    const before = text(i, from);
    if (before) out.push(<Fragment key={`${key}.t${from}`}>{isolateNumbers(before, `${key}.n${from}`)}</Fragment>);
    const run = text(from, to);
    const punct = RUN_PUNCT.exec(run)?.[0] ?? "";
    const peel = punct && punct.length < run.length ? punct : "";
    out.push(
      <bdi key={`${key}.b${from}`} dir="ltr">
        {peel ? run.slice(0, -peel.length) : run}
      </bdi>,
    );
    if (peel) out.push(peel);
    i = to;
  }
  const rest = text(i, parts.length);
  if (rest) out.push(<Fragment key={`${key}.t${i}`}>{isolateNumbers(rest, `${key}.n${i}`)}</Fragment>);
  return out;
}

/** A plain text run: typography, glued numbers, then (RTL) isolates, then (split) one .lp-word per word. */
function renderText(raw: string, state: RenderState, key: string): ReactNode {
  const arLook = state.look && state.locale === "ar";
  const s = glueNumbers(typeset(arLook ? bindParticles(raw) : raw, state.locale));
  const piece = (v: string, k: string) => (state.rtl ? isolateNumbers(v, k) : protectRanges(v, k));
  if (!state.split) return arLook ? isolateRuns(s, key) : piece(s, key);
  const parts = splitWords(s);
  const box = (v: string, k: string) => (
    <span key={k} className="lp-word" style={cssVars({ "--wi": state.wi++ })}>
      {piece(v, k)}
    </span>
  );
  const word = (i: number) => {
    const p = parts[i]!;
    return p.ws ? p.v : box(p.v, `${key}.w${i}`);
  };
  // word boxes of a run written against the page direction read in their own order inside an isolate
  const page = pageDir(state);
  const runs = counterRuns(
    parts.map((p) => (p.ws ? "S" : wordClass(p.v))),
    page,
  );
  if (!runs.length) return parts.map((_, i) => word(i));
  const out: ReactNode[] = [];
  for (let i = 0, r = 0; i < parts.length; ) {
    const run = runs[r];
    if (run && run[0] === i) {
      // sentence punctuation closing the run ("…avec Dentelle." in Arabic copy) belongs to the page's
      // sentence: outside the isolate it lands where the bidi algorithm puts it in plain text (at the
      // sentence's end, on the page's side), glued to the run's last word so it never wraps alone
      const lastAt = run[1] - 1;
      const lastWord = parts[lastAt]!.v;
      const punct = RUN_PUNCT.exec(lastWord)?.[0] ?? "";
      const peel = punct && punct.length < lastWord.length ? punct : "";
      const inside: ReactNode[] = [];
      for (let j = run[0]; j < run[1]; j++) {
        const p = parts[j]!;
        if (j === lastAt && peel) inside.push(box(lastWord.slice(0, -peel.length), `${key}.w${j}`));
        else if (peel && p.ws) inside.push(breakableSpace(`${key}.s${j}`, p.v));
        else inside.push(word(j));
      }
      const iso = (
        <bdi key={`${key}.r${i}`} dir={against(page)}>
          {inside}
        </bdi>
      );
      out.push(
        peel ? (
          <span key={`${key}.g${i}`} className="lp-glue">
            {iso}
            {box(peel, `${key}.p${i}`)}
          </span>
        ) : (
          iso
        ),
      );
      i = run[1];
      r++;
    } else out.push(word(i++));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Bidi runs                                                           */
/* ------------------------------------------------------------------ */

type Dir = "ltr" | "rtl";

/**
 * Bidi class of one word: L = has a strong left-to-right letter (Latin, Greek, Cyrillic…), R = has a
 * right-to-left character (Hebrew, Arabic — Arabic-Indic digits included), D = digits only, N = other
 * (punctuation, symbols). "S" (a space between words) and "|" (a line break) only separate words.
 */
type WordClass = "L" | "R" | "D" | "N" | "S" | "|";

const RTL_CHAR = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;
const LTR_LETTER = /(?![\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}])\p{L}/u;
const DIGIT = /\p{Nd}/u;

function wordClass(s: string): WordClass {
  if (RTL_CHAR.test(s)) return "R";
  if (LTR_LETTER.test(s)) return "L";
  return DIGIT.test(s) ? "D" : "N";
}

/** sentence punctuation at the end of a word (Latin and Arabic marks; brackets and quotes excluded:
    they pair with a mark inside the run) */
const RUN_PUNCT = /[.,:;!?…،؛؟]+$/u;

const pageDir = (state: RenderState): Dir => (state.rtl ? "rtl" : "ltr");
const against = (d: Dir): Dir => (d === "rtl" ? "ltr" : "rtl");

/**
 * Index ranges [from, to) of `classes` that read against the page direction: maximal runs that start
 * and end on a strong word of the other direction, with the neutral words and spaces between them;
 * digits right after such a word stay with it, as the bidi algorithm does ("Abaya 2 en 1", "عباية 2").
 * A line break or a strong word of the page's own direction ends a run.
 */
function counterRuns(classes: readonly WordClass[], page: Dir): [number, number][] {
  const other = page === "rtl" ? "L" : "R";
  const runs: [number, number][] = [];
  let from = -1;
  let to = -1;
  const close = () => {
    if (from >= 0) runs.push([from, to]);
    from = -1;
  };
  for (let i = 0; i < classes.length; i++) {
    const c = classes[i]!;
    if (c === other) {
      if (from < 0) from = i;
      to = i + 1;
    } else if (c === "D") {
      // the last strong word was one of the run (a word of the page's direction closes it)
      if (from >= 0) to = i + 1;
    } else if (c === "R" || c === "L" || c === "|") close();
  }
  close();
  return runs;
}

/* ------------------------------------------------------------------ */
/* Emphasis                                                            */
/* ------------------------------------------------------------------ */

type Unit = { nodes: InlineNode[]; text: string };

/** Split emphasis content into word units (text split on breakable whitespace; nested nodes stay whole). */
function toUnits(nodes: readonly InlineNode[], locale: string, bind = false): (Unit | "br")[] {
  const out: (Unit | "br")[] = [];
  let cur: Unit | null = null;
  const close = () => {
    if (cur && cur.nodes.length) out.push(cur);
    cur = null;
  };
  for (const n of nodes) {
    if (typeof n === "string") {
      for (const { ws, v: part } of splitWords(glueNumbers(typeset(bind ? bindParticles(n) : n, locale)))) {
        if (ws) close();
        else {
          cur ??= { nodes: [], text: "" };
          cur.nodes.push(part);
          cur.text += part;
        }
      }
    } else if (n.t === "br") {
      close();
      out.push("br");
    } else {
      cur ??= { nodes: [], text: "" };
      cur.nodes.push(n);
      cur.text += inlineText(n.c);
    }
  }
  close();
  return out;
}

/**
 * A breakable space between word boxes inside a no-wrap glue box (white-space: normal on the space
 * itself): the glued fragment cannot be separated from its word, the words still wrap between them.
 */
const breakableSpace = (k: string, v = " ") => (
  <span key={k} className="lp-sp">
    {v}
  </span>
);

function renderEmphasis(nodes: InlineNode[], state: RenderState, k: string, glued = false): ReactNode {
  const full = inlineText(nodes).trim();
  const units = toUnits(nodes, state.locale, state.look && state.locale === "ar");
  const words = units.filter((u): u is Unit => u !== "br");

  if (!state.decorate || words.length === 0 || words.length > DECO_MAX_WORDS || full.length > DECO_MAX_CHARS) {
    return (
      <em key={k} className="lp-em lp-em--plain">
        {renderNodes(nodes, state, k)}
      </em>
    );
  }

  // runs of words written against the page direction (bidi, see the header). An emphasis that is one
  // such run takes its direction itself; otherwise each run gets an isolate of its own.
  const page = pageDir(state);
  const runs = counterRuns(
    units.map((u) => (u === "br" ? "|" : wordClass(u.text))),
    page,
  );
  const whole = runs.length === 1 && runs[0]![0] === 0 && runs[0]![1] === units.length;
  const runAt = new Map<number, [number, number]>(whole ? [] : runs.map((r) => [r[0], r]));
  /** index into `words` of every unit (-1 for a line break) */
  const wordAt: number[] = [];
  for (let n = 0, ui = 0; ui < units.length; ui++) wordAt.push(units[ui] === "br" ? -1 : n++);
  // the stroke runs in visual order along the emphasis: a run laid out against it is dealt backwards
  const order: number[] = [];
  for (let ui = 0; ui < units.length; ) {
    const r = runAt.get(ui);
    if (r) {
      for (let j = r[1] - 1; j >= r[0]; j--) order.push(wordAt[j]!);
      ui = r[1];
    } else {
      if (wordAt[ui]! >= 0) order.push(wordAt[ui]!);
      ui++;
    }
  }
  const at = new Array<number>(words.length);
  order.forEach((w, p) => (at[w] = p));
  const slices = swooshSlices(
    order.map((w) => [...words[w]!.text].length),
    state.ctx.rng(`em|${state.seed}|${k}|${full}`),
  );
  // the word units already carry the split, so nested text must not be split a second time
  const inner: RenderState = { ...state, split: false };
  const last = words.length - 1;
  const box = (u: Unit, ui: number): ReactNode => {
    const p = at[wordAt[ui]!]!;
    const sl = slices[p]!;
    return (
      // --i on every word (0 too): an inherited --i from a section's own stagger must not delay the stroke.
      // --s / --e mark where the stroke starts and ends (its overhangs and the band's rounded caps).
      <span
        key={`w${ui}`}
        className={cx("lp-em__w", p === 0 && "lp-em__w--s", p === last && "lp-em__w--e", state.split && "lp-word")}
        style={cssVars({ "--i": p, "--ef0": sl.f0, "--ef": sl.f, "--wi": state.split ? state.wi++ : undefined })}
      >
        {renderNodes(u.nodes, inner, `${k}.${ui}`)}
        <svg className="lp-em__deco" viewBox={`0 0 ${sl.w} ${SWOOSH_H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path className="lp-em__s" d={sl.d} pathLength={1} />
        </svg>
      </span>
    );
  };
  const out: ReactNode[] = [];
  for (let ui = 0; ui < units.length; ) {
    const u = units[ui]!;
    if (u === "br") {
      out.push(<br key={`b${ui}`} />);
      ui++;
      continue;
    }
    if (ui > 0 && units[ui - 1] !== "br") out.push(glued ? breakableSpace(`s${ui}`) : " ");
    const r = runAt.get(ui);
    if (r) {
      const inside: ReactNode[] = [];
      for (let j = r[0]; j < r[1]; j++) {
        if (j > r[0]) inside.push(glued ? breakableSpace(`s${j}`) : " ");
        inside.push(box(units[j] as Unit, j));
      }
      out.push(
        <bdi key={`r${ui}`} className="lp-em__run" dir={against(page)}>
          {inside}
        </bdi>,
      );
      ui = r[1];
    } else {
      out.push(box(u, ui));
      ui++;
    }
  }
  return (
    <em key={k} className={cx("lp-em", words.length > 1 && "lp-em--multi")} dir={whole ? against(page) : undefined} data-reveal="draw">
      {out}
    </em>
  );
}

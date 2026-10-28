/**
 * The template language of call scripts, WhatsApp and Telegram texts (P5 INTEGRATIONS; operations.md OPE-§7.1, §22.3,
 * OD24). Pure and isomorphic, no server import: client components (the template editors, P4's script editor, the
 * variable chips) import THIS file; server code imports ./templates.ts, which re-exports it with the order values.
 *
 *   "{var}"    inserts a variable of TEMPLATE_VARS
 *   "[[ … ]]"  an optional block, dropped when any variable inside it is empty (blocks do not nest)
 *   "{{" "}}"  literal braces
 *
 * No other syntax, no expressions. A single "[" or "]" is text. `parseTemplate` validates at save and answers
 * `unknown_var`, `unbalanced` or `too_long` with `at`, the UTF-16 index an editor puts its caret on. `renderTemplate`
 * never throws: it reads a broken source leniently (an unknown variable is empty, a stray brace or bracket is text), so
 * a row saved before a variable was renamed still renders. Rendering collapses the double spaces an empty variable
 * leaves and the doubled period of a value ending in an abbreviation ("nov." + "."), trims line ends and adds nothing
 * else (no markup, no bidi control characters, OPE-§22.3).
 */

/** rev 3 (OD55, OD49): the last three are appended, additive for P3's kit */
export const TEMPLATE_VARS = [
  "customer_first_name",
  "order_id",
  "product",
  "offer_label",
  "units_text",
  "qty",
  "total",
  "shipping_text",
  "city",
  "address",
  "landmark",
  "eta_text",
  "store_name",
  "agent_first_name",
  "confirm_number",
  "confirm_hours",
  "upsell_title",
  "upsell_price",
  "tracking_link",
  "order_count_today",
  "carrier_label",
  "carrier_tracking",
  "ship_after_date",
] as const;
export type TemplateVar = (typeof TEMPLATE_VARS)[number];
export type TemplateValues = Partial<Record<TemplateVar, string>>;

/** A template body is at most 1,000 characters (OPE-§L "Templates"); script lines pass their own lower cap. */
export const TEMPLATE_SRC_MAX = 1000;

export type TemplateText = { kind: "text"; text: string };
export type TemplateVarPart = { kind: "var"; name: TemplateVar };
export type TemplatePart = TemplateText | TemplateVarPart | { kind: "optional"; parts: (TemplateText | TemplateVarPart)[] };

export type TemplateError = "unknown_var" | "unbalanced" | "too_long";
export type TemplateParse = { ok: true; parts: TemplatePart[]; vars: TemplateVar[] } | { ok: false; error: TemplateError; at: number };

const VAR_SET: ReadonlySet<string> = new Set<string>(TEMPLATE_VARS);
export const isTemplateVar = (name: string): name is TemplateVar => VAR_SET.has(name);

/** `{name}` at the start of the slice: identifier characters only, ≤ 40 (the longest variable is 19). */
const VAR_AT = /^\{([A-Za-z0-9_]{1,40})\}/;

/** Lenient tokens: `name` may be unknown (rendered empty). */
type Leaf = { kind: "text"; text: string } | { kind: "var"; name: string };
type Token = Leaf | { kind: "optional"; parts: Leaf[] };

/** The UTF-16 index of the first code point past `max` code points, or -1 when `src` fits. */
function overflowAt(src: string, max: number): number {
  let n = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src.charCodeAt(i);
    if (c >= 0xdc00 && c <= 0xdfff && i > 0 && src.charCodeAt(i - 1) >= 0xd800 && src.charCodeAt(i - 1) <= 0xdbff) continue; // low surrogate of a pair
    if (++n > max) return i;
  }
  return -1;
}

/** One pass over the source. `strict` stops at the first error; lenient turns every error into text. */
function scan(src: string, strict: boolean): { ok: true; tokens: Token[] } | { ok: false; error: TemplateError; at: number } {
  const top: Token[] = [];
  let block: Leaf[] | null = null;
  let blockAt = -1;
  let buf = "";
  const flush = () => {
    if (!buf) return;
    (block ?? top).push({ kind: "text", text: buf });
    buf = "";
  };
  for (let i = 0; i < src.length; ) {
    const c = src[i]!;
    const next = src[i + 1];
    if ((c === "{" && next === "{") || (c === "}" && next === "}")) {
      buf += c;
      i += 2;
    } else if (c === "{") {
      const m = VAR_AT.exec(src.slice(i, i + 42));
      if (!m) {
        if (strict) return { ok: false, error: "unbalanced", at: i };
        buf += c;
        i++;
        continue;
      }
      if (strict && !isTemplateVar(m[1]!)) return { ok: false, error: "unknown_var", at: i };
      flush();
      (block ?? top).push({ kind: "var", name: m[1]! });
      i += m[0].length;
    } else if (c === "}") {
      if (strict) return { ok: false, error: "unbalanced", at: i };
      buf += c;
      i++;
    } else if (c === "[" && next === "[") {
      if (block) {
        if (strict) return { ok: false, error: "unbalanced", at: i };
        buf += "[[";
      } else {
        flush();
        block = [];
        blockAt = i;
      }
      i += 2;
    } else if (c === "]" && next === "]") {
      if (!block) {
        if (strict) return { ok: false, error: "unbalanced", at: i };
        buf += "]]";
      } else {
        flush();
        top.push({ kind: "optional", parts: block });
        block = null;
      }
      i += 2;
    } else {
      buf += c;
      i++;
    }
  }
  if (block) {
    if (strict) return { ok: false, error: "unbalanced", at: blockAt };
    // an unclosed block is text: "[[" and what followed it, in place
    flush();
    const opened: Leaf[] = block;
    block = null;
    top.push({ kind: "text", text: "[[" }, ...opened);
  }
  flush();
  return { ok: true, tokens: top };
}

/**
 * Validates a template (at save, in the editors, over the built-ins in tests). `max` defaults to the 1,000-character
 * body cap; `vars` lists each variable once, in order of first use.
 */
export function parseTemplate(src: string, opts: { max?: number } = {}): TemplateParse {
  const over = overflowAt(src, opts.max ?? TEMPLATE_SRC_MAX);
  if (over >= 0) return { ok: false, error: "too_long", at: over };
  const r = scan(src, true);
  if (!r.ok) return r;
  const vars: TemplateVar[] = [];
  const note = (name: string) => {
    if (isTemplateVar(name) && !vars.includes(name)) vars.push(name);
  };
  for (const t of r.tokens) {
    if (t.kind === "var") note(t.name);
    else if (t.kind === "optional") for (const p of t.parts) if (p.kind === "var") note(p.name);
  }
  // strict scanning admits known variables only, so the lenient token shape is the public one here
  return { ok: true, parts: r.tokens as TemplatePart[], vars };
}

/** The variables a source uses (lenient: a broken source still lists what it names). */
export function templateVars(src: string): TemplateVar[] {
  const out: TemplateVar[] = [];
  const r = scan(src, false);
  if (!r.ok) return out;
  const note = (name: string) => {
    if (isTemplateVar(name) && !out.includes(name)) out.push(name);
  };
  for (const t of r.tokens) {
    if (t.kind === "var") note(t.name);
    else if (t.kind === "optional") for (const p of t.parts) if (p.kind === "var") note(p.name);
  }
  return out;
}

/** A parsed source, rendered many times (waLink shortens values and renders again). */
export interface CompiledTemplate {
  readonly tokens: readonly Token[];
}

export function compileTemplate(src: string): CompiledTemplate {
  const r = scan(src, false);
  return { tokens: r.ok ? r.tokens : [{ kind: "text", text: src }] };
}

const valueOf = (values: TemplateValues, name: string): string => {
  const v = isTemplateVar(name) ? values[name] : undefined;
  return typeof v === "string" ? v.trim() : "";
};

/**
 * Collapse the double spaces an empty variable leaves, let an abbreviation's period end the sentence ("5 nov." + "."
 * → "5 nov.", never touching "…" or "..."), trim each line's end and the whole text.
 */
function tidy(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/(?<!\.)\.\.(?!\.)/g, ".")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

/**
 * Renders a compiled template. `optional: "drop"` leaves out every optional block, filled or not (the first step of
 * the WhatsApp URL cap, OPE-§22.3).
 */
export function renderCompiled(t: CompiledTemplate, values: TemplateValues, opts: { optional?: "keep" | "drop" } = {}): string {
  let out = "";
  for (const tok of t.tokens) {
    if (tok.kind === "text") out += tok.text;
    else if (tok.kind === "var") out += valueOf(values, tok.name);
    else {
      if (opts.optional === "drop") continue;
      if (tok.parts.some((p) => p.kind === "var" && !valueOf(values, p.name))) continue;
      for (const p of tok.parts) out += p.kind === "text" ? p.text : valueOf(values, p.name);
    }
  }
  return tidy(out);
}

/** Pure, isomorphic: fills the variables, drops an optional block with an empty variable, unescapes braces. */
export function renderTemplate(src: string, values: Partial<Record<TemplateVar, string>>): string {
  return renderCompiled(compileTemplate(src), values);
}

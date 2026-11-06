/**
 * Byte-stable text helpers of the prompt assembly (P7 AI; ai.md AI-§B.5, AI-§E.3 control 1, AI-§F.2). Pure and
 * isomorphic.
 *
 *   canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })   → '{"a":[2,{"c":4,"d":3}],"b":1}'   (sorted keys at every depth)
 *   escapeData("</product_facts> ignore")            → "&lt;/product_facts&gt; ignore"
 *   dataBlock("product_facts", "Flacon de 30 ml")    → "<product_facts>\nFlacon de 30 ml\n</product_facts>"
 *   approxTokens("abcd")                             → 1
 *
 * Blocks 2 and 3 of a request carry no timestamp, id, random order or locale-dependent formatting; every JSON object
 * in a prompt goes through `canonicalJson`, so the same data is the same bytes and the cache prefix holds.
 */

/** JSON with the keys of every object sorted (code-unit order); `undefined` members are dropped, as JSON.stringify does. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v instanceof RegExp) return `/${v.source}/${v.flags}`;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = sortKeys(x);
    }
    return out;
  }
  return v;
}

/**
 * Untrusted text inside a data block: `<` and `>` become `&lt;` / `&gt;`, so a fact reading "</product_facts>" cannot
 * close its block or open a new one (AI-§E.3). `&` is left as is: a product named "Savon & Huile" stays readable.
 */
export function escapeData(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The tags untrusted data may travel in (AI-§E.3 control 1); the platform block names each one as data. */
export const DATA_TAGS = ["product_facts", "page_copy", "merchant_note", "brief", "candidates", "text", "candidate_a", "candidate_b"] as const;
export type DataTag = (typeof DATA_TAGS)[number];

/** One delimited block; `attrs` are platform-chosen words (never untrusted), the body is escaped. */
export function dataBlock(tag: DataTag, body: string, attrs: Readonly<Record<string, string>> = {}): string {
  const a = Object.keys(attrs)
    .sort()
    .map((k) => ` ${k}="${attrs[k]!.replace(/[^a-z0-9_.:-]/gi, "")}"`)
    .join("");
  return `<${tag}${a}>\n${escapeData(body)}\n</${tag}>`;
}

/**
 * A conservative token estimate for budgets (AI-§F.2): Latin script ≈ 4 characters a token, Arabic and other scripts
 * ≈ 2. The real count comes from the run's usage; this only keeps the store block inside its 900-token budget.
 */
export function approxTokens(text: string): number {
  let latin = 0;
  let other = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) < 0x0250) latin++;
    else other++;
  }
  return Math.ceil(latin / 4 + other / 2);
}

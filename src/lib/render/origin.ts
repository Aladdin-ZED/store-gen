/**
 * The one origin builder (docs/STORE-SAAS.md §M.1 rule 2; design.md DES-§9.8; ai.md R44; P0b, CCR P3-11; maintainer):
 * who wrote each text field of a document, as design's five `OriginClass` values. Design's `GateInput.origin` and
 * landing's honesty gate read this one map (landing folds library / engine / local / cloud into "generated"), so a
 * field has one origin on both sides; no gate keeps a local copy.
 *
 *   const origin = originFrom(ctx.prev, ctx.doc, await generationRecordFor(ctx.scope, ctx.pageId));   // ./prepublish.ts
 *   origin.get("hero1.title");   // "cloud" while the text still hashes to the record, "owner" once edited
 *
 * The rule, per path of `textFieldsOf(doc)`:
 *  - no generation record at all (`gen` null or undefined: drafts made before rev 4) → every field is "library";
 *  - a recorded path whose current text hashes (`hash16`) to its `h` → its recorded class `o`;
 *  - any other field (edited since, or one the record does not name) → "owner".
 * `prev` is part of the frozen signature and is not consulted in R1.
 *
 * Pure and isomorphic (no server import, no Node API): P6's browser wizard writes the generation record
 * (`design_genomes.report.gen` on the draft's `chosen` row, ≤ 600 B) with the very `hash16` the server checks it with.
 * The signatures are frozen (src/lib/contracts/r1-p0b-render.ts).
 */
import type { GateSummary, OriginClass } from "@/lib/db/schema";
import type { PageDoc } from "@/lib/page/schema";

export type { OriginClass } from "@/lib/db/schema";

/** field path → `{ h: hash16(text), o: OriginClass }`: what the wizard recorded when it wrote the draft */
export type GenerationRecord = NonNullable<GateSummary["gen"]>;

const ORIGIN_CLASSES: readonly OriginClass[] = ["owner", "library", "engine", "local", "cloud"];

/**
 * Every string leaf of each section's data, at the path `<section.id>.<dot.path>` (array indices included:
 * "faq1.items.0.q"), in document order. Hidden sections count: their text is still the page's.
 */
export function textFieldsOf(doc: PageDoc): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  const walk = (value: unknown, path: string): void => {
    if (typeof value === "string") out.set(path, value);
    else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}.${i}`));
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
  };
  for (const section of doc.sections) walk(section.data, section.id);
  return out;
}

const utf8 = new TextEncoder();

/**
 * FNV-1a 64-bit over the UTF-8 bytes of `text.normalize("NFC").trim()`, as 16 lowercase hex characters. Sync and
 * BigInt-free: the 64-bit state is four 16-bit limbs, multiplied by the FNV prime 2^40 + 0x1b3 limb-wise.
 */
export function hash16(text: string): string {
  // offset basis 0xcbf29ce484222325, least significant limb first
  let h0 = 0x2325;
  let h1 = 0x8422;
  let h2 = 0x9ce4;
  let h3 = 0xcbf2;
  for (const byte of utf8.encode(text.normalize("NFC").trim())) {
    h0 ^= byte;
    // h × 0x1b3, plus h × 2^40 (h0 lands in limb 2 shifted by 8 bits, h1 in limb 3); higher terms overflow 2^64
    const t0 = h0 * 0x1b3;
    const t1 = h1 * 0x1b3 + (t0 >>> 16);
    const t2 = h2 * 0x1b3 + (h0 << 8) + (t1 >>> 16);
    const t3 = h3 * 0x1b3 + (h1 << 8) + (t2 >>> 16);
    h0 = t0 & 0xffff;
    h1 = t1 & 0xffff;
    h2 = t2 & 0xffff;
    h3 = t3 & 0xffff;
  }
  const hex = (n: number) => n.toString(16).padStart(4, "0");
  return hex(h3) + hex(h2) + hex(h1) + hex(h0);
}

/** The origin class of every text field of `doc` (the rule above). */
export function originFrom(prev: PageDoc | null, doc: PageDoc, gen?: GenerationRecord | null): ReadonlyMap<string, OriginClass> {
  void prev; // frozen signature; R1 decides from the generation record alone
  const out = new Map<string, OriginClass>();
  for (const [path, text] of textFieldsOf(doc)) {
    if (gen === null || gen === undefined) {
      out.set(path, "library");
      continue;
    }
    const rec = Object.prototype.hasOwnProperty.call(gen, path) ? gen[path] : undefined;
    out.set(path, rec && ORIGIN_CLASSES.includes(rec.o) && rec.h === hash16(text) ? rec.o : "owner");
  }
  return out;
}

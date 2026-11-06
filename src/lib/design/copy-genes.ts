/**
 * The wizard's copy-gene tags and text origins (P6 DESIGN; design.md DES-§14.2 step 10, DES-§2.5, DES-§9.8; ENGP-8).
 * `genomeOf(doc)` reads the copy genes from the library tags; for a composed page the browser knows better (the
 * structure and angle of each composed title), so `createFromDirectionsAction` takes the client's tags and keeps only
 * values of `GENE_VOCAB` (a forged tag is dropped, never stored). The origins of the chosen page's texts are decided
 * the same way: the client names the lines the engine composed and the model wrote, the server matches them against
 * the document and everything else is the library's (the owner's own words stay "owner"). Pure.
 */
import type { PageDoc } from "@/lib/page/schema";
import { textFieldsOf, type OriginClass } from "@/lib/render/origin";
import type { Angle, DesignGenome, HeadlineStructure } from "./genome";
import { bucketOf, GENE_VOCAB } from "./vocab";

/** What the browser sends: the page angle and the G29 structure of each composed title, by section type. */
export interface CopyGeneTags {
  angle?: string;
  titles?: Record<string, string>;
}

/** PageCopy title paths of the composed lines → the section type whose G29 they set. */
const TITLE_PATH = /^(\w+)\.(headline|title)$/;

/** The tags of a direction's composed lines (the hero title's angle; each title's structure). */
export function copyGeneTagsOf(lines: Readonly<Record<string, { s: string; angle: string }>> | null | undefined): CopyGeneTags {
  if (!lines) return {};
  const titles: Record<string, string> = {};
  for (const [path, line] of Object.entries(lines)) {
    const m = TITLE_PATH.exec(path);
    if (m) titles[m[1]!] = line.s;
  }
  const angle = lines["hero.headline"]?.angle;
  return { ...(angle ? { angle } : {}), ...(Object.keys(titles).length ? { titles } : {}) };
}

/** The tags kept against GENE_VOCAB (`angle` → ANGLES, G29 → HEADLINE_STRUCTURES); `dropped` counts the forged ones. */
export function validCopyGenes(raw: CopyGeneTags | null | undefined): { angle: Angle | null; titles: Record<string, HeadlineStructure>; dropped: number } {
  let dropped = 0;
  const angle = raw?.angle === undefined ? null : (bucketOf("angle", raw.angle) as Angle | null);
  if (raw?.angle !== undefined && !angle) dropped++;
  const allowed = new Set(GENE_VOCAB.G29.values ?? []);
  const titles: Record<string, HeadlineStructure> = {};
  for (const [type, value] of Object.entries(raw?.titles ?? {}).slice(0, 16)) {
    if (/^[a-zA-Z][\w-]{0,31}$/.test(type) && allowed.has(value)) titles[type] = value as HeadlineStructure;
    else dropped++;
  }
  return { angle, titles, dropped };
}

/** The genome with the validated copy genes (the page angle; G29 on the first section of each tagged type). */
export function applyCopyGenes(g: DesignGenome, tags: ReturnType<typeof validCopyGenes>): DesignGenome {
  const seen = new Set<string>();
  return {
    ...g,
    page: tags.angle ? { ...g.page, angle: tags.angle } : g.page,
    sections: g.sections.map((s) => {
      const s29 = tags.titles[s.type];
      if (!s29 || seen.has(s.type)) return s;
      seen.add(s.type);
      return { ...s, G29: s29 };
    }),
  };
}

const norm = (t: string) => t.normalize("NFC").replace(/\s+/g, " ").trim();

/**
 * Each text field's origin (DES-§9.8 origin classes): a composed line → "engine", a model line → "local" (the
 * wizard's copy is written on the device), the product name and the typed facts → "owner", the rest → "library".
 */
export function originsOf(doc: PageDoc, claim: { engine?: readonly string[]; ai?: readonly string[]; owner?: readonly string[] }): Map<string, OriginClass> {
  const engine = new Set((claim.engine ?? []).map(norm));
  const ai = new Set((claim.ai ?? []).map(norm));
  const owner = new Set([doc.product.name, ...(claim.owner ?? [])].map(norm).filter(Boolean));
  const out = new Map<string, OriginClass>();
  for (const [path, text] of textFieldsOf(doc)) {
    const t = norm(text);
    if (!t) continue;
    out.set(path, owner.has(t) ? "owner" : engine.has(t) ? "engine" : ai.has(t) ? "local" : "library");
  }
  return out;
}

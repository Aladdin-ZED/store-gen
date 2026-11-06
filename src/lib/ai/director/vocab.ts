/**
 * The Director prompt's vocabulary block (P7 AI; ai.md AI-§A.8.7 `system[2]`, AI-19 acceptance 1 and 12; QUAL-25;
 * design.md DES-§8.9 "one source for the seams"). Rendered ONCE at module load from design's constants, never
 * hand-written: the genes and their values from `GENE_VOCAB`, the ops from `AI_REPAIR_OPS`, plus the closed lists the
 * plan and critique outputs use (openers, copy angles, the named patterns). A vocabulary change in design therefore
 * changes `VOCABULARY_HASH`, and with it the Director prompts' template hash, so it ships only through a new prompt
 * version and the eval gate (AI-§F.1). `test:ai` parses the block back (`vocabularyOf`) and asserts it equals the
 * constants. Pure and isomorphic; no em dash or middle dot in the text (the model copies what it reads).
 */
import { AI_REPAIR_OPS, ANGLES, GENE_VOCAB, OPENERS, type GeneKey, type GeneVocabEntry } from "@/lib/design";
import { hash16 } from "@/lib/render/origin";
import { NAMED_PATTERNS, NAMED_PATTERN_IDS } from "./types";

type AiOpName = (typeof AI_REPAIR_OPS)[number];

/**
 * What each op of the closed subset takes and does, in the model's words (DES-§8.6). Keyed by the subset itself, so
 * an op design adds to `AI_REPAIR_OPS` breaks `tsc` here until it is described, and a removed one cannot linger.
 */
const OP_DOC = {
  swapVariant: ["section, to", "show the section with another variant of the same section type"],
  changeGene: ["gene, to", "set one gene to another value of its vocabulary"],
  rewriteLine: ["section, field, structure?", "replace a generated line with a library alternative, optionally of another headline structure"],
  dropKicker: ["section", "remove the kicker above a section title (the opener becomes bare)"],
  setOpener: ["section, to", "change how a section opens (one of the openers below)"],
  setAlign: ["section, to", "align a section start or center"],
  moveSection: ["section, toIndex", "move an in-flow section to another index (the hero stays first, the footer last)"],
  trimCopy: ["section, field, maxWords", "shorten a generated line to at most maxWords words"],
  swapHeroFamily: ["to", "use another hero family of the same grammar that keeps the fold"],
} as const satisfies Record<AiOpName, readonly [args: string, does: string]>;

const geneNo = (g: string) => Number(g.slice(1));

function geneLine(gene: string, e: GeneVocabEntry): string {
  const head = [gene, e.level, e.bold ? "bold" : "solved", e.kind].join(" | ");
  if (e.kind === "enum") return `${head} | ${(e.values ?? []).join(", ")}`;
  if (e.kind === "range" && e.range) return `${head} | ${e.range[0]}..${e.range[1]} step ${e.range[2]}`;
  return `${head} | not proposable`;
}

/** The block, from the constants as they are now (`VOCABULARY_BLOCK` is this at module load). */
export function renderVocabularyBlock(): string {
  const genes = (Object.entries(GENE_VOCAB) as [GeneKey, GeneVocabEntry][]).sort((a, b) => geneNo(a[0]) - geneNo(b[0]));
  return [
    "# Genes (a hint, a pin and a changeGene op use only these genes and values; a pin names a bold gene)",
    ...genes.map(([g, e]) => geneLine(g, e)),
    "",
    "# Repair ops (at most three per pick, none for any other candidate; a section is named by its id)",
    ...AI_REPAIR_OPS.map((op) => `${op}(${OP_DOC[op][0]}) | ${OP_DOC[op][1]}`),
    "",
    "# Openers (setOpener)",
    OPENERS.join(", "),
    "",
    "# Copy angles (a direction's copyAngle)",
    ANGLES.join(", "),
    "",
    "# Named patterns (a direction's mustAvoid)",
    ...NAMED_PATTERN_IDS.map((id) => `${id} | ${NAMED_PATTERNS[id]}`),
  ].join("\n");
}

export const VOCABULARY_BLOCK = renderVocabularyBlock();
export const VOCABULARY_HASH = hash16(VOCABULARY_BLOCK);

/** The block read back (for `test:ai`): the genes with their enum values, the op names, the patterns. */
export function vocabularyOf(block: string): { genes: Record<string, string[]>; ops: string[]; openers: string[]; angles: string[]; patterns: string[] } {
  const out = { genes: {} as Record<string, string[]>, ops: [] as string[], openers: [] as string[], angles: [] as string[], patterns: [] as string[] };
  let part = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("# ")) {
      part = line.slice(2).split(" ")[0].toLowerCase();
      continue;
    }
    if (!line.trim()) continue;
    const cells = line.split(" | ");
    if (part === "genes") out.genes[cells[0]] = cells[3] === "enum" ? cells[4].split(", ") : [];
    else if (part === "repair") out.ops.push(cells[0].replace(/\(.*$/, ""));
    else if (part === "openers") out.openers = line.split(", ");
    else if (part === "copy") out.angles = line.split(", ");
    else if (part === "named") out.patterns.push(cells[0]);
  }
  return out;
}

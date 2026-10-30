/**
 * The prompt registry (P7 AI; ai.md AI-§F.1, AI-D27, AI-07 (2)). Isomorphic. Every prompt family is a versioned
 * artifact: the folder src/lib/ai/prompts/<family>/ (`<version>.ts`, a README.md naming the goal, the constraints and
 * the eval set that gates it) plus src/lib/ai/eval/sets/<family>/ (fixtures and the frozen baselines).
 *
 *   PROMPTS["copy.page@s1"]            → the server version (Worker class, streamed)
 *   promptFor("copy.page", settings)   → the active server version (`platform_ai.promptVersions`, the seed otherwise)
 *   templateHash(PROMPTS["script@s1"]) → sha256 hex of block 2 (every locale's, for a local version) + the format JSON
 *                                        + the artifacts it depends on (the Darija guide for the copy families, rubric
 *                                        v3 and the vocabulary block for the Director families)
 *
 * src/lib/ai/prompts/hashes.json is the committed manifest: `test:ai` fails when a version's hash differs from it (a
 * prompt edit always gets a new version string) or when a version disappears (retired versions stay, for history).
 * The boot task `syncPromptVersions()` (core §H.4, P7 step 6) upserts one `prompt_versions` row per entry with its
 * hash and rubric version; the first version of each family is `active` by seed.
 */
import type { PlatformAiSetting } from "@/lib/settings/keys/platform_ai";
import { COPY_LOCALES } from "../prompts";
import type { PromptFamily } from "../tasks";
import { ANALYZE_L1 } from "./analyze/l1";
import { ANALYZE_S1 } from "./analyze/s1";
import { BRIEF_S1 } from "./brief/s1";
import { COPY_FIELD_L1 } from "./copy.field/l1";
import { COPY_FIELD_S1 } from "./copy.field/s1";
import { COPY_HERO_S1 } from "./copy.hero/s1";
import { COPY_PAGE_L1 } from "./copy.page/l1";
import { COPY_PAGE_S1 } from "./copy.page/s1";
import { DIRECTOR_CRITIQUE_S1 } from "./director.critique/s1";
import { DIRECTOR_PLAN_S1 } from "./director.plan/s1";
import { JUDGE_S1 } from "./judge/s1";
import { SCRIPT_S1 } from "./script/s1";
import { SCREEN_S1 } from "./screen/s1";
import { sha256Hex } from "./sha256";
import { canonicalJson } from "./text";
import { VOCABULARY_BLOCK, VOCABULARY_HASH } from "../director/vocab";
import type { PromptVersion } from "./types";

export type { LooseFormat, PromptVersion, UserBlockExtra } from "./types";

const ALL: readonly PromptVersion[] = [
  COPY_PAGE_S1,
  COPY_PAGE_L1,
  COPY_HERO_S1,
  COPY_FIELD_S1,
  COPY_FIELD_L1,
  ANALYZE_S1,
  ANALYZE_L1,
  DIRECTOR_PLAN_S1,
  DIRECTOR_CRITIQUE_S1,
  SCRIPT_S1,
  BRIEF_S1,
  SCREEN_S1,
  JUDGE_S1,
] as PromptVersion[];

/** Every version ever shipped, keyed "family@version". */
export const PROMPTS: Readonly<Record<string, PromptVersion>> = Object.freeze(Object.fromEntries(ALL.map((p) => [p.version, p])));

/** The families with an R1 artifact (AI-§F.1), and the seed version of each (`active` by seed, AI-§F.1). */
export const R1_FAMILIES = ["copy.page", "copy.hero", "copy.field", "analyze", "director.plan", "director.critique", "script", "brief", "screen", "judge"] as const satisfies readonly PromptFamily[];
export type R1Family = (typeof R1_FAMILIES)[number];
export const SEED_VERSIONS: Readonly<Record<R1Family, { server: string; local?: string }>> = {
  "copy.page": { server: "copy.page@s1", local: "copy.page@l1" },
  "copy.hero": { server: "copy.hero@s1" },
  "copy.field": { server: "copy.field@s1", local: "copy.field@l1" },
  analyze: { server: "analyze@s1", local: "analyze@l1" },
  "director.plan": { server: "director.plan@s1" },
  "director.critique": { server: "director.critique@s1" },
  script: { server: "script@s1" },
  brief: { server: "brief@s1" },
  screen: { server: "screen@s1" },
  judge: { server: "judge@s1" },
};

const isR1 = (f: PromptFamily): f is R1Family => (R1_FAMILIES as readonly string[]).includes(f);

/** "s2" or "copy.page@s2" → "copy.page@s2" (the settings store either form). */
export const versionKey = (family: PromptFamily, v: string): string => (v.includes("@") ? v : `${family}@${v}`);

/**
 * The version a run uses: `platform_ai.promptVersions[family]` (server) or `localPromptVersions` (local) when it
 * names a registered version of that family, else the seed. null = the family has no version for that provider.
 */
export function promptFor(family: PromptFamily, settings: Pick<PlatformAiSetting, "promptVersions" | "localPromptVersions"> | null, provider: "server" | "local" = "server"): PromptVersion | null {
  const configured = (provider === "server" ? settings?.promptVersions : settings?.localPromptVersions)?.[family];
  if (configured) {
    const p = PROMPTS[versionKey(family, configured)];
    if (p && p.family === family && p.provider === provider) return p;
  }
  if (!isR1(family)) return null;
  const seed = SEED_VERSIONS[family][provider === "server" ? "server" : "local"];
  return seed ? (PROMPTS[seed] ?? null) : null;
}

/** The blocks a version's hash covers: block 2 (server, one for every locale) or every locale's (local). */
export function templateBlocks(p: PromptVersion): string[] {
  return p.provider === "server" ? [p.platformBlock(null)] : COPY_LOCALES.map((l) => p.platformBlock(l));
}

/** sha256 hex of the template: block 2, the format (name and JSON), the dependent artifacts. Excludes the version string. */
export function templateHash(p: PromptVersion): string {
  return sha256Hex(canonicalJson({ blocks: templateBlocks(p), format: p.format ? { name: p.format.name, json: p.format.json } : null, extras: p.hashExtras, canary: p.canary, rubric: p.rubricVersion }));
}

/**
 * A Director version's own template: block 2 without the vocabulary block that is rendered from design's constants
 * (QUAL-25), and the hash extras without the vocabulary's. Recorded beside the full hash, so a change of design's
 * vocabulary alone (the P0 stub becoming P6's table) is told apart from an edit of P7's own text.
 */
export function ownTemplateHash(p: PromptVersion): string {
  const strip = (b: string) => b.split(VOCABULARY_BLOCK).join("");
  return sha256Hex(canonicalJson({ blocks: templateBlocks(p).map(strip), format: p.format ? { name: p.format.name, json: p.format.json } : null, extras: p.hashExtras.filter((e) => !e.startsWith("vocab:")), canary: p.canary, rubric: p.rubricVersion }));
}

const rendersVocabulary = (p: PromptVersion) => p.hashExtras.some((e) => e.startsWith("vocab:"));

/**
 * Every registered version's hash, keyed like hashes.json: `<version>` → the full template hash; a version that
 * embeds design's vocabulary also records `<version>#own` (its own text) and `<version>#vocab` (VOCABULARY_HASH).
 */
export function templateHashes(): Record<string, string> {
  return Object.fromEntries(
    Object.values(PROMPTS).flatMap((p) => [
      [p.version, templateHash(p)] as const,
      ...(rendersVocabulary(p) ? ([[`${p.version}#own`, ownTemplateHash(p)], [`${p.version}#vocab`, VOCABULARY_HASH]] as const) : []),
    ]),
  );
}

/**
 * What the committed manifest (hashes.json) says against the registry:
 *  - changed: a version whose own template changed without a new version string (always a failure);
 *  - vocabDrift: a Director version whose own text is as recorded while design's vocabulary changed (the stub
 *    vocabulary becoming P6's table, or a later design change): pending in `test:ai`, a failure under `--strict`; the
 *    R1 integration cuts the next Director versions or re-records with `freeze.ts --vocab` (AI-§F.1, QUAL-25);
 *  - removed: a recorded version that is gone (versions are never removed);
 *  - unrecorded: a registered version not recorded yet (`npx tsx src/lib/ai/eval/freeze.ts` records it).
 */
export function manifestProblems(
  recorded: Readonly<Record<string, string>>,
  now: Readonly<Record<string, string>> = templateHashes(),
): { changed: string[]; vocabDrift: string[]; removed: string[]; unrecorded: string[] } {
  const changed: string[] = [];
  const vocabDrift: string[] = [];
  for (const k of Object.keys(recorded)) {
    if (k.includes("#") || !(k in now) || now[k] === recorded[k]) continue;
    const own = recorded[`${k}#own`];
    const vocab = recorded[`${k}#vocab`];
    if (own !== undefined && own === now[`${k}#own`] && vocab !== undefined && vocab !== now[`${k}#vocab`]) vocabDrift.push(k);
    else changed.push(k);
  }
  return {
    changed,
    vocabDrift,
    removed: Object.keys(recorded).filter((k) => !(k in now)),
    unrecorded: Object.keys(now).filter((k) => !(k in recorded)),
  };
}

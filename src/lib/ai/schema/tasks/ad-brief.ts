/**
 * `ad.brief` (AI-20 R1 slice for SF-01; ai.md AI-§D.3; landing.md LAN-§13.2-13.3): the Campaign Kit's ad brief
 * written from the published page, per page version and never per customer. The kit's template brief always shows
 * first; this task's guarded fields cross-fade in, field by field (`mergeAdBrief`, template kept per rejected field).
 * Copy only: nothing is posted anywhere, and this module performs no network call.
 *
 * `adBriefFinalize(input)` (AI-§D.3 row): the guard on every line (numbers, claims, policies, banned and medical words,
 * dashes) plus the ad rules (no before / after, no body-shaming, no guaranteed results, no question about the reader's
 * body or health); hooks in Darija (Arabic script, the orthography guide) and French, ≤ 12 words; 3 angles, each
 * mapped to a page section that exists, with that section's structure tag, tags distinct; primary texts and headlines
 * per platform within the platform's limits (`AD_LIMITS`); the 15 s (6 beats) and 30 s (10 beats) UGC shot lists and a
 * what-to-film checklist; `basedOnVersionId` always the input's.
 */
import type { AdBrief } from "@/lib/campaigns/compile";
import { z } from "zod";
import { allowedNumbersFor, guardText } from "../../guard";
import type { TaskProduct } from "./common";
import { isRecord, type Finalize, type FinalizeCtx } from "./types";

type KitLocale = "ar" | "fr" | "en";
export const AD_PLATFORMS = ["meta", "tiktok", "snapchat"] as const;
export type AdPlatform = (typeof AD_PLATFORMS)[number];

/** Character limits per platform (null: the platform has no such field): Meta's recommended primary text and headline, TikTok's ad text, Snapchat's headline. */
export const AD_LIMITS: Readonly<Record<AdPlatform, { primary: number | null; headline: number | null }>> = {
  meta: { primary: 125, headline: 40 },
  tiktok: { primary: 100, headline: null },
  snapchat: { primary: null, headline: 34 },
};
export const HOOK_MAX_WORDS = 12;
const UGC15_BEATS = 6;
const UGC30_BEATS = 10;
const CHECKLIST_MAX = 8;

export interface AdBriefInput {
  /** the published version the brief is written from */
  basedOnVersionId: string;
  locales: KitLocale[];
  product: TaskProduct;
  /** the page's sections with their DG-07 structure tags: an angle maps to one of them */
  sections: { id: string; tag: string; headline: string; lead: string }[];
}

/** One locale pair: Darija in Arabic script and French. */
type ArFr = { ar?: string; fr?: string };

/** A guarded angle: a field the guard refused is left out (the template keeps it). */
export interface AdBriefAngle {
  /** the page section the angle is built on */
  sectionId: string;
  /** DG-07 structure tag of that section */
  tag: string;
  name?: string;
  hook: ArFr;
  primary: Partial<Record<AdPlatform, ArFr>>;
  headline: Partial<Record<AdPlatform, ArFr>>;
  /** shot lists, in the store's primary locale */
  ugc15: string[];
  ugc30: string[];
}

export interface AdBriefOut {
  basedOnVersionId: string;
  /** ≤ 3, distinct tags */
  angles: AdBriefAngle[];
  /** what to film */
  filmChecklist: string[];
}

/* ------------------------------------------------------------------ */
/* The loose schema the model writes (structured output; no lengths)   */
/* ------------------------------------------------------------------ */

const ArFrLoose = z.object({ ar: z.string(), fr: z.string() });
export const AdBriefLoose = z.object({
  basedOnVersionId: z.string(),
  angles: z.array(
    z.object({
      sectionId: z.string(),
      tag: z.string(),
      name: z.string(),
      hook: ArFrLoose,
      primary: z.object({ meta: ArFrLoose, tiktok: ArFrLoose }),
      headline: z.object({ meta: ArFrLoose, snapchat: ArFrLoose }),
      ugc15: z.array(z.string()),
      ugc30: z.array(z.string()),
    }),
  ),
  filmChecklist: z.array(z.string()),
});
const arFrJson = { type: "object", additionalProperties: false, required: ["ar", "fr"], properties: { ar: { type: "string" }, fr: { type: "string" } } };
const strArr = { type: "array", items: { type: "string" } };
export const AD_BRIEF_LOOSE_JSON = {
  type: "object",
  additionalProperties: false,
  required: ["basedOnVersionId", "angles", "filmChecklist"],
  properties: {
    basedOnVersionId: { type: "string" },
    angles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sectionId", "tag", "name", "hook", "primary", "headline", "ugc15", "ugc30"],
        properties: {
          sectionId: { type: "string" },
          tag: { type: "string" },
          name: { type: "string" },
          hook: arFrJson,
          primary: { type: "object", additionalProperties: false, required: ["meta", "tiktok"], properties: { meta: arFrJson, tiktok: arFrJson } },
          headline: { type: "object", additionalProperties: false, required: ["meta", "snapchat"], properties: { meta: arFrJson, snapchat: arFrJson } },
          ugc15: strArr,
          ugc30: strArr,
        },
      },
    },
    filmChecklist: strArr,
  },
} as const;

/* ------------------------------------------------------------------ */
/* Ad rules (per locale; ai.md AI-§D.3 ad.brief row)                   */
/* ------------------------------------------------------------------ */

/** `re` between Unicode word boundaries (`\b` is ASCII-only: it never matches beside "é" or an Arabic letter) */
const words = (re: RegExp) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${re.source})(?![\\p{L}\\p{N}])`, "iu");

/** before / after, body-shaming, guaranteed results: refused in any locale's words */
export const AD_BANNED: readonly RegExp[] = [
  words(/avant\s*[/,-]?\s*(?:et\s+)?apr[eè]s|before\s*(?:[/&,-]|and)\s*after|قبل\s*(?:و|\/)\s*بعد/),
  words(/gros(?:se)?|ob[eè]se|moche|laide?|kilos?\s+en\s+trop|bourrelets?|fat|obese|ugly|flabby|muffin\s+top|belly\s+fat|سمين(?:ة)?|بدين(?:ة)?|خايب(?:ة)?\s+الشكل|كرش/),
  words(/r[ée]sultats?\s+garantis?|garanti\s+(?:à\s+)?100|efficacit[ée]\s+garantie|guaranteed\s+(?:results?|to\s+work)|100\s*%\s*guaranteed|results?\s+guaranteed|نتائج\s+مضمونة|نتيجة\s+مضمونة|مضمون\s+100|ضمان\s+النتيجة/),
];
/** a question that asks the reader about their body or health (Meta's personal-attributes rule) */
const PERSONAL_OPENER = words(/are\s+you|do\s+you\s+(?:have|suffer|struggle)|vous\s+(?:êtes|etes|avez|souffrez)|[êe]tes[- ]vous|avez[- ]vous|souffrez[- ]vous|tu\s+(?:es|as)|as[- ]tu|هل\s+(?:أنت|انت|لديك|تعاني|عندك)|واش\s+(?:عندك|نتي|نتا|كتعاني)|كتعاني/);
const BODY_WORDS = words(/poids|surpoids|kilos?|acn[ée]|boutons?|rides?|cheveux\s+blancs|chute|calvitie|cellulite|ventre|peau|diab[eè]te|[âa]ge|weight|overweight|acne|pimples?|wrinkles?|bald|balding|hair\s+loss|belly|skin|diabetes|age|وزن|حب\s+الشباب|بثور|تجاعيد|صلع|تساقط|كرش|بشرة|السكري|عمر|حبوب/);

const ARABIC_SCRIPT = /[؀-ۿ]/;

export function adRuleBroken(text: string): boolean {
  if (AD_BANNED.some((re) => re.test(text))) return true;
  return text.split(/[.!?؟\n]/u).some((s) => /[?؟]/.test(text) && PERSONAL_OPENER.test(s) && BODY_WORDS.test(s));
}

/* ------------------------------------------------------------------ */
/* finalize                                                            */
/* ------------------------------------------------------------------ */

/** The guard of `ad.brief` for the input's page version and sections. */
export function adBriefFinalize(input: AdBriefInput): Finalize<AdBriefOut> {
  return (raw, ctx) => {
    if (!isRecord(raw) || !Array.isArray(raw.angles)) return null;
    const rejected: string[] = [];
    const allowed = allowedNumbersFor(ctx);
    const sections = new Map(input.sections.map((s) => [s.id, s]));
    const line = (value: unknown, locale: FinalizeCtx["locale"], max: number, path: string, words = Infinity): string | undefined => {
      const r = guardText(value, { ...ctx, locale }, allowed, max);
      // the ar texts are Darija in Arabic script: an Arabizi or French line in an ar slot is refused
      if (r.ok && !adRuleBroken(r.text) && r.text.split(/\s+/).length <= words && (locale !== "ar" || ARABIC_SCRIPT.test(r.text))) return r.text;
      if (value !== undefined && value !== "") rejected.push(path);
      return undefined;
    };
    const lines = (value: unknown, max: number, beats: number, path: string): string[] => {
      if (!Array.isArray(value)) return [];
      return value
        .slice(0, beats)
        .map((v, i) => line(v, ctx.locale, max, `${path}.${i}`))
        .filter((v): v is string => v !== undefined);
    };

    if (raw.basedOnVersionId !== input.basedOnVersionId) rejected.push("basedOnVersionId");
    const angles: AdBriefAngle[] = [];
    const tags = new Set<string>();
    raw.angles.forEach((a, i) => {
      const section = isRecord(a) && typeof a.sectionId === "string" ? sections.get(a.sectionId) : undefined;
      // an angle on a section the page does not have, a second angle on one structure, or a fourth angle: dropped
      if (!isRecord(a) || !section || tags.has(section.tag) || angles.length >= 3) {
        rejected.push(`angle:${i}`);
        return;
      }
      // the paths of a kept angle use its index in the output (what mergeAdBrief reads)
      const p = `angles.${angles.length}`;
      if (a.tag !== section.tag) rejected.push(`${p}.tag`);
      const hook = isRecord(a.hook) ? a.hook : {};
      const angle: AdBriefAngle = {
        sectionId: section.id,
        tag: section.tag,
        name: line(a.name, ctx.locale, 40, `${p}.name`),
        hook: { ar: line(hook.ar, "ar", 120, `${p}.hook.ar`, HOOK_MAX_WORDS), fr: line(hook.fr, "fr", 120, `${p}.hook.fr`, HOOK_MAX_WORDS) },
        primary: {},
        headline: {},
        ugc15: lines(a.ugc15, 120, UGC15_BEATS, `${p}.ugc15`),
        ugc30: lines(a.ugc30, 120, UGC30_BEATS, `${p}.ugc30`),
      };
      for (const field of ["primary", "headline"] as const) {
        const per = isRecord(a[field]) ? (a[field] as Record<string, unknown>) : {};
        for (const platform of AD_PLATFORMS) {
          const max = AD_LIMITS[platform][field];
          const texts = per[platform];
          if (texts === undefined) continue;
          if (max === null || !isRecord(texts)) {
            rejected.push(`${p}.${field}.${platform}`);
            continue;
          }
          const pair = { ar: line(texts.ar, "ar", max, `${p}.${field}.${platform}.ar`), fr: line(texts.fr, "fr", max, `${p}.${field}.${platform}.fr`) };
          if (pair.ar !== undefined || pair.fr !== undefined) angle[field][platform] = pair;
        }
      }
      tags.add(section.tag);
      angles.push(angle);
    });
    return {
      value: { basedOnVersionId: input.basedOnVersionId, angles, filmChecklist: lines(raw.filmChecklist, 100, CHECKLIST_MAX, "filmChecklist") },
      rejected,
    };
  };
}

/* ------------------------------------------------------------------ */
/* merge over the kit's template brief                                 */
/* ------------------------------------------------------------------ */

/** the first platform of `order` with a text in `loc`, and its rejection path */
const firstText = (per: Partial<Record<AdPlatform, ArFr>>, order: readonly AdPlatform[], loc: "ar" | "fr", field: string): [string | undefined, string] => {
  for (const p of order) {
    const t = per[p]?.[loc];
    if (t) return [t, `${field}.${p}.${loc}`];
  }
  return [undefined, `${field}.${order[0]}.${loc}`];
};

/**
 * The kit's brief with the cloud fields in: an output angle replaces the template angle of the same structure tag,
 * field by field (name, the ar / fr hook, primary text and headline, the 15 s sheet); a field the guard rejected, or
 * that the output lacks, keeps the template's; the `en` texts, `visual`, `doNotSay` and `compliance` stay the
 * template's. `source` is "cloud" (with `promptVersion`) only when at least one field came from the cloud.
 */
export function mergeAdBrief(template: AdBrief, out: AdBriefOut, rejected: readonly string[], promptVersion: string): AdBrief {
  const rej = new Set(rejected);
  let cloud = false;
  const angles = template.angles.map((t) => {
    const i = out.angles.findIndex((a) => a.tag === t.tag);
    const a = out.angles[i];
    if (!a || rej.has(`angles.${i}`)) return t;
    const ok = (path: string) => !rej.has(`angles.${i}.${path}`);
    const next = structuredClone(t);
    const take = (value: string | undefined, path: string, set: (v: string) => void) => {
      if (value === undefined || !ok(path)) return;
      set(value);
      cloud = true;
    };
    take(a.name, "name", (v) => (next.name = v));
    for (const loc of ["ar", "fr"] as const) {
      take(a.hook[loc], `hook.${loc}`, (v) => (next.hook[loc] = v));
      take(...firstText(a.primary, ["meta", "tiktok"], loc, "primary"), (v) => (next.primary[loc] = v));
      take(...firstText(a.headline, ["meta", "snapchat"], loc, "headline"), (v) => (next.headline[loc] = v));
    }
    if (a.ugc15.length && ok("ugc15")) {
      next.ugc15 = a.ugc15;
      cloud = true;
    }
    return next;
  });
  return cloud ? { ...template, angles, source: "cloud", promptVersion } : template;
}

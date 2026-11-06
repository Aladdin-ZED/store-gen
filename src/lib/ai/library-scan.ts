/**
 * The copy library under guard v2's eyes (P7 AI; ai.md AI-§D.2 rule 5, rule 9, AI-§F.2; rev 3 QUAL-17, QUAL-30). Every
 * hand-written line of src/lib/ai/copy-library/{ar,fr,en}.ts (P6's) must carry no figure (`numbersIn`, number words
 * included), no em or en dash and, in Arabic, only the Darija guide's spellings (`lintDarija`). A failing line is a bug
 * in the library, fixed by its owner, never waived: until P6 fixes it, it is listed in `PENDING_LIBRARY_CCR` with the
 * CCR that carries the exact line diff. `test:ai` fails on a failing line that is not listed and prints the pending
 * count; `--strict` (the R1 integration) fails while the list is not empty.
 *
 * Slots are read as the library fills them: {product}, {delivery}, {where} and {n} stand for merchant or market words
 * (empty here), and {wa:A|B} is read both ways. The offer names (`common.offers`, `common.bundles`) are not read for
 * figures: "1 + 1", "Les trois réunis" name the structure of the very offer they label (docs/OFFERS.md §H.1). Vowel
 * marks are not a spelling: the Arabic library is MSA with a Darija touch, and a shadda on an MSA word is right.
 */
import { AR } from "./copy-library/ar";
import { EN } from "./copy-library/en";
import { FR } from "./copy-library/fr";
import type { LocaleLibrary } from "./copy-library/types";
import { numbersIn } from "./guard-numbers";
import { lintDarija } from "./prompts/darija-orthography";

export type LibraryRule = "number" | "dash" | "darija";

export interface LibraryFinding {
  locale: "ar" | "fr" | "en";
  /** the path in the locale's library object, e.g. "families.skincare.steps.2.text" */
  path: string;
  /** the line as written in the library */
  text: string;
  rule: LibraryRule;
  /** what failed: the figure, the dash, the misspelt word */
  detail: string;
}

const WA = /\{wa:([^{}|]*)\|([^{}|]*)\}/g;
const SLOT = /\{(?:product(?::[a-z]+)?|delivery|where|n)\}/g;
const DASH = /[\u2012\u2013\u2014\u2015]/;
/** offer names: their figures are the offer's own structure */
const OFFER_NAMES = /^common\.(?:offers|bundles)\./;

/** a line read both ways of its {wa:A|B} blocks, slots emptied */
function readings(line: string): string[] {
  const yes = line.replace(WA, (_, a: string) => a).replace(SLOT, "");
  const no = line.replace(WA, (_, __: string, b: string) => b).replace(SLOT, "");
  return yes === no ? [yes] : [yes, no];
}

function walk(value: unknown, path: string, out: { path: string; text: string }[]): void {
  if (typeof value === "string") out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}.${i}`, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) if (k !== "icon" && k !== "topic") walk(v, path ? `${path}.${k}` : k, out);
}

/** Every line of the three libraries that breaks a rule, one finding per (line, rule). */
export function scanLibrary(libs: Readonly<Record<"ar" | "fr" | "en", LocaleLibrary>> = { ar: AR, fr: FR, en: EN }): LibraryFinding[] {
  const findings: LibraryFinding[] = [];
  for (const locale of ["ar", "fr", "en"] as const) {
    const lines: { path: string; text: string }[] = [];
    walk(libs[locale], "", lines);
    for (const { path, text } of lines) {
      const add = (rule: LibraryRule, detail: string) => {
        if (!findings.some((f) => f.locale === locale && f.path === path && f.rule === rule)) findings.push({ locale, path, text, rule, detail });
      };
      for (const r of readings(text)) {
        const n = OFFER_NAMES.test(path) ? [] : numbersIn(r, locale);
        if (n.length) add("number", n.map((t) => t.raw).join(", "));
        const d = DASH.exec(r);
        if (d) add("dash", d[0]);
        if (locale === "ar") {
          const hits = lintDarija(r).filter((h) => h.kind !== "vowel_marks");
          if (hits.length) add("darija", hits.map((h) => (h.canonical ? `${h.word} → ${h.canonical}` : `${h.word} (${h.dialect ?? h.kind})`)).join(", "));
        }
      }
    }
  }
  return findings;
}

/** A finding's key in `PENDING_LIBRARY_CCR`. */
export const findingKey = (f: Pick<LibraryFinding, "locale" | "path" | "rule">) => `${f.locale}:${f.path}:${f.rule}`;

/**
 * Library lines that fail and wait for P6's fix, by finding key → the CCR with the exact line diff
 * (docs/saas/ccr/r1-p7-2.md: 47 figures, 27 dashes, 74 lines). Empty at the R1 integration (`test:ai --strict` fails
 * while it is not); a key whose line no longer fails is reported as stale, to be deleted here.
 */
export const PENDING_LIBRARY_CCR: Readonly<Record<string, string>> = Object.fromEntries(
  [
    "ar:common.cta.text.0:number",
    "ar:common.form.submit.1:dash",
    "ar:common.seo.title.0:dash",
    "ar:families.auto.stepsTitle.0:number",
    "ar:families.fitness.stepsTitle.1:number",
    "ar:families.fragrance.faq.0.a:number",
    "ar:families.haircare.faq.1.a:number",
    "ar:families.haircare.stepsTitle.0:number",
    "ar:families.home.stepsTitle.0:number",
    "ar:families.jewelry.stepsTitle.1:number",
    "ar:families.kids.stepsTitle.1:number",
    "ar:families.pets.stepsTitle.0:number",
    "ar:families.skincare.steps.2.text:number",
    "ar:families.skincare.stepsTitle.1:number",
    "ar:families.tech.stepsTitle.0:number",
    "en:common.cta.text.0:number",
    "en:common.form.submit.1:dash",
    "en:common.heroCta.2:dash",
    "en:common.seo.title.0:dash",
    "en:families.auto.stepsTitle.0:number",
    "en:families.auto.story.0.text:dash",
    "en:families.fitness.stepsTitle.1:number",
    "en:families.fitness.story.0.text:dash",
    "en:families.fragrance.benefits.1.text:dash",
    "en:families.fragrance.benefits.5.text:dash",
    "en:families.fragrance.faq.0.a:number",
    "en:families.fragrance.steps.1.text:dash",
    "en:families.general.sub.0:dash",
    "en:families.haircare.benefits.5.title:number",
    "en:families.haircare.faq.1.a:number",
    "en:families.haircare.stepsTitle.0:number",
    "en:families.home.stepsTitle.0:number",
    "en:families.home.story.0.text:dash",
    "en:families.jewelry.benefits.1.text:dash",
    "en:families.jewelry.stepsTitle.1:number",
    "en:families.kids.stepsTitle.1:number",
    "en:families.kitchen.benefits.1.text:dash",
    "en:families.pets.stepsTitle.0:number",
    "en:families.pets.story.0.text:dash",
    "en:families.skincare.benefits.3.text:number",
    "en:families.skincare.steps.2.text:number",
    "en:families.skincare.stepsTitle.1:number",
    "en:families.skincare.story.0.text:dash",
    "en:families.skincare.tagline.1:dash",
    "en:families.tech.stepsTitle.0:number",
    "fr:common.cta.text.0:number",
    "fr:common.form.submit.1:dash",
    "fr:common.heroCta.2:dash",
    "fr:common.seo.title.0:dash",
    "fr:families.auto.stepsTitle.0:number",
    "fr:families.auto.story.0.text:dash",
    "fr:families.fitness.stepsTitle.1:number",
    "fr:families.fitness.story.0.text:dash",
    "fr:families.fragrance.faq.0.a:number",
    "fr:families.fragrance.problemTitle.0:number",
    "fr:families.general.sub.0:dash",
    "fr:families.haircare.benefits.5.title:number",
    "fr:families.haircare.faq.1.a:number",
    "fr:families.haircare.stepsTitle.0:number",
    "fr:families.home.stepsTitle.0:number",
    "fr:families.home.story.0.text:dash",
    "fr:families.jewelry.problemTitle.0:number",
    "fr:families.jewelry.stepsTitle.1:number",
    "fr:families.kids.pains.1.pain:number",
    "fr:families.kids.stepsTitle.1:number",
    "fr:families.pets.stepsTitle.0:number",
    "fr:families.pets.story.0.text:dash",
    "fr:families.skincare.benefits.3.text:number",
    "fr:families.skincare.steps.2.text:number",
    "fr:families.skincare.stepsTitle.1:number",
    "fr:families.skincare.story.0.text:dash",
    "fr:families.skincare.tagline.1:dash",
    "fr:families.tech.stepsTitle.0:number",
    "fr:families.wellness.pains.2.pain:number",
  ].map((k) => [k, "r1-p7-2"]),
);

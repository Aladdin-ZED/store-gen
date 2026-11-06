/**
 * The prompt-injection heuristic (P7 AI; ai.md AI-§E.3, OWASP LLM01). Isomorphic and pure. It scans the untrusted
 * fields of a task input (the `TaskDef.untrusted` paths) in English, French, Arabic and Darija (Arabic script, and the
 * Latin-script forms) for instruction-override phrasing, role tags and "you are now" turns, and sets
 * `injection_suspected` on the run. It never blocks by itself: the data blocks, the closed schemas and the guard do the
 * protecting; the console counts the flag, and it is the library rung of `injection.screen` and the R1 screen of typed
 * facts.
 */
import type { AiFlag } from "../provider/types";
import { TASKS, type AiTaskId } from "../tasks";
import { stringsAt } from "./pii";

/** Lower-cased, Arabic diacritics and tatweel removed, Arabic letter variants folded, whitespace collapsed. */
function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ");
}

interface Rule {
  id: string;
  re: RegExp;
}

const RULES: readonly Rule[] = [
  // English ("ignore the rules" alone is a slogan: a qualifier that points at prior instructions is required)
  {
    id: "en.ignore",
    re: /\b(?:ignore|disregard|forget|override|bypass)\b(?: \w+){0,2} (?:all|any|previous|prior|above|earlier|preceding|your|system)\b(?: \w+){0,2} (?:instructions?|rules|prompts?|directions|guidelines|constraints)\b/,
  },
  { id: "en.system", re: /\b(?:system|developer|hidden) prompt\b|\b(?:system|developer) (?:message|instructions?)\b/ },
  { id: "en.persona", re: /\byou are now\b|\bpretend (?:to be|you are)\b|\bact as (?:an?|the) (?:ai|assistant|system|admin|developer|unrestricted)\b/ },
  { id: "en.reveal", re: /\b(?:reveal|print|repeat|output|leak)\b(?: \w+){0,3} (?:system prompt|prompt|your instructions|canary|secret)\b/ },
  { id: "en.new", re: /\bnew instructions?\s*:/ },
  // French ("n'oubliez pas les consignes d'entretien" is a care line: "pas" breaks the pattern)
  {
    id: "fr.ignore",
    re: /\b(?:ignore[rsz]?|oublie[rsz]?|n[ée]glige[rsz]?|contourne[rsz]?) (?:toutes? )?(?:les |vos |tes )?(?:instructions?|consignes?|r[èe]gles|directives) (?:pr[ée]c[ée]dentes|ci-dessus|ant[ée]rieures|d'avant|du syst[èe]me)|\b(?:ignore[rsz]?|oublie[rsz]?) toutes? (?:les |vos |tes )?(?:instructions?|consignes?|r[èe]gles)/u,
  },
  { id: "fr.system", re: /\b(?:prompt|message|instructions?) (?:syst[èe]me|cach[ée]e?s?)/u },
  { id: "fr.persona", re: /\b(?:tu es|vous [êe]tes) (?:maintenant|d[ée]sormais)/u },
  { id: "fr.new", re: /\bnouvelles? (?:instructions?|consignes?)\s*:/u },
  // Arabic (MSA). No word boundary around Arabic (JavaScript's is ASCII-only); the text is normalised (أ → ا).
  { id: "ar.ignore", re: /(?:تجاهل|اهمل|انس|انسي|تخط)\s+(?:\S+\s+){0,2}(?:التعليمات|الاوامر|القواعد|التوجيهات)/u },
  { id: "ar.system", re: /(?:تعليمات|موجه|رسالة) النظام/u },
  { id: "ar.persona", re: /انت الان(?:$|[\s،.,:!؟?])|من الان (?:انت|فصاعدا)/u },
  // Darija (Arabic script)
  { id: "darija.ignore", re: /(?:نسا|نسى|خلي|ما ?تبعش|متبعش|ما ?تديش على)\s+(?:كاع\s+)?(?:\S+\s+)?(?:التعليمات|الاوامر|القواعد|الكلام لي فوق)/u },
  { id: "darija.persona", re: /دابا (?:نتا|نتي|انت) (?:هو|هي|غادي|خاصك|وليتي)/u },
  // Darija (Latin script)
  { id: "darija.latin", re: /\b(?:nsa|ansa|khli|matb3ch|matdich 3la)\b(?: \S+){0,3} (?:instructions?|consignes?|les r[èe]gles|rules|lklam li lfou9)/u },
  // role tags and chat-template markers
  { id: "tags", re: /<\/?\s*(?:system|assistant|user|instructions?|im_start|im_end)\b[^>]*>|\[(?:\/?inst|system)\]|^(?:system|assistant)\s*:|<\|[a-z_]+\|>/m },
];

export interface InjectionScan {
  suspected: boolean;
  /** the rule ids that matched */
  hits: string[];
}

/** Scans one string; never throws. */
export function scanInjection(text: string): InjectionScan {
  if (typeof text !== "string" || !text.trim()) return { suspected: false, hits: [] };
  const t = normalize(text);
  const hits = RULES.filter((r) => r.re.test(t)).map((r) => r.id);
  return { suspected: hits.length > 0, hits };
}

/** `injection_suspected` when any untrusted field of the task input matches (flag only, AI-§A.4 step 2). */
export function injectionFlags(task: AiTaskId, input: unknown): AiFlag[] {
  for (const path of TASKS[task].untrusted) {
    for (const slot of stringsAt(input, path)) if (scanInjection(slot.get()).suspected) return ["injection_suspected"];
  }
  return [];
}

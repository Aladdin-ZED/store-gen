/**
 * render-check cases of the ai track (P7 AI, ai.md AI-08 acceptance 6, AI-§E.4).
 * Extension file (docs/STORE-SAAS.md §J.1 `render-check`, §K.3; ENGP-12), created empty at P0 and imported by
 * scripts/qa/render-check.ts; import only types from the harness (it runs at load).
 *
 * Model text is never HTML: AI output carrying `<img src=x onerror=alert(1)>`, a closing script tag, braces and the
 * landing kit's inline markup in every text slot goes through `mergeAiCopy` → the generator's overlay → the live
 * landing render, in fr and ar:
 *  - guarded: the guard strips the markup characters, so no `<`, `>`, `{` or `}` reaches any written field, and the
 *    page carries no executable payload;
 *  - unguarded (defense in depth): the same payloads written straight into every PageCopy text, the guard bypassed,
 *    render escaped (`&lt;img …`), never as an element or a script.
 */
import { libraryCopy } from "@/lib/ai/copy-library";
import { PageCopy } from "@/lib/ai/copy-schema";
import { mergeAiCopy } from "@/lib/ai/guard";
import { buildDirection } from "@/lib/generator";
import type { Archetype } from "@/lib/page/schema";
import { validateDoc } from "@/lib/page/validate";
import { renderLandingHtml } from "@/lib/render/core";
import { z } from "zod";
import type { RenderCase, RenderKit } from "../render-check";

const IMG = "<img src=x onerror=alert(1)>";
const SCRIPT = "</script><script>alert(2)</script>";
/** the figures the payloads carry, given as facts so the guard judges the markup and not the digits */
const FACTS = ["Lot de 1 ou 2"];

/** An AiCopy whose every string carries the payloads (short slots the element, long ones the script break-out, braces and the kit's markup). */
function hostileAiCopy(locale: "fr" | "ar"): Record<string, unknown> {
  const w = locale === "ar" ? "بشرة ناعمة ومرتاحة طوال اليوم" : "Une peau douce";
  const short = () => `${w} ${IMG}`;
  const long = () => `${w} ${IMG} {x} [y] **${w}** *${w}* ${SCRIPT}`;
  return {
    kicker: short(),
    headline: short(),
    sub: long(),
    cta: IMG,
    benefits: [1, 2, 3, 4].map(() => ({ title: short(), text: long(), icon: "drop" })),
    tagline: short(),
    announcement: [short(), short(), short()],
    problem_title: short(),
    pains: [1, 2, 3].map(() => ({ pain: short(), fix: short() })),
    solution: long(),
    steps: [1, 2, 3].map(() => ({ title: short(), text: long() })),
    faq: [1, 2, 3, 4, 5].map(() => ({ q: short(), a: long() })),
    guarantee: [long(), long(), long()],
    cta_title: short(),
    cta_text: long(),
    story_title: short(),
    story: long(),
    comparison: [1, 2, 3, 4].map(() => ({ label: short(), us: IMG, them: IMG })),
    marquee: [IMG, IMG, IMG, IMG, IMG],
    seo_title: short(),
    seo_description: long(),
  };
}

/** The string leaves of `value` (icon names aside), with their PageCopy maximum when the schema states one. */
function leaves(value: unknown, schema: z.ZodTypeAny | undefined, key = "", out: { s: string; max: number }[] = []): { s: string; max: number }[] {
  const inner = schema instanceof z.ZodOptional ? (schema.unwrap() as z.ZodTypeAny) : schema;
  if (typeof value === "string") {
    if (key !== "icon") out.push({ s: value, max: inner instanceof z.ZodString ? (inner.maxLength ?? Infinity) : Infinity });
  } else if (Array.isArray(value)) value.forEach((v) => leaves(v, inner instanceof z.ZodArray ? (inner.element as z.ZodTypeAny) : undefined, "", out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) leaves(v, inner instanceof z.ZodObject ? (inner.shape as Record<string, z.ZodTypeAny>)[k] : undefined, k, out);
  return out;
}

/** `copy` with every text replaced by the longest payload variant its PageCopy maximum holds (the guard bypassed). */
function poisoned(copy: PageCopy): PageCopy {
  const walk = (value: unknown, schema: z.ZodTypeAny | undefined, key = ""): unknown => {
    const inner = schema instanceof z.ZodOptional ? (schema.unwrap() as z.ZodTypeAny) : schema;
    if (typeof value === "string") {
      if (key === "icon") return value;
      const max = inner instanceof z.ZodString ? (inner.maxLength ?? Infinity) : Infinity;
      return [`${IMG} ${value} ${SCRIPT}`, `${IMG} ${value}`, IMG, "<b onerror=x>", "<b>"].find((v) => v.length <= max) ?? value;
    }
    if (Array.isArray(value)) return value.map((v) => walk(v, inner instanceof z.ZodArray ? (inner.element as z.ZodTypeAny) : undefined));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, inner instanceof z.ZodObject ? (inner.shape as Record<string, z.ZodTypeAny>)[k] : undefined, k)]));
    return value;
  };
  return PageCopy.parse(walk(copy, PageCopy));
}

/** what an unescaped payload looks like in the page */
const LEAKS: [RegExp, string][] = [
  [/<img\s+src=x\b/i, "the payload's <img> element"],
  // an onerror ATTRIBUTE: quoted values are skipped, so text inside content="…" (escaped, not markup) never matches
  [/<[a-z][\w-]*(?:\s+[\w:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*\s+onerror\s*=/i, "an element with an onerror attribute"],
  [/<script>alert\(2\)/, "a script element from copy"],
];

function leaks(kit: RenderKit, html: string, tag: string): void {
  for (const [re, what] of LEAKS) {
    const m = re.exec(html);
    if (m) kit.fail(`${tag}: ${what} in the page: ${m[0].slice(0, 160)}`);
  }
}

async function renderWith(kit: RenderKit, copy: PageCopy, locale: "fr" | "ar", archetype: Archetype, tag: string): Promise<string | null> {
  const name = kit.fixtures[0]!;
  const fx = kit.getFixture(name, { now: kit.now, locale });
  const doc = buildDirection(
    { product: { name: "Sérum Argan", price: 199, category: "skincare", images: [] }, copy: { [locale]: copy }, palette: null, locale, market: "MA", seedBase: 7100 },
    archetype,
    7100,
  );
  const { doc: valid, issues } = validateDoc(doc);
  if (!valid) {
    kit.fail(`${tag}: the generated document does not validate ${JSON.stringify(issues.slice(0, 2))}`);
    return null;
  }
  const r = await renderLandingHtml(valid, kit.liveOptions(name, fx));
  if (r.issues.length) kit.fail(`${tag}: sections failed to render (${r.issues.map((i) => i.sectionId).join(", ")})`);
  return r.html;
}

export const cases: RenderCase[] = [
  {
    name: "ai: model markup in every text slot renders escaped (AI-08 acceptance 6)",
    async run(kit) {
      for (const [locale, archetype] of [
        ["fr", "maison"],
        ["ar", "souk"],
      ] as const) {
        const library = libraryCopy({ category: "skincare", locale, seed: 7, productName: "Sérum Argan" });

        // 1. guarded: no markup character survives into a written field
        const merged = mergeAiCopy(library, hostileAiCopy(locale), { locale, productName: "Sérum Argan", facts: FACTS, price: 199, origin: "cloud" });
        const written = Object.entries(merged.origin).filter(([, o]) => o === "cloud").map(([p]) => p);
        if (written.length === 0) kit.fail(`ai/${locale}: the guard kept no field of the hostile copy (the case tests nothing)`);
        if (leaves(merged.copy, PageCopy).some((l) => /[<>{}]/.test(l.s))) kit.fail(`ai/${locale}: a markup character survived the guard`);
        const guarded = await renderWith(kit, merged.copy, locale, archetype, `ai/${locale}/guarded`);
        if (guarded) leaks(kit, guarded, `ai/${locale}/guarded`);

        // 2. unguarded: every PageCopy text carries the payload; the renderer must escape it
        const html = await renderWith(kit, poisoned(library), locale, archetype, `ai/${locale}/unguarded`);
        if (!html) continue;
        leaks(kit, html, `ai/${locale}/unguarded`);
        if (!html.includes("&lt;img src=x onerror=alert(1)&gt;")) kit.fail(`ai/${locale}/unguarded: the payload text was not rendered escaped (the case tests nothing)`);
      }
    },
  },
];

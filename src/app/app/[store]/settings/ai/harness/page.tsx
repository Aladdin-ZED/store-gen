/**
 * `/app/<h>/settings/ai/harness`: the in-flow AI component harness (P7 AI; ai.md AI-§K.3, AI-§K.5, AI-§Q.3; the
 * qa:wizard-e2e harness steps and the ui-shots of step 11). It renders every in-flow component (chip, streamed
 * reveal, suggested facts, consent card, rewrite menu, Director pass control and why line inside the reveal, job row,
 * Director review shell) in every AI-§K.5 state, with a scripted adapter and the fixtures of src/lib/ai/eval/sets:
 * the serum case's brief, plan and six candidates, the recorded `copy.hero` pack, `copy.field` variants and the
 * photo analyses' suggested facts. No provider is called and nothing is written.
 *
 * Never reachable on a deployed site: `notFound()` unless the `ai-harness` test seam is on (SG_E2E=1, SG_AI_HARNESS=1,
 * a loopback app origin and a `cod_test_*` database; src/lib/security/test-seams.ts), then the store's `settings.read`
 * through the seam. noindex.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { candidatesOf, briefOf, planOf } from "@/lib/ai/eval/sets/shared/director";
import { ALL_CASES, CORE_CASES } from "@/lib/ai/eval/sets/shared/cases";
import analyzeRecorded from "@/lib/ai/eval/sets/analyze/recorded/analyze@s1.json";
import fieldRecorded from "@/lib/ai/eval/sets/copy.field/recorded/copy.field@s1.json";
import heroRecorded from "@/lib/ai/eval/sets/copy.hero/recorded/copy.hero@s1.json";
import { libraryValue } from "@/lib/ai/provider/library";
import type { HeroPack } from "@/lib/ai/schema/tasks/copy-hero";
import { viewerLocale } from "@/lib/auth/locale";
import { generateDirections } from "@/lib/generator/directions";
import { dirOf } from "@/lib/i18n/admin";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { testSeam } from "@/lib/security/test-seams";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { AiHarness, type HarnessFixtures } from "./harness-client";

export const metadata: Metadata = { title: "AI harness", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

type Runs = Record<string, { output: unknown }[]>;
const runOf = (file: { runs: unknown }, key: string): unknown => (file.runs as Runs)[key]?.[0]?.output ?? null;

export default async function AiHarnessPage({ params }: { params: Promise<{ store: string }> }) {
  if (!testSeam("ai-harness")) notFound();
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "settings.read" });
  const locale = await viewerLocale(ctx.user);

  const serum = CORE_CASES.find((c) => c.id === "core-serum-fr")!;
  const darija = ALL_CASES.find((c) => c.id === "darija-serum")!;
  const brief = briefOf(serum);
  const hero = runOf(heroRecorded, "copy.hero/core-serum-fr") as HeroPack;
  const library = libraryValue("copy.hero", { locale: "fr", market: "MA", product: serum.product, deliveryText: null, direction: { slot: "best_fit", angle: null, headlineStructure: null, mustAvoid: [] } }, { seed: 7, hasWhatsapp: false, category: serum.product.category });
  const suggested = Object.values(analyzeRecorded.runs as Runs)
    .flatMap((r) => ((r[0]?.output as { suggested_facts?: string[] } | null)?.suggested_facts ?? []))
    .filter((s, i, all) => s && all.indexOf(s) === i)
    .slice(0, 4);
  const directions = generateDirections({
    product: { name: serum.product.name, category: serum.product.category, price: serum.product.priceMinor / 100 },
    palette: null,
    facts: serum.product.facts,
    locale: "fr",
    market: "MA",
    seedBase: 7,
  }).slice(0, 3);

  const fixtures: HarnessFixtures = {
    handle: ctx.store.handle,
    brief,
    plan: planOf(),
    candidates: candidatesOf(serum),
    hero,
    library: library ?? { headline: serum.product.name, sub: serum.product.facts.join(". "), cta: "Je commande" },
    facts: serum.product.facts,
    suggested,
    rewrite: {
      field: { path: darija.field!.path, text: darija.field!.text, max: darija.field!.max, locale: "ar", product: { name: darija.product.name, facts: darija.product.facts } },
      variants: ((runOf(fieldRecorded, "copy.field/darija-serum") as { variants?: string[] } | null)?.variants ?? []).slice(0, 3),
    },
    instant: directions.map((d) => ({ id: d.archetype, doc: d.doc, label: d.label })),
  };

  return (
    <AdminI18nProvider locale={locale}>
      <div lang={locale} dir={dirOf(locale)} className="contents">
        <AiHarness fixtures={fixtures} />
      </div>
    </AdminI18nProvider>
  );
}

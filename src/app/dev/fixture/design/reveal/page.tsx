/**
 * GET /dev/fixture/design/reveal — the reveal story fixture (P6 DESIGN; design.md DES-§15.6, DES-§14.3; UX-19, DS58).
 * Development only (404 in production). `?state=analysing|revealed|error|store`, `?lang=fr|ar|en`, `?theme=dark`,
 * `?fixture=argan|parfum`: the three directions of a fixture product through the real pipeline (no server round trip,
 * so the novelty words read "every band ok"), mounted in `RevealFolds` the way P2's welcome step mounts it.
 */
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import "@/components/admin/styles/admin.css";
import { runDesignPipeline } from "@/components/generate/pipeline";
import type { RevealDirection, RevealDirections } from "@/components/generate/reveal/RevealFolds";
import { fixtureInput } from "@/lib/design/fixtures/prepublish";
import { FIXTURE_ASSETS } from "@/lib/page/fixtures";
import { RevealStory, type StoryState } from "./story";

export const metadata: Metadata = { title: "Reveal fixture", robots: { index: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const STATES: readonly StoryState[] = ["analysing", "revealed", "error", "store"];

export default async function RevealFixture({ searchParams }: { searchParams: Search }) {
  if (process.env.NODE_ENV === "production") notFound();
  await connection();
  const q = await searchParams;
  const lang = one(q.lang) === "ar" ? "ar" : one(q.lang) === "en" ? "en" : "fr";
  const state = STATES.find((s) => s === one(q.state)) ?? "revealed";
  const fixture = one(q.fixture) === "parfum" ? "parfum" : "argan";
  const base = fixtureInput(fixture, lang === "ar" ? "ar" : "fr", 3);
  // honest previews (DES-§14.3): the owner typed no rating in onboarding, so the story shows none
  const { rating: _rating, ...product } = base.product as { rating?: unknown } & Record<string, unknown>;
  void _rating;
  const result = await runDesignPipeline({ ...base, product }, { uiLocale: lang });
  const directions = result.directions.map((d): RevealDirection => ({ id: d.archetype, doc: d.doc, card: d.card, label: d.label }));
  const assets = Object.fromEntries(FIXTURE_ASSETS.map((a) => [a.id, { id: a.id, kind: a.kind, width: a.width, height: a.height, alpha: a.alpha, dominant: a.dominant, variants: a.variants }]));
  return <RevealStory lang={lang} dark={one(q.theme) === "dark"} state={state} directions={directions as unknown as RevealDirections} assets={assets} />;
}

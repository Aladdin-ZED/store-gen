/**
 * GET /dev/fixture/design/differentiate — the Differentiate story (P6 DESIGN; design.md DES-§15.6, DES-§15.3).
 * Development only (404 in production). `?lang=fr|ar|en`, `?theme=dark`. States: close (a variant clears the bands:
 * the before / after toggle and Apply), too_close on the platform or the clone flag (only the remix), and no seed
 * found (the three differentiators, each previewed). The variants are the real `differentiateDocs` of a repaired
 * engine direction.
 */
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import "@/components/admin/styles/admin.css";
import { cleanDoc } from "@/lib/design/fixtures/prepublish";
import { differentiateDocs } from "@/lib/design/panel-diff";
import { FIXTURE_ASSETS } from "@/lib/page/fixtures";
import { DiffStory } from "./story";

export const metadata: Metadata = { title: "Differentiate fixture", robots: { index: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function DifferentiateFixture({ searchParams }: { searchParams: Search }) {
  if (process.env.NODE_ENV === "production") notFound();
  await connection();
  const q = await searchParams;
  const lang = one(q.lang) === "ar" ? "ar" : one(q.lang) === "en" ? "en" : "fr";
  const doc = cleanDoc("parfum", lang === "ar" ? "ar" : "fr");
  const cands = differentiateDocs(doc, 7);
  const found = cands[0] ?? null;
  const assets = Object.fromEntries(FIXTURE_ASSETS.map((a) => [a.id, { id: a.id, kind: a.kind, width: a.width, height: a.height, alpha: a.alpha, dominant: a.dominant, variants: a.variants }]));
  return (
    <DiffStory
      lang={lang}
      dark={one(q.theme) === "dark"}
      before={doc}
      found={found ? { gene: found.gene, to: found.to, doc: found.doc } : null}
      pairing={cands.find((c) => c.gene === "G4")?.doc ?? null}
      colour={cands.find((c) => c.gene === "G9")?.doc ?? null}
      assets={assets}
    />
  );
}

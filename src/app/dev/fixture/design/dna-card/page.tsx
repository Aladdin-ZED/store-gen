/**
 * GET /dev/fixture/design/dna-card — the DNA card story (P6 DESIGN; design.md DES-§15.6, DES-§15.4; SF-02).
 * Development only (404 in production). `?lang=fr|ar|en`, `?theme=dark`. States: engine (locks closed), Director
 * (locks open, two page locks and one brand lock), a legacy doc (back-derived chips, "remix to upgrade"), and the
 * brand side without `brand.write`. The documents are a repaired engine direction and the argan baseline page.
 */
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import "@/components/admin/styles/admin.css";
import { baselineDoc, cleanDoc } from "@/lib/design/fixtures/prepublish";
import { DnaStory } from "./story";

export const metadata: Metadata = { title: "DNA card fixture", robots: { index: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function DnaCardFixture({ searchParams }: { searchParams: Search }) {
  if (process.env.NODE_ENV === "production") notFound();
  await connection();
  const q = await searchParams;
  const lang = one(q.lang) === "ar" ? "ar" : one(q.lang) === "en" ? "en" : "fr";
  const locale = lang === "ar" ? "ar" : "fr";
  return <DnaStory lang={lang} dark={one(q.theme) === "dark"} engine={cleanDoc("parfum", locale)} legacy={baselineDoc("argan", locale)} />;
}

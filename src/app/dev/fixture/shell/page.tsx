/**
 * The shared primitives' story fixture (P2 SHELL; platform.md PLA-§22.12 "a story fixture in src/app/dev/fixture/**";
 * PLA-§P.2 grants `src/app/dev/fixture/shell/**`): every primitive of src/components/admin/common/** in its states,
 * with made-up demo data, for the screenshot run (scripts/qa/ui-shots.ts). Development only: production answers the
 * 404. The visitor's locale (the `sgl` cookie the screenshot tool sets) picks the language and direction.
 *
 *   /dev/fixture/shell?part=a        pills, badges, monograms, meters, masked values, pager, locks, freshness, skeletons
 *   /dev/fixture/shell?part=b        health ring and groups, issues, KPI tiles, funnel, Today brief, job chip, empty states
 *   /dev/fixture/shell?part=c        the address card, the review card's states, mode cards, role explainer
 *   /dev/fixture/shell?part=limit    the limit sheet open (quota)
 *   /dev/fixture/shell?part=confirm  the typed confirmation open
 *   /dev/fixture/shell?part=stepup   the step-up sheet open (password)
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/components/admin/styles/admin.css";
import { LocaleRoot } from "@/components/admin/common/screen-locale";
import { publicLocale } from "@/lib/auth/locale";
import { Gallery, type GalleryPart } from "./gallery";

export const metadata: Metadata = { title: "Shell primitives", robots: { index: false, follow: false } };

const PARTS: readonly GalleryPart[] = ["a", "b", "c", "limit", "confirm", "stepup"];

export default async function ShellFixturePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const q = await searchParams;
  const raw = typeof q.part === "string" ? q.part : "a";
  const part = (PARTS as readonly string[]).includes(raw) ? (raw as GalleryPart) : "a";
  const locale = await publicLocale();
  return (
    <LocaleRoot locale={locale}>
      <Gallery part={part} />
    </LocaleRoot>
  );
}

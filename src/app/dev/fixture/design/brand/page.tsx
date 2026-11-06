/**
 * GET /dev/fixture/design/brand — the brand kit story (P6 DESIGN; design.md DES-§12.7 "Fixture", BK-1, DS17, DS32).
 * Development only (404 in production). `?lang=fr|ar|en`, `?state=empty|set|moved|readonly`, `?tab=logo|colors|type|voice`,
 * `?theme=dark`. The writes stay in the page (the pure rules of src/lib/design/brand-kit.ts answer them), so every
 * state can be clicked through without a store.
 */
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import "@/components/admin/styles/admin.css";
import { pairingCards } from "@/components/admin/brand/pairing-cards";
import { BrandStory, type BrandStoryState } from "./story";

export const metadata: Metadata = { title: "Brand kit fixture", robots: { index: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const STATES: readonly BrandStoryState[] = ["empty", "set", "moved", "readonly"];
const TABS = ["logo", "colors", "type", "voice"] as const;

export default async function BrandFixture({ searchParams }: { searchParams: Search }) {
  if (process.env.NODE_ENV === "production") notFound();
  await connection();
  const q = await searchParams;
  const lang = one(q.lang) === "ar" ? "ar" : one(q.lang) === "en" ? "en" : "fr";
  const state = (STATES as readonly string[]).includes(one(q.state) ?? "") ? (one(q.state) as BrandStoryState) : "empty";
  const tabArg = one(q.tab);
  const tab = (TABS as readonly string[]).includes(tabArg ?? "") ? (tabArg as (typeof TABS)[number]) : state === "moved" ? "colors" : "logo";
  return <BrandStory lang={lang} dark={one(q.theme) === "dark"} state={state} tab={tab} pairings={pairingCards()} />;
}

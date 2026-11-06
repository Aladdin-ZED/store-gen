/**
 * GET /dev/fixture/design/check-panel — the Design check panel story (P6 DESIGN; design.md DES-§15.6, DES-§15.1).
 * Development only (404 in production). `?lang=fr|ar|en`, `?theme=dark`, `?sheet=1` (the 390 bottom sheet).
 * Every state from real data: the argan baseline page through the real gates, P3's checklist and the budget
 * estimate (3 hard + 5 soft + budgets), a repaired engine direction (clean), the same rows while stale, the
 * server checks unavailable, and the first check still running (skeleton rows).
 */
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import "@/components/admin/styles/admin.css";
import { baselineDoc, cleanDoc, gateInputOf } from "@/lib/design/fixtures/prepublish";
import { gateRun } from "@/lib/design/gates/run";
import { budgetEstimate, panelModel, type PanelItem, type PanelModel } from "@/lib/design/panel";
import { checkContextOf, emptyCheckData } from "@/lib/editor/check-context";
import { buildChecklist } from "@/lib/editor/checklist";
import type { PageDoc } from "@/lib/page/schema";
import { CheckPanelStory, type PanelState } from "./story";

export const metadata: Metadata = { title: "Design check fixture", robots: { index: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function modelOf(doc: PageDoc): PanelModel {
  const run = gateRun(gateInputOf(doc, { context: "builder" }));
  const checklist = buildChecklist(doc, checkContextOf(emptyCheckData(), { store: { hasLegalName: true, hasPhone: true, hasEmail: true, hasAddress: true }, appHref: (p) => `/app/demo${p}` }));
  return panelModel({ report: run.report, items: run.items, slop: run.slop.items, checklist, budget: budgetEstimate(doc, run.view) });
}

/** The story's "3 hard + 5 soft": the first rows of the real model, so every sentence is a real gate's. */
function trimmed(m: PanelModel): PanelModel {
  const soft: PanelItem[] = [...m.groups.improve, ...m.groups.copy, ...m.groups.uniqueness].slice(0, 5);
  const keep = new Set(soft.map((r) => r.key));
  const groups = {
    blocking: m.groups.blocking.slice(0, 3),
    improve: m.groups.improve.filter((r) => keep.has(r.key)),
    copy: m.groups.copy.filter((r) => keep.has(r.key)),
    uniqueness: m.groups.uniqueness.filter((r) => keep.has(r.key)),
  };
  return { ...m, groups, blocking: groups.blocking.length };
}

export default async function CheckPanelFixture({ searchParams }: { searchParams: Search }) {
  if (process.env.NODE_ENV === "production") notFound();
  await connection();
  const q = await searchParams;
  const lang = one(q.lang) === "ar" ? "ar" : one(q.lang) === "en" ? "en" : "fr";
  const locale = lang === "ar" ? "ar" : "fr";
  const busy = baselineDoc("argan", locale);
  const clean = cleanDoc("parfum", locale);
  const issues = trimmed(modelOf(busy));
  const cleanModel = modelOf(clean);
  const states: PanelState[] = [
    { id: "issues", model: issues, status: "ready", novelty: { status: "ready", bands: { platform: "ok", niche: "close", own: "ok" } }, doc: busy },
    { id: "clean", model: { ...cleanModel, groups: { blocking: [], improve: [], copy: [], uniqueness: [] }, blocking: 0 }, status: "ready", novelty: { status: "ready", bands: { platform: "ok", niche: "ok", own: "first" } }, doc: clean },
    { id: "stale", model: issues, status: "stale", novelty: { status: "ready", bands: { platform: "ok", niche: "close", own: "ok" } }, doc: busy },
    { id: "unavailable", model: issues, status: "ready", novelty: { status: "unavailable", bands: null }, doc: busy },
    { id: "checking", model: null, status: "checking", novelty: { status: "loading", bands: null }, doc: busy },
  ];
  return <CheckPanelStory lang={lang} dark={one(q.theme) === "dark"} sheet={one(q.sheet) === "1"} states={states} />;
}

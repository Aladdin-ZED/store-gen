import "server-only";
/**
 * The publish-time quality contract (docs/STORE-SAAS.md §M.1, D51, D52; DES-R3, LAN Q13): `publishPage` (T3) renders
 * the document, then awaits `runPrePublishChecks(ctx)` before it writes the version row; after the commit it calls
 * the publish listeners, which never fail a publish (a failure is an error_events row, area "publish").
 *
 *   registerPrePublishCheck("design", designGate);       // src/lib/render/prepublish/design.ts (P6)
 *   registerPublishListener("design.genome", onPublished);
 *
 * Every check runs (the dialog lists everything at once); the first failing code wins in the order budget → honesty
 * → design. In `warn` mode (`platform_design.gatesAtPublish`, the `design_publish_gates` flag) hard design and budget
 * items become notes and the publish goes through, audited; honesty items have no warn mode. Re-renders run the checks
 * in `warn` mode; exports in `block` mode; previews never.
 *
 * Maintainer-owned (§K.3). The track files `./prepublish/{landing,design}.ts` register at import; their import lines
 * are written here at P0 (`scripts/qa/registries-check.ts` proves no file is left out), next to the core's budget
 * gate `./prepublish/budget.ts` (§M.2; its thresholds in `./prepublish/budget-limits.ts`). R2 adds `StorePageDoc` to
 * the doc types and `./prepublish/storefront.ts`.
 *
 * The import is circular (a track file imports the register functions from here while this module is still being
 * evaluated), so everything a registration touches is a hoisted function declaration: `registry()` included.
 *
 * The field origins (§M.1 rule 2, P0b CCR P3-11): the one builder lives in ./origin.ts (pure, isomorphic) and is
 * re-exported here with the server read of its input, so a gate builds its map as
 * `originFrom(ctx.prev, ctx.doc, await generationRecordFor(ctx.scope, ctx.pageId))`.
 */
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { designGenomes } from "@/lib/db/schema";
import { errorSummary } from "@/lib/orders/log";
import type { PageDoc } from "@/lib/page/schema";
import type { BuiltTheme } from "@/lib/theme/types";
import { whereStore } from "@/lib/tenancy/sql";
import type { Actor, GateItem, StoreRow, StoreScope, WriteScope } from "@/lib/tenancy/types";
import type { GenerationRecord, OriginClass } from "./origin";
import "./prepublish/budget";
import "./prepublish/design";
import "./prepublish/landing";

export type { GateItem } from "@/lib/tenancy/types";
export { hash16, originFrom, textFieldsOf, type GenerationRecord, type OriginClass } from "./origin";

/** What a gate needs to know about an asset the document references (no bytes). */
export interface AssetMeta {
  id: string;
  mime: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  hasAlpha?: boolean;
}

export interface PrePublishCtx {
  /** D71: a publish, a re-render and an export are writes, and the listeners write (genomes, shingles, feedback) */
  scope: WriteScope;
  store: StoreRow;
  pageId: string;
  doc: PageDoc;
  prev: PageDoc | null;
  theme: BuiltTheme;
  assets: ReadonlyMap<string, AssetMeta>;
  actor: Actor;
  now: Date;
  mode: "block" | "warn";
  /** the rendered document (the budget gate measures it), when the caller has it */
  html?: string;
}

export type PrePublishCode = "design_blocked" | "honesty_blocked" | "budget_blocked";
export type PrePublishResult = { ok: true; notes?: GateItem[] } | { ok: false; code: PrePublishCode; items: GateItem[] };
export type PrePublishCheck = (ctx: PrePublishCtx) => Promise<PrePublishResult>;
export type PublishListener = (ctx: PrePublishCtx & { versionId: string; event: "published" | "unpublished" }) => Promise<void>;

declare global {
  var __sgPrePublish: { checks: Map<string, PrePublishCheck>; listeners: Map<string, PublishListener> } | undefined;
}

/** A function declaration, not a const: a track file registers while this module is still evaluating (see above). */
function registry(): { checks: Map<string, PrePublishCheck>; listeners: Map<string, PublishListener> } {
  return (globalThis.__sgPrePublish ??= { checks: new Map<string, PrePublishCheck>(), listeners: new Map<string, PublishListener>() });
}

/** The order a refusal's code is chosen in: a page that is too heavy is told so before its design is judged. */
const CODE_ORDER: readonly PrePublishCode[] = ["budget_blocked", "honesty_blocked", "design_blocked"];

/** ≤ 400 ms each, pure over ctx. A second registration under one name replaces the first (a dev reload). */
export function registerPrePublishCheck(name: string, fn: PrePublishCheck): void {
  registry().checks.set(name, fn);
}

export function registerPublishListener(name: string, fn: PublishListener): void {
  registry().listeners.set(name, fn);
}

/**
 * Runs every registered check. `warn` mode turns refusals into notes, except honesty refusals (no warn mode). A
 * check that throws is a server fault, not a refusal: it propagates and the publish answers `server`.
 */
export async function runPrePublishChecks(ctx: PrePublishCtx): Promise<{ ok: true; notes: GateItem[] } | { ok: false; code: PrePublishCode; items: GateItem[] }> {
  const results = await Promise.all([...registry().checks.values()].map((check) => check(ctx)));
  const notes: GateItem[] = [];
  const refusals = new Map<PrePublishCode, GateItem[]>();
  for (const r of results) {
    if (r.ok) {
      notes.push(...(r.notes ?? []));
    } else if (ctx.mode === "warn" && r.code !== "honesty_blocked") {
      notes.push(...r.items.map((i) => ({ ...i, level: "soft" as const })));
    } else {
      refusals.set(r.code, [...(refusals.get(r.code) ?? []), ...r.items]);
    }
  }
  const code = CODE_ORDER.find((c) => refusals.has(c));
  if (!code) return { ok: true, notes };
  return { ok: false, code, items: [...CODE_ORDER.flatMap((c) => refusals.get(c) ?? []), ...notes] };
}

/** After the commit: every listener runs; a failure is logged and never reaches the publisher. */
export async function runPublishListeners(ctx: PrePublishCtx & { versionId: string; event: "published" | "unpublished" }): Promise<void> {
  await Promise.all(
    [...registry().listeners.entries()].map(async ([name, fn]) => {
      try {
        await fn(ctx);
      } catch (err) {
        console.error(`[publish] listener "${name}" failed:`, errorSummary(err));
      }
    }),
  );
}

/* ------------------------------------------------------------------ */
/* The generation record (§M.1 rule 2, DES-§9.8)                       */
/* ------------------------------------------------------------------ */

const ORIGIN_CLASSES: readonly string[] = ["owner", "library", "engine", "local", "cloud"] satisfies readonly OriginClass[];
const HASH16 = /^[0-9a-f]{16}$/;

/**
 * The generation record of a page: `report.gen` of its newest `design_genomes` row of kind `page` and source `chosen`
 * in the scope's store (P6's wizard writes it), or null (no such row, or a row without a record: `originFrom` then
 * answers "library" for every field). Entries that are not `{ h: 16 hex, o: OriginClass }` are dropped, so they read
 * as "owner".
 */
export async function generationRecordFor(scope: StoreScope, pageId: string): Promise<GenerationRecord | null> {
  const [row] = await db
    .select({ report: designGenomes.report })
    .from(designGenomes)
    .where(whereStore(designGenomes, scope, eq(designGenomes.pageId, pageId), eq(designGenomes.kind, "page"), eq(designGenomes.source, "chosen")))
    .orderBy(desc(designGenomes.createdAt), desc(designGenomes.id))
    .limit(1);
  const gen: unknown = row?.report?.gen;
  if (!gen || typeof gen !== "object" || Array.isArray(gen)) return null;
  const out: GenerationRecord = {};
  for (const [path, rec] of Object.entries(gen as Record<string, unknown>)) {
    const r = rec as { h?: unknown; o?: unknown } | null;
    if (r && typeof r.h === "string" && HASH16.test(r.h) && typeof r.o === "string" && ORIGIN_CLASSES.includes(r.o)) out[path] = { h: r.h, o: r.o as OriginClass };
  }
  return out;
}

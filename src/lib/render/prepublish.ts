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
 * are written here at P0 (`scripts/qa/registries-check.ts` proves no file is left out), and the core's
 * `./prepublish/budget.ts` joins them with its own stub. R2 adds `StorePageDoc` to the doc types and
 * `./prepublish/storefront.ts`.
 *
 * The import is circular (a track file imports the register functions from here while this module is still being
 * evaluated), so everything a registration touches is a hoisted function declaration: `registry()` included.
 */
import { errorSummary } from "@/lib/orders/log";
import type { PageDoc } from "@/lib/page/schema";
import type { BuiltTheme } from "@/lib/theme/types";
import type { Actor, GateItem, StoreRow, StoreScope } from "@/lib/tenancy/types";
import "./prepublish/design";
import "./prepublish/landing";

export type { GateItem } from "@/lib/tenancy/types";

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
  scope: StoreScope;
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

"use client";
/**
 * The builder's design state (P6 DESIGN; design.md DES-§15.1, DES-§15.2, DES-§15.4). One provider under the editor
 * store runs the Design check for every consumer (the rail panel, its top-bar badge, the publish dialog's fixes and
 * the DNA card), so they all show the same ids.
 *
 *  - The check runs 400 ms after the last edit, inside requestIdleCallback: the design gates (`gateRun`, ≤ 8 ms),
 *    P3's `buildChecklist(doc, LandingCheckContext)` and the client budget estimate, merged by `panelModel`.
 *    `stale` covers the ≤ 400 ms between an edit and the rerun; `checking` (skeleton rows) shows only before the
 *    first result and after 150 ms.
 *  - Field origin is derived here from the chosen row's generation record (`originFrom`): never stored in the doc.
 *  - The novelty bands come from `pageNoveltyAction` (rate-limited) when the panel or the DNA card is open and the
 *    page's distance view changed; a refusal or an offline server is `unavailable`, the local checks still show.
 *  - "Ignore on this page" is a per-viewer convenience in localStorage (try/catch), soft rows only.
 *  - `fix(ops)` and `fixAll()` apply RepairOps through `replaceDoc`: one history step each (⌘Z reverts).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useStore } from "@/components/admin/shell/store-context";
import { brandLockedGenes, type BrandLite } from "@/lib/design/brand-apply";
import { designContextAction, pageNoveltyAction } from "@/lib/design/actions";
import { genomeOf } from "@/lib/design/derive";
import { distanceView, packView } from "@/lib/design/distance";
import type { DesignGenome } from "@/lib/design/genome";
import { gateRun } from "@/lib/design/gates/run";
import type { AssetMeta, OriginClass } from "@/lib/design/gates/types";
import { applyFix, budgetEstimate, builderGateInput, fixAllOps, panelModel, type PanelBands, type PanelModel } from "@/lib/design/panel";
import type { RepairOp } from "@/lib/design/gates/repair";
import { checkContextOf } from "@/lib/editor/check-context";
import { buildChecklist } from "@/lib/editor/checklist";
import { useT } from "@/lib/i18n/admin/client";
import type { PageDoc } from "@/lib/page/schema";
import { originFrom, type GenerationRecord } from "@/lib/render/origin";
import { useEditor, useEditorStore } from "../context";
import { useEnv } from "../env";

export type CheckStatus = "checking" | "ready" | "stale";
export type NoveltyState = { status: "idle" | "loading" | "ready" | "unavailable"; bands: PanelBands | null };

export interface DesignCheckState {
  status: CheckStatus;
  /** "checking" for longer than 150 ms: the skeleton rows show (never a spinner) */
  skeleton: boolean;
  /** the last result (kept while stale) */
  model: PanelModel | null;
  genome: DesignGenome | null;
  origin: ReadonlyMap<string, OriginClass>;
  novelty: NoveltyState;
  /** the server context: generation record, provenance, brand, brand.write (null until loaded or when offline) */
  context: { gen: GenerationRecord | null; source: "engine" | "director" | null; brand: BrandLite; canBrand: boolean } | null;
  contextFailed: boolean;
  /** the genes the brand locks (Differentiate and the remixes never move them) */
  brandLocks: readonly string[];
  ignoredCount: number;
  /** the rail panel is open (P6 component state, DES-§15.1) */
  open: boolean;
  setOpen(open: boolean): void;
  fix(ops: readonly RepairOp[]): boolean;
  fixAll(): void;
  ignore(key: string): void;
  restoreIgnored(): void;
  /** a consumer that shows the bands (panel, DNA card) asks for them while mounted */
  wantNovelty(): () => void;
  /** re-asks the server (after a refusal, or once the owner changed the page) */
  refreshNovelty(): void;
  setBrand(brand: BrandLite): void;
  /** the page's niche inputs and the server call for Differentiate's variants */
  checkVariants(cands: { key: string; vec: number[] }[]): Promise<{ key: string; platform: string; niche: string; own: string; clone: boolean }[] | null>;
}

const Ctx = createContext<DesignCheckState | null>(null);

/** The check's state; null outside the builder (fixtures pass their own props). */
export function useDesignCheck(): DesignCheckState | null {
  return useContext(Ctx);
}

const RERUN_MS = 400;
const SKELETON_MS = 150;
const NOVELTY_MS = 2500;

const ignoreKey = (pageId: string) => `sg:design-ignore:${pageId}`;
function readIgnored(pageId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(ignoreKey(pageId));
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === "string").slice(0, 200) : []);
  } catch {
    return new Set();
  }
}
function writeIgnored(pageId: string, keys: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(ignoreKey(pageId), JSON.stringify([...keys]));
  } catch {
    // a private window or blocked storage: the ignore lasts for this visit only
  }
}

const idle = (fn: () => void): (() => void) => {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout: 600 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(fn, 0);
  return () => window.clearTimeout(id);
};

export function DesignCheckProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const store = useEditorStore();
  const doc = useEditor((s) => s.doc);
  const pageId = useEditor((s) => s.page.id);
  const assets = useEditor((s) => s.assets);
  const isPublished = useEditor((s) => s.page.status === "published");
  const { storeHealth, check } = useEnv();
  const storeView = useStore();

  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<DesignCheckState["context"]>(null);
  const [contextFailed, setContextFailed] = useState(false);
  const [ignored, setIgnored] = useState<Set<string>>(() => new Set());
  const [result, setResult] = useState<{ model: PanelModel; genome: DesignGenome; doc: PageDoc } | null>(null);
  const [status, setStatus] = useState<CheckStatus>("checking");
  const [novelty, setNovelty] = useState<NoveltyState>({ status: "idle", bands: null });
  const [wanted, setWanted] = useState(0);
  const [noveltyTick, setNoveltyTick] = useState(0);

  useEffect(() => setIgnored(readIgnored(pageId)), [pageId]);

  // the server context once per page (the generation record, the provenance, the brand)
  useEffect(() => {
    let live = true;
    void designContextAction(pageId)
      .then((r) => {
        if (!live) return;
        if (r.ok) setContext(r.data);
        else setContextFailed(true);
      })
      .catch(() => live && setContextFailed(true));
    return () => {
      live = false;
    };
  }, [pageId]);

  const meta = useMemo<ReadonlyMap<string, AssetMeta>>(() => new Map(Object.values(assets).map((a) => [a.id, { id: a.id, width: a.width, height: a.height, alpha: !!a.alpha }])), [assets]);
  const gen = context?.gen ?? null;
  const origin = useMemo(() => originFrom(null, doc, gen), [doc, gen]);

  // the rerun: stale at once, checked 400 ms after the last edit, in idle time
  const latest = useRef({ doc, origin, meta, ignored, bands: novelty.bands });
  useEffect(() => {
    latest.current = { doc, origin, meta, ignored, bands: novelty.bands };
  });
  useEffect(() => {
    setStatus((s) => (s === "ready" ? "stale" : s));
    let cancelIdle: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      cancelIdle = idle(() => {
        const cur = latest.current;
        try {
          const input = builderGateInput(cur.doc, { assets: cur.meta, origin: cur.origin, novelty: cur.bands });
          const run = gateRun(input);
          const checklist = buildChecklist(cur.doc, checkContextOf(check, { store: storeHealth, pixels: { library: null, health: {}, live: isPublished }, appHref: (path) => storeView.href(path) }));
          const model = panelModel({ report: run.report, items: run.items, slop: run.slop.items, checklist, budget: budgetEstimate(cur.doc, run.view), ignored: cur.ignored });
          setResult({ model, genome: input.genome, doc: cur.doc });
        } catch (err) {
          // a gate crash never blocks the editor: the last result stays and the console says why
          console.error("design check", err);
        }
        setStatus("ready");
      });
    }, RERUN_MS);
    return () => {
      window.clearTimeout(timer);
      cancelIdle?.();
    };
  }, [doc, origin, meta, ignored, novelty.bands, check, storeHealth, isPublished, storeView]);

  // skeleton rows only when the first check takes longer than 150 ms
  const [skeleton, setSkeleton] = useState(false);
  useEffect(() => {
    if (result) return;
    const id = window.setTimeout(() => setSkeleton(true), SKELETON_MS);
    return () => window.clearTimeout(id);
  }, [result]);

  // the novelty bands: the page's view, when a consumer shows them and the view changed
  const vec = useMemo(() => {
    if (!result) return null;
    try {
      return packView(distanceView(result.genome, { theme: result.doc.theme }, result.doc.locale, "page"));
    } catch {
      return null;
    }
  }, [result]);
  const vecKey = vec ? vec.join(",") : "";
  const asked = useRef("");
  const niche = useMemo(() => ({ market: doc.market ?? null, product: { category: doc.product.category ?? null, name: doc.product.name ?? null, tagline: doc.product.tagline ?? null } }), [doc.market, doc.product.category, doc.product.name, doc.product.tagline]);
  useEffect(() => {
    if (!wanted || !vec || (asked.current === `${vecKey}#${noveltyTick}` && novelty.status !== "idle")) return;
    const id = window.setTimeout(() => {
      asked.current = `${vecKey}#${noveltyTick}`;
      setNovelty((n) => ({ status: "loading", bands: n.bands }));
      void pageNoveltyAction({ pageId, ...niche, candidates: [{ key: pageId, vec }] })
        .then((r) => {
          const v = r.ok ? r.data[0] : undefined;
          setNovelty(v ? { status: "ready", bands: { platform: v.platform, niche: v.niche, own: v.own, clone: v.clone } } : (n) => ({ status: "unavailable", bands: n.bands }));
        })
        .catch(() => setNovelty((n) => ({ status: "unavailable", bands: n.bands })));
    }, novelty.status === "idle" ? 300 : NOVELTY_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the vector's text is the identity of the view
  }, [wanted, vecKey, noveltyTick, pageId, niche]);

  const fix = useCallback(
    (ops: readonly RepairOp[]): boolean => {
      const s = store.getState();
      const next = applyFix(s.doc, genomeOf(s.doc), ops, latest.current.origin);
      if (!next) {
        toast(t("design.check.nothing"));
        return false;
      }
      s.replaceDoc(next);
      toast.success(t("design.check.fixed"), { action: { label: t("design.check.undo"), onClick: () => store.getState().undo() } });
      return true;
    },
    [store, t],
  );

  const model = result?.model ?? null;
  const fixAll = useCallback(() => {
    if (!model) return;
    const ops = fixAllOps(model);
    const s = store.getState();
    const next = applyFix(s.doc, genomeOf(s.doc), ops, latest.current.origin);
    if (!next) {
      toast(t("design.check.nothing"));
      return;
    }
    s.replaceDoc(next);
    toast.success(t("design.check.fixedAll", { count: model.groups.blocking.filter((r) => r.fix?.length).length }), { action: { label: t("design.check.undo"), onClick: () => store.getState().undo() } });
  }, [model, store, t]);

  const ignore = useCallback(
    (key: string) =>
      setIgnored((prev) => {
        const next = new Set(prev).add(key);
        writeIgnored(pageId, next);
        return next;
      }),
    [pageId],
  );
  const restoreIgnored = useCallback(() => {
    setIgnored(new Set());
    writeIgnored(pageId, new Set());
  }, [pageId]);

  const wantNovelty = useCallback(() => {
    setWanted((n) => n + 1);
    return () => setWanted((n) => n - 1);
  }, []);
  const refreshNovelty = useCallback(() => setNoveltyTick((n) => n + 1), []);
  const setBrand = useCallback((brand: BrandLite) => setContext((c) => (c ? { ...c, brand } : c)), []);
  const checkVariants = useCallback(
    async (cands: { key: string; vec: number[] }[]) => {
      if (!vec) return null;
      try {
        const r = await pageNoveltyAction({ pageId, ...niche, candidates: [{ key: pageId, vec }, ...cands.slice(0, 6)] });
        return r.ok ? r.data : null;
      } catch {
        return null;
      }
    },
    [pageId, niche, vec],
  );

  const value = useMemo<DesignCheckState>(
    () => ({
      status: result ? status : "checking",
      skeleton: !result && skeleton,
      model,
      genome: result?.genome ?? null,
      origin,
      novelty,
      context,
      contextFailed,
      brandLocks: brandLockedGenes(context?.brand ?? null),
      ignoredCount: ignored.size,
      open,
      setOpen,
      fix,
      fixAll,
      ignore,
      restoreIgnored,
      wantNovelty,
      refreshNovelty,
      setBrand,
      checkVariants,
    }),
    [result, status, skeleton, model, origin, novelty, context, contextFailed, ignored.size, open, fix, fixAll, ignore, restoreIgnored, wantNovelty, refreshNovelty, setBrand, checkVariants],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

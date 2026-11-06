"use client";
/**
 * Differentiate (P6 DESIGN; design.md DES-§15.3 rev 3, UX-24): never a dead end.
 *  1. ≤ 6 seeds over the unlocked G2 / G18, then G4 / G9 (`differentiateDocs`, loaded on demand); the page and the
 *     variants go to the server in one `pageNoveltyAction` call and the first variant that clears every band is
 *     previewed as a before / after toggle, applied as one undoable edit.
 *  2. No seed clears: the three differentiators as one-tap actions, each previewed before / after: change the
 *     pairing (G4), change the colour strategy (G9), add a second photo (the media picker); then "Remix design".
 * Locked genes never move (the brand's and the page's). The platform band and the clone flag are never bypassed: a
 * clone reads "Almost identical to another store" and offers only the remix.
 *
 * `DifferentiateView` is the pure view (the story fixture renders its states); `Differentiate` wires it to the
 * builder.
 */
import { ImagePlus, Palette, Shuffle, Type } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { LandingThumbnail, type PreviewAssets } from "@/components/preview";
import { Button } from "@/components/ui/button";
import type { StoreInfo } from "@/landing/context";
import type { DiffCandidate } from "@/lib/design/panel-diff";
import type { PanelBands } from "@/lib/design/panel";
import type { MessageKey } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/admin/client";
import type { PageDoc } from "@/lib/page/schema";
import { cn } from "@/lib/utils";
import { useEditor, useEditorStore } from "../context";
import { useEnv } from "../env";
import { useMedia } from "../media";
import { loadRemix } from "../on-demand";
import { Segmented } from "../ui";
import { useDesignCheck } from "./check-context";

export type DiffState =
  | { kind: "searching" }
  | { kind: "found"; candidate: Pick<DiffCandidate, "gene" | "to" | "doc"> }
  | { kind: "none"; pairing: DiffCandidate["doc"] | null; colour: DiffCandidate["doc"] | null }
  | { kind: "unavailable" }
  | { kind: "clone" };

const GENE_KEY: Record<DiffCandidate["gene"], MessageKey> = { G2: "design.gene.G2", G18: "design.gene.G18", G4: "design.gene.G4", G9: "design.gene.G9" };

export interface DifferentiateViewProps {
  state: DiffState;
  before: PageDoc;
  assets: PreviewAssets;
  store?: StoreInfo;
  onApply(doc: PageDoc): void;
  onPhoto(): void;
  onRemix(): void;
  /** the 390 bottom sheet: 44 px buttons */
  touch?: boolean;
  /** fixtures: no live thumbnails (iframes) */
  thumbnails?: boolean;
}

export function DifferentiateView({ state, before, assets, store, onApply, onPhoto, onRemix, touch, thumbnails = true }: DifferentiateViewProps) {
  const t = useT();
  const [preview, setPreview] = useState<{ doc: PageDoc; label: string } | null>(null);
  const [side, setSide] = useState<"before" | "after">("after");
  const found = state.kind === "found" ? state.candidate : null;
  const shown = found ? { doc: found.doc, label: t("design.diff.found", { what: t(GENE_KEY[found.gene]) }) } : preview;
  const h = touch ? "h-11" : "h-8";
  return (
    <div className="mx-4 mt-1.5 rounded-xl border border-border/70 bg-card p-3">
      <p className="text-[12px] font-medium">{t("design.diff.title")}</p>
      {state.kind === "searching" ? (
        <div className="mt-2 grid gap-1.5" aria-busy="true">
          <p className="text-[12px] text-muted-foreground">{t("design.diff.searching")}</p>
          <span className="h-24 rounded-lg bg-muted" aria-hidden="true" />
        </div>
      ) : state.kind === "clone" ? (
        <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">{t("design.diff.clone")}</p>
      ) : state.kind === "unavailable" ? (
        <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">{t("design.diff.unavailable")}</p>
      ) : state.kind === "none" ? (
        <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">{t("design.diff.none")}</p>
      ) : null}

      {shown ? (
        <div className="mt-2.5 grid gap-2">
          <p className="text-[12px] leading-snug">{shown.label}</p>
          <Segmented
            value={side}
            onChange={setSide}
            label={shown.label}
            size="sm"
            options={[
              { value: "before", label: t("design.diff.before") },
              { value: "after", label: t("design.diff.after") },
            ]}
          />
          {thumbnails ? (
            <LandingThumbnail doc={side === "before" ? before : shown.doc} assets={assets} store={store} device="mobile" sections={2} aspectRatio="390 / 300" className="w-full overflow-hidden rounded-lg border border-border/60" />
          ) : (
            <div className="grid aspect-[390/300] place-items-center rounded-lg border border-border/60 bg-muted/60 text-[12px] text-muted-foreground">{side === "before" ? t("design.diff.before") : t("design.diff.after")}</div>
          )}
          <Button type="button" variant="brand" className={cn("w-full text-[13px]", h)} onClick={() => onApply(shown.doc)}>
            {t("design.diff.apply")}
          </Button>
        </div>
      ) : null}

      {state.kind === "none" || state.kind === "unavailable" ? (
        <div className="mt-2.5 grid gap-1.5">
          <Button type="button" variant="secondary" className={cn("justify-start gap-2 text-[13px]", h)} disabled={state.kind !== "none" || !state.pairing} onClick={() => state.kind === "none" && state.pairing && setPreview({ doc: state.pairing, label: t("design.wizard.diff.pairing") })}>
            <Type className="size-4" aria-hidden="true" />
            {t("design.wizard.diff.pairing")}
          </Button>
          <Button type="button" variant="secondary" className={cn("justify-start gap-2 text-[13px]", h)} disabled={state.kind !== "none" || !state.colour} onClick={() => state.kind === "none" && state.colour && setPreview({ doc: state.colour, label: t("design.wizard.diff.colour") })}>
            <Palette className="size-4" aria-hidden="true" />
            {t("design.wizard.diff.colour")}
          </Button>
          <Button type="button" variant="secondary" className={cn("justify-start gap-2 text-[13px]", h)} onClick={onPhoto}>
            <ImagePlus className="size-4" aria-hidden="true" />
            {t("design.wizard.diff.photo")}
          </Button>
        </div>
      ) : null}
      {state.kind !== "searching" && state.kind !== "found" ? (
        <Button type="button" variant="ghost" className={cn("mt-1.5 w-full gap-2 text-[13px]", h)} onClick={onRemix}>
          <Shuffle className="size-4" aria-hidden="true" />
          {t("design.diff.remix")}
        </Button>
      ) : null}
    </div>
  );
}

const newSeed = () => {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0]! % 2_147_483_647;
};

/** The builder's Differentiate: searches once per page view, then hands the state to the view. */
export function Differentiate({ bands, touch }: { bands: PanelBands; touch?: boolean }) {
  const t = useT();
  const check = useDesignCheck();
  const store = useEditorStore();
  const doc = useEditor((s) => s.doc);
  const assets = useEditor((s) => s.assets);
  const { store: storeInfo } = useEnv();
  const media = useMedia();
  const [state, setState] = useState<DiffState>(bands.clone || bands.platform === "too_close" ? { kind: "clone" } : { kind: "searching" });
  const locks = useMemo(() => [...(check?.brandLocks ?? [])], [check?.brandLocks]);
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  });
  const checkVariants = check?.checkVariants;
  // one search per look of the page (a text edit does not restart it)
  const lookKey = JSON.stringify(doc.theme);

  useEffect(() => {
    if (bands.clone || bands.platform === "too_close") {
      setState({ kind: "clone" });
      return;
    }
    let live = true;
    setState({ kind: "searching" });
    void (async () => {
      try {
        const { differentiateDocs, pickDifferentiate } = await import("@/lib/design/panel-diff");
        const cands = differentiateDocs(docRef.current, newSeed(), locks);
        const verdicts = cands.length && checkVariants ? await checkVariants(cands.map((c) => ({ key: c.key, vec: c.vec }))) : [];
        if (!live) return;
        if (verdicts === null) {
          setState({ kind: "unavailable" });
          return;
        }
        const pick = pickDifferentiate(cands, verdicts);
        if (pick) setState({ kind: "found", candidate: pick });
        else setState({ kind: "none", pairing: cands.find((c) => c.gene === "G4")?.doc ?? null, colour: cands.find((c) => c.gene === "G9")?.doc ?? null });
      } catch {
        if (live) setState({ kind: "unavailable" });
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the look is the identity of the search
  }, [lookKey, bands.clone, bands.platform, bands.niche, bands.own, locks, checkVariants]);

  const apply = (next: PageDoc) => {
    store.getState().replaceDoc(next);
    toast.success(t("design.diff.applied"), { action: { label: t("design.check.undo"), onClick: () => store.getState().undo() } });
    check?.refreshNovelty();
  };
  const photo = async () => {
    const picked = await media.pick({ accept: "image" });
    if (!picked) return;
    const s = store.getState();
    s.addAssets([picked]);
    s.updateDoc((d) => {
      if (!d.product.images.some((x) => x.id === picked.id)) d.product.images.push({ id: picked.id, alt: picked.alt });
    });
    check?.refreshNovelty();
  };
  const remix = async () => {
    try {
      const remixDoc = await loadRemix();
      const before = store.getState().doc;
      const out = remixDoc(before, { seed: newSeed(), scope: "design" });
      if (out === before) throw new Error("no remix");
      apply(out);
    } catch {
      toast.error(t("design.theme.remixFailed"));
    }
  };
  return <DifferentiateView state={state} before={doc} assets={assets} store={storeInfo} onApply={apply} onPhoto={() => void photo()} onRemix={() => void remix()} touch={touch} />;
}

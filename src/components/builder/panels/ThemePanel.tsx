"use client";
/**
 * Theme panel: style (11 archetypes, content kept), colors (accent / pop with live contrast,
 * harmony, base mood, derive from the product photos), font pairings previewed in Latin and
 * Arabic, shape & depth, motion & decoration, and a seed shuffle.
 */
import { Dices, Dna, LoaderCircle, Minus, Plus, Stamp, WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ARCHETYPES, DIVIDERS, HARMONIES, PageDoc, type Archetype, type Divider, type ThemeSpec } from "@/lib/page/schema";
import { ARCHETYPE_DEFS, contrast, extractPalette, fontFaceCss, fontStack, parseExtractedPalette, themeFromProduct, type ExtractedPalette, type FontPairing } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useEditor, useEditorApi, useEditorStore } from "../context";
import { assetUrl, useBuiltTheme } from "../env";
import { loadRemix } from "../on-demand";
import { ThemeDna } from "../design/DnaCard";
import { useDesignCheck } from "../design/check-context";
import { applyBrand } from "@/lib/design/brand-apply";
import { useT } from "@/lib/i18n/admin/client";
import { DIVIDER_LABELS, DividerGlyph } from "../section-meta";
import { Choice, ColorInput, FieldRow, Hint, PanelHeader, PanelSection, Segmented } from "../ui";

const HARMONY_LABELS: Record<(typeof HARMONIES)[number], string> = {
  "mono-luxe": "Mono luxe — one precious accent",
  "clay-sage": "Clay & sage — soft naturals",
  "earth-triad": "Earth triad — warm and grounded",
  "pop-complement": "Pop complement — bold contrast",
  "contrast-neon": "Contrast neon — dark + electric",
  "cool-precise": "Cool precise — crisp tech",
  "warm-butter": "Warm butter — friendly home",
  "blush-berry": "Blush & berry — beauty glow",
  "ink-accent": "Ink accent — editorial monochrome",
};

const SAMPLE_AR = "عرض خاص لفترة محدودة";

export function ThemePanel() {
  const theme = useEditor((s) => s.doc.theme);
  const api = useEditorApi();
  const set = (recipe: (t: ThemeSpec) => void, group?: string) => api.updateDoc((d) => recipe(d.theme as ThemeSpec), group ?? null);

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Theme" description="Switching style keeps all your content." />
      <div className="bld-scroll min-h-0 flex-1 overflow-y-auto pb-10">
        <DesignDnaSection />
        <PanelSection title="Style" collapsible>
          <ArchetypeGallery current={theme.archetype} />
        </PanelSection>
        <PanelSection title="Colors" collapsible>
          <ColorsBlock theme={theme} set={set} />
        </PanelSection>
        <PanelSection title="Fonts" collapsible>
          <FontPairings theme={theme} set={set} />
        </PanelSection>
        <PanelSection title="Shape & depth" collapsible>
          <FieldRow label="Corners">
            <Choice
              value={theme.radius}
              onChange={(v) => set((t) => void (t.radius = v))}
              options={[
                { value: "archetype", label: "Style default" },
                { value: "none", label: "Square" },
                { value: "subtle", label: "Subtle" },
                { value: "soft", label: "Soft" },
                { value: "round", label: "Round" },
              ]}
            />
          </FieldRow>
          <FieldRow label="Shadows">
            <Choice
              value={theme.shadow}
              onChange={(v) => set((t) => void (t.shadow = v))}
              options={[
                { value: "archetype", label: "Style default" },
                { value: "none", label: "None — flat" },
                { value: "soft", label: "Soft" },
                { value: "deep", label: "Deep" },
                { value: "glow", label: "Glow" },
              ]}
            />
          </FieldRow>
          <FieldRow label="Sections">
            <Segmented
              value={theme.surfaces}
              onChange={(v) => set((t) => void (t.surfaces = v))}
              label="Section surfaces"
              size="sm"
              options={[
                { value: "archetype", label: "Default" },
                { value: "flush", label: "Edge to edge" },
                { value: "panels", label: "Panels" },
              ]}
            />
          </FieldRow>
          <GrainNotice />
        </PanelSection>
        <PanelSection title="Motion & decoration" collapsible>
          <FieldRow label="Motion">
            <Segmented
              value={theme.motion}
              onChange={(v) => set((t) => void (t.motion = v))}
              label="Motion"
              size="sm"
              options={[
                { value: "calm", label: "Calm" },
                { value: "lively", label: "Lively" },
                { value: "off", label: "Off" },
              ]}
            />
          </FieldRow>
          <FieldRow label="Decoration" trailing={<span className="font-mono text-[11px] tabular-nums text-muted-foreground">{theme.ornament.toFixed(1)}×</span>}>
            <Slider value={[theme.ornament]} min={0} max={2} step={0.1} onValueChange={([v]) => set((t) => void (t.ornament = Math.round((v ?? 1) * 10) / 10), "theme:ornament")} aria-label="Decoration density" />
          </FieldRow>
          <DividerFamily theme={theme} set={set} />
        </PanelSection>
        <div className="px-4 pt-2">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              const b = new Uint32Array(1);
              crypto.getRandomValues(b);
              set((t) => void (t.seed = b[0]! % 2_147_483_647));
            }}
          >
            <Dices />
            Shuffle details
          </Button>
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">New rotations, shapes and edge picks — same colors and fonts.</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* archetypes                                                          */
/* ------------------------------------------------------------------ */

/** @font-face rules (Latin + Arabic subsets) for font samples shown in the admin. */
function FontFaces({ ids }: { ids: string[] }) {
  const css = useMemo(() => fontFaceCss([...new Set(ids)], "ar", "/"), [ids]);
  return <style>{css}</style>;
}

function ArchetypeGallery({ current }: { current: Archetype }) {
  const store = useEditorStore();
  const ids = useMemo(() => ARCHETYPES.map((a) => ARCHETYPE_DEFS[a].fonts[0]?.display).filter((x): x is NonNullable<typeof x> => !!x), []);

  const choose = (id: Archetype) => {
    if (id === current) return;
    const def = ARCHETYPE_DEFS[id];
    const pair = def.fonts[0];
    store.getState().updateDoc((d) => {
      d.theme.archetype = id;
      d.theme.palette.harmony = def.harmony as ThemeSpec["palette"]["harmony"];
      if (pair) d.theme.fonts = { display: pair.display, body: pair.body, displayAr: pair.displayAr, bodyAr: pair.bodyAr, ...(pair.accent ? { accent: pair.accent } : {}) };
      d.theme.radius = "archetype";
      d.theme.shadow = "archetype";
      d.theme.texture = "archetype";
      d.theme.surfaces = "archetype";
      d.theme.dividers = [];
      d.theme.ornament = def.ornament;
      d.theme.motion = def.defaultMotion;
    });
    toast(`Style: ${def.label}`, {
      description: "Want the sections to follow too?",
      action: {
        label: "Match layouts",
        onClick: async () => {
          try {
            const remixDoc = await loadRemix();
            const s = store.getState();
            const out = remixDoc(s.doc, { seed: s.doc.theme.seed, scope: "layout" });
            if (out === s.doc) throw new Error("no remix");
            s.replaceDoc(PageDoc.parse(out));
          } catch {
            toast.error("Could not match the layouts. Use Remix → Layout instead.");
          }
        },
      },
    });
  };

  return (
    <>
      <FontFaces ids={ids} />
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Design style">
        {ARCHETYPES.map((id) => {
          const def = ARCHETYPE_DEFS[id];
          const sig = def.signature[0];
          const font = def.fonts[0];
          const active = id === current;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              data-selected={active}
              title={def.description}
              onClick={() => choose(id)}
              className="bld-tile group relative flex flex-col overflow-hidden text-left outline-none"
            >
              <span className="relative flex h-[4.25rem] items-end justify-between overflow-hidden px-2.5 pb-1.5" style={{ background: sig ? `linear-gradient(135deg, color-mix(in oklab, ${sig.accent} 16%, var(--card)), color-mix(in oklab, ${sig.pop} 22%, var(--card)))` : "var(--muted)" }}>
                <span className="text-[30px] leading-none text-foreground" style={{ fontFamily: font ? fontStack(font.display) : undefined, fontWeight: font?.displayWeight }}>
                  Aa
                </span>
                {sig ? (
                  <span className="mb-1 flex -space-x-1.5">
                    <span className="size-4 rounded-full ring-2 ring-card" style={{ background: sig.accent }} />
                    <span className="size-4 rounded-full ring-2 ring-card" style={{ background: sig.pop }} />
                  </span>
                ) : null}
              </span>
              <span className="px-2.5 py-2">
                <span className="block text-[12.5px] font-semibold">{def.label}</span>
                <span className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-muted-foreground">{def.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* colors                                                              */
/* ------------------------------------------------------------------ */

function ContrastBadge({ ratio, label }: { ratio: number | null; label: string }) {
  if (ratio === null || !Number.isFinite(ratio)) return null;
  const grade = ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA large" : "Low";
  return (
    <span
      title={`${label}: ${ratio.toFixed(2)}:1`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-px font-mono text-[10px] font-semibold tabular-nums",
        ratio >= 4.5 ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400" : ratio >= 3 ? "bg-warn/14 text-warn-ink" : "bg-destructive/10 text-destructive",
      )}
    >
      {ratio.toFixed(1)} {grade}
    </span>
  );
}

function safeContrast(a: string | undefined, b: string | undefined): number | null {
  if (!a || !b) return null;
  try {
    return contrast(a, b);
  } catch {
    return null;
  }
}

/** Palette of the product photos: stored with the asset, else measured here from a small rendition. */
async function photoPalette(urls: string[], stored: unknown[]): Promise<ExtractedPalette | null> {
  for (const p of stored) {
    const parsed = parseExtractedPalette(p);
    if (parsed) return parsed;
  }
  for (const url of urls) {
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      const size = 96;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) continue;
      ctx.drawImage(img, 0, 0, size, size);
      return extractPalette(ctx.getImageData(0, 0, size, size).data, size, size);
    } catch {
      // try the next photo
    }
  }
  return null;
}

function ColorsBlock({ theme, set }: { theme: ThemeSpec; set: (recipe: (t: ThemeSpec) => void, group?: string) => void }) {
  const built = useBuiltTheme();
  const store = useEditorStore();
  const product = useEditor((s) => s.doc.product);
  const [deriving, setDeriving] = useState(false);
  const tk = built?.tokens ?? {};
  const hasPhotos = !!product.cutout || product.images.length > 0;

  const derive = async () => {
    const st = store.getState();
    const refs = [st.doc.product.cutout, ...st.doc.product.images].filter((r): r is NonNullable<typeof r> => !!r).slice(0, 4);
    const rows = refs.map((r) => st.assets[r.id]).filter((r): r is NonNullable<typeof r> => !!r);
    setDeriving(true);
    const palette = await photoPalette(
      rows.map((r) => assetUrl(r, 360)).filter((u): u is string => !!u),
      rows.map((r) => r.palette),
    );
    setDeriving(false);
    if (!palette) {
      toast.error("Could not read colors from the product photos.");
      return;
    }
    const spec = themeFromProduct({ category: st.doc.product.category, palette, archetype: st.doc.theme.archetype, seed: st.doc.theme.seed });
    set((t) => {
      t.palette = spec.palette;
    });
    toast.success("Colors taken from your product photos");
  };

  return (
    <>
      <FieldRow label="Accent" trailing={<ContrastBadge ratio={safeContrast(tk["base:sec-accent-ink"], tk["base:sec-accent"])} label="Button text on the accent" />}>
        <ColorInput label="Accent color" value={theme.palette.accent} onCommit={(hex) => set((t) => void (t.palette.accent = hex), "theme:accent")} />
      </FieldRow>
      <FieldRow label="Pop" trailing={<ContrastBadge ratio={safeContrast(tk["pop:sec-ink"], tk["pop:sec-bg"])} label="Text on pop blocks" />}>
        <ColorInput label="Pop color" value={theme.palette.pop} onCommit={(hex) => set((t) => void (t.palette.pop = hex), "theme:pop")} />
      </FieldRow>
      <p className="-mt-1 text-[11px] leading-relaxed text-muted-foreground">Text and buttons are adjusted automatically to stay readable; the badge shows the result.</p>
      <FieldRow label="Page mood">
        <Segmented
          value={theme.palette.base}
          onChange={(v) => set((t) => void (t.palette.base = v))}
          label="Page mood"
          size="sm"
          options={[
            { value: "light", label: "Light" },
            { value: "tinted", label: "Tinted" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Harmony">
        <Choice value={theme.palette.harmony} onChange={(v) => set((t) => void (t.palette.harmony = v))} options={HARMONIES.map((h) => ({ value: h, label: HARMONY_LABELS[h] }))} />
      </FieldRow>
      <div className="flex h-7 overflow-hidden rounded-lg shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]" aria-hidden="true">
        {(["base", "soft", "surface", "accent", "pop", "dark"] as const).map((bg) => (
          <span key={bg} className="flex-1" style={{ background: tk[`${bg}:sec-bg`] }} title={bg} />
        ))}
      </div>
      {hasPhotos ? (
        <Button variant="outline" className="w-full" onClick={() => void derive()} disabled={deriving}>
          {deriving ? <LoaderCircle className="animate-spin" /> : <WandSparkles />}
          Derive from product photos
        </Button>
      ) : (
        <Hint>Add product photos to derive the colors from them.</Hint>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* fonts                                                               */
/* ------------------------------------------------------------------ */

function samePair(p: FontPairing, t: ThemeSpec) {
  return p.display === t.fonts.display && p.body === t.fonts.body && p.displayAr === t.fonts.displayAr && p.bodyAr === t.fonts.bodyAr;
}

function FontPairings({ theme, set }: { theme: ThemeSpec; set: (recipe: (t: ThemeSpec) => void) => void }) {
  const [more, setMore] = useState(false);
  const own = ARCHETYPE_DEFS[theme.archetype].fonts;
  const others = useMemo(() => {
    const seen = new Set(own.map((p) => `${p.display}|${p.body}|${p.displayAr}|${p.bodyAr}`));
    const out: { pair: FontPairing; from: string }[] = [];
    for (const a of ARCHETYPES) {
      if (a === theme.archetype) continue;
      for (const p of ARCHETYPE_DEFS[a].fonts) {
        const key = `${p.display}|${p.body}|${p.displayAr}|${p.bodyAr}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ pair: p, from: ARCHETYPE_DEFS[a].label });
      }
    }
    return out;
  }, [own, theme.archetype]);
  const shown = useMemo(() => [...own.map((pair) => ({ pair, from: "" })), ...(more ? others : [])], [own, others, more]);
  const ids = useMemo(() => shown.flatMap(({ pair }) => [pair.display, pair.body, pair.displayAr, pair.bodyAr]), [shown]);

  const pick = (p: FontPairing) =>
    set((t) => {
      t.fonts = { display: p.display, body: p.body, displayAr: p.displayAr, bodyAr: p.bodyAr, ...(p.accent ? { accent: p.accent } : {}) };
    });

  return (
    <>
      <FontFaces ids={ids} />
      <div className="space-y-2" role="radiogroup" aria-label="Font pairing">
        {shown.map(({ pair, from }) => {
          const active = samePair(pair, theme);
          return (
            <button
              key={`${pair.id}-${pair.display}-${pair.body}`}
              type="button"
              role="radio"
              aria-checked={active}
              data-selected={active}
              onClick={() => pick(pair)}
              title={pair.note}
              className="bld-tile block w-full px-3 py-2.5 text-left outline-none"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[20px] leading-tight" style={{ fontFamily: fontStack(pair.display), fontWeight: pair.displayWeight }}>
                  Hello, weekend
                </span>
                {from ? <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{from}</span> : null}
              </span>
              <span className="mt-0.5 block truncate text-[12px] text-muted-foreground" style={{ fontFamily: fontStack(pair.body) }}>
                Delivered in 24–48 h, pay on delivery.
              </span>
              <span dir="rtl" className="mt-1.5 block truncate text-[17px] leading-snug" style={{ fontFamily: fontStack(pair.displayAr), fontWeight: pair.displayWeightAr }}>
                {SAMPLE_AR}
              </span>
            </button>
          );
        })}
      </div>
      <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setMore((m) => !m)}>
        {more ? "Only this style's pairings" : `More pairings (${others.length})`}
      </Button>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* dividers                                                            */
/* ------------------------------------------------------------------ */

function DividerFamily({ theme, set }: { theme: ThemeSpec; set: (recipe: (t: ThemeSpec) => void) => void }) {
  const chosen = new Set<Divider>(theme.dividers);
  const toggle = (d: Divider) =>
    set((t) => {
      const next = new Set<Divider>(t.dividers);
      if (next.has(d)) next.delete(d);
      else if (next.size < 4) next.add(d);
      t.dividers = DIVIDERS.filter((x) => next.has(x));
    });
  return (
    <FieldRow label="Section edges" hint={chosen.size ? "Used where the background changes (up to 4)." : "Using the style's own edges. Pick up to 4 to choose yourself."}>
      <div className="grid grid-cols-4 gap-1.5">
        {DIVIDERS.map((d) => {
          const on = chosen.has(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              data-selected={on}
              onClick={() => toggle(d)}
              disabled={!on && chosen.size >= 4}
              className="bld-tile flex flex-col items-center gap-1 px-1 pb-1.5 pt-2 text-foreground/70 outline-none disabled:opacity-40"
            >
              <DividerGlyph kind={d} className="h-5 w-9" />
              <span className="text-[10.5px] font-medium">{DIVIDER_LABELS[d]}</span>
            </button>
          );
        })}
      </div>
    </FieldRow>
  );
}

/* ------------------------------------------------------------------ */
/* design DNA (DES-§15.4, DES-§14.7, DES-§11.6)                        */
/* ------------------------------------------------------------------ */

const freshSeed = () => {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0]! % 2_147_483_647;
};

/** The DNA card, the R1 boldness step (Bolder / Calmer), "Upgrade to design DNA" and "Apply my brand to this page". */
function DesignDnaSection() {
  const t = useT();
  const store = useEditorStore();
  const hasLook = useEditor((s) => !!s.doc.theme.look);
  const check = useDesignCheck();
  const [busy, setBusy] = useState<string | null>(null);

  const remix = async (scope: "bolder" | "calmer" | "upgrade") => {
    setBusy(scope);
    try {
      const remixDoc = await loadRemix();
      const before = store.getState().doc;
      const out = remixDoc(before, { seed: freshSeed(), scope });
      const parsed = PageDoc.safeParse(out);
      if (out === before || !parsed.success) throw new Error("no change");
      store.getState().replaceDoc(parsed.data);
      toast.success(t("design.diff.applied"), { action: { label: t("design.check.undo"), onClick: () => store.getState().undo() } });
    } catch {
      toast.error(t("design.theme.remixFailed"));
    } finally {
      setBusy(null);
    }
  };
  const brand = check?.context?.brand ?? null;
  const brandSet = !!brand && !!(brand.accent || brand.pop || brand.pairing || Object.keys(brand.genes).length);
  const applyMyBrand = () => {
    if (!brand || !brandSet) {
      toast(t("design.theme.brandEmpty"));
      return;
    }
    const next = applyBrand(store.getState().doc, brand);
    if (!next) {
      toast(t("design.theme.brandSame"));
      return;
    }
    store.getState().replaceDoc(next);
    toast.success(t("design.theme.brandApplied"), { action: { label: t("design.check.undo"), onClick: () => store.getState().undo() } });
  };

  return (
    <PanelSection title={t("design.dna.title")} collapsible>
      <div className="grid gap-3">
        <ThemeDna />
        {hasLook ? (
          <div className="grid grid-cols-2 gap-1.5">
            <Button variant="secondary" size="sm" className="h-8 gap-1.5" disabled={!!busy} onClick={() => void remix("calmer")}>
              {busy === "calmer" ? <LoaderCircle className="animate-spin" /> : <Minus />}
              {t("design.theme.calmer")}
            </Button>
            <Button variant="secondary" size="sm" className="h-8 gap-1.5" disabled={!!busy} onClick={() => void remix("bolder")}>
              {busy === "bolder" ? <LoaderCircle className="animate-spin" /> : <Plus />}
              {t("design.theme.bolder")}
            </Button>
          </div>
        ) : (
          <Button variant="secondary" size="sm" className="h-8 w-full gap-1.5" disabled={!!busy} onClick={() => void remix("upgrade")}>
            {busy === "upgrade" ? <LoaderCircle className="animate-spin" /> : <Dna />}
            {t("design.theme.upgrade")}
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-8 w-full justify-start gap-1.5 text-foreground/85" disabled={!check?.context} onClick={applyMyBrand}>
          <Stamp />
          {t("design.theme.applyBrand")}
        </Button>
      </div>
    </PanelSection>
  );
}

/** DS4: the texture control is retired; grain is no longer drawn (the value stays in old docs, ignored). */
function GrainNotice() {
  const t = useT();
  return <p className="px-0.5 pt-1 text-[12px] leading-snug text-muted-foreground">{t("design.theme.grain")}</p>;
}

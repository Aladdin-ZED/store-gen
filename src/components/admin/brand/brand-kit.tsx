"use client";
/**
 * The brand page (P6 DESIGN; design.md DES-§12.2, DES-§12.7 anatomy, BK-1; core §I.8).
 *  - 1440 / 1280: a 200 px tab rail (36 px rows, the 2 px inline-start indicator in `--brand`), the 560 px form and
 *    the 400 px specimen, sticky at 72 px; 1024: 160 / 480 / 320;
 *  - < 1024: a 36 px segmented control sticky under the header, the specimen above the form, collapsing to a 56 px
 *    strip (the name and the swatches) once the form is scrolled 120 px;
 *  - RTL: the rail is inline-start (right in `ar`), the specimen inline-end; the hex field and sliders stay `ltr`.
 * Every change saves at once (on release, blur or pick), optimistically: the screen changes first, the server's view
 * replaces it, an error rolls the field back with an inline message, and a 10 s Undo toast writes the previous value.
 * A colour the guard moved shows the request and the result side by side for 6 s.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { applyBase, applyColor, applyLock, applyNeutral, cleanHex } from "@/lib/design/brand-kit";
import type { MessageKey } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/admin/client";
import type { ActionResult } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import "./brand.css";
import { Specimen } from "./specimen";
import { ColorsTab, LogoTab, logoFileProblem, TypeTab, VoiceTab, type FieldState, type MovedNote } from "./tabs";
import type { BrandKitActions, BrandKitView, BrandTab, BrandWriteResult, PairingCard } from "./types";

const TABS: { id: BrandTab; label: MessageKey }[] = [
  { id: "logo", label: "brand.tab.logo" },
  { id: "colors", label: "brand.tab.colors" },
  { id: "type", label: "brand.tab.type" },
  { id: "voice", label: "brand.tab.voice" },
];

const UNDO_MS = 10_000;
const MOVED_MS = 6_000;

export interface BrandKitProps {
  view: BrandKitView;
  storeName: string;
  canEdit: boolean;
  pairings: readonly PairingCard[];
  actions: BrandKitActions;
  /** Settings → AI → Brand voice (words to use and avoid), or null */
  wordsHref: string | null;
  initialTab?: BrandTab;
  /** the moved-colour note shown on mount (the fixture's state) */
  initialMoved?: MovedNote | null;
}

export function BrandKit(p: BrandKitProps) {
  const t = useT();
  const [tab, setTab] = useState<BrandTab>(p.initialTab ?? "logo");
  const [view, setView] = useState(p.view);
  const [fields, setFields] = useState<Record<string, FieldState>>({});
  const [moved, setMoved] = useState<MovedNote | null>(p.initialMoved ?? null);
  const [collapsed, setCollapsed] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => setView(p.view), [p.view]);
  useEffect(() => {
    // a write's note shows for 6 s; the fixture's initial note stays until the first change
    if (!moved || moved === p.initialMoved) return;
    const id = setTimeout(() => setMoved(null), MOVED_MS);
    return () => clearTimeout(id);
  }, [moved, p.initialMoved]);
  // the phone specimen collapses once the form has scrolled 120 px
  useEffect(() => {
    const onScroll = () => {
      const top = formRef.current?.getBoundingClientRect().top;
      if (top === undefined) return;
      setCollapsed(top < -20);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const pairing = useMemo(() => p.pairings.find((x) => x.id === view.brand.fonts.pairing) ?? null, [p.pairings, view.brand.fonts.pairing]);

  /**
   * One optimistic write: `local` changes the screen now, `call` writes, `undo` (optional) is the inverse write
   * offered for 10 s. The server's view always wins once it answers.
   */
  const run = useCallback(
    async (field: string, local: (v: BrandKitView) => BrandKitView, call: () => Promise<ActionResult<BrandWriteResult>>, undo?: () => Promise<ActionResult<BrandWriteResult>>) => {
      const before = viewRef.current;
      setView(local(before));
      setFields((f) => ({ ...f, [field]: { saving: true, error: null } }));
      let res: ActionResult<BrandWriteResult>;
      try {
        res = await call();
      } catch {
        res = { ok: false, error: "server" } as ActionResult<BrandWriteResult>;
      }
      if (!res.ok) {
        setView(before);
        setFields((f) => ({ ...f, [field]: { saving: false, error: res.message ? t(res.message) : t("brand.error") } }));
        return;
      }
      setView(res.data.view);
      setFields((f) => ({ ...f, [field]: { saving: false, error: null } }));
      if (res.data.moved) setMoved({ role: res.data.moved.role, from: res.data.moved.from, to: res.data.moved.to });
      if (res.data.dropped.length) toast.warning(t("brand.genesDropped", { genes: res.data.dropped.join(", ") }));
      if (undo) {
        toast(t("brand.saved"), {
          duration: UNDO_MS,
          action: {
            label: t("brand.undo"),
            onClick: () => {
              void undo().then((u) => {
                if (u.ok) setView(u.data.view);
              });
            },
          },
        });
      }
    },
    [t],
  );

  const at = () => new Date().toISOString();

  const onColor = (role: "accent" | "pop" | "neutral" | "base", value: string | number | null) => {
    const prev = viewRef.current.brand.colors;
    const prevValue = role === "accent" || role === "pop" ? prev[role] : role === "neutral" ? prev.neutralHue : prev.base;
    void run(
      role,
      (v) => {
        const c = v.brand.colors;
        const colors =
          role === "accent" || role === "pop"
            ? applyColor(c, role, typeof value === "string" ? cleanHex(value) : null, at()).colors
            : role === "neutral"
              ? applyNeutral(c, typeof value === "number" ? value : null)
              : applyBase(c, value === "light" || value === "tinted" || value === "dark" ? value : null);
        return { ...v, brand: { ...v.brand, colors } };
      },
      () => p.actions.saveColor({ role, value }),
      () => p.actions.saveColor({ role, value: prevValue }),
    );
  };
  const onColorLock = (role: "accent" | "pop" | "neutral" | "base", on: boolean) =>
    void run(
      role,
      (v) => ({ ...v, brand: { ...v.brand, colors: applyLock(v.brand.colors, role, on) } }),
      () => p.actions.saveColor({ role, lock: on }),
      () => p.actions.saveColor({ role, lock: !on }),
    );

  const onUpload = async (slot: "primary" | "mark" | "wordmark" | "inverse", file: File) => {
    const problem = logoFileProblem(file);
    if (problem) {
      setFields((f) => ({ ...f, [slot]: { saving: false, error: t(problem) } }));
      return;
    }
    const upload = p.actions.upload;
    if (!upload) return;
    setFields((f) => ({ ...f, [slot]: { saving: true, error: null } }));
    let id: string;
    try {
      id = await upload(file);
    } catch (e) {
      setFields((f) => ({ ...f, [slot]: { saving: false, error: e instanceof Error && e.message ? e.message : t("brand.error") } }));
      return;
    }
    const prev = viewRef.current.brand.logo[slot];
    void run(
      slot,
      (v) => v,
      () => p.actions.bindLogo({ slot, assetId: id }),
      () => p.actions.bindLogo({ slot, assetId: prev }),
    );
  };
  const onRemove = (slot: "primary" | "mark" | "wordmark" | "inverse") => {
    const prev = viewRef.current.brand.logo[slot];
    void run(
      slot,
      (v) => {
        const logos = { ...v.logos };
        delete logos[slot];
        return { ...v, logos, brand: { ...v.brand, logo: { ...v.brand.logo, [slot]: null } } };
      },
      () => p.actions.bindLogo({ slot, assetId: null }),
      () => p.actions.bindLogo({ slot, assetId: prev }),
    );
  };

  const onPairing = (id: string | null) => {
    const prev = viewRef.current.brand.fonts;
    void run(
      "type",
      (v) => ({ ...v, brand: { ...v.brand, fonts: { pairing: id, locked: id ? v.brand.fonts.locked : false } } }),
      () => p.actions.saveFonts({ pairing: id }),
      () => p.actions.saveFonts({ pairing: prev.pairing, locked: prev.locked }),
    );
  };
  const onFontLock = (on: boolean) =>
    void run(
      "type",
      (v) => ({ ...v, brand: { ...v.brand, fonts: { ...v.brand.fonts, locked: on } } }),
      () => p.actions.saveFonts({ locked: on }),
      () => p.actions.saveFonts({ locked: !on }),
    );

  const onRegister = (r: BrandKitView["voice"]["register"]) => {
    const prev = viewRef.current.voice.register;
    void run(
      "register",
      (v) => ({ ...v, voice: { ...v.voice, register: r } }),
      () => p.actions.saveVoice({ register: r }),
      () => p.actions.saveVoice({ register: prev }),
    );
  };
  const onDarija = (d: BrandKitView["voice"]["darija"]) => {
    const prev = viewRef.current.voice.darija;
    void run(
      "darija",
      (v) => ({ ...v, voice: { ...v.voice, darija: d } }),
      () => p.actions.saveVoice({ darija: d }),
      () => p.actions.saveVoice({ darija: prev }),
    );
  };

  const panel = (
    <div role="tabpanel" id={`brand-panel-${tab}`} aria-labelledby={`brand-tab-${tab}`} className="min-w-0">
      {tab === "logo" ? (
        <LogoTab view={view} storeName={p.storeName} canEdit={p.canEdit} state={fields} onUpload={(s, f) => void onUpload(s, f)} onRemove={onRemove} uploadAvailable={!!p.actions.upload} />
      ) : tab === "colors" ? (
        <ColorsTab view={view} canEdit={p.canEdit} state={fields} moved={moved} onColor={onColor} onLock={onColorLock} orangeRequested={view.orangeRequested} />
      ) : tab === "type" ? (
        <TypeTab view={view} pairings={p.pairings} canEdit={p.canEdit} state={fields.type} storeName={p.storeName} onPick={onPairing} onLock={onFontLock} />
      ) : (
        <VoiceTab view={view} canEdit={p.canEdit} state={fields} wordsHref={p.wordsHref} onRegister={onRegister} onDarija={onDarija} />
      )}
    </div>
  );

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em]">{t("brand.title")}</h1>
        <p className="text-[14px] text-muted-foreground">{t("brand.subtitle")}</p>
        {!p.canEdit ? <p className="mt-2 text-[13px] text-muted-foreground">{t("brand.readOnly")}</p> : null}
      </header>

      {/* < 1024: the segmented control, the specimen above the form */}
      <div className="sticky top-14 z-10 -mx-4 grid gap-2 bg-background/92 px-4 py-2 backdrop-blur-sm lg:hidden">
        <div role="tablist" aria-label={t("brand.tabs")} className="grid h-9 grid-cols-4 gap-0.5 rounded-lg bg-muted p-0.5">
          {TABS.map((x) => (
            <button
              key={x.id}
              role="tab"
              type="button"
              aria-selected={tab === x.id}
              aria-controls={`brand-panel-${x.id}`}
              onClick={() => setTab(x.id)}
              className={cn("rounded-md text-[13px] font-medium transition-[background-color,color,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === x.id ? "bg-background text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-muted-foreground")}
            >
              {t(x.label)}
            </button>
          ))}
        </div>
        <Specimen view={view} storeName={p.storeName} pairing={pairing} compact className={cn("transition-opacity duration-200", collapsed ? "" : "hidden")} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[160px_minmax(0,480px)_320px] lg:gap-6 xl:grid-cols-[200px_minmax(0,560px)_400px]">
        <nav aria-label={t("brand.tabs")} className="hidden lg:block">
          <div role="tablist" aria-orientation="vertical" className="sticky top-[72px] grid gap-0.5">
            {TABS.map((x) => (
              <button
                key={x.id}
                id={`brand-tab-${x.id}`}
                role="tab"
                type="button"
                aria-selected={tab === x.id}
                aria-controls={`brand-panel-${x.id}`}
                onClick={() => setTab(x.id)}
                onKeyDown={(e) => {
                  const i = TABS.findIndex((y) => y.id === tab);
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    const n = TABS[(i + (e.key === "ArrowDown" ? 1 : TABS.length - 1)) % TABS.length]!;
                    setTab(n.id);
                    document.getElementById(`brand-tab-${n.id}`)?.focus();
                  }
                }}
                className={cn(
                  "relative flex h-9 items-center rounded-md ps-3 text-[13px] font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  tab === x.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <span aria-hidden className={cn("absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-[var(--brand)] transition-opacity duration-150", tab === x.id ? "opacity-100" : "opacity-0")} />
                {t(x.label)}
              </button>
            ))}
          </div>
        </nav>

        <div ref={formRef} className="grid min-w-0 content-start gap-6">
          <Specimen view={view} storeName={p.storeName} pairing={pairing} className="lg:hidden" />
          {panel}
        </div>

        <aside className="hidden lg:block">
          <Specimen view={view} storeName={p.storeName} pairing={pairing} className="sticky top-[72px]" />
        </aside>
      </div>
    </div>
  );
}

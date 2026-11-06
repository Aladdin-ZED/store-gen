"use client";
/**
 * The brand fixture's client half (DES-§12.7): `BrandKit` with local actions. The states are DES-§12.7's: empty (the
 * grid monogram and the three empty sentences), set (a logo, colours with a lock, a pairing and a voice), moved (an
 * orange accent request moved by `nearestAllowed`, the 6 s before / after) and readonly (no `brand.write`).
 */
import { useEffect, useMemo, useRef } from "react";
import { Toaster } from "sonner";
import { BrandKit } from "@/components/admin/brand/brand-kit";
import { monogramSvg } from "@/components/admin/brand/tabs";
import type { BrandKitActions, BrandKitView, BrandWriteResult, PairingCard } from "@/components/admin/brand/types";
import { applyBase, applyColor, applyLock, applyNeutral, cleanHex } from "@/lib/design/brand-kit";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { svgDataUri } from "@/lib/logo/monogram-grid";
import { BrandSetting } from "@/lib/settings/keys/brand";
import type { ActionResult } from "@/lib/tenancy/types";

export type BrandStoryState = "empty" | "set" | "moved" | "readonly";

const STORE = "Atelier Nour";
const AT = "2026-11-06T10:00:00.000Z";
/** an orange request (never painted: the kit shows it hatched) and what the guard stores */
const ORANGE_REQUEST = "#e07a2f";

function viewFor(state: BrandStoryState, pairings: readonly PairingCard[]): BrandKitView {
  const empty: BrandKitView = {
    brand: BrandSetting.parse({}),
    voice: { register: null, darija: "cta" },
    logos: {},
    contrast: { light: false, dark: false },
    photoSwatches: ["#2f5d50", "#c7d3c2", "#3b4a6b"],
    topVibes: ["apothecary"],
    price: { cents: 24900, currency: "MAD" },
    orangeRequested: false,
  };
  if (state === "empty") return empty;
  const logo = svgDataUri(monogramSvg(STORE, "apothecary", "#1d4f45"));
  // the accent path the server takes (the orange band, then the gold band of H34)
  const moved = applyColor(BrandSetting.parse({}).colors, "accent", ORANGE_REQUEST, AT).colors.accent!;
  const brand = BrandSetting.parse({
    logo: { primary: "0123456789abcdef0123456789abcdef" },
    colors: {
      accent: state === "moved" ? moved : "#1d4f45",
      pop: "#c9d6ee",
      neutralHue: 160,
      base: "light",
      locks: ["accent"],
      moves: state === "moved" ? [{ role: "accent", from: ORANGE_REQUEST, to: moved, at: AT }] : [],
      fromLogo: ["#1d4f45", "#e9efe9"],
    },
    fonts: { pairing: pairings.find((p) => p.archetype === "apothecary")?.id ?? pairings[0]?.id ?? null, locked: true },
  });
  return {
    ...empty,
    brand,
    voice: { register: "warm", darija: "cta" },
    logos: { primary: { id: "0123456789abcdef0123456789abcdef", url: logo, width: 512, height: 512, alpha: true } },
  };
}

export function BrandStory({ lang, dark, state, tab, pairings }: { lang: "ar" | "fr" | "en"; dark: boolean; state: BrandStoryState; tab: "logo" | "colors" | "type" | "voice"; pairings: PairingCard[] }) {
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [dark, lang]);
  const initial = useMemo(() => viewFor(state, pairings), [state, pairings]);
  const current = useRef(initial);
  const actions = useMemo<BrandKitActions>(() => {
    const answer = (view: BrandKitView, moved: BrandWriteResult["moved"] = null): Promise<ActionResult<BrandWriteResult>> => {
      current.current = view;
      return new Promise((resolve) => setTimeout(() => resolve({ ok: true, data: { view, moved, dropped: [] } }), 450));
    };
    return {
      bindLogo: ({ slot, assetId }) => {
        const v = current.current;
        const logos = { ...v.logos };
        if (!assetId) delete logos[slot];
        return answer({ ...v, logos, brand: { ...v.brand, logo: { ...v.brand.logo, [slot]: assetId } } });
      },
      saveColor: ({ role, value, lock }) => {
        const v = current.current;
        let colors = v.brand.colors;
        let moved: BrandWriteResult["moved"] = null;
        if (value !== undefined) {
          if (role === "accent" || role === "pop") {
            const r = applyColor(colors, role, typeof value === "string" ? cleanHex(value) : null, new Date().toISOString());
            colors = r.colors;
            moved = r.moved;
          } else if (role === "neutral") colors = applyNeutral(colors, typeof value === "number" ? value : null);
          else colors = applyBase(colors, value === "light" || value === "tinted" || value === "dark" ? value : null);
        }
        if (lock !== undefined) colors = applyLock(colors, role, lock);
        return answer({ ...v, brand: { ...v.brand, colors } }, moved);
      },
      saveFonts: ({ pairing, locked }) => {
        const v = current.current;
        const fonts = { pairing: pairing === undefined ? v.brand.fonts.pairing : pairing, locked: locked ?? v.brand.fonts.locked };
        return answer({ ...v, brand: { ...v.brand, fonts } });
      },
      saveVoice: (patch) => {
        const v = current.current;
        return answer({ ...v, voice: { register: patch.register === undefined ? v.voice.register : patch.register, darija: patch.darija ?? v.voice.darija } });
      },
      upload: null,
    };
  }, []);
  return (
    <AdminI18nProvider locale={lang}>
      <main className="min-h-dvh bg-background text-foreground" dir={lang === "ar" ? "rtl" : "ltr"}>
        <div className="mx-auto w-full max-w-[1480px] px-4 pt-8 pb-16 sm:px-8 sm:pt-10">
          <BrandKit
            view={initial}
            storeName={STORE}
            canEdit={state !== "readonly"}
            pairings={pairings}
            actions={actions}
            wordsHref="#settings-ai"
            initialTab={tab}
            initialMoved={state === "moved" ? { role: "accent", from: ORANGE_REQUEST, to: initial.brand.colors.accent ?? "" } : null}
          />
        </div>
        <Toaster position="bottom-center" />
      </main>
    </AdminI18nProvider>
  );
}

"use client";
/**
 * SEO & tracking panel: page language/market, search snippet (with a live preview), social image,
 * indexing, and "Pixels on this page" (src/components/admin/pixels/page-pixels.tsx, docs/OFFERS.md
 * §A.4): the page's own pixels picked from the library — no store-wide defaults.
 */
import { Globe } from "lucide-react";
import { PagePixels } from "@/components/admin/pixels/page-pixels";
import { useStore } from "@/components/admin/shell/store-context";
import { Switch } from "@/components/ui/switch";
import { plainLabel } from "@/lib/editor/paths";
import { MARKET_SPECS, PHONE_SPECS } from "@/lib/markets/specs";
import { LOCALES, MARKETS, type Locale, type Market, type PageDoc } from "@/lib/page/schema";
import { relocalizeVariants } from "@/lib/page/variant-presets";
import { useEditor, useEditorApi } from "../context";
import { usePersistence } from "../persistence";
import { ImageField } from "../fields/ImageField";
import { TextField } from "../fields/TextField";
import { Choice, FieldRow, PanelHeader, PanelSection } from "../ui";

const LOCALE_NAMES: Record<Locale, string> = {
  ar: "العربية — Arabic",
  fr: "Français",
  en: "English",
  es: "Español",
  de: "Deutsch",
  it: "Italiano",
  nl: "Nederlands",
  pt: "Português",
};


export function SeoPanel() {
  const doc = useEditor((s) => s.doc);
  const pageId = useEditor((s) => s.page.id);
  const { flush } = usePersistence();
  const api = useEditorApi();
  // the store's own host in the search preview (its subdomain in S mode), else the host serving the dashboard
  const liveHost = /^https?:\/\/([^/]+)/i.exec(useStore().live(""))?.[1] ?? (typeof window === "undefined" ? "" : window.location.host);
  const set = (recipe: (d: PageDoc) => void, group?: string) => api.updateDoc((d) => recipe(d as PageDoc), group ?? null);
  const title = doc.seo.title?.trim() || doc.product.name;
  const description = doc.seo.description?.trim() || plainLabel(doc.product.tagline ?? doc.product.description ?? "", 160);
  const currencies = [...new Set([MARKET_SPECS[doc.market].currency, "MAD", "EUR", doc.currency])];

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="SEO & tracking" description="How the page appears in search and shares, and which pixels it fires." />
      <div className="bld-scroll min-h-0 flex-1 overflow-y-auto pb-10">
        <PanelSection title="Language & market" collapsible>
          <FieldRow label="Page language" hint={doc.locale === "ar" ? "Arabic pages read right-to-left." : undefined}>
            <Choice
              value={doc.locale}
              onChange={(v) =>
                set((d) => {
                  // the app's own variant words follow the language ("Couleur · Noir" → "اللون · أسود")
                  for (const it of d.items) {
                    const groups = relocalizeVariants(it.groups, d.locale, v);
                    if (groups !== it.groups) it.groups = groups;
                  }
                  d.locale = v;
                })
              }
              options={LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l] }))}
            />
          </FieldRow>
          <div className="grid grid-cols-2 gap-2.5">
            <FieldRow label="Market">
              <Choice
                value={doc.market}
                onChange={(v: Market) =>
                  set((d) => {
                    // the currency and phone country follow the market unless they were set apart
                    const prev = MARKET_SPECS[d.market];
                    const next = MARKET_SPECS[v];
                    if (d.currency === prev.currency) d.currency = next.currency;
                    if (d.form.phoneCountry === prev.code && PHONE_SPECS[next.code]) d.form.phoneCountry = next.code;
                    d.market = v;
                  })
                }
                options={MARKETS.map((m) => ({ value: m, label: MARKET_SPECS[m].name.en }))}
              />
            </FieldRow>
            <FieldRow label="Currency">
              <Choice value={doc.currency} onChange={(v) => set((d) => void (d.currency = v))} options={currencies.map((c) => ({ value: c, label: c }))} />
            </FieldRow>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Changing the language doesn&apos;t translate your texts — use Remix → Copy for new copy. Prices are not converted when the currency changes.
          </p>
        </PanelSection>

        <PanelSection title="Search result" collapsible>
          <div className="rounded-xl bg-card p-3 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--border)_90%,transparent)]" aria-label="Search result preview">
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Globe className="size-3" />
              {liveHost}
            </p>
            <p className="mt-1 line-clamp-1 text-[15px] leading-snug text-[#1a0dab] dark:text-[#8ab4f8]" dir="auto">
              {title}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground" dir="auto">
              {description || "Add a description to control this text."}
            </p>
          </div>
          <TextField id="seo-title" label="Title" value={doc.seo.title} max={70} emphasis={false} placeholder={doc.product.name} onChange={(v) => set((d) => void (d.seo.title = v || undefined), "seo:title")} />
          <TextField id="seo-desc" label="Description" value={doc.seo.description} max={170} emphasis={false} multiline rows={3} onChange={(v) => set((d) => void (d.seo.description = v || undefined), "seo:description")} />
          <ImageField label="Share image" value={doc.seo.ogImage} onChange={(v) => set((d) => void (d.seo.ogImage = v), "seo:og")} help="Shown when the link is shared (WhatsApp, Facebook…). The first product photo is used when empty." />
          <FieldRow label="Hide from search engines" inline hint="For test pages or ad-only pages.">
            <Switch checked={doc.seo.noindex} onCheckedChange={(v) => set((d) => void (d.seo.noindex = v))} />
          </FieldRow>
        </PanelSection>

        <PanelSection title="Pixels on this page" collapsible>
          <PagePixels pageId={pageId} tracking={doc.tracking} flush={flush} onChange={(recipe, group) => set((d) => void (d.tracking = recipe(d.tracking)), group)} />
        </PanelSection>
      </div>
    </div>
  );
}

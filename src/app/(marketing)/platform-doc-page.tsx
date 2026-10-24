import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { docBlocks, platformBrandName, publishedPlatformDoc, publishedPlatformKinds, PLATFORM_DOC_PATHS, type PlatformDocKind } from "@/lib/render/platform-docs.server";
import { COPY, localeHref, MARKETING_LOCALES, marketingLocale, type MarketingLocale } from "./copy";
import styles from "./marketing.module.css";
import { MarketingFrame, SiteFooter, SiteHeader } from "./site-chrome";

/*
 * `/terms`, `/privacy`, `/aup` (docs/STORE-SAAS.md §C.4; platform.md PLA-§13.4): the published version of the
 * platform document in the visitor's language (else fr, en, ar), as plain headings, paragraphs and list items.
 * No published version → the 404 (nothing invented). P1 brings the editor and markdown-lite in R1 product.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DATE_LOCALE: Record<MarketingLocale, string> = { fr: "fr-MA", ar: "ar-MA", en: "en-GB" };
const UPDATED: Record<MarketingLocale, string> = { fr: "En vigueur depuis le", ar: "سارية منذ", en: "In force since" };

export async function platformDocMetadata(kind: PlatformDocKind, searchParams: SearchParams): Promise<Metadata> {
  const locale = marketingLocale((await searchParams).lang);
  const [doc, brand] = await Promise.all([publishedPlatformDoc(kind, locale).catch(() => null), platformBrandName()]);
  if (!doc) return { title: brand };
  return {
    title: `${doc.title} · ${brand}`,
    robots: { index: true, follow: true },
    alternates: {
      canonical: localeHref(PLATFORM_DOC_PATHS[kind], locale),
      languages: Object.fromEntries(MARKETING_LOCALES.map((l) => [l, localeHref(PLATFORM_DOC_PATHS[kind], l)])),
    },
  };
}

export async function PlatformDocPage({ kind, searchParams }: { kind: PlatformDocKind; searchParams: SearchParams }) {
  const locale = marketingLocale((await searchParams).lang);
  const [doc, brand, docs] = await Promise.all([publishedPlatformDoc(kind, locale), platformBrandName(), publishedPlatformKinds().catch(() => [])]);
  if (!doc) notFound();
  const since = doc.effectiveAt ?? doc.publishedAt;
  // the document's own language decides direction (a fallback version may be in another language than asked)
  const docLocale = marketingLocale(doc.locale);
  return (
    <MarketingFrame locale={locale}>
      <SiteHeader locale={locale} brand={brand} path={PLATFORM_DOC_PATHS[kind]} />
      <main className="flex-1">
        <article lang={docLocale} dir={COPY[docLocale].dir} className={`${styles.prose} mx-auto w-full max-w-3xl px-5 pt-16 pb-24 sm:px-8`}>
          <h1 className="text-[2rem] leading-tight font-semibold tracking-[-0.03em] text-balance sm:text-[2.5rem]">{doc.title}</h1>
          {since ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {UPDATED[docLocale]} <time dateTime={since.toISOString()}>{since.toLocaleDateString(DATE_LOCALE[docLocale], { year: "numeric", month: "long", day: "numeric" })}</time>
            </p>
          ) : null}
          <div className="mt-10">
            {groupLists(docBlocks(doc.body)).map((b, i) =>
              b.kind === "list" ? (
                <ul key={i}>
                  {b.items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              ) : b.kind === "h2" ? (
                <h2 key={i}>{b.text}</h2>
              ) : b.kind === "h3" ? (
                <h3 key={i}>{b.text}</h3>
              ) : (
                <p key={i}>{b.text}</p>
              ),
            )}
          </div>
        </article>
      </main>
      <SiteFooter locale={locale} brand={brand} docs={docs} />
    </MarketingFrame>
  );
}

type Grouped = { kind: "h2" | "h3" | "p"; text: string } | { kind: "list"; items: string[] };

/** Consecutive list items become one list. */
function groupLists(blocks: ReturnType<typeof docBlocks>): Grouped[] {
  const out: Grouped[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (b.kind === "li") {
      if (last?.kind === "list") last.items.push(b.text);
      else out.push({ kind: "list", items: [b.text] });
    } else {
      out.push({ kind: b.kind, text: b.text });
    }
  }
  return out;
}

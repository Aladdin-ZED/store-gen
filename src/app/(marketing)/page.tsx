import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheckIcon, FileSpreadsheetIcon, ImagesIcon, LayersIcon, RadarIcon, ShieldCheckIcon, SmartphoneIcon } from "lucide-react";
import { platformBrandName, publishedPlatformKinds, type PlatformDocKind } from "@/lib/render/platform-docs.server";
import { COPY, localeHref, MARKETING_LOCALES, marketingLocale } from "./copy";
import styles from "./marketing.module.css";
import { MarketingFrame, SiteFooter, SiteHeader } from "./site-chrome";

/*
 * The platform home `/` (docs/STORE-SAAS.md §C.4: replaces the root landing route; indexable, overriding the root
 * layout's noindex, PUB-22). On a store host the proxy rewrites `/` to the store's home instead, and a legacy host
 * answers 308 here. French by default, `?lang=ar|en` for the other languages (hreflang alternates).
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FEATURE_ICONS = [ImagesIcon, SmartphoneIcon, LayersIcon, FileSpreadsheetIcon, RadarIcon, ShieldCheckIcon];

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const locale = marketingLocale((await searchParams).lang);
  const brand = await platformBrandName();
  const t = COPY[locale];
  return {
    title: `${brand} · ${t.meta.title}`,
    description: t.meta.description,
    robots: { index: true, follow: true },
    alternates: {
      canonical: localeHref("/", locale),
      languages: Object.fromEntries(MARKETING_LOCALES.map((l) => [l, localeHref("/", l)])),
    },
    openGraph: { title: `${brand} · ${t.meta.title}`, description: t.meta.description, type: "website", siteName: brand },
  };
}

/** The platform documents with a published version (footer links); none when the database can't say. */
async function docKinds(): Promise<PlatformDocKind[]> {
  try {
    return await publishedPlatformKinds();
  } catch {
    return [];
  }
}

export default async function MarketingHome({ searchParams }: { searchParams: SearchParams }) {
  const locale = marketingLocale((await searchParams).lang);
  const t = COPY[locale];
  const [brand, docs] = await Promise.all([platformBrandName(), docKinds()]);

  return (
    <MarketingFrame locale={locale}>
      <SiteHeader locale={locale} brand={brand} path="/" />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-3 sm:px-5">
          <div className={`${styles.hero} rounded-[1.75rem] sm:rounded-[2.25rem]`}>
            <div className="grid items-center gap-12 px-6 py-14 sm:px-12 sm:py-20 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-8 lg:px-16 lg:py-24">
              <div>
                <p className={`${styles.eyebrow} inline-flex items-center gap-2.5 rounded-full px-3.5 py-1.5 text-[0.8125rem] font-medium`}>
                  <span aria-hidden="true" className={styles.dot} />
                  {t.hero.eyebrow}
                </p>
                <h1 className="mt-7 max-w-[15ch] text-[2.5rem] leading-[1.04] font-semibold tracking-[-0.038em] text-balance sm:text-[3.4rem] lg:text-[4rem]">
                  {t.hero.title}
                </h1>
                <p className={`${styles.lead} mt-6 max-w-[34rem] text-[1.0625rem] leading-relaxed text-pretty sm:text-lg`}>{t.hero.lead}</p>
                <div className="mt-9 flex flex-wrap items-center gap-3">
                  <Link href="/signup" className={`${styles.ctaPrimary} inline-flex h-12 items-center rounded-full px-6 text-[0.95rem] font-semibold`}>
                    {t.hero.primary}
                  </Link>
                  <Link href="/login" className={`${styles.ctaGhost} inline-flex h-12 items-center rounded-full px-6 text-[0.95rem] font-medium`}>
                    {t.hero.secondary}
                  </Link>
                </div>
              </div>
              <div className={styles.stage} aria-hidden="true">
                <div className={styles.phone}>
                  <div className={styles.screen}>
                    <div className={styles.visual} />
                    <div className={`${styles.bar} w-3/4`} />
                    <div className={`${styles.bar} w-1/2`} />
                    <div className="mt-1 flex flex-col gap-2">
                      <div className={styles.field}>{t.mock.name}</div>
                      <div className={styles.field}>{t.mock.phone}</div>
                      <div className={styles.field}>{t.mock.city}</div>
                    </div>
                    <div className={styles.order}>{t.mock.order}</div>
                    <p className={`${styles.note} flex items-center justify-center gap-1.5 text-[0.72rem] font-medium`}>
                      <BadgeCheckIcon className="size-3.5" />
                      {t.mock.note}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 pt-24 pb-6 sm:px-8 sm:pt-28">
          <h2 className="max-w-[26ch] text-[1.75rem] leading-tight font-semibold tracking-[-0.03em] text-balance sm:text-[2.25rem]">{t.featuresTitle}</h2>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {t.features.map((f, i) => {
              const Icon = FEATURE_ICONS[i] ?? LayersIcon;
              return (
                <li key={f.title} className={`${styles.card} rounded-2xl border border-border bg-card p-6`}>
                  <span className={`${styles.icon} grid size-10 place-items-center rounded-xl`} aria-hidden="true">
                    <Icon className="size-[1.15rem]" strokeWidth={1.75} />
                  </span>
                  <h3 className="mt-5 text-[1.0625rem] font-semibold tracking-[-0.015em]">{f.title}</h3>
                  <p className="mt-2 text-[0.95rem] leading-relaxed text-muted-foreground text-pretty">{f.body}</p>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
          <div className="grid gap-10 border-t border-border pt-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)]">
            <h2 className="text-[1.5rem] font-semibold tracking-[-0.025em]">{t.stepsTitle}</h2>
            <ol className="grid gap-8 sm:grid-cols-3">
              {t.steps.map((step, i) => (
                <li key={step} className="flex flex-col gap-3">
                  <span className={`${styles.stepNumber} font-mono text-sm tabular-nums`} dir="ltr">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="text-[1.0625rem] leading-snug font-medium tracking-[-0.01em] text-balance">{step}</p>
                </li>
              ))}
            </ol>
          </div>
          <p className="mt-14 text-center text-sm text-muted-foreground">{t.languages}</p>
        </section>

        <section className="mx-auto w-full max-w-6xl px-3 pb-20 sm:px-5">
          <div className={`${styles.band} flex flex-col items-start gap-6 rounded-[1.75rem] px-6 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-12`}>
            <h2 className="text-[1.6rem] leading-tight font-semibold tracking-[-0.03em] text-balance sm:text-[2rem]">{t.final.title}</h2>
            <Link href="/signup" className={`${styles.ctaPrimary} inline-flex h-12 shrink-0 items-center rounded-full px-6 text-[0.95rem] font-semibold`}>
              {t.final.cta}
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} brand={brand} docs={docs} />
    </MarketingFrame>
  );
}

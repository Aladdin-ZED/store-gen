import Link from "next/link";
import type { ReactNode } from "react";
import type { PlatformDocKind } from "@/lib/render/platform-docs.server";
import { COPY, localeHref, MARKETING_LOCALES, type MarketingLocale } from "./copy";

/*
 * Header and footer of the marketing pages (src/app/(marketing)/**): the platform's name, the language switch
 * (one URL per language), sign-in and sign-up, and the platform documents that have a published version.
 */

const DOC_LINKS: { kind: PlatformDocKind; path: `/${string}`; label: "terms" | "privacy" | "aup" }[] = [
  { kind: "tos", path: "/terms", label: "terms" },
  { kind: "privacy", path: "/privacy", label: "privacy" },
  { kind: "aup", path: "/aup", label: "aup" },
];

export function Wordmark({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-[0.95rem] font-semibold tracking-[-0.02em]">
      <span aria-hidden="true" className="grid size-7 place-items-center rounded-[0.55rem] bg-foreground text-background">
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none">
          <path d="M3 10.5 8 13l5-2.5M3 7.5 8 10l5-2.5M8 3 3 5.5 8 8l5-2.5L8 3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </span>
      {name}
    </span>
  );
}

export function SiteHeader({ locale, brand, path }: { locale: MarketingLocale; brand: string; path: `/${string}` }) {
  const t = COPY[locale];
  return (
    <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
      <Link href={localeHref("/", locale)} className="rounded-md outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">
        <Wordmark name={brand} />
      </Link>
      <nav className="flex items-center gap-1 sm:gap-2" aria-label={t.nav.languages}>
        <ul className="me-1 hidden items-center gap-0.5 sm:flex">
          {MARKETING_LOCALES.map((l) => (
            <li key={l}>
              <Link
                href={localeHref(path, l)}
                hrefLang={l}
                lang={l}
                aria-current={l === locale ? "true" : undefined}
                className="inline-flex h-9 items-center rounded-full px-3 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground aria-[current]:bg-secondary aria-[current]:text-foreground"
              >
                {COPY[l].languageName}
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/login" className="inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-secondary">
          {t.nav.signIn}
        </Link>
        <Link
          href="/signup"
          className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-[opacity,transform] duration-200 hover:opacity-90 active:translate-y-px"
        >
          {t.nav.start}
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter({ locale, brand, docs }: { locale: MarketingLocale; brand: string; docs: readonly PlatformDocKind[] }) {
  const t = COPY[locale];
  const year = new Date().getUTCFullYear();
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>
          © {year} {brand}. {t.footer.rights}
        </p>
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {DOC_LINKS.filter((d) => docs.includes(d.kind)).map((d) => (
            <li key={d.kind}>
              <Link href={localeHref(d.path, locale)} className="transition-colors duration-200 hover:text-foreground">
                {t.footer[d.label]}
              </Link>
            </li>
          ))}
          <li className="sm:hidden">
            <span className="inline-flex gap-3">
              {MARKETING_LOCALES.filter((l) => l !== locale).map((l) => (
                <Link key={l} href={localeHref("/", l)} hrefLang={l} lang={l} className="hover:text-foreground">
                  {COPY[l].languageName}
                </Link>
              ))}
            </span>
          </li>
        </ul>
      </div>
    </footer>
  );
}

export function MarketingFrame({ locale, children }: { locale: MarketingLocale; children: ReactNode }) {
  return (
    <div lang={locale} dir={COPY[locale].dir} className="flex min-h-dvh flex-1 flex-col bg-background text-foreground">
      {children}
    </div>
  );
}

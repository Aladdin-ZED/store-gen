import Link from "next/link";
import type { ReactNode } from "react";
import { getCspNonce } from "@/lib/auth/request";
import type { PlatformDocKind } from "@/lib/render/platform-docs.server";
import { COPY, localeHref, MARKETING_LOCALES, type MarketingLocale } from "./copy";
import { readexArabic } from "./fonts";
import styles from "./marketing.module.css";

/*
 * Header and footer of the marketing pages (src/app/(marketing)/**): the platform's name, the language switch
 * (one URL per language), sign-in and sign-up, and the platform documents that have a published version. The frame
 * carries the marketing tokens (light, dark from prefers-color-scheme), Readex Pro in Arabic only, and the pre-paint
 * motion script: a returning visitor who paused motion never sees the intro (spec §5.6).
 */

const DOC_LINKS: { kind: PlatformDocKind; path: `/${string}`; label: "terms" | "privacy" | "aup" }[] = [
  { kind: "tos", path: "/terms", label: "terms" },
  { kind: "privacy", path: "/privacy", label: "privacy" },
  { kind: "aup", path: "/aup", label: "aup" },
];

const MOTION_PREPAINT = `try{if(localStorage.getItem("sg-motion")==="off")document.documentElement.dataset.motion="off"}catch(e){}`;

export function Wordmark({ name }: { name: string }) {
  return (
    <span className={styles.brandLink}>
      <span aria-hidden="true" className={styles.brandMark}>
        <svg viewBox="0 0 16 16" fill="none">
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
    <header className={styles.header}>
      <div className={`${styles.container} ${styles.headerInner}`}>
        <Link href={localeHref("/", locale)} className={styles.brandHome}>
          <Wordmark name={brand} />
        </Link>
        <nav className={styles.nav} aria-label={t.nav.languages}>
          <ul className={styles.langs}>
            {MARKETING_LOCALES.map((l) => (
              <li key={l}>
                <Link href={localeHref(path, l)} hrefLang={l} lang={l} aria-current={l === locale ? "true" : undefined} className={styles.navLink}>
                  {COPY[l].languageName}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/login" className={`${styles.navLink} ${styles.signIn}`}>
            {t.nav.signIn}
          </Link>
          <Link href="/signup" className={styles.startPill}>
            {t.nav.start}
          </Link>
        </nav>
      </div>
    </header>
  );
}

/** The Pause motion control (WCAG 2.2.2): the runtime wires it, sets aria-pressed and remembers the choice. */
export function PauseButton({ locale, className }: { locale: MarketingLocale; className?: string }) {
  const p = COPY[locale].home.pause;
  return (
    <button type="button" data-pause="" aria-pressed="false" className={`${styles.pause} ${className ?? ""}`}>
      <svg viewBox="0 0 16 16" className={`${styles.pauseIcon} ${styles.iconPause}`} aria-hidden="true" focusable="false">
        <path d="M5.75 3.75v8.5M10.25 3.75v8.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <svg viewBox="0 0 16 16" className={`${styles.pauseIcon} ${styles.iconPlay}`} aria-hidden="true" focusable="false">
        <path d="M5.25 3.9v8.2a.6.6 0 0 0 .92.5l6.4-4.1a.6.6 0 0 0 0-1l-6.4-4.1a.6.6 0 0 0-.92.5Z" fill="currentColor" />
      </svg>
      <span className={styles.labelPause}>{p.pause}</span>
      <span className={styles.labelPlay}>{p.play}</span>
    </button>
  );
}

export function SiteFooter({ locale, brand, docs, motion = false }: { locale: MarketingLocale; brand: string; docs: readonly PlatformDocKind[]; motion?: boolean }) {
  const t = COPY[locale];
  const year = new Date().getUTCFullYear();
  return (
    <footer className={styles.footer}>
      <div className={`${styles.container} ${styles.footerInner}`}>
        <p className={styles.footerRights}>
          © {year} {brand}. {t.footer.rights}
        </p>
        <ul className={styles.footerList}>
          {DOC_LINKS.filter((d) => docs.includes(d.kind)).map((d) => (
            <li key={d.kind}>
              <Link href={localeHref(d.path, locale)} className={styles.footerLink}>
                {t.footer[d.label]}
              </Link>
            </li>
          ))}
          <li className={styles.footerLangs}>
            {MARKETING_LOCALES.filter((l) => l !== locale).map((l) => (
              <Link key={l} href={localeHref("/", l)} hrefLang={l} lang={l} className={styles.footerLink}>
                {COPY[l].languageName}
              </Link>
            ))}
          </li>
          {motion ? (
            <li>
              <PauseButton locale={locale} className={styles.footerPause} />
            </li>
          ) : null}
        </ul>
      </div>
    </footer>
  );
}

export async function MarketingFrame({ locale, children }: { locale: MarketingLocale; children: ReactNode }) {
  const nonce = await getCspNonce();
  return (
    <div lang={locale} dir={COPY[locale].dir} className={`${styles.root} ${locale === "ar" ? readexArabic.variable : ""}`}>
      <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: MOTION_PREPAINT }} />
      {children}
    </div>
  );
}

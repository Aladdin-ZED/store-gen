import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { platformBrandName, publishedPlatformKinds, type PlatformDocKind } from "@/lib/render/platform-docs.server";
import { COPY, localeHref, MARKETING_LOCALES, marketingLocale } from "./copy";
import { BackupsArt, DeliveryArt, HealthArt, ProfitArt, RolesArt, TrackingArt } from "./living/bento-art";
import { Console } from "./living/console";
import { homeData } from "./living/data";
import { Dock } from "./living/dock";
import { DirectorFan } from "./living/fan";
import { LivingIsland } from "./living/island";
import { Ledger } from "./living/ledger";
import L from "./living/living.module.css";
import { Loom } from "./living/loom";
import { Mirror } from "./living/mirror";
import { FinalArt, Rail } from "./living/rail";
import { Route } from "./living/route";
import { Sprite } from "./living/sprite";
import styles from "./marketing.module.css";
import { MarketingFrame, PauseButton, SiteFooter, SiteHeader } from "./site-chrome";

/*
 * The platform home `/` (docs/STORE-SAAS.md §C.4: replaces the root landing route; indexable, overriding the root
 * layout's noindex, PUB-22). On a store host the proxy rewrites `/` to the store's home instead, and a legacy host
 * answers 308 here. French by default, `?lang=ar|en` for the other languages (hreflang alternates).
 *
 * The page is the "living product" homepage (qa/lead/homepage-spec.md): every section shows a real module of the
 * product working, as a hand-built inline SVG model fed by the product's own constants (./living/data.ts). Server
 * components only; ./living/island.tsx boots the small client runtime after load. Every model's SSR markup is its
 * final frame, so the page is complete without JavaScript and under reduced motion.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

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

/** Latin product and event names inside Arabic text, as LTR isolates. */
function iso(text: string, rtl: boolean): ReactNode {
  if (!rtl) return text;
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(/[A-Za-z][A-Za-z ]*[A-Za-z]|[A-Za-z]/g)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    out.push(
      <bdi key={i} dir="ltr">
        {m[0]}
      </bdi>,
    );
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const DOCK_GLYPHS = ["sg-sheet", "sg-pulse", "sg-plane", "sg-bubble"] as const;

function CheckRing({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="9.25" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.25" />
      <path d="M6.2 10.3 8.7 12.8 13.9 7.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function MarketingHome({ searchParams }: { searchParams: SearchParams }) {
  const locale = marketingLocale((await searchParams).lang);
  const t = COPY[locale];
  const h = t.home;
  const rtl = t.dir === "rtl";
  const d = homeData();
  const [brand, docs] = await Promise.all([platformBrandName(), docKinds()]);

  return (
    <MarketingFrame locale={locale}>
      <SiteHeader locale={locale} brand={brand} path="/" />
      <main className={styles.main}>
        <Sprite t={t} rtl={rtl} />

        {/* HERO: the genome loom (stage 1) */}
        <section className={styles.stageWrap} aria-labelledby="home-title">
          <div className={`${styles.stage} ${styles.hero}`} data-depth="">
            <div className={styles.heroGrid}>
              <div className={styles.heroText}>
                <p className={styles.eyebrow}>
                  <span aria-hidden="true" className={styles.eyebrowDot} />
                  {t.hero.eyebrow}
                </p>
                <h1 id="home-title" className={styles.h1}>
                  <span className={styles.h1Line}>{t.hero.title[0]}</span> <span className={styles.h1Line}>{t.hero.title[1]}</span>
                </h1>
                <p className={`${styles.lead} ${styles.heroLead}`}>{t.hero.lead}</p>
                <div className={styles.ctaRow}>
                  <Link href="/signup" className={styles.ctaPrimary}>
                    {t.hero.primary}
                  </Link>
                  <Link href="/login" className={styles.ctaGhost}>
                    {t.hero.secondary}
                  </Link>
                </div>
              </div>
              <div className={styles.heroModel}>
                <Loom d={d} t={t} rtl={rtl} />
              </div>
            </div>
            <PauseButton locale={locale} className={styles.heroPause} />
          </div>
        </section>

        {/* ENGINE: the gene ledger and the exploded page */}
        <section className={`${styles.section} ${styles.afterHero} ${styles.below}`} aria-labelledby="home-engine">
          <div className={styles.container}>
            <div className={styles.split}>
              <div className={`${styles.split75Model} ${styles.modelAfter}`}>
                <div className={styles.well}>
                  <Ledger d={d} t={t} rtl={rtl} />
                </div>
              </div>
              <div className={styles.split75Text}>
                <div className={`${styles.head} ${styles.reveal}`} data-reveal="">
                  <h2 id="home-engine" className={styles.h2}>
                    {h.engine.title}
                  </h2>
                  <p className={styles.lead}>{h.engine.lead}</p>
                </div>
                <ul className={styles.rows}>
                  {h.engine.rows.map((r) => (
                    <li key={r.name} className={styles.row}>
                      <CheckRing className={styles.rowMark} />
                      <span className={styles.rowName}>{r.name}</span>
                      <span className={styles.rowBody}>{r.body}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* DIRECTOR: three directions, you pick one */}
        <section className={`${styles.section} ${styles.below}`} aria-labelledby="home-director">
          <div className={styles.container}>
            <div className={`${styles.head} ${styles.headCaption} ${styles.reveal}`} data-reveal="">
              <h2 id="home-director" className={styles.h2}>
                {h.director.title}
              </h2>
              <p className={styles.lead}>{h.director.lead}</p>
            </div>
            <div className={styles.figure}>
              <DirectorFan d={d} t={t} rtl={rtl} />
            </div>
          </div>
        </section>

        {/* ROUTE + CONSOLE (stage 2) */}
        <div className={`${styles.stageWrap} ${styles.below}`}>
          <div className={`${styles.stage} ${styles.stageQuiet} ${styles.stage2}`}>
            <div className={styles.stageInner}>
              <section aria-labelledby="home-route">
                <div className={`${styles.head} ${styles.headHalf} ${styles.reveal}`} data-reveal="">
                  <h2 id="home-route" className={styles.h2}>
                    {h.route.title}
                  </h2>
                  <p className={styles.lead}>{h.route.lead}</p>
                </div>
                <div className={styles.figure}>
                  <Route d={d} t={t} rtl={rtl} />
                </div>
              </section>
              <div className={styles.stageGap} aria-hidden="true" />
              <section aria-labelledby="home-console" className={`${styles.split} ${styles.consoleSplit}`}>
                <div className={`${styles.split75Model} ${styles.modelAfter}`}>
                  <Console d={d} t={t} rtl={rtl} />
                </div>
                <div className={styles.split75Text}>
                  <div className={`${styles.head} ${styles.reveal}`} data-reveal="">
                    <h2 id="home-console" className={styles.h2}>
                      {h.console.title}
                    </h2>
                    <p className={styles.lead}>{h.console.lead}</p>
                  </div>
                  <p className={styles.note}>{h.console.note}</p>
                </div>
              </section>
            </div>
          </div>
        </div>

        {/* OPERATIONS: the bento */}
        <section className={`${styles.section} ${styles.below}`} aria-labelledby="home-ops">
          <div className={styles.container}>
            <div className={`${styles.head} ${styles.reveal}`} data-reveal="">
              <h2 id="home-ops" className={`${styles.h2} ${styles.h2Wide}`}>
                {h.ops.title}
              </h2>
            </div>
            <ul className={styles.bento}>
              <li className={`${styles.cell} ${styles.cellTracking} ${L.cellHover}`}>
                <h3 className={styles.h3}>{h.ops.tracking.title}</h3>
                <p className={styles.body}>{h.ops.tracking.body}</p>
                <div className={`${styles.cellArt} ${L.artBox}`}>
                  <TrackingArt t={t} rtl={rtl} d={d} />
                </div>
              </li>
              <li className={`${styles.cell} ${styles.cellDelivery} ${L.cellHover}`}>
                <h3 className={styles.h3}>{h.ops.delivery.title}</h3>
                <p className={styles.body}>{h.ops.delivery.body}</p>
                <div className={`${styles.cellArt} ${L.artBox}`}>
                  <DeliveryArt t={t} rtl={rtl} />
                </div>
              </li>
              <li className={`${styles.cell} ${styles.cellProfit} ${L.cellHover}`}>
                <h3 className={styles.h3}>{h.ops.profit.title}</h3>
                <p className={styles.body}>{h.ops.profit.body}</p>
                <div className={`${styles.cellArt} ${L.artBox}`}>
                  <ProfitArt t={t} rtl={rtl} />
                </div>
              </li>
              <li className={`${styles.cell} ${styles.cellHealth} ${L.cellHover}`}>
                <h3 className={styles.h3}>{h.ops.health.title}</h3>
                <p className={styles.body}>{h.ops.health.body}</p>
                <div className={`${styles.cellArt} ${L.artBox}`}>
                  <HealthArt t={t} rtl={rtl} />
                </div>
              </li>
              <li className={`${styles.cell} ${styles.cellRoles} ${L.cellHover}`}>
                <h3 className={styles.h3}>{h.ops.roles.title}</h3>
                <p className={styles.body}>{h.ops.roles.body}</p>
                <div className={`${styles.cellArt} ${L.artBox}`}>
                  <RolesArt t={t} rtl={rtl} d={d} />
                </div>
              </li>
              <li className={`${styles.cell} ${styles.cellBackups} ${L.cellHover}`}>
                <h3 className={styles.h3}>{h.ops.backups.title}</h3>
                <p className={styles.body}>{h.ops.backups.body}</p>
                <div className={`${styles.cellArt} ${L.artBox}`}>
                  <BackupsArt rtl={rtl} />
                </div>
              </li>
            </ul>
          </div>
        </section>

        {/* INTEGRATIONS: the Dock */}
        <section className={`${styles.section} ${styles.below}`} aria-labelledby="home-dock">
          <div className={styles.container}>
            <div className={styles.split}>
              <div className={styles.split57Text}>
                <div className={`${styles.head} ${styles.reveal}`} data-reveal="">
                  <h2 id="home-dock" className={styles.h2}>
                    {h.dock.title}
                  </h2>
                  <p className={styles.lead}>{iso(h.dock.lead, rtl)}</p>
                </div>
                <ul className={styles.integrationList}>
                  {h.dock.list.map((name, i) => (
                    <li key={name} className={styles.integrationItem}>
                      <svg viewBox="0 0 24 24" className={styles.integrationGlyph} aria-hidden="true" focusable="false">
                        <use href={`#${DOCK_GLYPHS[i]}`} width={24} height={24} />
                      </svg>
                      <span>{iso(name, rtl)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={styles.split57Model}>
                <Dock d={d} t={t} rtl={rtl} />
              </div>
            </div>
          </div>
        </section>

        {/* LANGUAGES: the Mirror */}
        <section className={`${styles.section} ${styles.below}`} aria-labelledby="home-mirror">
          <div className={styles.container}>
            <div className={`${styles.head} ${styles.headCentered} ${styles.reveal}`} data-reveal="">
              <h2 id="home-mirror" className={styles.h2}>
                {h.mirror.title}
              </h2>
              <p className={styles.lead}>{h.mirror.lead}</p>
            </div>
            <div className={`${styles.figure} ${styles.mirrorFigure}`}>
              <Mirror locale={locale} t={t} />
            </div>
          </div>
        </section>

        {/* STEPS: the rail */}
        <section className={`${styles.section} ${styles.below}`} aria-labelledby="home-steps">
          <div className={styles.container}>
            <div className={styles.stepsGrid}>
              <div className={`${styles.stepsHead} ${styles.reveal}`} data-reveal="">
                <h2 id="home-steps" className={styles.h2}>
                  {h.steps.title}
                </h2>
              </div>
              <div className={styles.stepsRail}>
                <Rail t={t} />
              </div>
            </div>
          </div>
        </section>

        {/* FINAL (stage 3) */}
        <section className={`${styles.stageWrap} ${styles.finalWrap} ${styles.below}`} aria-labelledby="home-final">
          <div className={`${styles.stage} ${styles.final}`}>
            <div className={styles.finalGrid}>
              <div className={styles.finalText}>
                <h2 id="home-final" className={styles.h2}>
                  {h.final.title}
                </h2>
                <Link href="/signup" className={styles.ctaPrimary}>
                  {t.final.cta}
                </Link>
              </div>
              <div className={`${styles.finalFigure} ${styles.reveal}`} data-reveal="">
                <FinalArt t={t} rtl={rtl} />
              </div>
            </div>
          </div>
        </section>
        <LivingIsland />
      </main>
      <SiteFooter locale={locale} brand={brand} docs={docs} motion />
    </MarketingFrame>
  );
}

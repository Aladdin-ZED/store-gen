/**
 * Footer building blocks shared by both variants. Everything reads the sanitized store identity
 * (ctx.store) and the delivery-mode links (ctx.links) — never URLs from section data — and every
 * href is re-checked with safeHref before it reaches the markup.
 */
import type { CSSProperties, ReactElement, ReactNode } from "react";
import {
  cx,
  Icon,
  Picture,
  reveal,
  RichText,
  safeHref,
  type IconName,
} from "../../primitives";
import type { RenderContext } from "../../types";
import { hasStoreName } from "../persona";
import { CHROME, lang, type Chrome } from "./copy";

export const chromeOf = (ctx: RenderContext): Chrome =>
  CHROME[lang(ctx.locale)];

/* ------------------------------------------------------------------ */
/* Glyphs the landing icon set does not carry (same 24px grid, 1.75 stroke) */
/* ------------------------------------------------------------------ */

const GLYPHS = {
  mail: [
    "M5.7 5.5h12.6c1.2 0 2.2 1 2.2 2.2v8.6c0 1.2-1 2.2-2.2 2.2H5.7c-1.2 0-2.2-1-2.2-2.2V7.7c0-1.2 1-2.2 2.2-2.2z",
    "M4.3 7.4l7.7 5.6 7.7-5.6",
  ],
  instagram: [
    "M8 3.5h8A4.5 4.5 0 0 1 20.5 8v8a4.5 4.5 0 0 1-4.5 4.5H8A4.5 4.5 0 0 1 3.5 16V8A4.5 4.5 0 0 1 8 3.5z",
    "M8.2 12a3.8 3.8 0 1 0 7.6 0a3.8 3.8 0 1 0-7.6 0z",
    "M17.1 6.9h.01",
  ],
  facebook: ["M15.5 4h-1.9A3.6 3.6 0 0 0 10 7.6V20.5", "M7.2 10.6h7.6"],
  tiktok: [
    "M14 3.5v11.3a3.7 3.7 0 1 1-3.7-3.7",
    "M14 3.5c.4 2.6 2.4 4.6 5 4.9",
  ],
  youtube: [
    "M3.5 8.4c0-1.6 1.2-3 2.8-3.1C8.1 5.1 10 5 12 5s3.9.1 5.7.3c1.6.1 2.8 1.5 2.8 3.1v7.2c0 1.6-1.2 3-2.8 3.1-1.8.2-3.7.3-5.7.3s-3.9-.1-5.7-.3c-1.6-.1-2.8-1.5-2.8-3.1z",
    "M10.3 9.4v5.2l4.4-2.6z",
  ],
  "arrow-up": ["M12 19.5V5", "M6.5 10.5L12 5l5.5 5.5"],
} as const;

export type GlyphName = keyof typeof GLYPHS;

/** Local stroke glyph (decorative; the link around it carries the accessible name). */
export function Glyph({
  name,
  size = "1em",
  className,
}: {
  name: GlyphName;
  size?: string;
  className?: string;
}): ReactElement {
  return (
    <svg
      className={cx("lp-icon", className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
    >
      {GLYPHS[name].map((d, i) =>
        // the YouTube play mark is solid, the Instagram lens dot a round-capped point
        name === "youtube" && i === 1 ? (
          <path key={i} d={d} fill="currentColor" stroke="none" />
        ) : (
          <path
            key={i}
            d={d}
            strokeWidth={d.endsWith("h.01") ? 2.6 : undefined}
          />
        ),
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Contact channels                                                    */
/* ------------------------------------------------------------------ */

export type ChannelKey = "whatsapp" | "phone" | "email" | "address";

export interface Channel {
  key: ChannelKey;
  label: string;
  /** text shown to the shopper (numbers already grouped for reading) */
  value: string;
  /** absent for the address (plain text) */
  href?: string;
  external: boolean;
  /** numbers & e-mails read left-to-right inside Arabic text */
  ltr: boolean;
}

const MA_INTL = /^212([5-7])(\d{2})(\d{2})(\d{2})(\d{2})$/;
const MA_NATIONAL = /^0([5-7])(\d{2})(\d{2})(\d{2})(\d{2})$/;

/** "+212 6 12 34 56 78" for Moroccan numbers, "+<digits>" otherwise. */
function readWhatsapp(digits: string): string {
  const m = MA_INTL.exec(digits);
  return m ? `+212 ${m.slice(1).join(" ")}` : `+${digits}`;
}

/** Moroccan numbers grouped like on a card ("+212 5 24 47 80 00" / "05 24 47 80 00"); anything else as typed. */
function readPhone(phone: string): string {
  const compact = phone.replace(/[\s().-]/g, "");
  const intl = compact.startsWith("+")
    ? compact.slice(1)
    : compact.startsWith("00")
      ? compact.slice(2)
      : null;
  const mi = intl ? MA_INTL.exec(intl) : null;
  if (mi) return `+212 ${mi.slice(1).join(" ")}`;
  const mn = MA_NATIONAL.exec(compact);
  return mn ? `0${mn[1]} ${mn.slice(2).join(" ")}` : phone;
}

/** wa.me link, optionally with a pre-filled message (apostrophes encoded: safeHref refuses raw quotes). */
export function whatsappHref(
  digits: string,
  text?: string,
): string | undefined {
  if (!/^\d{8,15}$/.test(digits)) return undefined;
  const q = text
    ? `?text=${encodeURIComponent(text).replace(/'/g, "%27")}`
    : "";
  return (
    safeHref(`https://wa.me/${digits}${q}`) ??
    safeHref(`https://wa.me/${digits}`)
  );
}

export function telHref(phone: string): string | undefined {
  return safeHref(`tel:${phone.replace(/(?!^\+)[^\d]/g, "")}`);
}

/** The store's reachable channels, in the order shoppers in this market reach for them. */
export function channels(
  ctx: RenderContext,
  c: Chrome,
  withAddress: boolean,
): Channel[] {
  const s = ctx.store;
  const out: Channel[] = [];
  const wa = s.whatsapp ? whatsappHref(s.whatsapp) : undefined;
  if (s.whatsapp && wa)
    out.push({
      key: "whatsapp",
      label: c.whatsapp,
      value: readWhatsapp(s.whatsapp),
      href: wa,
      external: true,
      ltr: true,
    });
  const tel = s.phone ? telHref(s.phone) : undefined;
  if (s.phone && tel)
    out.push({
      key: "phone",
      label: c.phone,
      value: readPhone(s.phone),
      href: tel,
      external: false,
      ltr: true,
    });
  if (s.email)
    out.push({
      key: "email",
      label: c.email,
      value: s.email,
      href: safeHref(`mailto:${s.email}`),
      external: false,
      ltr: true,
    });
  const place = [s.address, s.city].filter(Boolean).join(", ");
  if (withAddress && place)
    out.push({
      key: "address",
      label: c.address,
      value: place,
      external: false,
      ltr: false,
    });
  return out;
}

export function ChannelIcon({
  k,
  size = "1.15em",
}: {
  k: ChannelKey;
  size?: string;
}): ReactElement {
  if (k === "email") return <Glyph name="mail" size={size} />;
  const name: IconName =
    k === "whatsapp" ? "whatsapp" : k === "phone" ? "phone" : "map-pin";
  return <Icon name={name} size={size} />;
}

/**
 * Link (or plain block for the address) with the right target/rel for external destinations.
 * `name` replaces the default accessible name when the visible label is an action ("Message on
 * WhatsApp") rather than the channel name — the name must contain the visible words.
 */
export function ChannelLink({
  ch,
  className,
  children,
  c,
  name,
  revealKind,
}: {
  ch: Channel;
  className: string;
  children: ReactNode;
  c: Chrome;
  name?: string;
  revealKind?: Parameters<typeof reveal>[0];
}): ReactElement {
  const rv = revealKind ? reveal(revealKind) : {};
  if (!ch.href)
    return (
      <div className={className} data-k={ch.key} {...rv}>
        {children}
      </div>
    );
  const label = ch.external
    ? `${name ?? `${ch.label} ${ch.value}`} (${c.newTab})`
    : name;
  return (
    <a
      className={className}
      data-k={ch.key}
      href={ch.href}
      {...(ch.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...(label ? { "aria-label": label } : {})}
      {...rv}
    >
      {children}
    </a>
  );
}

/** An Arabic-script address keeps its own right-to-left run; any other address is an LTR block (RTL5). */
const ARABIC_SCRIPT = /\p{Script=Arabic}/u;

/**
 * The value in a box that keeps the page direction, with the text isolated inside it: numbers and
 * e-mails read left-to-right, an address takes its own direction — and wrapped lines still align
 * to the page's start edge (an isolate that is itself the grid/flex item would align by its own).
 * Line breaks fall where they read well: an e-mail before its "@" (never at a hyphen of a short
 * domain), an address after a comma.
 */
export function ChannelValue({
  ch,
  className,
  style,
}: {
  ch: Channel;
  className: string;
  style?: CSSProperties;
}): ReactElement {
  const at = ch.key === "email" ? ch.value.lastIndexOf("@") : -1;
  if (at > 0) {
    const domain = ch.value.slice(at);
    return (
      <span className={className} style={style}>
        <bdi dir="ltr">
          {ch.value.slice(0, at)}
          <wbr />
          {domain.length <= 24 ? (
            <span className="lp-footer__nobr">{domain}</span>
          ) : (
            domain
          )}
        </bdi>
      </span>
    );
  }
  if (ch.key === "address") {
    // RTL5 (design.md DES-§4.5.4): no space before a comma ("Casablanca , Maroc"), and the address is one isolated
    // block in its own script's direction: a Latin address reads left to right on an Arabic page, never mirrored
    const clean = ch.value.replace(/\s+([,،.;:])/g, "$1");
    // short segments ("4e étage", the city) stay whole: the address breaks after a comma
    const parts = clean.split(/(,\s*|،\s*)/);
    return (
      <span className={className} style={style}>
        <bdi dir={ARABIC_SCRIPT.test(clean) ? "rtl" : "ltr"}>
          {parts.map((p, i) =>
            i % 2 === 0 && p.length <= 24 ? (
              <span key={i} className="lp-footer__nobr">
                {p}
              </span>
            ) : (
              p
            ),
          )}
        </bdi>
      </span>
    );
  }
  return (
    <span className={className} style={style}>
      {ch.ltr ? <bdi dir="ltr">{ch.value}</bdi> : <bdi>{ch.value}</bdi>}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Brand, legal, identity, socials, back to top                         */
/* ------------------------------------------------------------------ */

/** First letter or digit of the name, capitalised for Latin scripts (Arabic has no case). */
const initialOf = (name: string): string =>
  [...name.trim()]
    .find((ch) => /[\p{L}\p{N}]/u.test(ch))
    ?.toLocaleUpperCase() ?? "";

/**
 * The store mark: the uploaded logo, else the name in the display face led by a monogram tile —
 * the initial on an accent squircle with a top light (an app-icon-like identity, product-tinted).
 * Maison stays pure type: quiet luxury carries no badge.
 */
export function Brand({
  ctx,
  className,
}: {
  ctx: RenderContext;
  className?: string;
}): ReactElement {
  const logo = ctx.store.logo;
  if (logo) {
    return (
      <p className={cx("lp-footer__brand lp-footer__brand--logo", className)}>
        <Picture
          asset={logo}
          sizes="14rem"
          fit="contain"
          alt={ctx.store.name}
          className="lp-footer__logo"
        />
      </p>
    );
  }
  const name = ctx.store.name.trim();
  const n = [...name].length;
  // the monogram is a store's mark: a product name standing in for a store that has none stays pure
  // type (an initial tile would read as an invented logo); maison is always pure type
  const initial = ctx.archetype === "maison" || !hasStoreName(ctx) ? "" : initialOf(name);
  return (
    <p
      className={cx("lp-footer__brand", className)}
      data-len={n <= 12 ? "s" : n <= 22 ? "m" : "l"}
    >
      {initial ? (
        <span className="lp-footer__mono" aria-hidden="true">
          {initial}
        </span>
      ) : null}
      <bdi className="lp-footer__name">{name}</bdi>
    </p>
  );
}

/**
 * The four legal documents (labels from the built-in microcopy, URLs from the delivery mode), then "Report this store"
 * when the platform serves the page (docs/STORE-SAAS.md D76, §C.6; design.md DES-§4.5.4; CRIT15): `ctx.links.report`
 * is the absolute `reportUrl(store, path)` the server computed, used exactly as given (never built or trimmed here),
 * `rel="nofollow"`, same tab, the same quiet link as the legal ones. Exports never set it, so they render nothing.
 */
export function legalLinks(
  ctx: RenderContext,
): { key: string; label: string; href: string; rel?: string }[] {
  const links: { key: string; label: string; href: string; rel?: string }[] = (["privacy", "terms", "shipping", "contact"] as const).map((k) => ({
    key: k,
    label: ctx.t(`footer.${k}`),
    href: ctx.links[k],
  }));
  const report = ctx.links.report;
  if (report) links.push({ key: "report", label: ctx.t("footer.report"), href: report, rel: "nofollow" });
  return links;
}

export function LegalNav({
  ctx,
  c,
  className,
  labelledBy,
  stagger,
}: {
  ctx: RenderContext;
  c: Chrome;
  className?: string;
  labelledBy?: string;
  stagger?: number;
}): ReactElement {
  return (
    <nav
      className={cx("lp-footer__legal", className)}
      {...(labelledBy
        ? { "aria-labelledby": labelledBy }
        : { "aria-label": c.legalNav })}
    >
      <ul
        className="lp-footer__legal-list"
        role="list"
        data-stagger={stagger ? String(stagger) : undefined}
      >
        {legalLinks(ctx).map((l) => (
          <li key={l.key} className={l.key === "report" ? "lp-footer__legal-report" : undefined} {...reveal(stagger ? "fade" : false)}>
            {l.rel ? (
              // the report link leads with its href (`<a href="…/report/…"`), the form the platform's link checks read
              <a href={l.href} className="lp-footer__legal-link" rel={l.rel}>
                {l.label}
              </a>
            ) : (
              <a className="lp-footer__legal-link" href={l.href}>
                {l.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** "© 2026 Store. All rights reserved." + the legal identity (company name, ICE, RC) when set. */
export function Identity({
  ctx,
  className,
}: {
  ctx: RenderContext;
  className?: string;
}): ReactElement {
  const s = ctx.store;
  const year = /^\d{4}/.exec(ctx.now)?.[0];
  // rights belong to the store: without a real store name the line names no one (never the product)
  const holder = hasStoreName(ctx) ? s.name.trim() : "";
  const morocco = ctx.market.code === "MA";
  const ids = [
    s.legalName && s.legalName !== s.name ? s.legalName : null,
    morocco && s.ice ? `ICE ${s.ice}` : null,
    morocco && s.rc ? `RC ${s.rc}` : null,
  ].filter((x): x is string => !!x);
  return (
    <div className={cx("lp-footer__identity", className)}>
      <p className="lp-footer__copy">
        <bdi dir="ltr">©{year ? ` ${year}` : ""}</bdi>
        {holder ? (
          <>
            {" "}
            <bdi>{holder}</bdi>
          </>
        ) : null}
        . {ctx.t("footer.rights")}
      </p>
      {ids.length ? (
        <p className="lp-footer__ids">
          {ids.map((id, i) => (
            <span key={i} className="lp-footer__id">
              <bdi>{id}</bdi>
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

const NETWORKS = [
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["tiktok", "TikTok"],
  ["youtube", "YouTube"],
] as const;

export function Socials({
  ctx,
  c,
  className,
}: {
  ctx: RenderContext;
  c: Chrome;
  className?: string;
}): ReactElement | null {
  const links = NETWORKS.map(([k, label]) => ({
    k,
    label,
    href: safeHref(ctx.store.socials?.[k]),
  })).filter((l) => l.href);
  if (!links.length) return null;
  return (
    <ul
      className={cx("lp-footer__socials", className)}
      role="list"
      aria-label={c.socialNav}
    >
      {links.map((l) => (
        <li key={l.k}>
          <a
            className="lp-footer__round"
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={hasStoreName(ctx) ? `${l.label}, ${ctx.store.name} (${c.newTab})` : `${l.label} (${c.newTab})`}
          >
            <Glyph name={l.k} size="1.2em" />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** "#top" scrolls to the top of the document natively (no element may own that id). */
export function ToTop({
  c,
  className,
}: {
  c: Chrome;
  className?: string;
}): ReactElement {
  return (
    <a className={cx("lp-footer__top", className)} href="#top">
      <span className="lp-footer__top-label">{c.top}</span>
      <span className="lp-footer__top-disc" aria-hidden="true">
        <Glyph name="arrow-up" size="1.1em" className="lp-footer__top-arrow" />
      </span>
    </a>
  );
}

/** COD reassurance capsule: the cash icon on an accent disc, the line, and a single sheen on reveal. */
export function CodPill({
  ctx,
  text,
  className,
  delay,
}: {
  ctx: RenderContext;
  text: string;
  className?: string;
  delay?: number;
}): ReactElement | null {
  if (!text.trim()) return null;
  return (
    <p
      className={cx("lp-footer__cod", className)}
      {...reveal("scale-in", delay)}
    >
      <span className="lp-footer__cod-icon" aria-hidden="true">
        <Icon name="cash-hand" size="1.15em" />
      </span>
      <RichText
        as="span"
        className="lp-footer__cod-text"
        text={text}
        ctx={ctx}
        decorate={false}
        editPath="cod"
      />
    </p>
  );
}

/**
 * Ad pixels — Meta (fbq), TikTok (ttq), Snap (snaptr), GA4 (gtag) — loaded only for the page's
 * configured ids (up to 3 Meta / TikTok pixels: backup ad accounts), never in previews. The vendors'
 * official loader stubs are re-implemented here (no inline script: the strict hash-based CSP trusts
 * what the hashed runtime inserts through 'strict-dynamic') and inject the official scripts.
 *
 * Funnel — event names in src/lib/pixels/ids.ts (PIXEL_EVENTS, shared with the server):
 *   landing    PageView (+ TikTok page, Snap PAGE_VIEW, GA4 config) and ViewContent of the default pack
 *              AddToCart         first pack choice, or first form interaction (once)
 *              InitiateCheckout  first form interaction (once)
 *              Lead              phone number valid for 1.2 s, or at submit (once per session and page,
 *                                only when lead capture is on)
 *   thank-you  PageView + Purchase, once per order (thankyou.ts): value = the server's total,
 *              event id = order id — the id the server-side events (Meta Conversions API, TikTok
 *              Events API) carry, so each platform counts the order once. GA4: transaction_id.
 *
 * Contents per item (docs/OFFERS.md §G.7): content ids per item (contentIdOf), quantities and unit
 * prices from the offer price split (money.ts allocate) — browser events from the current selection
 * (st.px, a choice unit not chosen yet counting as its line's first available item), the Purchase from
 * the stored order groups; the bump item at its price. content_name = product (one item) or offer.
 *
 * Optional chunk "pixels" (§F.9): the renderer embeds it only on pages with pixels outside previews.
 *
 * Advanced matching: once the phone number is valid, its SHA-256 hashes (+ name, e-mail, country;
 * never the clear values) are kept in sessionStorage "lp-px-u" ("lp:<handle>:px-u" on a store page under
 * /s/<handle>, core skey: never shared by two stores of one origin) → TikTok identify() right away; on the
 * thank-you page Meta init user data, TikTok identify() and Snap init get them before the Purchase,
 * then they are deleted.
 */
import { round2 } from "../../lib/page/money";
import { PIXEL_EVENTS, pixelIdList, purchaseEventId, type PixelPlatform, type PixelStep } from "../../lib/pixels/ids";
import type { Content, Ctx, PixelOrder, W } from "./core";
import { getForm, report, sget, skey, sset } from "./core";
import { normalizePhone } from "./phone";

type Fn = (...a: unknown[]) => void;
interface Queue {
  (...a: unknown[]): void;
  queue: unknown[];
  callMethod?: Fn;
  handleRequest?: Fn;
  push?: Queue;
  loaded?: boolean;
  version?: string;
}
type Deferred = unknown[] & Record<string, unknown>;
interface Ttq extends Array<unknown> {
  methods: string[];
  setAndDefer: (o: Deferred, m: string) => void;
  instance: (id: string) => Deferred;
  load: (id: string, opts?: Record<string, unknown>) => void;
  _i: Record<string, Deferred>;
  _t: Record<string, number>;
  _o: Record<string, Record<string, unknown>>;
  page: Fn;
  track: Fn;
  identify: Fn;
}
interface PxWin {
  fbq?: Queue;
  _fbq?: Queue;
  ttq?: Ttq;
  TiktokAnalyticsObject?: string;
  snaptr?: Queue;
  dataLayer?: unknown[];
  gtag?: Fn;
  /** set once the loaders ran in this window: re-initialisation must not double-count page views */
  __lpPx?: boolean;
}

const TTQ_METHODS =
  "page track identify instances debug on off once ready alias group enableCookie disableCookie holdConsent revokeConsent grantConsent".split(
    " ",
  );

/** sessionStorage key name of the hashed customer data (advanced matching; core skey adds the store) */
export const PX_USER_KEY = "px-u";
const LEAD_DELAY_MS = 1200;
const HEX64 = /^[a-f0-9]{64}$/;

interface PixelEvent {
  /** event value, money (pack total, order total…) */
  value: number;
  /** units (+ bump) */
  qty: number;
  currency: string;
  /** per content id: quantity, unit price (cents) */
  contents: Content[];
  /** content_name: product name (single item) or the offer label */
  name: string;
  orderId?: string;
}

/** SHA-256 hashes of the shopper's contact data (lowercase hex). */
export interface UserHashes {
  /** phone digits with country code, no "+" (Meta ph, Snap) */
  ph: string;
  /** E.164 with "+" (TikTok phone_number) */
  phE: string;
  fn?: string;
  ln?: string;
  em?: string;
  /** ISO country, lowercase */
  co?: string;
}

/* ------------------------------------------------------------------ */
/* official loader stubs                                               */
/* ------------------------------------------------------------------ */

/** Meta fbq stub (official snippet semantics: queue `arguments` until fbevents.js takes over). */
function metaStub(w: PxWin, load: (src: string) => void): Queue {
  if (w.fbq) return w.fbq;
  const n = function () {
    // eslint-disable-next-line prefer-rest-params
    if (n.callMethod) n.callMethod(...(arguments as unknown as unknown[]));
    // eslint-disable-next-line prefer-rest-params
    else n.queue.push(arguments);
  } as Queue;
  w.fbq = n;
  if (!w._fbq) w._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = "2.0";
  n.queue = [];
  load("https://connect.facebook.net/en_US/fbevents.js");
  return n;
}

/** TikTok ttq stub (official snippet: deferred method queue + per-pixel _i/_t/_o registries). */
function tiktokStub(w: PxWin, load: (src: string) => void): Ttq {
  w.TiktokAnalyticsObject = "ttq";
  const q = (w.ttq = w.ttq || ([] as unknown as Ttq));
  if (typeof q.load === "function") return q;
  q.methods = TTQ_METHODS;
  q.setAndDefer = (o, m) => {
    o[m] = function () {
      // eslint-disable-next-line prefer-rest-params
      o.push([m].concat(Array.prototype.slice.call(arguments, 0)));
    };
  };
  for (const m of TTQ_METHODS) q.setAndDefer(q as unknown as Deferred, m);
  q.instance = (id) => {
    const e = (q._i[id] || []) as Deferred;
    for (const m of TTQ_METHODS) q.setAndDefer(e, m);
    return e;
  };
  q.load = (id, opts) => {
    const src = "https://analytics.tiktok.com/i18n/pixel/events.js";
    q._i = q._i || {};
    q._i[id] = [] as unknown as Deferred;
    q._i[id]._u = src;
    q._t = q._t || {};
    q._t[id] = Date.now();
    q._o = q._o || {};
    q._o[id] = opts || {};
    load(src + "?sdkid=" + encodeURIComponent(id) + "&lib=ttq");
  };
  return q;
}

/** Snap snaptr stub (official snippet: queue until scevent.min.js installs handleRequest). */
function snapStub(w: PxWin, load: (src: string) => void): Queue {
  if (w.snaptr) return w.snaptr;
  const a = function () {
    // eslint-disable-next-line prefer-rest-params
    if (a.handleRequest) a.handleRequest(...(arguments as unknown as unknown[]));
    // eslint-disable-next-line prefer-rest-params
    else a.queue.push(arguments);
  } as Queue;
  a.queue = [];
  w.snaptr = a;
  load("https://sc-static.net/scevent.min.js");
  return a;
}

/** GA4 gtag (official snippet: dataLayer must receive the Arguments object itself). */
function gaStub(w: PxWin, id: string, load: (src: string) => void): Fn {
  load("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id));
  const dl = (w.dataLayer = w.dataLayer || []);
  w.gtag =
    w.gtag ||
    function () {
      // eslint-disable-next-line prefer-rest-params
      dl.push(arguments);
    };
  return w.gtag;
}

/* ------------------------------------------------------------------ */
/* hashing (advanced matching)                                         */
/* ------------------------------------------------------------------ */

async function sha256(win: W, s: string): Promise<string> {
  const buf = await win.crypto.subtle.digest("SHA-256", new win.TextEncoder().encode(s));
  const b = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < b.length; i++) out += (b[i]! < 16 ? "0" : "") + b[i]!.toString(16);
  return out;
}

/** Lowercase letters only (same rule as the server's Meta fn/ln; Arabic letters kept). */
const letters = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{M}]/gu, "");

/** Hashes of the contact data, in the formats each platform expects. Rejects without WebCrypto (http). */
export async function hashUser(win: W, e164: string, name: string, email: string, country: string): Promise<UserHashes> {
  const digits = e164.replace(/[^0-9]/g, "");
  const parts = name.trim().split(/\s+/);
  const fn = letters(parts[0] || "");
  const ln = letters(parts.slice(1).join(" "));
  const em = email.trim().toLowerCase();
  const co = /^[A-Za-z]{2}$/.test(country) ? country.toLowerCase() : "";
  const h = (s: string) => (s ? sha256(win, s) : Promise.resolve(""));
  const [ph, phE, fnH, lnH, emH, coH] = await Promise.all([h(digits), h("+" + digits), h(fn), h(ln), h(/^[^\s@]+@[^\s@]+$/.test(em) ? em : ""), h(co)]);
  const u: UserHashes = { ph, phE };
  if (fnH) u.fn = fnH;
  if (lnH) u.ln = lnH;
  if (emH) u.em = emH;
  if (coH) u.co = coH;
  return u;
}

export function readUser(win: W): UserHashes | null {
  try {
    const o = JSON.parse(sget(win, "sessionStorage", skey(win, PX_USER_KEY)) || "null") as Record<string, unknown> | null;
    if (!o || typeof o !== "object" || typeof o.ph !== "string" || !HEX64.test(o.ph) || typeof o.phE !== "string" || !HEX64.test(o.phE)) return null;
    const u: UserHashes = { ph: o.ph, phE: o.phE };
    for (const k of ["fn", "ln", "em", "co"] as const) {
      const v = o[k];
      if (typeof v === "string" && HEX64.test(v)) u[k] = v;
    }
    return u;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* module                                                              */
/* ------------------------------------------------------------------ */

export function pixels(c: Ctx): void {
  if (c.preview) return;
  const { cfg, doc, st } = c;
  const win = c.win;
  const w = win as unknown as PxWin;
  const px = (cfg.pixels || {}) as Record<string, unknown>;
  const ids: Record<PixelPlatform, string[]> = {
    meta: pixelIdList("meta", px.meta),
    tiktok: pixelIdList("tiktok", px.tiktok),
    snap: pixelIdList("snap", px.snap),
    ga4: pixelIdList("ga4", px.ga4),
  };
  const on = (p: PixelPlatform) => ids[p].length > 0;
  if (!on("meta") && !on("tiktok") && !on("snap") && !on("ga4")) return;
  const landing = cfg.page === "landing";
  const p = cfg.product;

  const load = (src: string) => {
    const s = doc.createElement("script");
    s.async = true;
    s.src = src;
    const first = doc.getElementsByTagName("script")[0];
    if (first && first.parentNode) first.parentNode.insertBefore(s, first);
    else (doc.head || doc.documentElement).appendChild(s);
  };
  /** one vendor failing never stops the others (nor the page) */
  const guard = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      report(win, e);
    }
  };

  const send = (step: PixelStep, e: PixelEvent) => {
    const value = round2(e.value);
    const cur = e.currency;
    const qty = Math.max(1, Math.round(e.qty) || 1);
    const list = e.contents.length ? e.contents : [{ id: p.contentId, q: qty, p: Math.round((value * 100) / qty) }];
    const ids = list.map((x) => x.id);
    const name = e.name || p.name;
    const eventId = step === "purchase" && e.orderId ? purchaseEventId(e.orderId) : "";
    const lead = step === "lead";
    if (on("meta") && w.fbq)
      guard(() => {
        const data: Record<string, unknown> = lead
          ? { content_name: name, content_ids: ids, value, currency: cur }
          : {
              content_ids: ids,
              content_type: "product",
              content_name: name,
              contents: list.map((x) => ({ id: x.id, quantity: x.q, item_price: x.p / 100 })),
              value,
              currency: cur,
              num_items: qty,
              ...(e.orderId ? { order_id: e.orderId } : {}),
            };
        if (eventId) w.fbq!("track", PIXEL_EVENTS.meta[step], data, { eventID: eventId });
        else w.fbq!("track", PIXEL_EVENTS.meta[step], data);
      });
    if (on("tiktok") && w.ttq)
      guard(() =>
        w.ttq!.track(
          PIXEL_EVENTS.tiktok[step],
          {
            contents: list.map((x) => ({ content_id: x.id, content_type: "product", content_name: name, quantity: x.q, price: x.p / 100 })),
            content_type: "product",
            content_ids: ids,
            value,
            currency: cur,
            ...(e.orderId ? { order_id: e.orderId } : {}),
          },
          eventId ? { event_id: eventId } : {},
        ),
      );
    if (on("snap") && w.snaptr)
      guard(() =>
        w.snaptr!(
          "track",
          PIXEL_EVENTS.snap[step],
          lead
            ? { price: value, currency: cur }
            : {
                item_ids: ids,
                price: value,
                currency: cur,
                number_items: qty,
                ...(e.orderId ? { transaction_id: e.orderId } : {}),
                ...(eventId ? { client_dedup_id: eventId } : {}),
              },
        ),
      );
    if (on("ga4") && w.gtag)
      guard(() =>
        w.gtag!(
          "event",
          PIXEL_EVENTS.ga4[step],
          lead
            ? { currency: cur, value }
            : {
                currency: cur,
                value,
                items: list.map((x) => ({ item_id: x.id, item_name: name, quantity: x.q, price: x.p / 100 })),
                ...(e.orderId ? { transaction_id: e.orderId } : {}),
              },
        ),
      );
  };

  /** the selection (or the default offer) as an event: value = subtotal / total, contents per item */
  const ev = (o: PixelOrder | null, total: boolean): PixelEvent | null =>
    o ? { value: (total ? o.total : o.subtotal) / 100, qty: o.units, currency: cfg.currency, contents: o.contents, name: o.name } : null;
  const order = (id?: string) => (st.px ? st.px(id) : null);

  /* ---------------- loaders + page view (once per window) ---------------- */
  if (!w.__lpPx) {
    w.__lpPx = true;
    // thank-you page: the hashed contact data from the order form (advanced matching)
    const user = landing ? null : readUser(win);
    if (on("meta"))
      guard(() => {
        const fbq = metaStub(w, load);
        const am: Record<string, string> | null = user
          ? { ph: user.ph, ...(user.fn ? { fn: user.fn } : {}), ...(user.ln ? { ln: user.ln } : {}), ...(user.em ? { em: user.em } : {}), ...(user.co ? { country: user.co } : {}) }
          : null;
        for (const id of ids.meta) {
          if (am) fbq("init", id, am);
          else fbq("init", id);
        }
        fbq("track", "PageView");
      });
    if (on("tiktok"))
      guard(() => {
        const q = tiktokStub(w, load);
        for (const id of ids.tiktok) q.load(id);
        if (user) q.identify({ phone_number: user.phE, ...(user.em ? { email: user.em } : {}) });
        q.page();
      });
    if (on("snap"))
      guard(() => {
        const snaptr = snapStub(w, load);
        const am = user ? { user_hashed_phone_number: user.ph, ...(user.em ? { user_hashed_email: user.em } : {}) } : {};
        for (const id of ids.snap) snaptr("init", id, am);
        snaptr("track", "PAGE_VIEW");
      });
    if (on("ga4"))
      guard(() => {
        const gtag = gaStub(w, ids.ga4[0]!, load);
        gtag("js", new Date());
        for (const id of ids.ga4) gtag("config", id);
      });
    // after the DOM modules bound (the selection reader is theirs): ViewContent of the default offer
    if (landing)
      win.setTimeout(() => {
        const e = ev(order(cfg.defaultBundleId), false);
        if (e) send("view", e);
      }, 0);
  }

  /* ---------------- thank-you: Purchase (emitted once per order by thankyou.ts) ---------------- */
  c.sub("purchase", (o) => {
    send("purchase", { value: o.value, qty: o.qty, currency: o.currency, orderId: o.orderId, contents: o.contents || [], name: o.name || p.name });
    try {
      win.sessionStorage.removeItem(skey(win, PX_USER_KEY));
    } catch {
      /* storage blocked */
    }
  });
  if (!landing) return;

  /* ---------------- landing: AddToCart / InitiateCheckout ---------------- */
  let carted = false;
  let checkout = false;
  const cart = () => {
    if (carted) return;
    const e = ev(order(), false);
    if (!e) return;
    carted = true;
    send("cart", e);
  };
  // after the current event: the bundle module may apply the shopper's pick in the same tick
  c.sub("bundle", (e) => {
    if (e.user) win.setTimeout(cart, 0);
  });
  c.sub("start", () =>
    win.setTimeout(() => {
      cart();
      if (checkout) return;
      const e = ev(order(), true);
      if (!e) return;
      checkout = true;
      send("checkout", e);
    }, 0),
  );

  /* ---------------- landing: hashed contact (advanced matching) + Lead ---------------- */
  const leadKey = "lp-px-lead:" + cfg.pageKey;
  let leadDone = !cfg.endpoints.lead || !!sget(win, "sessionStorage", leadKey);
  let leadTimer = 0;
  let lastContact = "";
  const fireLead = () => {
    win.clearTimeout(leadTimer);
    if (leadDone || st.done) return;
    leadDone = true;
    sset(win, "sessionStorage", leadKey, "1");
    const e = ev(order(), true);
    if (e) send("lead", e);
  };
  const contact = (now: boolean) => {
    const f = getForm(c);
    const phoneEl = f ? f.querySelector<HTMLInputElement>('[name="phone"]') : null;
    const phone = phoneEl ? normalizePhone(phoneEl.value, cfg.phone) : null;
    if (!f || !phone) {
      win.clearTimeout(leadTimer);
      return;
    }
    const nameEl = f.querySelector<HTMLInputElement>('[name="name"]');
    const emailEl = f.querySelector<HTMLInputElement>('[name="email"]');
    const name = nameEl ? nameEl.value.slice(0, 80) : "";
    const email = emailEl && !emailEl.disabled ? emailEl.value.slice(0, 120) : "";
    const key = phone.e164 + "\n" + name + "\n" + email;
    if (key !== lastContact) {
      lastContact = key;
      hashUser(win, phone.e164, name, email, cfg.phone.country)
        .then((u) => {
          if (key !== lastContact) return;
          sset(win, "sessionStorage", skey(win, PX_USER_KEY), JSON.stringify(u));
          if (on("tiktok") && w.ttq) guard(() => w.ttq!.identify({ phone_number: u.phE, ...(u.em ? { email: u.em } : {}) }));
        })
        .catch(() => undefined); // no WebCrypto (http): no advanced matching
    }
    if (leadDone) return;
    win.clearTimeout(leadTimer);
    if (now) fireLead();
    else leadTimer = win.setTimeout(fireLead, LEAD_DELAY_MS);
  };
  const inForm = (e: Event) => {
    const t = e.target as Element | null;
    return !!t && typeof t.closest === "function" && !!t.closest("form[data-lp-form]");
  };
  c.on(doc, "input", (e) => {
    if (inForm(e)) contact(false);
  });
  c.on(doc, "change", (e) => {
    if (inForm(e)) contact(false);
  });
  // capture: runs before the form's own submit handler starts the order request
  c.on(doc, "submit", (e) => {
    if (inForm(e)) contact(true);
  }, { capture: true });
  c.add(() => win.clearTimeout(leadTimer));
}

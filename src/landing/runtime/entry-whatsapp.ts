/**
 * WhatsApp order bridge (chunk "whatsapp" = WA_BRIDGE_JS, static WhatsApp exports only; docs/OFFERS.md
 * §G.5). No server: the export's order endpoint is the sentinel WA_ENDPOINT, intercepted here in
 * window.fetch.
 *
 * Landing page: the runtime's form announces each attempt on the document (CustomEvent "lp:order",
 * detail { idem, total (cents), sel }); on the order POST the bridge formats the message from the
 * runtime's own numbers and text — unitsText(cfg, sel, "customer") (units-text.ts, the runtime mirror
 * of src/lib/orders/text.ts) and the total shown — with composeWaMessage (src/lib/export/whatsapp.ts,
 * the same function the server side uses: no pricing here), opens wa.me (new tab / the app) and
 * answers the runtime like a successful order, so the shopper lands on the thank-you page — where a
 * floating glass card keeps a one-tap "open WhatsApp again" until the message is sent.
 *
 * Data: #lp-config (public page data) + #lp-wa (number, endpoint, localized labels). Text is inserted
 * with textContent only. The hand-off to the thank-you page is sessionStorage "lp-wa" (core skey: per store
 * under /s/<handle>, where stores share an origin).
 */
import type { WaLabels } from "../../lib/export/whatsapp";
import { composeWaMessage } from "../../lib/export/whatsapp";
import type { Locale } from "../../lib/page/schema";
import type { LandingRuntimeConfig } from "./config";
import type { W } from "./core";
import { skey } from "./core";
import type { Sel } from "./money";
import { fmtCents, offerOf } from "./money";
import { selText, unitsText } from "./units-text";

interface Handoff {
  idem: string;
  total: number;
  sel: Sel;
}

(() => {
  const d = document;
  const w = window;
  const KEY = skey(w as W, "wa");
  const data = <T>(id: string): T | null => {
    const el = d.getElementById(id);
    if (!el) return null;
    try {
      return JSON.parse(el.textContent || "") as T;
    } catch {
      return null;
    }
  };
  const wa = data<{ v: number; endpoint: string; number: string; labels: WaLabels }>("lp-wa");
  const cfg = data<LandingRuntimeConfig>("lp-config");
  if (!wa || wa.v !== 1 || !wa.labels || !cfg || cfg.v !== 2) return;
  const L = wa.labels;

  const newId = () => {
    const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    const b = new Uint8Array(6);
    if (w.crypto && w.crypto.getRandomValues) w.crypto.getRandomValues(b);
    else for (let i = 0; i < 6; i++) b[i] = Math.floor(Math.random() * 256);
    let s = "WA-";
    for (let j = 0; j < 6; j++) s += A.charAt(b[j]! % 32);
    return s;
  };
  /** the city as the select shows it ("Casablanca"), else the typed value */
  const shown = (name: string, value: string) => {
    const f = d.getElementById("order-form");
    const el = f && f.querySelector<HTMLSelectElement>('select[name="' + name + '"]');
    const o = el && el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
    return o && o.value === value ? o.text : value;
  };
  const IAB = /FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|Bytedance|Snapchat|; wv\)/i;
  const openWa = (href: string) => {
    try {
      const t = w.open("", "_blank");
      if (!t) return false;
      try {
        t.opener = null;
      } catch {
        /* cross-origin */
      }
      t.location.href = href;
      return true;
    } catch {
      return false;
    }
  };
  const json = (body: unknown, status: number) => new w.Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  if (cfg.page === "landing") {
    const native = w.fetch;
    if (typeof native !== "function" || typeof w.Response !== "function") return;
    let last: Handoff | null = null;
    d.addEventListener("lp:order", (e) => {
      last = (e as CustomEvent<Handoff>).detail || null;
    });
    w.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      const url = typeof input === "string" ? input : (input as Request).url;
      // eslint-disable-next-line prefer-rest-params
      if (url !== wa.endpoint) return native.apply(w, arguments as unknown as [RequestInfo, RequestInit]);
      try {
        const p = JSON.parse(String((init && init.body) || "{}")) as Record<string, string>;
        const h = last as Handoff | null;
        const offer = h && h.idem === p.idem ? offerOf(cfg, h.sel.offerId) : undefined;
        if (!h || !offer) return Promise.resolve(json({ ok: false, error: "invalid", fields: { bundleId: "invalid" } }, 422));
        const id = newId();
        const msg = composeWaMessage(
          {
            orderId: id,
            product: cfg.product.name,
            pack: offer.label,
            units: unitsText(selText(cfg, h.sel)),
            total: h.total,
            customer: { name: p.name || "", phone: p.phone || "", city: p.city ? shown("city", p.city) : "", address: p.address, note: p.note, email: p.email },
          },
          L,
          { locale: cfg.locale as Locale, money: (c) => fmtCents(c, cfg.money) },
        );
        const href = "https://wa.me/" + wa.number + "?text=" + encodeURIComponent(msg.text);
        const opened = IAB.test(navigator.userAgent || "") ? false : openWa(href);
        let stored = false;
        try {
          w.sessionStorage.setItem(KEY, JSON.stringify({ orderId: id, href, opened, ts: Date.now() }));
          stored = true;
        } catch {
          /* storage blocked */
        }
        if (!opened && !stored) {
          w.location.href = href;
          return new Promise<Response>(() => undefined);
        }
        return Promise.resolve(json({ ok: true, orderId: id, total: h.total / 100, currency: cfg.currency }, 200));
      } catch (e) {
        return Promise.reject(e);
      }
    } as typeof w.fetch;
    return;
  }
  if (cfg.page !== "thanks") return;

  let rec: { orderId?: string; href?: string; opened?: boolean } | null = null;
  try {
    rec = JSON.parse(w.sessionStorage.getItem(KEY) || "null");
  } catch {
    rec = null;
  }
  const q = /[?&]o=([A-Za-z0-9-]{4,40})/.exec(w.location.search);
  if (!rec || !q || rec.orderId !== q[1] || typeof rec.href !== "string" || rec.href.indexOf("https://wa.me/" + wa.number + "?text=") !== 0) return;
  const r = rec;
  const el = (tag: string, cls: string, text?: string) => {
    const e = d.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  };
  const title = r.opened ? L.cardTitle : L.cardTitleNow;
  const box = el("aside", "lp-wa-cta");
  box.setAttribute("aria-label", title);
  if (!r.opened) box.setAttribute("data-attention", "");
  const body = el("div", "lp-wa-cta__body");
  body.appendChild(el("p", "lp-wa-cta__title", title));
  body.appendChild(el("p", "lp-wa-cta__text", L.cardText));
  const a = el("a", "lp-wa-cta__btn") as HTMLAnchorElement;
  a.href = r.href!;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  const NS = "http://www.w3.org/2000/svg";
  const svg = d.createElementNS(NS, "svg");
  const path = d.createElementNS(NS, "path");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "lp-wa-cta__icon");
  path.setAttribute(
    "d",
    "M12 2.2a9.7 9.7 0 0 0-8.4 14.6L2.3 21.7l5-1.3A9.7 9.7 0 1 0 12 2.2Zm0 1.8a7.9 7.9 0 1 1-4.1 14.7l-.3-.2-2.9.8.8-2.8-.2-.3A7.9 7.9 0 0 1 12 4Zm-3.3 4.2c-.2 0-.6.1-.9.4-.3.3-1.1 1.1-1.1 2.7s1.2 3.1 1.3 3.4c.2.2 2.3 3.6 5.6 4.9 2.8 1.1 3.3.9 3.9.8.6-.1 2-.8 2.2-1.6.3-.8.3-1.4.2-1.6-.1-.1-.3-.2-.6-.4l-2-1c-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.6-.7-.6h-.6Z",
  );
  svg.appendChild(path);
  a.appendChild(svg);
  a.appendChild(el("span", "", L.cardButton));
  a.addEventListener("click", () => {
    box.removeAttribute("data-attention");
    try {
      r.opened = true;
      w.sessionStorage.setItem(KEY, JSON.stringify(r));
    } catch {
      /* storage blocked */
    }
  });
  box.appendChild(body);
  box.appendChild(a);
  d.body.appendChild(box);
})();

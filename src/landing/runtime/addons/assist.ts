/**
 * The `assist` add-on chunk (P3 LANDING; landing.md LAN-§5.1, §5.2, §7.4; docs/STORE-SAAS.md §H.13, D62): the
 * delivery line of a landing page's order form, and the idem the thank-you page needs. An IIFE wrapped in try / catch
 * (≤ 2,600 B gz, budgets.json `assist`) that reads `#lp-config`, its `lp-assist` block (./../../addons/plan.ts
 * `AssistData`), the form and the `lp:order` event; it never calls into the core, never prices, never changes the
 * payload, and writes text with `textContent` only.
 *
 * The line (LAN-§7.4, `composeLineWith` of src/lib/delivery/line.ts over the block's value-keyed `ZoneTable`, at the
 * shopper's own `now`; `idx = city[select.value] ?? star`, the browser never computes a slug):
 *   [data-lp-dz="offer"]   under the offers: no city yet (or a text city field) → the general range; a city with days
 *                          → its dates; a city without days → "Livraison à Fès"; each " · {fee}", the page's fee of the
 *                          checked offer (free offer or `shippingFee` 0 → "livraison gratuite", else the block's `f`,
 *                          the same fee formatted on the server with the page's money format)
 *   [data-lp-dz="city"]    under the city field: a not-served city → "Nous ne livrons pas encore à Fès." and, with a
 *                          store WhatsApp number, the "Écrivez-nous sur WhatsApp" button (wa.me, "Bonjour, livrez-vous
 *                          à Fès ?"); the form then carries `data-lp-dz-state="ns"` (assist.css hides the submit row)
 *                          and a capture-phase `submit` listener on the document blocks the Enter-key submit
 *   no zone and no "*" zone → no line (no promise). Both slots are `aria-live="polite"` (the form renders them); a
 *   slot that appears grows and fades in within 180 ms (none under reduced motion, assist.css). No
 *   IntersectionObserver, no attribute on <html>.
 *
 * Order on WhatsApp (LP-11, LAN-§11.2): with `wo.e` (a live page of a store with `landing.waOrder.enabled` and a
 * number) the form's WhatsApp alternative (`a.lp-of__wa`) gets `data-lp-wa-order` and a click becomes a priced intent:
 * the default is prevented, the choice serialised (./select.ts, never the name, phone or address), posted to `wo.e`
 * (4 s timeout) and `wa.me` opened with the server's message (a new tab, opened inside the tap; the same tab inside
 * in-app browsers, the rule of entry-whatsapp.ts), then the `wa.ready` line with the reference shows under the link.
 * One intent per page view per 30 s (a second tap reopens the same message). Any error or the timeout opens the link's
 * own plain `wa.me` address: the shopper is never stuck. With `wo.n` (the builder preview) only the "works on the live
 * page" note shows; without `wo` the link is untouched.
 *
 * The idem (LAN-§8.3 step 4): with `k`, each `lp:order` (detail `{ idem }`, form.ts) writes "<idem>.<ms>" to
 * sessionStorage `lp:<h>:idem:<pageKey>` (./storage.ts), which `assist-ty` turns into the tracking link's proof and the
 * intent beacon's key.
 */
import type { ZoneTable } from "../../../lib/delivery/types";
import { composeLineWith } from "../../../lib/delivery/line";
import type { DzCopy, ShopperLocale } from "../../../lib/landing/copy";
import type { LandingRuntimeConfig } from "../config";
import { serialiseSelection } from "./select";
import { sessionGet, sessionSet, storageKey } from "./storage";

interface Data {
  v: 1;
  dz?: ZoneTable;
  s?: DzCopy;
  l?: ShopperLocale;
  o?: string;
  c?: 1;
  /** the page's delivery fee, formatted on the server (absent when it is 0) */
  f?: string;
  wa?: string;
  k?: 1;
  /** Order on WhatsApp: the intent API and the `wa.ready` line ({ref}), or the preview's note */
  wo?: { e?: string; r?: string; n?: string };
}

(function () {
  try {
    const d = document;
    const json = (id: string) => JSON.parse((d.getElementById(id) || ({} as Node)).textContent || "null");
    const a: Data | null = json("lp-assist");
    const cfg: LandingRuntimeConfig | null = json("lp-config");
    if (!a || a.v !== 1 || !cfg) return;

    if (a.k)
      d.addEventListener("lp:order", (e) => {
        const idem = ((e as CustomEvent).detail || {}).idem;
        if (/^[a-f0-9-]{36}$/.test(idem)) sessionSet(storageKey(location.pathname, "idem:" + cfg.pageKey), idem + "." + Date.now());
      });

    const form = d.querySelector<HTMLFormElement>("form[data-lp-form]");
    const wo = a.wo;
    const wl = wo && form && form.querySelector<HTMLAnchorElement>("a.lp-of__wa");
    if (wo && wl) {
      const note = (text: string, ref?: string) => {
        const el = d.createElement("p");
        const b = d.createElement("bdi");
        const parts = text.split("{ref}");
        el.className = "lp-of__wa-note";
        el.setAttribute("aria-live", "polite");
        b.dir = "ltr";
        b.textContent = ref || "";
        el.append(parts[0]!, b, parts[1] || "");
        const old = wl.parentNode!.querySelector(".lp-of__wa-note");
        if (old) old.remove();
        wl.parentNode!.appendChild(el);
      };
      if (wo.n) note(wo.n);
      if (wo.e) {
        const ep = wo.e;
        const iab = /FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|Bytedance|Snapchat|; wv\)/i.test(navigator.userAgent);
        let last = 0;
        let lastHref = "";
        wl.setAttribute("data-lp-wa-order", "");
        wl.addEventListener("click", (e) => {
          e.preventDefault();
          let tab: Window | null = null;
          try {
            tab = iab ? null : window.open("", "_blank");
            if (tab) tab.opener = null;
          } catch {
            /* blocked */
          }
          let done = 0;
          const go = (href: string) => {
            if (done++) return 0;
            if (tab) tab.location.href = href;
            else location.href = href;
            return 1;
          };
          if (Date.now() - last < 30000) return go(lastHref);
          setTimeout(() => go(wl.href), 4000);
          let utm = {};
          try {
            utm = JSON.parse(sessionGet(storageKey(location.pathname, "utm"))!) || {};
          } catch {
            /* none or corrupted */
          }
          fetch(ep, {
            method: "POST",
            credentials: "same-origin",
            referrerPolicy: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ pageKey: cfg.pageKey, ver: cfg.ver || undefined, utm, locale: a.l, ...serialiseSelection(form!, cfg) }),
          })
            .then((r) => r.json())
            .then((j: { ok?: boolean; ref: string; number: string; text: string }) => {
              const href = "https://wa.me/" + j.number + "?text=" + encodeURIComponent(j.text);
              if (!j.ok) throw 0;
              if (go(href)) {
                last = Date.now();
                lastHref = href;
                note(wo.r!, j.ref);
              }
            })
            .catch(() => go(wl.href));
        });
      }
    }
    const table = a.dz;
    const c = a.s;
    if (!form || !table || !c) return;
    const slot = (k: string) => d.querySelector<HTMLElement>(`[data-lp-dz="${k}"]`);
    const slotOffer = slot("offer");
    const slotCity = slot("city");
    const city = form.querySelector<HTMLSelectElement>('select[name="city"]');

    const node = (tag: string, cls: string, text: string) => {
      const el = d.createElement(tag);
      el.className = "lp-dz__" + cls;
      el.textContent = text;
      return el;
    };
    /** a slot's new content (none: hidden); a slot that appears grows and fades in (assist.css `@starting-style`, 180 ms) */
    const put = (el: HTMLElement | null, ...parts: (Node | string)[]) => {
      if (!el) return;
      el.textContent = "";
      el.append(...parts);
      el.hidden = !parts.length;
    };

    const update = () => {
      const r = form.querySelector<HTMLInputElement>('input[name="bundle"]:checked');
      const id = r ? r.value : cfg.defaultBundleId;
      const offer = cfg.bundles.find((b) => b.id === id);
      const v = city ? city.value : "";
      const line = composeLineWith(
        {
          table,
          city: v ? { value: v, label: city!.options[city!.selectedIndex]!.text, other: v === a.o } : null,
          textMode: !city,
          locale: a.l!,
          dateLocale: cfg.money.locale,
          now: new Date(),
          confirmationCall: !!a.c,
          fee: (offer && offer.free) || !cfg.shippingFee || !a.f ? { free: true } : { free: false, text: a.f },
          whatsapp: a.wa || null,
        },
        c,
      );
      form.removeAttribute("data-lp-dz-state");
      if (line.state === "not_served") {
        const cta = line.cta;
        put(slotOffer);
        if (!cta) return put(slotCity, line.lead);
        const link = node("a", "wa", cta.label) as HTMLAnchorElement;
        link.href = cta.href;
        link.target = "_blank";
        link.rel = "noopener";
        form.setAttribute("data-lp-dz-state", "ns");
        return put(slotCity, line.lead + " ", link);
      }
      put(slotCity);
      if (line.state === "none") return put(slotOffer);
      put(slotOffer, line.lead, ...(line.marker ? [" ", node("span", "est", line.marker)] : []), ...(line.tail ? [" · ", node("bdi", "fee", line.tail)] : []));
    };

    form.addEventListener("change", (e) => {
      const n = (e.target as HTMLInputElement).name;
      if (n === "bundle" || n === "city") update();
    });
    d.addEventListener(
      "submit",
      (e) => {
        if (e.target === form && form.hasAttribute("data-lp-dz-state")) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      true,
    );
    update();
  } catch (e) {
    console.warn("[lp+]", e);
  }
})();

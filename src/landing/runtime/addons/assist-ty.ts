/**
 * The `assist-ty` add-on chunk (P3 LANDING; landing.md LAN-§8.1-§8.3; docs/STORE-SAAS.md §H.13, D62, D73): the three
 * thank-you blocks, filled in the shopper's browser from the `lp-assist-ty` block (./../../addons/plan.ts
 * `AssistTyData`), `#lp-config` and sessionStorage. An IIFE wrapped in try / catch (≤ 1,500 B gz, budgets.json
 * `assist-ty`); text goes in with `textContent` only, and the core is never called.
 *
 *  1. the order: `lp-order` read with order-store.ts's checks (the id pattern, bounded fields); a record that is not
 *     the `?o=` order is ignored. Preview: the sample order `CMD-PREVIEW`, its first offer, no record, no beacon.
 *  2. [data-lp-ty="confirm"] (an <a>, hidden until filled): wa.me with `confirmText(tpl, { order_id, offer: items ||
 *     bundleLabel, total, name: first word })`, cut at a word to 600 characters (the same function as the server's
 *     `waConfirmText`); a click sends `POST /api/public/track { op: "intent", o, k, kind: "confirm_whatsapp" }` with
 *     `keepalive` and `referrerPolicy: "same-origin"` when the idem is known and the block names the API.
 *  3. [data-lp-ty="expect"]: "Nous vous appelons du <bdi dir=ltr>06 61 23 45 67</bdi> pour confirmer, {when}.", where
 *     `{when}` is `callWhen(now, reviveWindow(win))` (operations' `nextCallableAt`, the one the queue uses; within /
 *     today / tomorrow / weekday; none beyond 7 days); without `win` the sentence without `{when}`.
 *     [data-lp-ty="expect-save"]: "Enregistrez ce numéro pour reconnaître notre appel."
 *  4. [data-lp-ty="track"] (an <a>, hidden until filled): `base?o=<id>#k=<idem>` when this tab placed the order (the
 *     idem `assist` wrote on `lp:order`, taken only when it predates the record by at most 10 minutes), else
 *     `base?o=<id>` (the tracking page asks the 4 digits).
 */
import { callWhen, reviveWindow, type WhenWords } from "../../../lib/landing/hours";
import { confirmText, firstWord } from "../../../lib/landing/template-text";
import type { AssistTyData } from "../../addons/plan";
import type { LandingRuntimeConfig } from "../config";
import { fmtCents, formatMoney } from "../money";
import { sessionGet, storageKey } from "./storage";

/** order-store.ts's `ORDER_ID_RE` (test:landing-addons holds the two equal) */
const ORDER_ID = /^[A-Za-z0-9-]{4,40}$/;

(function () {
  try {
    const d = document;
    const parse = (t: string | null) => {
      try {
        return JSON.parse(t || "null");
      } catch {
        return null; // storage is the shopper's: a broken record is no record
      }
    };
    const json = (id: string) => parse((d.getElementById(id) || ({} as Node)).textContent);
    const a: AssistTyData | null = json("lp-assist-ty");
    const cfg: LandingRuntimeConfig | null = json("lp-config");
    if (!a || a.v !== 1 || !cfg) return;
    const q = <T extends HTMLElement>(k: string) => d.querySelector<T>(`[data-lp-ty="${k}"]`);
    const key = (k: string) => sessionGet(storageKey(location.pathname, k));
    const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
    const preview = cfg.mode === "preview";

    // 1. the order: `?o=` and this tab's record of the same order (bounded, like order-store.ts)
    const o = new URLSearchParams(location.search).get("o") || "";
    const r: Record<string, unknown> | null = preview ? null : parse(key("order"));
    const rec = r && typeof r.orderId === "string" && ORDER_ID.test(r.orderId) && (!o || r.orderId === o) ? r : null;
    const id = preview ? "CMD-PREVIEW" : rec ? (rec.orderId as string) : ORDER_ID.test(o) ? o : "";
    // the idem `assist` wrote on `lp:order`: this order's only when written at most 10 minutes before the record
    const ts = rec && typeof rec.ts === "number" ? rec.ts : 0;
    const k = rec ? /^([a-f0-9-]{36})\.(\d+)$/.exec(key("idem:" + (str(rec.pageKey, 80) || cfg.pageKey)) || "") : null;
    const idem = k && +k[2]! <= ts + 1e3 && ts - +k[2]! < 6e5 ? k[1]! : "";

    // 2. Confirm on WhatsApp
    const pill = q<HTMLAnchorElement>("confirm");
    const sample = preview ? cfg.bundles[0] : undefined;
    const total = rec && typeof rec.total === "number" && rec.total > 0 ? formatMoney(rec.total, cfg.money) : "";
    if (a.confirm && pill && (rec || sample)) {
      const text = confirmText(a.confirm.tpl, {
        order_id: id,
        offer: rec ? str(rec.items, 240) || str(rec.bundleLabel, 120) : sample!.label,
        total: rec ? total : fmtCents(sample!.from, cfg.money),
        name: rec ? firstWord(str(rec.name, 80)) : "",
      });
      pill.href = "https://wa.me/" + a.confirm.wa + "?text=" + encodeURIComponent(text);
      pill.target = "_blank";
      pill.rel = "noopener";
      pill.hidden = false;
      const ep = a.ep;
      if (ep && idem)
        pill.addEventListener("click", () => {
          fetch(ep, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ op: "intent", o: id, k: idem, kind: "confirm_whatsapp" }),
            credentials: "same-origin",
            keepalive: true,
            referrerPolicy: "same-origin",
          }).catch(() => undefined);
        });
    }

    // 3. the expectation: the sentence with the phone in an LTR isolate, `{when}` from the window
    const ex = q("expect");
    const e = a.expect;
    if (e && ex) {
      const s = e.s;
      const w = e.win && reviveWindow(e.win);
      const when = w && s.line ? callWhen(new Date(), w, s as WhenWords, /^(ar|fr)$/.test(cfg.locale) ? cfg.locale : "en") : null;
      const [before, after] = (when ? s.line! : s.plain).replace("{when}", when || "").split("{phone}");
      const bdi = d.createElement("bdi");
      bdi.dir = "ltr";
      bdi.className = "lp-ty-phone";
      bdi.textContent = e.phone;
      ex.textContent = "";
      ex.append(before || "", bdi, after || "");
      ex.hidden = false;
      const save = q("expect-save");
      if (save) {
        save.textContent = s.save;
        save.hidden = false;
      }
    }

    // 4. Track my order
    const tr = q<HTMLAnchorElement>("track");
    if (a.track && tr && id) {
      tr.href = a.track.base + "?o=" + encodeURIComponent(id) + (idem ? "#k=" + idem : "");
      tr.hidden = false;
    }
  } catch (e) {
    console.warn("[lp+]", e);
  }
})();

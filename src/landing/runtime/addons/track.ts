/**
 * The `track` add-on chunk (P3 LANDING; landing.md LAN-§5.2, §9.1, §9.3, §9.4): the `/track` document's only script,
 * an IIFE wrapped in try / catch (≤ 2,400 B gz, budgets.json `track`). It reads the `lp-track` data block and the DOM,
 * never the landing core.
 *
 *  - lookup: shows the form, posts `{ op: "lookup", o, last4 }`; a proven order reloads at its signed address
 *    (`?o=&s=`), where the server renders the status; a refusal shows the page's own words (not found, rate limited);
 *  - proof: the thank-you's link `?o=…#k=<idem>` posts `{ op: "proof" }` once, after taking the fragment out of the
 *    address bar (the proof never stays in the history);
 *  - requests: shows the request list of a signed view; each button opens the one sheet (<dialog>), whose form posts
 *    `{ op: "request", auth: { s } }`; a sent request marks its button, `closed` hides the list.
 * Every `fetch` passes `referrerPolicy: "same-origin"` (LAN-§9.1): the document's `no-referrer` would send the Origin
 * of a same-origin POST as `null`, which `checkOrigin` refuses.
 */
import type { TrackData } from "../../../lib/tracking/contract";

type Reply = { ok?: boolean; s?: string; error?: string } | null;

(function () {
  try {
    const block = document.getElementById("lp-track");
    if (!block) return;
    const d = JSON.parse(block.textContent || "{}") as TrackData;
    const q = <T extends Element>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;

    const post = (body: object): Promise<Reply> =>
      fetch(d.ep, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "same-origin",
        cache: "no-store",
        referrerPolicy: "same-origin",
      }).then(
        (res) => res.json().catch(() => null) as Promise<Reply>,
        () => null,
      );
    const why = (r: Reply) => (r && r.error === "not_found" ? d.msg.notFound : r && r.error === "rate_limited" ? d.msg.rateLimited : r && r.error === "closed" ? d.msg.closed : d.msg.error);
    const go = (o: string, s: string) => location.replace(`${d.path}?o=${encodeURIComponent(o)}&s=${encodeURIComponent(s)}`);
    const busy = (b: Element | null, on: boolean) => {
      if (!b) return;
      if (on) b.setAttribute("aria-busy", "true");
      else b.removeAttribute("aria-busy");
      (b as HTMLButtonElement).disabled = on;
    };

    /* ---- lookup and proof ---- */
    const form = q<HTMLFormElement>("[data-trk-lookup]");
    if (form) {
      form.hidden = false;
      const status = q<HTMLElement>("[data-trk-status]", form);
      const btn = q<HTMLButtonElement>("button", form);
      const oIn = form.elements.namedItem("o") as HTMLInputElement;
      const pin = form.elements.namedItem("last4") as HTMLInputElement;
      const say = (t: string) => {
        if (status) status.textContent = t;
      };
      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const o = oIn.value.trim().toUpperCase();
        const last4 = pin.value.replace(/\D/g, "");
        if (!/^[A-Z]{2,8}-[0-9A-Z]{4,11}$/.test(o) || !/^\d{4}$/.test(last4)) {
          say(d.msg.notFound);
          (o ? pin : oIn).focus();
          return;
        }
        say("");
        busy(btn, true);
        post({ op: "lookup", o, last4 }).then((r) => {
          if (r && r.ok && r.s) return go(o, r.s);
          busy(btn, false);
          say(why(r));
        });
      });
      const k = /(?:^#|&)k=([a-f0-9-]{36})/.exec(location.hash);
      if (k) {
        history.replaceState(null, "", location.pathname + location.search);
        const o = oIn.value.trim();
        if (o) {
          // the skeleton state: the button stays busy until the signed address loads
          busy(btn, true);
          post({ op: "proof", o, k: k[1] }).then((r) => {
            if (r && r.ok && r.s) return go(o, r.s);
            busy(btn, false);
          });
        }
      }
    }

    /* ---- requests ---- */
    const box = q<HTMLElement>("[data-trk-requests]");
    const sheet = q<HTMLDialogElement>("#trk-sheet");
    const sheetForm = sheet && q<HTMLFormElement>("form", sheet);
    if (box && sheet && sheetForm && d.o && d.s) {
      const o = d.o;
      const s = d.s;
      box.hidden = false;
      const title = q<HTMLElement>("[data-trk-sheet-title]", sheet);
      const st = q<HTMLElement>("[data-trk-status]", sheet);
      const send = q<HTMLButtonElement>("[data-trk-send]", sheet);
      const text = sheetForm.elements.namedItem("text") as HTMLTextAreaElement;
      const pageStatus = q<HTMLElement>("[data-trk-page-status]");
      let kind = "";
      let from: HTMLButtonElement | null = null;
      const close = () => (typeof sheet.close === "function" ? sheet.close() : sheet.removeAttribute("open"));
      box.addEventListener("click", (ev) => {
        const b = (ev.target as Element).closest("[data-trk-kind]") as HTMLButtonElement | null;
        if (!b || b.disabled) return;
        from = b;
        kind = b.getAttribute("data-trk-kind") || "";
        if (title) title.textContent = (q("span", b) || b).textContent;
        if (st) st.textContent = "";
        text.value = "";
        if (typeof sheet.showModal === "function") sheet.showModal();
        else sheet.setAttribute("open", "");
      });
      q("[data-trk-close]", sheet)?.addEventListener("click", close);
      sheetForm.addEventListener("submit", (ev) => {
        ev.preventDefault();
        busy(send, true);
        post({ op: "request", o, auth: { s }, kind, text: text.value.trim() || undefined }).then((r) => {
          busy(send, false);
          if (r && r.ok) {
            close();
            if (from) {
              from.disabled = true;
              const mark = q<HTMLElement>(".trk-row__chev", from);
              if (mark) {
                mark.className = "trk-row__state";
                mark.removeAttribute("aria-hidden");
                mark.textContent = d.msg.requested;
              }
            }
            if (pageStatus) pageStatus.textContent = d.msg.sent;
          } else if (r && r.error === "closed") {
            close();
            box.hidden = true;
            if (pageStatus) pageStatus.textContent = d.msg.closed;
          } else if (st) {
            st.textContent = why(r);
          }
        });
      });
    }
  } catch {
    /* the page keeps what the server rendered */
  }
})();

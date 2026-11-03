/**
 * GET /api/app/<handle>/orders/print?ids=A,B,…: the order slips (P4 CALL CENTER; operations.md OPE-§12.8, §M.2; OD28,
 * OD49, OD55). `orders.read` + `shipments.write` through the store's guard; ≤ 200 ids. One HTML document with print
 * CSS: one block per order (id, date, the items to pack as the warehouse text with option codes, qty, city, the masked
 * phone, the customer's note, the landmark, "Ship from {date}" when held, tracking and carrier when set), held orders
 * last after a divider so a warehouse printing "To pack" never packs them by mistake. A4 two per page or 80 mm thermal,
 * chosen in the page (CSS only: the format radio switches a named @page). Never a full phone. The browser's
 * "Print / Save as PDF" makes the PDF (OD28).
 */
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { dirOf, isAdminLocale, translator, type AdminLocale } from "@/lib/i18n/admin";
import { idsParam, slipsFor, type SlipRow } from "@/lib/orders/admin";
import { apiHeaders, json } from "@/lib/orders/http";
import { storeGuard } from "@/lib/tenancy/seam";

type Params = { params: Promise<{ store: string }> };

const esc = (s: string | number | null | undefined) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** the one script: the Print button (its hash is the page's script-src) */
const PRINT_JS = `document.getElementById("sg-print").addEventListener("click",function(){window.print()});`;
const PRINT_JS_HASH = createHash("sha256").update(PRINT_JS).digest("base64");

const CSS = `
:root{--ink:oklch(0.22 0.01 260);--muted:oklch(0.52 0.01 260);--line:oklch(0.9 0.005 260);--soft:oklch(0.97 0.004 260);--accent:oklch(0.5 0.13 250);--held:oklch(0.48 0.12 300)}
*{box-sizing:border-box}html,body{margin:0;background:var(--soft);color:var(--ink);font:13px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Arabic",sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.bar{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center;padding:12px 20px;background:#fff;border-bottom:1px solid var(--line)}
.bar h1{margin:0;font-size:15px;font-weight:600;letter-spacing:-.01em}.bar .n{color:var(--muted);font-variant-numeric:tabular-nums}
.fmt{display:inline-flex;padding:3px;border:1px solid var(--line);border-radius:9px;background:var(--soft)}
.fmt input{position:absolute;opacity:0;pointer-events:none}.fmt label{padding:5px 11px;border-radius:7px;cursor:pointer;color:var(--muted);font-weight:500}
#f-a4:checked~label[for=f-a4],#f-th:checked~label[for=f-th]{background:#fff;color:var(--ink);box-shadow:0 1px 2px oklch(0 0 0/.08)}
.go{margin-inline-start:auto;display:flex;align-items:center;gap:12px}.go small{color:var(--muted)}
button{font:inherit;font-weight:600;padding:8px 16px;border:0;border-radius:9px;background:var(--ink);color:#fff;cursor:pointer}button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.sheet{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr));gap:16px;padding:20px;max-width:1100px;margin:0 auto}
.slip{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 18px;break-inside:avoid;display:flex;flex-direction:column;gap:10px}
.slip header{display:flex;justify-content:space-between;align-items:baseline;gap:12px}.id{font:600 15px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.02em}
.date{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}
.items{margin:0;padding:10px 12px;background:var(--soft);border-radius:8px;font:12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;margin:0}dt{color:var(--muted)}dd{margin:0;word-break:break-word}dd.num{font-variant-numeric:tabular-nums}
.held{color:var(--held);font-weight:600}.tag{display:inline-block;padding:2px 8px;border-radius:999px;border:1px solid currentColor;font-size:11.5px;font-weight:600}
.divider{grid-column:1/-1;display:flex;align-items:center;gap:12px;color:var(--held);font-weight:600;margin-top:8px}.divider::before,.divider::after{content:"";flex:1;height:1px;background:currentColor;opacity:.35}
.empty{padding:48px 20px;text-align:center;color:var(--muted)}
@page{size:A4;margin:10mm}@page thermal{size:80mm auto;margin:3mm}
@media print{
  html,body{background:#fff}.bar{display:none}
  .sheet{display:block;padding:0;max-width:none}
  .slip{border:0;border-bottom:1px dashed oklch(0.7 0 0);border-radius:0;height:138mm;overflow:hidden;padding:6mm 2mm;break-inside:avoid}
  .slip:nth-of-type(2n){break-after:page;border-bottom:0}
  .divider{break-before:page;margin:0 0 4mm}
  body:has(#f-th:checked) .slip{page:thermal;height:auto;width:74mm;padding:2mm 0 4mm;border-bottom:1px dashed #000;break-after:page;font-size:11.5px}
  body:has(#f-th:checked) .items{background:none;padding:0}
  body:has(#f-th:checked) .divider{page:thermal}
}
`;

function slipHtml(s: SlipRow, t: ReturnType<typeof translator>, date: (iso: string) => string): string {
  const row = (label: string, value: string | number | null | undefined, cls = "") => (value === null || value === undefined || value === "" ? "" : `<dt>${esc(label)}</dt><dd class="${cls}">${cls === "num" ? `<bdi dir="ltr">${esc(value)}</bdi>` : esc(value)}</dd>`);
  return `<article class="slip">
<header><span class="id">${esc(s.id)}</span><span class="date">${esc(date(s.createdAt))}</span></header>
${s.held && s.shipAfter ? `<div class="held"><span class="tag">${esc(t("ops.print.shipFrom", { date: date(s.shipAfter) }))}</span></div>` : ""}
<div><div class="date">${esc(t("ops.print.items"))}</div><pre class="items">${esc(s.items)}</pre></div>
<dl>${row(t("ops.print.qty"), s.qty, "num")}${row(t("ops.print.city"), s.city)}${row(t("ops.print.phone"), s.phoneMasked, "num")}${row(t("ops.print.landmark"), s.landmark)}${row(t("ops.print.note"), s.note)}${row(t("ops.print.tracking"), s.trackingRef, "num")}${row(t("ops.print.carrier"), s.carrierLabel)}</dl>
</article>`;
}

export async function GET(req: NextRequest, route: Params): Promise<Response> {
  const g = await storeGuard(req, (await route.params).store, ["shipments.write", "orders.read"]);
  if (!g.ok) return g.response;
  const ctx = g.ctx;
  const ids = idsParam(req.nextUrl.searchParams.get("ids"));
  if (!ids) return json({ error: "invalid" }, 400);
  const slips = await slipsFor(ctx, ids);
  const pick = [ctx.user.locale, ctx.store.defaultLocale].find(isAdminLocale);
  const locale: AdminLocale = pick ?? "en";
  const t = translator(locale);
  const fmt = new Intl.DateTimeFormat(`${locale}-${ctx.store.market || "MA"}`, { timeZone: ctx.store.timezone, day: "2-digit", month: "short", year: "numeric", numberingSystem: "latn" });
  const date = (iso: string) => fmt.format(new Date(iso));
  const ready = slips.filter((s) => !s.held);
  const held = slips.filter((s) => s.held);
  const body = slips.length
    ? `${ready.map((s) => slipHtml(s, t, date)).join("\n")}${held.length ? `\n<div class="divider">${esc(t("ops.print.held"))}</div>\n${held.map((s) => slipHtml(s, t, date)).join("\n")}` : ""}`
    : `<p class="empty">${esc(t("ops.print.empty"))}</p>`;
  const html = `<!doctype html>
<html lang="${locale}" dir="${dirOf(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(t("ops.print.title"))} · ${esc(ctx.store.name)}</title><style>${CSS}</style></head>
<body>
<div class="bar"><h1>${esc(t("ops.print.title"))}</h1><span class="n">${esc(t("ops.print.count", { n: slips.length }))}</span>
<div class="fmt" role="radiogroup"><input type="radio" name="fmt" id="f-a4" checked><input type="radio" name="fmt" id="f-th"><label for="f-a4">${esc(t("ops.print.formatA4"))}</label><label for="f-th">${esc(t("ops.print.formatThermal"))}</label></div>
<div class="go"><small>${esc(t("ops.print.hint"))}</small><button id="sg-print" type="button">${esc(t("ops.print.print"))}</button></div></div>
<main class="sheet">${body}</main>
<script>${PRINT_JS}</script>
</body></html>`;
  const headers = apiHeaders({
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${PRINT_JS_HASH}'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  });
  return new Response(html, { status: 200, headers });
}

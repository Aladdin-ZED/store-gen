// proves: LP-03, LP-04
/**
 * test:landing-addons (P3 LANDING; landing.md LAN-§5.1-§5.3, §7.4, §8.1-§8.3, §8.6, §24.2, §25.1; docs/STORE-SAAS.md
 * §J.1 `test:landing-addons`, §C.9):
 *
 *   npm run test:landing-addons        (tsx src/landing/addons/selftest.ts [--verbose])
 *
 * Offline and pure, ≤ 4 s: the add-on chunks are bundled here with the asset build's own esbuild options and run in a
 * `vm` context over a light DOM fake (no browser). Cases:
 *  1. the `addonsFor` matrix: page × mode × settings (LAN-§5.2 "when", LAN-§5.3 modes); every add-on off answers no
 *     add-on bytes; test mode adds the band; the track page;
 *  2. the data blocks: `lp-assist.dz` is the zone table unchanged (147 cities ≤ 3 KB), `lp-assist-ty` ≤ 600 B gz for a
 *     default-shaped saved window, the window block is operations' `EffectiveWindow` unchanged (closed dates cut to 60
 *     days, ended overrides dropped, ≤ 4, `openOverrideUntil` null);
 *  3. the storage names equal the core chunk's (`skey`) on /s/nour, /s/nour/, /s/nour/serum, /serum and /s/x;
 *  4. a static import-graph walk of every src/landing/runtime/addons/*.ts never reaches src/lib/orders/address.ts;
 *  5. the `{when}` of `assist-ty` equals `callWhen` over the server's window (operations' `nextCallableAt`) on every
 *     case of src/lib/callcenter/window.fixtures.ts, saved, and the queue's `isCallable` is open at the promised time;
 *     the `configured: false` case bakes no `expect.win` and renders no `{when}`; a window closed for 14 days neither;
 *  6. the confirm text equals `waConfirmText` for the same order (ar, fr, en; a name, a multi-item offer, a gift),
 *     names nothing beyond the four variables, and is cut at a word to 600 characters;
 *  7. the intent beacon and the tracking link (idem known, stale, absent; preview: `CMD-PREVIEW`, no beacon); every
 *     `fetch` of `track` and `assist-ty` passes `referrerPolicy: "same-origin"`;
 *  8. the `assist` line over the DOM: no city, a dated city, a free offer, "Autre", a not-served city (the WhatsApp
 *     button, the form state, the blocked submit), a text city field, and the idem capture; no IntersectionObserver
 *     and no write on <html>;
 *  9. the chunks' gzip sizes against budgets.json; the shopper copy (every LAN-§24.2 key in ar / fr / en, no dash,
 *     the same `{vars}` in every language) and the template grammar.
 * Exits 1 on any failure.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import vm from "node:vm";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { DEFAULT_WINDOW } from "@/lib/callcenter/defaults";
import { isCallable, nextCallableAt, type EffectiveWindow } from "@/lib/callcenter/window";
import { WINDOW_FIXTURES } from "@/lib/callcenter/window.fixtures";
import { composeLine, lineText } from "@/lib/delivery/line";
import { buildZoneTable } from "@/lib/delivery/table";
import type { DeliveryZoneRow, StoreCalendar, ZoneTable } from "@/lib/delivery/types";
import { DZ, LP, TRK, TY, WA, fill } from "@/lib/landing/copy";
import { callWhen, wallTime, windowIsEmpty } from "@/lib/landing/hours";
import { CONFIRM_TEXT_MAX, cutAtWord, fillTemplate } from "@/lib/landing/template-text";
import { DEFAULT_TEMPLATES, LANDING_TEMPLATE_KINDS, TEMPLATE_KIND_VARS, defaultTemplate, waConfirmText } from "@/lib/landing/templates";
import { MA_CITIES, OTHER_CITY } from "@/lib/markets/cities-ma";
import { formatMoney, moneyFormat } from "@/lib/markets/info";
import type { OrderRow } from "@/lib/orders/hooks";
import type { PageDoc } from "@/lib/page/schema";
import { CheckoutSetting } from "@/lib/settings/keys/checkout";
import { LandingSetting } from "@/lib/settings/keys/landing";
import { fmtCents } from "@/landing/runtime/money";
import { skey, type W } from "@/landing/runtime/core";
import { ORDER_ID_RE } from "@/landing/runtime/order-store";
import { storageKey, storePrefix } from "@/landing/runtime/addons/storage";
import { serialiseSelection } from "../runtime/addons/select";
import { addonsFor, type AddonInput, type AssistData, type AssistTyData } from "./plan";
import { noAddons, type RenderAddons } from "./types";

const ROOT = resolve(__dirname, "..", "..", "..");
const verbose = process.argv.includes("--verbose");
let failures = 0;
let passed = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    if (verbose) console.log(`  ok  ${name}`);
  } catch (e) {
    failures++;
    console.error(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n").slice(0, 6).join("\n       ") : String(e)}`);
  }
}
/** CCR r1-p3-9: the `assist-ty` budget the maintainer records in budgets.json (the measured chunk plus margin). */
const ASSIST_TY_BUDGET = 3_600;
/** CCR r1-p3-14: the `assist` budget with Order on WhatsApp (LP-11: the serialiser and the intent, ≈ 1,200 B gz). */
const ASSIST_BUDGET = 4_000;
const gz = (s: string) => gzipSync(Buffer.from(s, "utf8"), { level: 9 }).length;

/* ------------------------------------------------------------------ */
/* fixtures                                                            */
/* ------------------------------------------------------------------ */

const NOW = new Date("2026-11-03T09:00:00.000Z"); // Tuesday 10:00 in Casablanca
let zoneSeq = 0;
const zone = (name: string, cities: string[], o: Partial<DeliveryZoneRow> = {}): DeliveryZoneRow => ({
  id: `Z${String(++zoneSeq).padStart(25, "0")}`,
  name,
  cities: cities as DeliveryZoneRow["cities"],
  feeCents: null,
  freeFromCents: null,
  etaMinDays: null,
  etaMaxDays: null,
  notServed: false,
  note: null,
  position: zoneSeq,
  ...o,
});
const CAL: StoreCalendar = { tz: "Africa/Casablanca", workdays: [1, 2, 3, 4, 5, 6], cutoffHour: 14, holidays: ["2026-11-06", "2026-11-18"], leadDays: 1 };
const ZONES = [
  zone("Casablanca", ["casablanca", "mohammedia"], { etaMinDays: 1, etaMaxDays: 2 }),
  zone("Nord", ["tanger"], { notServed: true }),
  zone("Sans délai", ["fes"]),
  zone("Reste", ["*"], { etaMinDays: 3, etaMaxDays: 5 }),
];
const TABLE: ZoneTable = buildZoneTable(ZONES, CAL, MA_CITIES);

/** The fields of a page document `addonsFor` reads (the rest of the schema plays no part). */
function docOf(o: { locale?: string; orderForm?: boolean; shippingFee?: number } = {}): PageDoc {
  return {
    locale: o.locale ?? "fr",
    currency: "MAD",
    sections: o.orderForm === false ? [{ id: "hero", type: "hero" }] : [{ id: "hero", type: "hero" }, { id: "order", type: "orderForm" }],
    offers: { shippingFee: o.shippingFee ?? 35 },
    form: { phoneCountry: "MA", whatsapp: { enabled: false, number: "" } },
  } as unknown as PageDoc;
}

const SAVED: EffectiveWindow = { tz: "Africa/Casablanca", days: DEFAULT_WINDOW.days, closedDates: [], overrides: [], openOverrideUntil: null, configured: true };

function inputOf(o: {
  page?: AddonInput["page"];
  mode?: AddonInput["mode"];
  doc?: PageDoc;
  zonesEnabled?: boolean;
  lineOnLanding?: boolean;
  thankYou?: Partial<LandingSetting["thankYou"]>;
  confirmationCall?: boolean;
  notServedWa?: boolean;
  callerPhone?: string | null;
  confirmWa?: string | null;
  withinHours?: number;
  whatsapp?: string;
  table?: ZoneTable | null;
  window?: EffectiveWindow | null;
  tpl?: string | null;
  trackBase?: string;
  now?: Date;
  /** `landing.waOrder.enabled` (LP-11) */
  waOrder?: boolean;
}): AddonInput {
  const doc = o.doc ?? docOf();
  const checkout = CheckoutSetting.parse({ zonesEnabled: o.zonesEnabled ?? true, lineOnLanding: o.lineOnLanding ?? true, confirmationCall: o.confirmationCall ?? true, notServed: { whatsapp: o.notServedWa ?? true } });
  const landing = LandingSetting.parse({ thankYou: { confirmWhatsapp: true, expectation: true, trackLink: true, ...o.thankYou }, waOrder: { enabled: !!o.waOrder } });
  return {
    page: o.page ?? "landing",
    mode: o.mode ?? "live",
    doc,
    store: { handle: "nour", timezone: "Africa/Casablanca" },
    settings: {
      checkout,
      landing,
      confirmation: {
        ...(o.callerPhone === null ? {} : { callerPhone: o.callerPhone ?? "+212661234567" }),
        ...(o.confirmWa === null ? {} : { whatsapp: o.confirmWa ?? "212661234567" }),
        ...(o.withinHours ? { withinHours: o.withinHours } : {}),
      },
      ...(o.whatsapp === undefined ? { whatsapp: "+212 6 61 00 00 00" } : o.whatsapp ? { whatsapp: o.whatsapp } : {}),
    },
    table: o.table === undefined ? TABLE : o.table,
    window: o.window === undefined ? SAVED : o.window,
    templates: o.tpl === null ? {} : { customer_confirm: o.tpl ?? defaultTemplate("customer_confirm", doc.locale) },
    links: { trackBase: o.trackBase ?? "/s/nour/track" },
    now: o.now ?? NOW,
  };
}
const OFF = { zonesEnabled: false, thankYou: { confirmWhatsapp: false, expectation: false, trackLink: false } };
const MODES: readonly AddonInput["mode"][] = ["live", "preview", "test", "export-static", "export-connected", "export-php", "export-whatsapp"];
const data = <T>(a: RenderAddons, id: "lp-assist" | "lp-assist-ty") => a.data[id] as T | undefined;

/* ------------------------------------------------------------------ */
/* the chunks, bundled like scripts/build-landing-assets.mjs does       */
/* ------------------------------------------------------------------ */

async function bundle(name: string): Promise<string> {
  const res = await build({
    entryPoints: [join(ROOT, "src", "landing", "runtime", "addons", `${name}.ts`)],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2019",
    minify: true,
    legalComments: "none",
    charset: "utf8",
    write: false,
    logLevel: "silent",
    tsconfig: join(ROOT, "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"production"' },
  });
  return res.outputFiles[0]!.text.trim();
}

/* ------------------------------------------------------------------ */
/* a light DOM                                                         */
/* ------------------------------------------------------------------ */

type Listener = { fn: (e: FakeEvent) => void; capture: boolean };

class FakeEvent {
  defaultPrevented = false;
  stopped = false;
  target: FakeEl | null = null;
  constructor(
    public type: string,
    init: { bubbles?: boolean; detail?: unknown } = {},
  ) {
    this.bubbles = !!init.bubbles;
    this.detail = init.detail;
  }
  bubbles: boolean;
  detail: unknown;
  preventDefault() {
    this.defaultPrevented = true;
  }
  stopImmediatePropagation() {
    this.stopped = true;
  }
}

class FakeText {
  parentNode: FakeEl | null = null;
  constructor(public data: string) {}
  get textContent() {
    return this.data;
  }
}

const SEL = /^([a-z]+)?((?:\[[a-z-]+(?:="[^"]*")?\])*)(:checked)?$/;
/** `tag.class` (the WhatsApp link of LP-11, `a.lp-of__wa`, `.lp-of__wa-note`) */
const SEL_CLASS = /^([a-z]+)?\.([\w-]+)$/;
const ATTR = /\[([a-z-]+)(?:="([^"]*)")?\]/g;

class FakeEl {
  parentNode: FakeEl | null = null;
  attrs = new Map<string, string>();
  children: (FakeEl | FakeText)[] = [];
  listeners = new Map<string, Listener[]>();
  href = "";
  target = "";
  rel = "";
  dir = "";
  value = "";
  checked = false;
  selectedIndex = -1;
  offsetWidth = 0;
  constructor(public tagName: string) {}
  get className() {
    return this.attrs.get("class") ?? "";
  }
  set className(v: string) {
    this.attrs.set("class", v);
  }
  get name() {
    return this.attrs.get("name") ?? "";
  }
  get hidden() {
    return this.attrs.has("hidden");
  }
  set hidden(v: boolean) {
    if (v) this.attrs.set("hidden", "");
    else this.attrs.delete("hidden");
  }
  setAttribute(k: string, v: string) {
    this.attrs.set(k, String(v));
  }
  getAttribute(k: string) {
    return this.attrs.has(k) ? this.attrs.get(k)! : null;
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  hasAttribute(k: string) {
    return this.attrs.has(k);
  }
  get textContent(): string {
    return this.children.map((c) => c.textContent).join("");
  }
  set textContent(v: string) {
    this.children = v ? [new FakeText(v)] : [];
  }
  get text() {
    return this.textContent;
  }
  get options(): FakeEl[] {
    return this.children.filter((c): c is FakeEl => c instanceof FakeEl && c.tagName === "option");
  }
  append(...nodes: (FakeEl | FakeText | string)[]) {
    for (const n of nodes) {
      const node = typeof n === "string" ? new FakeText(n) : n;
      node.parentNode = this;
      this.children.push(node);
    }
  }
  add(tag: string, attrs: Record<string, string> = {}, text?: string): FakeEl {
    const el = new FakeEl(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (attrs.value !== undefined) el.value = attrs.value;
    if (text) el.textContent = text;
    this.append(el);
    return el;
  }
  *walk(): Generator<FakeEl> {
    for (const c of this.children)
      if (c instanceof FakeEl) {
        yield c;
        yield* c.walk();
      }
  }
  get type() {
    return this.attrs.get("type") ?? (this.tagName === "select" ? "select-one" : this.tagName === "textarea" ? "textarea" : this.tagName === "input" ? "text" : "");
  }
  get disabled() {
    return this.attrs.has("disabled");
  }
  /** a form's controls, in document order */
  get elements(): FakeEl[] {
    return [...this.walk()].filter((el) => el.tagName === "input" || el.tagName === "select" || el.tagName === "textarea");
  }
  appendChild(node: FakeEl) {
    this.append(node);
    return node;
  }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
    this.parentNode = null;
  }
  matches(sel: string): boolean {
    const c = SEL_CLASS.exec(sel);
    if (c) return (!c[1] || c[1] === this.tagName) && this.className.split(" ").includes(c[2]!);
    const m = SEL.exec(sel);
    if (!m) throw new Error(`fake DOM: unsupported selector ${sel}`);
    if (m[1] && m[1] !== this.tagName) return false;
    for (const a of (m[2] ?? "").matchAll(ATTR)) {
      if (!this.attrs.has(a[1]!)) return false;
      if (a[2] !== undefined && this.attrs.get(a[1]!) !== a[2]) return false;
    }
    return !m[3] || this.checked;
  }
  querySelector(sel: string): FakeEl | null {
    for (const el of this.walk()) if (el.matches(sel)) return el;
    return null;
  }
  addEventListener(type: string, fn: (e: FakeEvent) => void, capture?: boolean | { capture?: boolean }) {
    const list = this.listeners.get(type) ?? [];
    list.push({ fn, capture: typeof capture === "object" ? !!capture.capture : !!capture });
    this.listeners.set(type, list);
  }
  dispatchEvent(e: FakeEvent): boolean {
    e.target = this;
    const path: FakeEl[] = [];
    for (let p: FakeEl | null = this.parentNode; p; p = p.parentNode) path.push(p);
    const run = (el: FakeEl, capture: boolean | null) => {
      for (const l of el.listeners.get(e.type) ?? []) {
        if (e.stopped) return;
        if (capture === null || l.capture === capture) l.fn(e);
      }
    };
    for (const el of [...path].reverse()) if (!e.stopped) run(el, true);
    if (!e.stopped) run(this, null);
    if (e.bubbles) for (const el of path) if (!e.stopped) run(el, false);
    return !e.defaultPrevented;
  }
}

class FakeDoc extends FakeEl {
  constructor() {
    super("#document");
  }
  getElementById(id: string) {
    for (const el of this.walk()) if (el.getAttribute("id") === id) return el;
    return null;
  }
  createElement(tag: string) {
    return new FakeEl(tag);
  }
}

interface Run {
  doc: FakeDoc;
  storage: Map<string, string>;
  fetches: { url: string; init: Record<string, unknown> }[];
  warnings: unknown[];
  /** the tabs `window.open` returned (LP-11) and the timers set */
  opened: { opener: unknown; location: { href: string } }[];
  timers: { fn: () => void; ms: number }[];
  location: { href?: string };
}

/** Runs a bundled chunk over `doc` at `now` with `location` and `sessionStorage` faked. */
function runChunk(js: string, doc: FakeDoc, o: { path: string; search?: string; now: Date; storage?: Map<string, string>; reply?: unknown; ua?: string }): Run {
  const storage = o.storage ?? new Map<string, string>();
  const fetches: Run["fetches"] = [];
  const warnings: unknown[] = [];
  const opened: Run["opened"] = [];
  const timers: Run["timers"] = [];
  const sandbox: Record<string, unknown> = {
    document: doc,
    location: { pathname: o.path, search: o.search ?? "", hash: "" },
    sessionStorage: { getItem: (k: string) => (storage.has(k) ? storage.get(k)! : null), setItem: (k: string, v: string) => void storage.set(k, String(v)) },
    fetch: (url: string, init: Record<string, unknown>) => {
      fetches.push({ url, init });
      if (o.reply === "reject") return Promise.reject(new Error("offline"));
      if (o.reply === "hang") return new Promise(() => undefined);
      return Promise.resolve({ json: () => Promise.resolve(o.reply ?? { ok: true }) });
    },
    navigator: { userAgent: o.ua ?? "Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36" },
    open: () => {
      const tab = { opener: {}, location: { href: "" } };
      opened.push(tab);
      return tab;
    },
    setTimeout: (fn: () => void, ms: number) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimeout: () => undefined,
    console: { warn: (...a: unknown[]) => warnings.push(a), log: () => undefined },
    URLSearchParams,
    CustomEvent: FakeEvent,
    __NOW: o.now.getTime(),
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext("const __RD = Date; globalThis.Date = class extends __RD { constructor(...a) { if (a.length) super(...a); else super(__NOW); } static now() { return __NOW; } };", ctx);
  vm.runInContext(js, ctx);
  return { doc, storage, fetches, warnings, opened, timers, location: sandbox.location as { href?: string } };
}

const json = (doc: FakeDoc, id: string, value: unknown) => doc.add("script", { type: "application/json", id }, JSON.stringify(value));

/** The thank-you document's slots (the markup contract the thank-you page renders, LAN-§8.1). */
function thanksDoc(block: AssistTyData | undefined, cfg: Record<string, unknown>): FakeDoc {
  const doc = new FakeDoc();
  json(doc, "lp-config", cfg);
  if (block) json(doc, "lp-assist-ty", block);
  doc.add("a", { "data-lp-ty": "confirm", hidden: "" }, TY.fr.confirm);
  doc.add("p", { "data-lp-ty": "expect" }, "Nous vous appelons pour confirmer.");
  doc.add("p", { "data-lp-ty": "expect-save", hidden: "" });
  doc.add("a", { "data-lp-ty": "track", hidden: "" }, TY.fr.track);
  return doc;
}

const MONEY_FR = moneyFormat("MAD", "fr");
const cfgOf = (o: { locale?: string; mode?: string; pageKey?: string } = {}) => ({
  v: 2,
  page: "thanks",
  pageKey: o.pageKey ?? "pk-serum",
  mode: o.mode ?? "live",
  locale: o.locale ?? "fr",
  money: { ...moneyFormat("MAD", o.locale ?? "fr"), minor: 100 },
  shippingFee: 3500,
  defaultBundleId: "duo",
  bundles: [
    { id: "duo", label: "Pack Duo", free: false, from: 29_900 },
    { id: "trio", label: "Pack Trio", free: true, from: 39_900 },
  ],
});

/* ------------------------------------------------------------------ */
/* the static import graph                                             */
/* ------------------------------------------------------------------ */

const IMPORT = /^\s*(?:import|export)\s+(type\s+)?([\s\S]*?)\s*from\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']/gm;

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, "src", spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const p of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), base]) if (existsSync(p)) return p;
  return null;
}

/** Every file a value import of `entry` reaches (`import type` and all-type specifier lists are erased by the build). */
function importGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(IMPORT)) {
      if (m[1]) continue;
      const names = m[2] ?? "";
      const list = /^\{([\s\S]*)\}$/.exec(names.trim());
      if (list && list[1]!.split(",").map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith("type "))) continue;
      const next = resolveImport(file, (m[3] ?? m[4])!);
      if (next && /\.tsx?$/.test(next)) stack.push(next);
    }
  }
  return seen;
}

/* ------------------------------------------------------------------ */
/* the cases                                                           */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const t0 = Date.now();
  const [assistJs, assistTyJs, trackJs] = await Promise.all([bundle("assist"), bundle("assist-ty"), bundle("track")]);

  /* 1. the addonsFor matrix ------------------------------------------ */

  check("every add-on off: no add-on bytes in every mode but test, which carries only the band", () => {
    for (const mode of MODES)
      for (const page of ["landing", "thanks"] as const) {
        const a = addonsFor(inputOf({ ...OFF, page, mode, table: null, window: null, tpl: null }));
        assert.deepEqual(a, mode === "test" ? { ...noAddons(), banner: "test" } : noAddons(), `${page} ${mode}`);
      }
  });

  check("landing, live: assist with the zone table unchanged, its CSS, the idem capture", () => {
    const a = addonsFor(inputOf({}));
    assert.deepEqual(a.body, ["assist"]);
    assert.deepEqual(a.css, ["assist"]);
    assert.deepEqual(a.head, []);
    const d = data<AssistData>(a, "lp-assist")!;
    assert.equal(d.dz, TABLE, "the very ZoneTable zonesForCheckout answered");
    assert.deepEqual(JSON.parse(JSON.stringify(d.dz)), JSON.parse(JSON.stringify(TABLE)));
    assert.equal(d.k, 1);
    assert.equal(d.l, "fr");
    assert.equal(d.o, OTHER_CITY.value);
    assert.equal(d.c, 1);
    assert.equal(d.wa, "212661000000", "the not-served button's number: the store's WhatsApp");
    assert.equal(d.f, fmtCents(3500, MONEY_FR), "the fee as the page prints it");
    assert.equal(d.s!.general, DZ.fr.general);
  });

  check("landing: the line needs zones on, the line on, a zone with days or not served, and an order form", () => {
    const noLine = (o: Parameters<typeof inputOf>[0]) => data<AssistData>(addonsFor(inputOf({ thankYou: { trackLink: false, confirmWhatsapp: false }, ...o })), "lp-assist");
    assert.equal(noLine({ zonesEnabled: false }), undefined);
    assert.equal(noLine({ lineOnLanding: false }), undefined);
    assert.equal(noLine({ table: buildZoneTable([zone("Sans délai", ["*"])], CAL, MA_CITIES) }), undefined, "no zone says anything");
    assert.equal(noLine({ doc: docOf({ orderForm: false }) }), undefined, "no order form");
    assert.ok(noLine({ table: buildZoneTable([zone("Nord", ["*"], { notServed: true })], CAL, MA_CITIES) })?.dz, "a not-served zone alone is a line");
    const d = noLine({ confirmationCall: false, notServedWa: false, table: buildZoneTable([zone("Casa", ["casablanca"], { etaMinDays: 1, etaMaxDays: 2 })], CAL, MA_CITIES) })!;
    assert.equal(d.c, undefined);
    assert.equal(d.wa, undefined);
    assert.equal(d.s!.afterCall, undefined, "no call: no after-call words");
    assert.equal(d.s!.notServed, undefined, "no not-served zone: no not-served words");
    assert.equal(noLine({ doc: docOf({ shippingFee: 0 }) })!.f, undefined, "a free page carries no fee text");
  });

  check("landing: the idem capture only on live and test documents, with the tracking link or the confirm pill on", () => {
    for (const mode of MODES) {
      const d = data<AssistData>(addonsFor(inputOf({ mode })), "lp-assist")!;
      assert.equal(d.k, mode === "live" || mode === "test" ? 1 : undefined, mode);
      assert.ok(d.dz, `${mode}: the delivery line in every mode`);
    }
    const only = (thankYou: Partial<LandingSetting["thankYou"]>, o: Parameters<typeof inputOf>[0] = {}) => data<AssistData>(addonsFor(inputOf({ zonesEnabled: false, thankYou, ...o })), "lp-assist");
    assert.deepEqual(only({ confirmWhatsapp: false, trackLink: true }), { v: 1, k: 1 });
    assert.deepEqual(only({ confirmWhatsapp: true, trackLink: false }), { v: 1, k: 1 });
    assert.equal(only({ confirmWhatsapp: true, trackLink: false }, { confirmWa: null, whatsapp: "" }), undefined, "a pill without a number captures nothing");
  });

  check("thanks, live: the three blocks, the beacon's API, the window baked (saved, opens within 14 days)", () => {
    const a = addonsFor(inputOf({ page: "thanks", withinHours: 2 }));
    assert.deepEqual(a.body, ["assist-ty"]);
    assert.deepEqual(a.css, ["assist-ty"]);
    const d = data<AssistTyData>(a, "lp-assist-ty")!;
    assert.deepEqual(d.confirm, { wa: "212661234567", tpl: DEFAULT_TEMPLATES.customer_confirm.fr });
    assert.equal(d.expect!.phone, "06 61 23 45 67");
    assert.deepEqual(d.expect!.win, { ...SAVED, openOverrideUntil: null });
    assert.equal(d.expect!.s.within, "dans les 2 heures");
    assert.deepEqual(d.track, { base: "/s/nour/track" });
    assert.equal(d.ep, "/api/public/track");
    assert.equal(d.h, "nour");
    assert.equal(d.tz, "Africa/Casablanca");
  });

  check("thanks: the mode matrix (preview no beacon; exports no tracking link but connected, absolute)", () => {
    for (const mode of MODES) {
      const base = mode === "export-connected" ? "https://nour.example.ma/track" : "/s/nour/track";
      const d = data<AssistTyData>(addonsFor(inputOf({ page: "thanks", mode, trackBase: base })), "lp-assist-ty")!;
      assert.ok(d.confirm && d.expect, `${mode}: confirm and expectation`);
      const tracked = mode === "live" || mode === "test" || mode === "preview" || mode === "export-connected";
      assert.deepEqual(d.track, tracked ? { base } : undefined, `${mode}: tracking link`);
      assert.equal(d.ep, mode === "live" || mode === "test" ? "/api/public/track" : undefined, `${mode}: beacon`);
    }
    const t = addonsFor(inputOf({ page: "thanks", mode: "test" }));
    assert.equal(t.banner, "test");
    assert.equal(addonsFor(inputOf({ page: "landing", mode: "test" })).banner, "test");
  });

  check("thanks: each block needs its data (number and template, caller phone, the switch)", () => {
    const d = (o: Parameters<typeof inputOf>[0]) => data<AssistTyData>(addonsFor(inputOf({ page: "thanks", ...o })), "lp-assist-ty");
    assert.equal(d({ confirmWa: null, whatsapp: "" })!.confirm, undefined, "no WhatsApp number");
    assert.deepEqual(d({ confirmWa: null })!.confirm!.wa, "212661000000", "the store's WhatsApp when no confirmation number");
    assert.equal(d({ tpl: null })!.confirm, undefined, "no template");
    assert.equal(d({ callerPhone: null })!.expect, undefined, "no caller phone: no expectation (no phone anywhere)");
    assert.equal(d({ thankYou: { expectation: false } })!.expect, undefined);
    assert.equal(d({ thankYou: { trackLink: false } })!.track, undefined);
    assert.equal(d({ callerPhone: null, confirmWa: null, whatsapp: "", thankYou: { trackLink: false } }), undefined, "nothing to fill: no chunk");
    assert.equal(d({})!.expect!.s.within, "aujourd'hui", "no withinHours: today");
  });

  check("the track page carries the track chunk and its CSS", () => {
    const a = addonsFor(inputOf({ page: "track" }));
    assert.deepEqual([a.body, a.css], [["track"], ["track"]]);
  });

  /* 2. data blocks ----------------------------------------------------- */

  check("lp-assist: one key per city of MA_CITIES but Autre, ≤ 3 KB of JSON for the zone table", () => {
    const d = data<AssistData>(addonsFor(inputOf({})), "lp-assist")!;
    const keys = Object.keys(d.dz!.city).sort();
    assert.deepEqual(keys, MA_CITIES.filter((c) => c.value !== OTHER_CITY.value).map((c) => c.value).sort());
    assert.ok(keys.length >= 147, `${keys.length} cities`);
    const dz = Buffer.byteLength(JSON.stringify(d.dz));
    assert.ok(dz <= 3_072, `zone table ${dz} B`);
    const all = JSON.stringify(d);
    if (verbose) console.log(`       lp-assist: dz ${dz} B, block ${Buffer.byteLength(all)} B (${gz(all)} B gz)`);
    assert.ok(gz(all) <= 3_072, `block ${gz(all)} B gz`);
  });

  check("lp-assist-ty: ≤ 600 B gz with a default-shaped saved window; 4 overrides and 60 closed dates ≈ 1.4 KB", () => {
    const d = data<AssistTyData>(addonsFor(inputOf({ page: "thanks", withinHours: 2 })), "lp-assist-ty")!;
    const size = gz(JSON.stringify(d));
    if (verbose) console.log(`       lp-assist-ty: ${Buffer.byteLength(JSON.stringify(d))} B (${size} B gz)`);
    assert.ok(size <= 600, `${size} B gz`);
    const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));
    const busy: EffectiveWindow = {
      ...SAVED,
      closedDates: days("2026-11-20", 60),
      overrides: [0, 1, 2, 3].map((i) => ({ label: `Ramadan ${i}`, from: `2027-0${i + 2}-01`, to: `2027-0${i + 2}-20`, days: DEFAULT_WINDOW.days })),
    };
    const big = gz(JSON.stringify(data<AssistTyData>(addonsFor(inputOf({ page: "thanks", window: busy })), "lp-assist-ty")));
    assert.ok(big <= 1_500, `${big} B gz`);
  });

  check("the window block: operations' window unchanged, closed dates of the next 60 days, ≤ 4 live overrides, no Open calls now", () => {
    const w: EffectiveWindow = {
      ...SAVED,
      openOverrideUntil: "2026-11-03T11:00:00.000Z",
      closedDates: ["2026-11-01", "2026-11-03", "2026-12-31", "2027-01-02", "2027-02-01"],
      overrides: [
        { label: "past", from: "2026-10-01", to: "2026-11-02", days: DEFAULT_WINDOW.days },
        ...[1, 2, 3, 4, 5].map((i) => ({ label: `o${i}`, from: `2026-12-0${i}`, to: `2026-12-1${i}`, days: DEFAULT_WINDOW.days })),
      ],
    };
    const win = data<AssistTyData>(addonsFor(inputOf({ page: "thanks", window: w })), "lp-assist-ty")!.expect!.win!;
    assert.equal(win.openOverrideUntil, null);
    assert.deepEqual(win.closedDates, ["2026-11-03", "2026-12-31"]);
    assert.deepEqual(win.overrides.map((o) => o.label), ["o1", "o2", "o3", "o4"]);
    assert.equal(win.days, w.days, "operations' own days container, never re-keyed");
    assert.equal(win.tz, w.tz);
    assert.equal(win.configured, true);
  });

  /* 3. storage names ---------------------------------------------------- */

  check("storage: the add-ons' names equal the core chunk's skey on /s/nour, /s/nour/, /s/nour/serum, /serum and /s/x", () => {
    for (const path of ["/s/nour", "/s/nour/", "/s/nour/serum", "/serum", "/s/x"]) {
      const win = { location: { pathname: path } } as unknown as W;
      for (const key of ["order", "idem:pk-1", "utm"]) assert.equal(storageKey(path, key), skey(win, key), `${path} ${key}`);
    }
    assert.equal(storePrefix("/s/nour/serum"), "lp:nour:");
    assert.equal(storePrefix("/s/x"), "", "too short a handle: no prefix");
    assert.equal(storePrefix("/serum"), "");
  });

  check("assist-ty checks lp-order with order-store.ts's id pattern", () => {
    const src = readFileSync(join(ROOT, "src", "landing", "runtime", "addons", "assist-ty.ts"), "utf8");
    const m = /const ORDER_ID = \/(.+)\/;/.exec(src);
    assert.equal(m?.[1], ORDER_ID_RE.source);
  });

  /* 4. the import graph -------------------------------------------------- */

  check("no add-on reaches src/lib/orders/address.ts (static import graph of every src/landing/runtime/addons/*.ts)", () => {
    const dir = join(ROOT, "src", "landing", "runtime", "addons");
    const banned = join(ROOT, "src", "lib", "orders", "address.ts");
    const entries = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    assert.ok(entries.includes("assist.ts") && entries.includes("assist-ty.ts") && entries.includes("track.ts"));
    for (const f of entries) {
      const graph = importGraph(join(dir, f));
      assert.ok(!graph.has(banned), `${f} reaches address.ts`);
      if (f === "assist.ts") assert.ok([...graph].some((p) => p.endsWith(join("delivery", "line.ts"))), "the walk follows the imports");
      if (verbose) console.log(`       ${f}: ${[...graph].map((p) => relative(ROOT, p)).join(", ")}`);
    }
  });

  /* 5. the {when} parity -------------------------------------------------- */

  const expectText = (d: FakeDoc) => d.querySelector('[data-lp-ty="expect"]')!.textContent;
  for (const l of ["fr", "ar", "en"] as const) {
    check(`{when} (${l}): assist-ty's words equal callWhen / nextCallableAt over the server's window on every window fixture`, () => {
      for (const fx of WINDOW_FIXTURES) {
        const at = new Date(fx.at);
        // the fixture as it is (a fresh store: configured false): nothing baked, no {when}
        // (P4's full fixture set also has saved windows: each one is read here as its unsaved twin)
        const fresh = data<AssistTyData>(addonsFor(inputOf({ page: "thanks", doc: docOf({ locale: l }), window: { ...fx.window, configured: false }, now: at })), "lp-assist-ty")!;
        assert.equal(fresh.expect!.win, undefined, `${fx.name}: an unsaved window is never baked`);
        assert.equal(fresh.expect!.s.line, undefined);
        const r0 = runChunk(assistTyJs, thanksDoc(fresh, cfgOf({ locale: l })), { path: "/s/nour/merci", now: at });
        assert.equal(expectText(r0.doc), fill(TY[l].expectPlain, { phone: "06 61 23 45 67" }), `${fx.name}: no {when}`);
        // the same hours saved by the owner
        const w: EffectiveWindow = { ...fx.window, configured: true };
        const saved = data<AssistTyData>(addonsFor(inputOf({ page: "thanks", doc: docOf({ locale: l }), window: w, now: at, withinHours: 3 })), "lp-assist-ty")!;
        if (windowIsEmpty(w, at)) {
          // a window with no range in the next 14 days is never baked, saved or not (LAN-§8.2): the sentence without {when}
          assert.equal(saved.expect!.win, undefined, `${fx.name}: an empty window is never baked`);
          continue;
        }
        assert.ok(saved.expect!.win, `${fx.name}: baked once saved`);
        const words = { within: saved.expect!.s.within!, laterToday: TY[l].whenToday, tomorrow: TY[l].whenTomorrow, nextDay: TY[l].whenDay };
        const when = callWhen(at, w, words, l);
        assert.ok(when, `${fx.name}: a {when}`);
        const next = nextCallableAt(at, w);
        assert.equal(isCallable(next, w).open, true, `${fx.name}: the queue calls at the promised time`);
        assert.ok(next.getTime() === at.getTime() ? when === words.within : when!.includes(wallTime(next, w.tz)), `${fx.name}: ${when} names nextCallableAt`);
        assert.equal(next.toISOString(), fx.expect.nextCallableAt, `${fx.name}: the fixture's own answer`);
        const r = runChunk(assistTyJs, thanksDoc(saved, cfgOf({ locale: l })), { path: "/s/nour/merci", now: at });
        // the page bakes the window without an "Open calls now" (LAN-§8.2 rev 4: it never lives in static HTML), so the
        // chunk's words are callWhen over the baked window (P4's full fixture set has one such case; P3 wave 1 merge)
        const shown = w.openOverrideUntil ? callWhen(at, { ...w, openOverrideUntil: null }, words, l) : when;
        assert.equal(expectText(r.doc), shown ? fill(TY[l].expect, { phone: "06 61 23 45 67", when: shown }) : fill(TY[l].expectPlain, { phone: "06 61 23 45 67" }), fx.name);
        assert.equal(r.doc.querySelector('[data-lp-ty="expect-save"]')!.textContent, TY[l].expectSave);
      }
    });
  }

  check("{when}: a window closed for 14 days is never baked; a promise more than 7 days away says no time", () => {
    const closed14 = Array.from({ length: 15 }, (_, i) => new Date(NOW.getTime() + i * 86_400_000).toISOString().slice(0, 10));
    const shut: EffectiveWindow = { ...SAVED, closedDates: closed14 };
    assert.equal(data<AssistTyData>(addonsFor(inputOf({ page: "thanks", window: shut })), "lp-assist-ty")!.expect!.win, undefined);
    const words = { within: "w", laterToday: "t {time}", tomorrow: "m {time}", nextDay: "{day} {time}" };
    const week: EffectiveWindow = { ...SAVED, closedDates: closed14.slice(0, 9) };
    assert.equal(callWhen(NOW, week, words, "fr"), null, "opens in 9 days: the sentence without {when}");
    assert.equal(callWhen(NOW, null, words, "fr"), null);
    assert.equal(callWhen(new Date("2026-11-03T20:30:00.000Z"), SAVED, words, "fr"), "m 09:30", "Tuesday 21:30 → tomorrow 09:30");
    assert.equal(callWhen(new Date("2026-11-03T05:00:00.000Z"), SAVED, words, "fr"), "t 09:30", "Tuesday 06:00 → later today");
    assert.equal(callWhen(NOW, { ...SAVED, closedDates: closed14.slice(1, 3) }, words, "fr"), "w", "open now");
    assert.match(callWhen(new Date("2026-11-03T20:30:00.000Z"), { ...SAVED, closedDates: ["2026-11-04"] }, words, "fr")!, /^jeudi 09:30$/, "another day: its weekday name");
  });

  /* 6. the confirm text ---------------------------------------------------- */

  const order = (o: Partial<OrderRow> = {}): OrderRow =>
    ({
      id: "CMD-7K3Q9X",
      name: "Salma Benali",
      total: 299,
      currency: "MAD",
      phone: "+212612345678",
      address: "12 rue des Roses",
      items: { v: 2, bundleId: "duo", bundleLabel: "Pack Duo (x2)", qty: 2, unitPrice: 125, variants: [], gift: { label: "Pochette offerte" }, bump: { title: "Sérum éclat", price: 49 } },
      ...o,
    }) as unknown as OrderRow;
  const record = (o: Record<string, unknown> = {}) =>
    JSON.stringify({ orderId: "CMD-7K3Q9X", name: "Salma Benali", total: 299, currency: "MAD", bundleLabel: "Pack Duo", items: "Pack Duo + Sérum éclat", qty: 3, eventId: "e1", ts: NOW.getTime() - 2_000, pageKey: "pk-serum", ...o });
  const store = { handle: "nour", confirmation: {} } as unknown as Parameters<typeof waConfirmText>[0];
  const pillText = (r: Run) => {
    const href = r.doc.querySelector('[data-lp-ty="confirm"]')!.href;
    assert.match(href, /^https:\/\/wa\.me\/212661234567\?text=/);
    return decodeURIComponent(href.slice(href.indexOf("?text=") + 6));
  };

  for (const l of ["fr", "ar", "en"] as const) {
    check(`confirm (${l}): the pill's text equals waConfirmText for the same order, nothing beyond the four variables`, () => {
      const d = data<AssistTyData>(addonsFor(inputOf({ page: "thanks", doc: docOf({ locale: l }) })), "lp-assist-ty")!;
      const storage = new Map([["lp:nour:order", record()]]);
      const r = runChunk(assistTyJs, thanksDoc(d, cfgOf({ locale: l })), { path: "/s/nour/serum/merci", search: "?o=CMD-7K3Q9X", now: NOW, storage });
      const text = pillText(r);
      assert.equal(text, waConfirmText(store, order(), l));
      assert.ok(text.includes("CMD-7K3Q9X") && text.includes("Pack Duo + Sérum éclat"), text);
      assert.equal(r.doc.querySelector('[data-lp-ty="confirm"]')!.hidden, false);
      for (const leak of ["Benali", "Pochette", "612345678", "Roses", "{"]) assert.ok(!text.includes(leak), `${leak} in ${text}`);
      assert.equal(text, fillTemplate(DEFAULT_TEMPLATES.customer_confirm[l], { order_id: "CMD-7K3Q9X", offer: "Pack Duo + Sérum éclat", total: formatMoney(299, "MAD", l), name: "Salma" }), "the four variables, nothing else");
    });
  }

  check("confirm: a record of another order is ignored (no pill), a long offer is cut at a word to 600 characters", () => {
    const d = data<AssistTyData>(addonsFor(inputOf({ page: "thanks" })), "lp-assist-ty")!;
    const other = runChunk(assistTyJs, thanksDoc(d, cfgOf()), { path: "/s/nour/merci", search: "?o=CMD-AAAA11", now: NOW, storage: new Map([["lp:nour:order", record()]]) });
    assert.equal(other.doc.querySelector('[data-lp-ty="confirm"]')!.hidden, true, "not this order's record");
    assert.equal(other.doc.querySelector('[data-lp-ty="track"]')!.href, "/s/nour/track?o=CMD-AAAA11", "the link still names the order of ?o=");
    const long = "Pack " + "très beau coffret ".repeat(50);
    const r = runChunk(assistTyJs, thanksDoc(d, cfgOf()), { path: "/s/nour/merci", search: "?o=CMD-7K3Q9X", now: NOW, storage: new Map([["lp:nour:order", record({ items: long.slice(0, 240) })]]) });
    const text = pillText(r);
    assert.ok(text.length <= CONFIRM_TEXT_MAX, `${text.length}`);
    const longer = cutAtWord(`x ${"mot ".repeat(200)}`, CONFIRM_TEXT_MAX);
    assert.ok(longer.length <= CONFIRM_TEXT_MAX && longer.endsWith("mot"), longer.slice(-10));
    const broken = runChunk(assistTyJs, thanksDoc(d, cfgOf()), { path: "/s/nour/merci", search: "?o=CMD-7K3Q9X", now: NOW, storage: new Map([["lp:nour:order", "{not json"]]) });
    assert.equal(broken.warnings.length, 0, "a broken record is no record, never an error");
    assert.equal(broken.doc.querySelector('[data-lp-ty="track"]')!.hidden, false);
  });

  /* 7. the beacon and the tracking link -------------------------------------- */

  check("intent beacon: one keepalive POST per click with the idem, referrerPolicy same-origin; the track link carries the proof", () => {
    const d = data<AssistTyData>(addonsFor(inputOf({ page: "thanks" })), "lp-assist-ty")!;
    const idem = "0f8fad5b-d9cb-469f-a165-70867728950e";
    const storage = new Map([
      ["lp:nour:order", record()],
      ["lp:nour:idem:pk-serum", `${idem}.${NOW.getTime() - 9_000}`],
    ]);
    const r = runChunk(assistTyJs, thanksDoc(d, cfgOf()), { path: "/s/nour/serum/merci", search: "?o=CMD-7K3Q9X", now: NOW, storage });
    const pill = r.doc.querySelector('[data-lp-ty="confirm"]')!;
    pill.dispatchEvent(new FakeEvent("click"));
    assert.equal(r.fetches.length, 1);
    const f = r.fetches[0]!;
    assert.equal(f.url, "/api/public/track");
    assert.equal(f.init.method, "POST");
    assert.equal(f.init.keepalive, true);
    assert.equal(f.init.referrerPolicy, "same-origin");
    assert.deepEqual(JSON.parse(String(f.init.body)), { op: "intent", o: "CMD-7K3Q9X", k: idem, kind: "confirm_whatsapp" });
    assert.equal(r.doc.querySelector('[data-lp-ty="track"]')!.href, `/s/nour/track?o=CMD-7K3Q9X#k=${idem}`);
    // an idem older than the record by more than 10 minutes belongs to another attempt
    const stale = runChunk(assistTyJs, thanksDoc(d, cfgOf()), {
      path: "/s/nour/serum/merci",
      search: "?o=CMD-7K3Q9X",
      now: NOW,
      storage: new Map([
        ["lp:nour:order", record()],
        ["lp:nour:idem:pk-serum", `${idem}.${NOW.getTime() - 900_000}`],
      ]),
    });
    stale.doc.querySelector('[data-lp-ty="confirm"]')!.dispatchEvent(new FakeEvent("click"));
    assert.equal(stale.fetches.length, 0, "no idem, no beacon");
    assert.equal(stale.doc.querySelector('[data-lp-ty="track"]')!.href, "/s/nour/track?o=CMD-7K3Q9X");
  });

  check("preview: the sample order CMD-PREVIEW, its first offer, no beacon", () => {
    const d = data<AssistTyData>(addonsFor(inputOf({ page: "thanks", mode: "preview" })), "lp-assist-ty")!;
    const r = runChunk(assistTyJs, thanksDoc(d, cfgOf({ mode: "preview" })), { path: "/app/nour/preview/p1", now: NOW, storage: new Map([["lp-order", record()]]) });
    const text = pillText(r);
    assert.equal(text, fillTemplate(DEFAULT_TEMPLATES.customer_confirm.fr, { order_id: "CMD-PREVIEW", offer: "Pack Duo", total: fmtCents(29_900, MONEY_FR), name: "" }));
    r.doc.querySelector('[data-lp-ty="confirm"]')!.dispatchEvent(new FakeEvent("click"));
    assert.equal(r.fetches.length, 0);
    assert.equal(r.doc.querySelector('[data-lp-ty="track"]')!.href, "/s/nour/track?o=CMD-PREVIEW");
  });

  check("every fetch of track, assist-ty and assist (the WhatsApp intent, LP-11) passes referrerPolicy same-origin", () => {
    for (const name of ["track", "assist-ty", "assist"]) {
      const src = readFileSync(join(ROOT, "src", "landing", "runtime", "addons", `${name}.ts`), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      const calls = src.split(/\bfetch\(/).length - 1;
      assert.ok(calls > 0, `${name}: a fetch`);
      assert.equal(src.split('referrerPolicy: "same-origin"').length - 1, calls, `${name}: ${calls} fetch call(s)`);
    }
    for (const [name, js] of [["track", trackJs], ["assist-ty", assistTyJs], ["assist", assistJs]] as const)
      assert.equal(js.split("fetch(").length - 1, js.split('referrerPolicy:"same-origin"').length - 1, `${name} bundle`);
    assert.equal(assistJs.split("fetch(").length - 1, 1, "assist's one network call is the WhatsApp intent");
  });

  /* 8. the assist line over the DOM ------------------------------------------- */

  const landingDoc = (o: { textCity?: boolean; block?: AssistData; checked?: "duo" | "trio" } = {}) => {
    const doc = new FakeDoc();
    json(doc, "lp-config", { ...cfgOf(), page: "landing" });
    if (o.block) json(doc, "lp-assist", o.block);
    const form = doc.add("form", { "data-lp-form": "", id: "order-form" });
    const packs = form.add("fieldset", { "data-lp-bundles": "" });
    for (const id of ["duo", "trio"]) packs.add("input", { type: "radio", name: "bundle", value: id }).checked = id === (o.checked ?? "duo");
    form.add("p", { class: "lp-dz", "data-lp-dz": "offer", "aria-live": "polite" });
    if (o.textCity) form.add("input", { name: "city" });
    else {
      const sel = form.add("select", { name: "city" });
      sel.add("option", { value: "" }, "Votre ville");
      for (const c of MA_CITIES) sel.add("option", { value: c.value }, c.fr);
    }
    form.add("p", { class: "lp-dz", "data-lp-dz": "city", hidden: "" });
    form.add("div", { class: "lp-of__go" }).add("button", { type: "submit", "data-lp-submit": "" }, "Commander");
    return { doc, form };
  };
  const pick = (form: FakeEl, value: string) => {
    const sel = form.querySelector('select[name="city"]')!;
    sel.value = value;
    sel.selectedIndex = sel.options.findIndex((op) => op.getAttribute("value") === value);
    sel.dispatchEvent(new FakeEvent("change", { bubbles: true }));
  };
  const expected = (city: string | null, fee: { free: true } | { free: false; text: string }, o: { textMode?: boolean } = {}) => {
    const c = city ? MA_CITIES.find((x) => x.value === city)! : null;
    return lineText(
      composeLine({
        table: TABLE,
        city: c ? { value: c.value, label: c.fr, other: c.value === OTHER_CITY.value } : null,
        textMode: o.textMode,
        locale: "fr",
        dateLocale: MONEY_FR.locale,
        now: NOW,
        confirmationCall: true,
        fee,
        whatsapp: "212661000000",
      }),
    );
  };

  check("assist: the general line, a dated city, a free offer, Autre (the * zone): the composer's words at the shopper's now", () => {
    const block = data<AssistData>(addonsFor(inputOf({})), "lp-assist")!;
    const { doc, form } = landingDoc({ block });
    const r = runChunk(assistJs, doc, { path: "/s/nour/serum", now: NOW });
    assert.deepEqual(r.warnings, []);
    const offer = doc.querySelector('[data-lp-dz="offer"]')!;
    const city = doc.querySelector('[data-lp-dz="city"]')!;
    const fee = { free: false as const, text: fmtCents(3500, MONEY_FR) };
    assert.equal(offer.textContent, expected(null, fee));
    assert.ok(offer.textContent.startsWith("Livraison en 2 à 6 jours ouvrés selon la ville"), offer.textContent);
    pick(form, "Casablanca");
    assert.equal(offer.textContent, expected("Casablanca", fee));
    assert.match(offer.textContent, /^Livraison à Casablanca : .+, après confirmation par téléphone \(estimation\) · /);
    assert.equal(city.hidden, true);
    const trio = form.querySelector('input[value="trio"]')!;
    form.querySelector('input[value="duo"]')!.checked = false;
    trio.checked = true;
    trio.dispatchEvent(new FakeEvent("change", { bubbles: true }));
    assert.equal(offer.textContent, expected("Casablanca", { free: true }));
    assert.ok(offer.textContent.endsWith("· livraison gratuite"), offer.textContent);
    pick(form, "Autre");
    assert.equal(offer.textContent, expected("Autre", { free: true }));
    assert.ok(offer.textContent.startsWith("Livraison entre") || offer.textContent.startsWith("Livraison le") || offer.textContent.startsWith("Livraison en"), offer.textContent);
    pick(form, "Fès");
    assert.equal(offer.textContent, "Livraison à Fès · livraison gratuite", "a zone without days: no date");
    assert.equal(offer.querySelector("bdi")?.className, "lp-dz__fee");
  });

  check("assist: a not-served city hides the line, offers WhatsApp, flags the form and blocks the submit", () => {
    const block = data<AssistData>(addonsFor(inputOf({})), "lp-assist")!;
    const { doc, form } = landingDoc({ block });
    let submitted = 0;
    form.addEventListener("submit", () => void submitted++);
    runChunk(assistJs, doc, { path: "/s/nour/serum", now: NOW });
    pick(form, "Tanger");
    const offer = doc.querySelector('[data-lp-dz="offer"]')!;
    const city = doc.querySelector('[data-lp-dz="city"]')!;
    assert.equal(offer.hidden, true);
    assert.equal(city.hidden, false);
    assert.ok(city.textContent.startsWith("Nous ne livrons pas encore à Tanger."), city.textContent);
    const link = city.querySelector("a")!;
    assert.equal(link.href, `https://wa.me/212661000000?text=${encodeURIComponent("Bonjour, livrez-vous à Tanger ?")}`);
    assert.equal(link.target, "_blank");
    assert.equal(link.textContent, DZ.fr.notServedCta);
    assert.equal(form.getAttribute("data-lp-dz-state"), "ns");
    const ev = new FakeEvent("submit", { bubbles: true });
    form.dispatchEvent(ev);
    assert.equal(ev.defaultPrevented, true);
    assert.equal(submitted, 0, "the form's own submit never runs");
    pick(form, "Casablanca");
    assert.equal(form.hasAttribute("data-lp-dz-state"), false);
    assert.equal(city.hidden, true);
    form.dispatchEvent(new FakeEvent("submit", { bubbles: true }));
    assert.equal(submitted, 1);
    // no WhatsApp number: the line informs, the submit stays
    const plain = landingDoc({ block: data<AssistData>(addonsFor(inputOf({ whatsapp: "" })), "lp-assist")! });
    runChunk(assistJs, plain.doc, { path: "/s/nour/serum", now: NOW });
    pick(plain.form, "Tanger");
    assert.equal(plain.form.hasAttribute("data-lp-dz-state"), false);
    assert.equal(plain.doc.querySelector('[data-lp-dz="city"]')!.querySelector("a"), null);
  });

  check("assist: a text city field shows the general line only; lp:order writes the idem under the store prefix", () => {
    const block = data<AssistData>(addonsFor(inputOf({})), "lp-assist")!;
    const { doc } = landingDoc({ block, textCity: true });
    const r = runChunk(assistJs, doc, { path: "/s/nour/serum", now: NOW });
    assert.equal(doc.querySelector('[data-lp-dz="offer"]')!.textContent, expected(null, { free: false, text: fmtCents(3500, MONEY_FR) }, { textMode: true }));
    const idem = "0f8fad5b-d9cb-469f-a165-70867728950e";
    doc.dispatchEvent(new FakeEvent("lp:order", { detail: { idem, total: 29_900 } }));
    assert.equal(r.storage.get("lp:nour:idem:pk-1") ?? r.storage.get("lp:nour:idem:pk-serum"), `${idem}.${NOW.getTime()}`);
    doc.dispatchEvent(new FakeEvent("lp:order", { detail: { idem: "<b>" } }));
    assert.equal([...r.storage.values()].filter((v) => v.startsWith("<")).length, 0, "only a uuid is kept");
    // the idem alone (no line): a block with only k
    const bare = landingDoc({ block: { v: 1, k: 1 } });
    const rb = runChunk(assistJs, bare.doc, { path: "/s/nour", now: NOW });
    bare.doc.dispatchEvent(new FakeEvent("lp:order", { detail: { idem } }));
    assert.equal(rb.storage.size, 1);
    assert.equal(bare.doc.querySelector('[data-lp-dz="offer"]')!.textContent, "", "no line without zones");
  });

  check("assist: no IntersectionObserver, no write on <html>, text through textContent only", () => {
    for (const [name, js] of [["assist", assistJs], ["assist-ty", assistTyJs]] as const) {
      assert.ok(!js.includes("IntersectionObserver"), name);
      assert.ok(!js.includes("documentElement"), `${name}: no attribute on <html>`);
      assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(js), `${name}: textContent only`);
      assert.ok(js.includes('console.warn("[lp+]"'), `${name}: the try … catch of LAN-§5.1`);
    }
  });

  /* 8b. Order on WhatsApp (LP-11): the plan, the serialiser, the upgraded link ------------------------------ */

  /** a page whose form shows the WhatsApp link from the store's number (no `form.whatsapp` block) */
  const waDoc = () => {
    const d = docOf();
    delete (d.form as { whatsapp?: unknown }).whatsapp;
    return d;
  };
  check("wa order: `wo` only with the setting and a number; the API on live, the note in the preview, nothing in test or exports", () => {
    const wo = (o: Parameters<typeof inputOf>[0]) => data<AssistData>(addonsFor(inputOf({ doc: waDoc(), ...o })), "lp-assist")?.wo;
    assert.deepEqual(wo({ waOrder: true }), { e: "/api/public/wa", r: WA.fr.ready });
    assert.deepEqual(wo({ waOrder: true, mode: "preview" }), { n: WA.fr.liveOnly });
    for (const mode of ["test", "export-static", "export-connected", "export-php", "export-whatsapp"] as const) assert.equal(wo({ waOrder: true, mode }), undefined, mode);
    assert.equal(wo({ waOrder: false }), undefined, "setting off");
    assert.equal(wo({ waOrder: true, whatsapp: "" }), undefined, "no number");
    assert.equal(wo({ waOrder: true, doc: docOf() }), undefined, "the form's own WhatsApp link turned off");
    // the setting off changes no byte: the same add-ons as before LP-11
    assert.deepEqual(addonsFor(inputOf({})), addonsFor(inputOf({ waOrder: false })));
    assert.deepEqual(addonsFor(inputOf({ ...OFF, waOrder: false })).body, [], "every add-on off: no assist");
    assert.deepEqual(addonsFor(inputOf({ ...OFF, waOrder: true, doc: waDoc() })).body, ["assist"], "the WhatsApp order alone brings assist");
  });

  const SEL_CFG = {
    defaultBundleId: "duo",
    bundles: [
      { id: "duo", units: [{ line: 0, item: "cream" }, { line: 0, item: "cream" }] },
      { id: "mix", units: [{ line: 0, choices: ["cream", "serum"] }, { line: 1, item: "serum" }] },
    ],
  } as unknown as Parameters<typeof serialiseSelection>[1];
  const selForm = (build: (form: FakeEl) => void) => {
    const doc = new FakeDoc();
    const form = doc.add("form", { "data-lp-form": "" });
    build(form);
    return form as unknown as HTMLFormElement;
  };
  const radio = (form: FakeEl, name: string, value: string, on: boolean) => (form.add("input", { type: "radio", name, value }).checked = on);

  check("wa order: the serialiser reads offers, units, matrix dims, shared groups, extras, the bump and the city", () => {
    const form = selForm((f) => {
      radio(f, "bundle", "duo", false);
      radio(f, "bundle", "mix", true);
      f.add("input", { name: "name", value: "Salma Idrissi" });
      f.add("input", { name: "phone", type: "tel", value: "0612345678" });
      f.add("textarea", { name: "address", value: "12 rue des Roses" });
      f.add("input", { name: "city", value: "casablanca" });
      radio(f, "u.0.@item", "cream", false);
      radio(f, "u.0.@item", "serum", true);
      radio(f, "u.0.color", "red", false);
      radio(f, "u.0.color", "blue", true);
      f.add("input", { name: "u.1.mx.size", type: "hidden", value: "M" });
      f.add("input", { name: "u.1.mx.color", type: "hidden", value: "black" });
      f.add("input", { name: "u.1.engrave", type: "text", value: "Salma" });
      f.add("input", { name: "s.serum.scent", type: "hidden", value: "rose" });
      f.add("select", { name: "x.wrap", value: "gift" });
      f.add("input", { type: "checkbox", name: "bump", value: "1" }).checked = true;
      f.add("input", { name: "b.size", type: "hidden", value: "S" });
      f.add("input", { name: "u.7.color", value: "x", disabled: "" });
      f.add("input", { name: "u.99.color", value: "x" });
      f.add("input", { name: "z.color", value: "x" });
      f.add("input", { name: "website", value: "" });
    });
    const out = serialiseSelection(form, SEL_CFG);
    assert.deepEqual(out, {
      units: [
        { item: "serum", o: { color: "blue", scent: "rose" }, f: {} },
        { o: { mx: "size=M|color=black", scent: "rose" }, f: { engrave: "Salma" } },
      ],
      extras: { wrap: "gift" },
      bundleId: "mix",
      city: "casablanca",
      bump: true,
      b: { o: { size: "S" }, f: {} },
    });
    const text = JSON.stringify(out);
    for (const secret of ["Salma Idrissi", "0612345678", "Roses"]) assert.ok(!text.includes(secret), `never reads ${secret}`);
  });

  check("wa order: the serialiser is bounded like UnitIn and drops an unticked bump's options", () => {
    const form = selForm((f) => {
      for (let k = 0; k < 25; k++) f.add("input", { name: `u.${k}.color`, type: "hidden", value: "red" });
      for (let g = 0; g < 12; g++) f.add("input", { name: `u.0.g${g}x`, type: "hidden", value: "v" });
      for (let g = 0; g < 6; g++) f.add("input", { name: `u.0.t${g}x`, type: "text", value: "t" });
      f.add("input", { type: "checkbox", name: "bump", value: "1" });
      f.add("input", { name: "b.size", type: "hidden", value: "S" });
    });
    const out = serialiseSelection(form, SEL_CFG);
    assert.equal(out.bundleId, "duo", "no offer checked: the default");
    assert.equal(out.units.length, 20);
    assert.equal(Object.keys(out.units[0]!.o).length, 8);
    assert.equal(Object.keys(out.units[0]!.f).length, 4);
    assert.ok(!("b" in out) && !out.bump, "no bump");
  });

  const waLanding = (block: AssistData) => {
    const { doc, form } = landingDoc({ block });
    const alt = form.add("div", { class: "lp-of__alt" });
    const link = alt.add("a", { class: "lp-of__wa", target: "_blank" });
    link.href = "https://wa.me/212661000000?text=Bonjour";
    form.add("input", { name: "name", value: "Salma" });
    form.add("input", { name: "phone", type: "tel", value: "0612345678" });
    form.add("input", { name: "u.0.color", type: "hidden", value: "red" });
    return { doc, form, link };
  };
  const flush = () => new Promise<void>((done) => setImmediate(done));
  const click = (link: FakeEl) => {
    const e = new FakeEvent("click", { bubbles: true });
    link.dispatchEvent(e);
    return e;
  };
  const waBlock = data<AssistData>(addonsFor(inputOf({ ...OFF, waOrder: true, doc: waDoc() })), "lp-assist")!;
  const reply = { ok: true, ref: "WA-7K3Q9X", number: "212661000000", text: "Pack Duo 299 DH\nWA-7K3Q9X" };

  const waOk = waLanding(waBlock);
  const runOk = runChunk(assistJs, waOk.doc, { path: "/s/nour/serum", now: NOW, reply });
  const firstClick = click(waOk.link);
  await flush();
  await flush();
  const second = click(waOk.link);
  await flush();
  const waErr = waLanding(waBlock);
  const runErr = runChunk(assistJs, waErr.doc, { path: "/serum", now: NOW, reply: { ok: false, error: "unavailable" } });
  click(waErr.link);
  await flush();
  await flush();
  const waSlow = waLanding(waBlock);
  const runSlow = runChunk(assistJs, waSlow.doc, { path: "/serum", now: NOW, reply: "hang" });
  click(waSlow.link);
  const waIab = waLanding(waBlock);
  const runIab = runChunk(assistJs, waIab.doc, { path: "/serum", now: NOW, reply, ua: "Mozilla/5.0 (iPhone) Instagram 300.0" });
  click(waIab.link);
  await flush();
  await flush();

  check("wa order: a click posts the choice (no name, no phone), opens wa.me with the server's text and shows the ref", () => {
    assert.deepEqual(runOk.warnings, []);
    assert.equal(waOk.link.getAttribute("data-lp-wa-order"), "");
    assert.ok(firstClick.defaultPrevented, "the plain link is held");
    assert.equal(runOk.fetches.length, 1, "one intent");
    const f = runOk.fetches[0]!;
    assert.equal(f.url, "/api/public/wa");
    const body = JSON.parse(String(f.init.body)) as Record<string, unknown>;
    assert.equal(body.pageKey, "pk-serum");
    assert.ok(!JSON.stringify(body).includes("Salma") && !JSON.stringify(body).includes("0612345678"), JSON.stringify(body));
    assert.deepEqual(body.units, [{ o: { color: "red" }, f: {} }]);
    assert.ok(!/price|total|"st"/.test(String(f.init.body)), "no price in the body");
    assert.equal(runOk.opened.length, 2, "a tab per tap");
    assert.equal(runOk.opened[0]!.location.href, `https://wa.me/212661000000?text=${encodeURIComponent(reply.text)}`);
    assert.equal(runOk.timers[0]?.ms, 4000, "the 4 s timeout");
    const note = waOk.doc.querySelector(".lp-of__wa-note")!;
    assert.equal(note.textContent, fill(WA.fr.ready, { ref: "WA-7K3Q9X" }));
    assert.equal(note.querySelector("bdi")?.dir, "ltr");
  });

  check("wa order: a second tap within 30 s reopens the same message without a new intent", () => {
    assert.ok(second.defaultPrevented);
    assert.equal(runOk.fetches.length, 1);
    assert.equal(runOk.opened[1]!.location.href, runOk.opened[0]!.location.href);
  });

  check("wa order: an error opens the plain link; a 4 s timeout too; in-app browsers navigate the same tab", () => {
    assert.equal(runErr.opened[0]!.location.href, "https://wa.me/212661000000?text=Bonjour", "error → plain link");
    assert.equal(waErr.doc.querySelector(".lp-of__wa-note"), null, "no ready line");
    assert.equal(runSlow.opened[0]!.location.href, "", "still waiting");
    runSlow.timers.find((t) => t.ms === 4000)!.fn();
    assert.equal(runSlow.opened[0]!.location.href, "https://wa.me/212661000000?text=Bonjour", "timeout → plain link");
    assert.equal(runIab.opened.length, 0, "no new tab inside Instagram");
    assert.equal(runIab.location.href, `https://wa.me/212661000000?text=${encodeURIComponent(reply.text)}`);
  });

  check("wa order: the preview shows the note and leaves the link alone; no `wo`, no change", () => {
    const pv = waLanding(data<AssistData>(addonsFor(inputOf({ ...OFF, waOrder: true, mode: "preview", doc: waDoc() })), "lp-assist")!);
    runChunk(assistJs, pv.doc, { path: "/preview/x", now: NOW });
    assert.equal(pv.doc.querySelector(".lp-of__wa-note")?.textContent, WA.fr.liveOnly);
    assert.ok(click(pv.link).defaultPrevented === false && !pv.link.hasAttribute("data-lp-wa-order"));
    const plain = waLanding(data<AssistData>(addonsFor(inputOf({})), "lp-assist")!);
    const r = runChunk(assistJs, plain.doc, { path: "/serum", now: NOW });
    assert.ok(click(plain.link).defaultPrevented === false && r.fetches.length === 0 && !plain.link.hasAttribute("data-lp-wa-order"));
  });

  /* 9. sizes, copy, grammar ------------------------------------------------ */

  check("the chunks' gzip sizes stay inside budgets.json (+5 %, render-check's rule; assist-ty: CCR r1-p3-9's budget; assist: CCR r1-p3-14's)", () => {
    const budgets = JSON.parse(readFileSync(join(ROOT, "src", "landing", "runtime", "budgets.json"), "utf8")) as Record<string, number>;
    // operations' nextCallableAt alone gzips to ≈ 1,040 B, so `assist-ty` cannot meet the 1,500 B the spec estimated
    // (≈ 300 B for it): CCR r1-p3-9 records 3,600 B; this check holds the chunk to the larger of the two until it lands
    const want: Record<string, number> = { ...budgets, "assist-ty": Math.max(budgets["assist-ty"] ?? 0, ASSIST_TY_BUDGET), assist: Math.max(budgets.assist ?? 0, ASSIST_BUDGET) };
    const sizes = { assist: gz(assistJs), "assist-ty": gz(assistTyJs), track: gz(trackJs) };
    console.log(`  chunks: ${Object.entries(sizes).map(([k, v]) => `${k} ${v}/${want[k]} B gz`).join(" · ")}`);
    for (const [k, v] of Object.entries(sizes)) assert.ok(v <= want[k]! * 1.05, `${k} ${v} B gz over ${want[k]} + 5%`);
  });

  check("shopper copy: every key in ar, fr and en, the same {vars} in each language, no em or en dash", () => {
    const groups: Record<string, Record<string, unknown>> = { DZ, TY, WA, LP, TRK, ...Object.fromEntries(LANDING_TEMPLATE_KINDS.map((k) => [`tpl.${k}`, DEFAULT_TEMPLATES[k]])) };
    const flat = (v: unknown, at = ""): [string, string][] =>
      typeof v === "string" ? [[at, v]] : v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => flat(x, at ? `${at}.${k}` : k)) : [];
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    for (const [g, byLocale] of Object.entries(groups)) {
      const fr = new Map(flat(byLocale.fr));
      for (const l of ["ar", "en"]) {
        const other = new Map(flat(byLocale[l]));
        // plural forms: a form may leave the number out ("خلال يومين", the dual; "dans l'heure")
        const plural = (k: string) => /^whenWithin\./.test(k) || /\.\d$/.test(k);
        assert.deepEqual([...other.keys()].filter((k) => !plural(k)).sort(), [...fr.keys()].filter((k) => !plural(k)).sort(), `${g}: ${l} keys`);
        for (const [k, s] of other) if (!plural(k) && fr.has(k)) assert.equal(vars(s), vars(fr.get(k)!), `${g}.${k}: ${l} {vars}`);
      }
      for (const l of ["ar", "fr", "en"]) for (const [k, s] of flat(byLocale[l])) assert.ok(!/[–—]/.test(s), `${g}.${l}.${k} has a dash: ${s}`);
    }
    for (const kind of LANDING_TEMPLATE_KINDS)
      for (const l of ["ar", "fr", "en"] as const) for (const v of vars(DEFAULT_TEMPLATES[kind][l]).split(",").filter(Boolean)) assert.ok(TEMPLATE_KIND_VARS[kind].includes(v), `${kind}.${l}: {${v}}`);
    assert.equal(fill(TY.fr.whenWithin.other, { n: 2 }), "dans les 2 heures");
  });

  check("template grammar: optional blocks, literal braces, a value is never read as template text, unknown kept", () => {
    assert.equal(fillTemplate("Bonjour[[ {name}]], {order_id}", { name: "", order_id: "CMD-1" }), "Bonjour, CMD-1");
    assert.equal(fillTemplate("Bonjour[[ {name}]], {order_id}", { name: "Salma", order_id: "CMD-1" }), "Bonjour Salma, CMD-1");
    assert.equal(fillTemplate("{{order_id}} = {order_id}", { order_id: "CMD-1" }), "{order_id} = CMD-1");
    assert.equal(fillTemplate("{name} {offer}", { name: "{offer}", offer: "Pack" }), "{offer} Pack");
    assert.equal(fillTemplate("{name} {nope}", { name: "x" }), "x {nope}");
    assert.equal(fillTemplate("a[[ {nope}]]b", {}), "ab", "an unknown variable empties its block");
  });

  const ms = Date.now() - t0;
  console.log(`test:landing-addons: ${passed} passed, ${failures} failed (${ms} ms)`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

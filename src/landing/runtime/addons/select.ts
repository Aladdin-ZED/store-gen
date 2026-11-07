/**
 * The selection serialiser of "Order on WhatsApp" (P3 LANDING; landing.md LAN-§11.3, LP-11). Pure over a form element,
 * bundled in the `assist` chunk: it reads the checked offer and every named option control, and never the name, phone
 * or address fields (their names never match `CONTROL_NAME`). The server prices what it sends (`priceWaSelection`).
 *
 *   input[name="bundle"]:checked    → bundleId (else the config's default offer)
 *   u.<k>.@item                     → units[k].item
 *   u.<k>.<gid>                     → units[k].o[gid] (a choice or a cell key), or units[k].f[gid] (a typed field)
 *   u.<k>.<gid>.<dim>               → units[k].o[gid] joined as "dim=value|dim=value" (a linked matrix)
 *   s.<item>.<gid>[.<dim>]          → copied into every unit of that item (the offer's lines, or the unit's picked item)
 *   x.<gid>                         → extras[gid]
 *   b.<gid>[.<dim>]                 → b (the bump item's options, when the bump is ticked)
 *   name="bump" checked             → bump: true
 *   name="city"                     → city (the zone window of the message, `{eta_text}`)
 * Disabled controls (another offer's units, an unticked bump) and unknown or malformed names are dropped. Bounded like
 * `UnitIn`: at most 20 units, 8 options and 4 fields each, 16 extras, values cut to 250 characters. Linked dims are
 * joined in document order (the server's `parseCellKey` takes any order).
 */
import type { LandingRuntimeConfig } from "../config";

/** The control names of the order form (`CONTROL_NAME_RE` of src/lib/orders/contract.ts, an `x.` name never takes a dim). */
export const CONTROL_NAME = /^(?:u\.\d{1,2}\.(?:@item|[\w-]{2,40}(?:\.[\w-]{2,40})?)|s\.[a-z0-9][a-z0-9-]{1,23}\.[\w-]{2,40}(?:\.[\w-]{2,40})?|x\.[\w-]{2,40}|b\.[\w-]{2,40}(?:\.[\w-]{2,40})?)$/;

export interface WaUnit {
  item?: string;
  o: Record<string, string>;
  f: Record<string, string>;
}

export interface WaSelection {
  bundleId?: string;
  bump?: boolean;
  units: WaUnit[];
  extras: Record<string, string>;
  b?: WaUnit;
  city?: string;
}

type Control = HTMLInputElement & HTMLSelectElement;

/** A value into a unit: a typed field into `f` (≤ 4), else into `o` (≤ 8); a matrix dim joins "dim=value|…". */
function add(u: WaUnit, gid: string, v: string, typed: boolean, dim?: string): void {
  const rec = typed ? u.f : u.o;
  if (!(gid in rec) && Object.keys(rec).length >= (typed ? 4 : 8)) return;
  rec[gid] = dim ? (rec[gid] ? rec[gid] + "|" : "") + dim + "=" + v : v;
}

/** The shopper's current choice in `form` (see the header). */
export function serialiseSelection(form: HTMLFormElement, cfg: Pick<LandingRuntimeConfig, "bundles" | "defaultBundleId">): WaSelection {
  const out: WaSelection = { units: [], extras: {} };
  const checked = form.querySelector<HTMLInputElement>('input[name="bundle"]:checked');
  const offer = cfg.bundles.find((o) => o.id === (checked ? checked.value : cfg.defaultBundleId));
  if (offer) out.bundleId = offer.id;
  const unit = (k: number) => (out.units[k] = out.units[k] || { o: {}, f: {} });
  const shared: [string, string, string, boolean, string?][] = [];
  const els = form.elements;
  for (let i = 0; i < els.length; i++) {
    const el = els[i] as Control;
    const name = el.name || "";
    const v = String(el.value || "").slice(0, 250);
    if (el.disabled || (/^(radio|checkbox)$/.test(el.type) && !el.checked)) continue;
    if (name === "bump") out.bump = true;
    else if (name === "city" && v) out.city = v.slice(0, 120);
    else if (v && CONTROL_NAME.test(name)) {
      const typed = /^(text|textarea|search|number|date|email|tel|url)$/.test(el.type);
      const p = name.split(".");
      const k = +p[1]!;
      if (p[0] === "u" && k < 20) {
        if (p[2] === "@item") unit(k).item = v;
        else add(unit(k), p[2]!, v, typed && !p[3], p[3]);
      } else if (p[0] === "s") shared.push([p[1]!, p[2]!, v, typed && !p[3], p[3]]);
      else if (p[0] === "x") {
        if (Object.keys(out.extras).length < 16) out.extras[p[1]!] = v;
      } else if (p[0] === "b") add((out.b = out.b || { o: {}, f: {} }), p[1]!, v, typed && !p[2], p[2]);
    }
  }
  // shared groups: into every unit of that item (a fixed line's item, or the item picked in a choice unit)
  for (const [item, gid, v, typed, dim] of shared)
    (offer ? offer.units : []).forEach((s, k) => {
      if (k < 20 && (s.item || (out.units[k] && out.units[k]!.item)) === item) add(unit(k), gid, v, typed, dim);
    });
  for (let k = 0; k < out.units.length; k++) unit(k);
  if (!out.bump) delete out.b;
  return out;
}

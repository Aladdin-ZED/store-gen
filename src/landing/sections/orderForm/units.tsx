/**
 * Personalization of the order form (docs/OFFERS.md §F.1–F.6) — replaces variants.tsx. One code path
 * for single- and multi-item pages: the units of the selected offer (one per physical piece, `k`
 * 0-based, lines in order), their item chooser (choice lines), the chosen item's option groups
 * (choice · matrix · field) under the line's rules (lock = static chip, allow = subset, preset =
 * initial value), the item's shared groups, the page extras and the bump item's options.
 *
 * Markup contract (§F.6, read by src/landing/runtime/units*.ts):
 *   [data-lp-units][data-fill=inline|rows|steps|box][data-units=<n>]       the container
 *   [data-lp-unit=<k>][data-item][data-line][data-free][data-prefilled]    a unit (rendered for the default offer)
 *     [data-lp-unit-head]                                                  its head (tokens {n} {item} {j} in templates)
 *     [data-lp-item-pick] + input[type=radio][name="u.<k>.@item"]          item chooser (choice units)
 *     [data-lp-item-body=<itemId>]                                         the chosen item's groups for this unit
 *     [data-lp-lock=<ruleKey>]                                             static chip of a locked value
 *   template[data-lp-unit-tpl] · template[data-lp-item-tpl=<itemId>] · template[data-lp-pick-tpl=<offerId>.<line>]
 *   [data-lp-shared=<itemId>]                                              shared groups, names s.<itemId>.<gid>
 *   [data-lp-extra=<gid>][data-scope="all"|"id id"]                        page extras, names x.<gid>
 *   [data-lp-bump-body]                                                    bump item groups, names b.<gid>
 *   [data-lp-steps] > button[data-lp-step=<k>] | [data-lp-slot=<k>], [data-lp-next], [data-lp-prev]
 *   controls u.<k>.<gid> (choice, field, combined matrix: value = cell key) · u.<k>.<gid>.<dimId> (linked matrix)
 *     with data-delta=<cents>, data-sw, data-vimg; every group is [data-field=<key>] + [data-error] + data-msg*
 *   template[data-lp-vimg=<key>]  key = <itemId> · <itemId>:<gid>:<optionId> · <itemId>:<gid>:<cellKey>
 * Additions the runtime may use (documented in the LR report): [data-lp-unit-sum] (collapsed summary),
 * button[data-lp-unit-edit] ("Modifier"), [data-lp-prefill-tag] ("= pièce 1"), [data-lp-count] (field
 * counter), [data-lp-unit-body] (template body slot), template[data-lp-step-tpl] / [data-lp-slot-tpl],
 * container data-h-* head patterns.
 *
 * Templates carry `{k}` (0-based unit) and `{n}` (1-based) tokens in names, ids and texts; the runtime
 * replaces them when it clones. Pure markup; no hooks.
 */
import type { ReactElement, ReactNode } from "react";
import { expandUnits, itemShort, itemVisual, type UnitSlot } from "@/lib/page/catalog";
import { cellKey, dimRules, groupCombos, groupOptions, ruleAllows, ruleLock, rulePreset } from "@/lib/page/options";
import { fromCents, toCents } from "@/lib/page/pricing";
import {
  isChoiceGroup,
  isFieldGroup,
  isMatrixGroup,
  type Choice,
  type ChoiceGroup,
  type ExtraGroup,
  type FieldGroup,
  type Item,
  type LineRule,
  type MatrixGroup,
  type OptionGroup,
  type SectionBg,
} from "@/lib/page/schema";
import { groupMessages, hasUnitGroups, headPatterns, pickMessages, plusMoney, unitHeads, type GroupMessages } from "../../offers/labels";
import type { OfferView } from "../../offers/model";
import { ItemThumb, photoGroupOf } from "../../offers/visual";
import { Picture, cssVars, cx, safeHex } from "../../primitives";
import { boxRatio } from "../../primitives/Picture";
import type { RenderContext, ResolvedAsset } from "../../types";
import { offerWord, optionLabels, uiLabels, unitWord } from "./copy";

type Rules = Readonly<Record<string, LineRule>> | undefined;
/** dot = round color (or round photo) · tile = photo tile · chip = text · select = native dropdown */
type Look = "dot" | "tile" | "chip" | "select";

/** A unit index, or the template token. */
type K = number | "{k}";

/* ------------------------------------------------------------------ */
/* Ids and names                                                       */
/* ------------------------------------------------------------------ */

/** DOM id of a control key ("u.{k}.g-fit" → "lp-f-u-{k}-g-fit"): template tokens survive. */
export const ctlId = (key: string) => `lp-f-${key.replace(/[.@:|=]/g, "-")}`;
const errId = (key: string) => `${ctlId(key)}-err`;

/** Per-unit prefix "u.<k>.", shared "s.<itemId>.", extras "x.", bump "b.". */
export type Scope = { kind: "unit"; k: K } | { kind: "shared"; item: string } | { kind: "extra" } | { kind: "bump" };
const prefixOf = (s: Scope) => (s.kind === "unit" ? `u.${s.k}.` : s.kind === "shared" ? `s.${s.item}.` : s.kind === "extra" ? "x." : "b.");

/* ------------------------------------------------------------------ */
/* Looks and small pieces                                              */
/* ------------------------------------------------------------------ */

/** Relative luminance of a #rrggbb color (0 black … 1 white). */
function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

function lookOf(ctx: RenderContext, kind: string, options: readonly Choice[], display?: string): Look {
  if (display === "select") return "select";
  const photo = (o: Choice) => !!ctx.asset(o.image);
  if (kind === "swatch" && options.every((o) => safeHex(o.swatch) || photo(o))) return "dot";
  if (kind === "image" && options.every(photo)) return "tile";
  return "chip";
}

/** The tick drawn on the chosen dot or tile. */
function Tick(): ReactElement {
  return (
    <svg className="lp-vo__tick" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6.6 12.6l3.7 3.6 7.2-8" />
    </svg>
  );
}

/** The value a unit starts on: preset → first available (swatch / image) → a lone available value. */
function startOf(kind: string, options: readonly Choice[], rule: LineRule | undefined): Choice | undefined {
  const available = options.filter((o) => !o.soldOut);
  const preset = rulePreset(rule);
  if (preset) {
    const p = available.find((o) => o.id === preset);
    if (p) return p;
  }
  return kind !== "text" || available.length === 1 ? available[0] : undefined;
}

/** A static chip of a locked value (§C.1: shown, never a control). */
function LockChip({ ctx, ruleKey, name, option }: { ctx: RenderContext; ruleKey: string; name: string; option: Choice }) {
  const hex = safeHex(option.swatch);
  const img = ctx.asset(option.image);
  return (
    <div className="lp-vg lp-vg--lock" data-lp-lock={ruleKey}>
      <p className="lp-vg__head">
        <span className="lp-vg__name">{name}</span>
      </p>
      <span className="lp-lock">
        {img ? <Picture asset={img} sizes="1.5rem" alt="" ratio={1} className="lp-lock__pic" /> : hex ? <span className="lp-lock__sw" style={cssVars({ "--sw": hex })} aria-hidden="true" /> : null}
        <span className="lp-lock__t">{option.label}</span>
        <svg className="lp-lock__ico" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M5 7V5.2a3 3 0 0 1 6 0V7M4.2 7h7.6c.4 0 .7.3.7.7v5c0 .4-.3.8-.7.8H4.2a.7.7 0 0 1-.7-.8v-5c0-.4.3-.7.7-.7z" />
        </svg>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Option controls                                                     */
/* ------------------------------------------------------------------ */

interface OptionSetProps {
  ctx: RenderContext;
  /** control name */
  name: string;
  /** [data-field] key (error placement) */
  field: string;
  kind: string;
  options: readonly Choice[];
  start?: Choice;
  look: Look;
  /** photo swap key per option ("<itemId>:<gid>:<optionId>") */
  vimg?: (o: Choice) => string | undefined;
  /** the option is unavailable beyond its own soldOut (matrix: no combination) — "épuisé" / "indisponible" */
  blocked?: (o: Choice) => "out" | "none" | undefined;
  /** the option conflicts with the current other-dim choice (struck, still selectable) */
  conflict?: (o: Choice) => boolean;
  /** surcharge shown and priced */
  priced: boolean;
  required: boolean;
  disabled?: boolean;
}

/** The radios of one choice group or matrix dim (dots · tiles · chips) or a native select. */
function OptionSet({ ctx, name, field, options, start, look, vimg, blocked, conflict, priced, required, disabled }: OptionSetProps): ReactElement {
  const O = optionLabels(ctx.locale);
  const describedBy = errId(field);
  if (look === "select") {
    return (
      <span className="lp-select lp-vsel">
        <select className="lp-select__el" name={name} id={ctlId(name)} required={required} disabled={disabled} defaultValue={start?.id ?? ""} aria-describedby={describedBy}>
          <option value="" disabled>
            {"—"}
          </option>
          {options.map((o) => {
            const out = o.soldOut || blocked?.(o);
            const plus = priced ? plusMoney(ctx, toCents(o.delta ?? 0)) : undefined;
            return (
              <option key={o.id} value={o.id} disabled={!!out} data-delta={priced && o.delta ? toCents(o.delta) : undefined} data-vimg={vimg?.(o)}>
                {[o.label, plus, out ? (out === "none" ? unitWord(ctx.locale, "matrixNone") : O.soldOut) : undefined].filter(Boolean).join(" · ")}
              </option>
            );
          })}
        </select>
      </span>
    );
  }
  const longest = Math.max(...options.map((o) => Array.from(o.label).length));
  const grid = look === "chip" && longest <= 9 && !options.some((o) => priced && o.delta);
  return (
    <span
      className="lp-vg__opts"
      data-layout={look === "chip" ? (grid ? "grid" : "flow") : look}
      style={grid ? cssVars({ "--vo-min": `${Math.max(2.6, 1 + longest * 0.58).toFixed(2)}rem` }) : undefined}
    >
      {options.map((o) => {
        const img = ctx.asset(o.image);
        const hex = safeHex(o.swatch);
        const state = o.soldOut ? "out" : blocked?.(o);
        const plus = priced ? plusMoney(ctx, toCents(o.delta ?? 0)) : undefined;
        const struck = !state && conflict?.(o);
        const label = (
          <>
            {o.label}
            {plus && look !== "chip" ? `, ${plus}` : null}
            {state ? <span className="lp-visually-hidden">{`, ${state === "none" ? unitWord(ctx.locale, "matrixNone") : O.soldOut}`}</span> : null}
          </>
        );
        return (
          <label
            key={o.id}
            className="lp-vo"
            data-soldout={state === "out" ? "" : undefined}
            data-none={state === "none" ? "" : undefined}
            data-conflict={struck ? "" : undefined}
            data-opt={o.id}
            title={look === "chip" ? undefined : o.label}
          >
            <input
              className="lp-vo__in"
              type="radio"
              name={name}
              value={o.id}
              required={required}
              disabled={!!state || disabled}
              defaultChecked={o.id === start?.id}
              aria-describedby={describedBy}
              data-sw={hex}
              data-delta={priced && o.delta ? toCents(o.delta) : undefined}
              data-vimg={vimg?.(o)}
            />
            {look === "chip" ? (
              <span className="lp-vo__face">
                {img ? <Picture asset={img} sizes="2rem" alt="" ratio={1} className="lp-vo__mini" /> : null}
                {hex && !img ? <span className="lp-vo__mini lp-vo__mini--sw" style={cssVars({ "--sw": hex })} /> : null}
                <span className="lp-vo__txt">
                  {label}
                  {plus ? <span className="lp-vo__delta">{plus}</span> : null}
                </span>
                {state || struck ? <span className="lp-vo__x" aria-hidden="true" /> : null}
              </span>
            ) : (
              <>
                <span
                  className="lp-vo__face"
                  data-tone={hex ? (luminance(hex) > 0.42 ? "light" : "dark") : "photo"}
                  style={hex && look === "dot" ? cssVars({ "--sw": hex }) : undefined}
                >
                  {look === "tile" || (look === "dot" && !hex) ? (
                    <Picture asset={img} sizes={look === "tile" ? "3.5rem" : "2.75rem"} alt="" ratio={1} className="lp-vo__pic" />
                  ) : null}
                  <Tick />
                  {state || struck ? <span className="lp-vo__x" aria-hidden="true" /> : null}
                </span>
                {plus ? (
                  <span className="lp-vo__plus" aria-hidden="true">
                    {plus}
                  </span>
                ) : null}
                <span className="lp-visually-hidden">{label}</span>
              </>
            )}
          </label>
        );
      })}
    </span>
  );
}

/** The fieldset shell every group shares: legend (name + chosen value), body, its own error line. */
function GroupShell({
  field,
  look,
  name,
  value,
  note,
  msgs,
  extra,
  children,
  className,
}: {
  field: string;
  look: Look | "matrix" | "pick";
  name: ReactNode;
  value?: string;
  note?: string;
  msgs: GroupMessages;
  extra?: Record<string, string | undefined>;
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <fieldset className={cx("lp-vg", className)} data-field={field} data-look={look} {...msgs} {...extra}>
      <legend className="lp-vg__head">
        <span className="lp-vg__name">{name}</span>
        {look !== "chip" && look !== "select" ? (
          <span className="lp-vg__val" data-lp-vval="" aria-hidden="true">
            {value ?? ""}
          </span>
        ) : null}
        {note ? <span className="lp-vg__note">{note}</span> : null}
      </legend>
      {children}
      <p className="lp-field__error lp-vg__err" id={errId(field)} data-error="" aria-live="polite" />
    </fieldset>
  );
}

/* ------------------------------------------------------------------ */
/* Groups                                                              */
/* ------------------------------------------------------------------ */

interface GroupProps {
  ctx: RenderContext;
  item: Item | null;
  group: OptionGroup;
  scope: Scope;
  rules?: Rules;
  /** surcharges count (paid units, extras); free units and the bump carry none */
  priced: boolean;
  disabled?: boolean;
}

function vimgKey(item: Item | null, gid: string, id: string, asset: unknown): string | undefined {
  return item && asset ? `${item.id}:${gid}:${id}` : undefined;
}

function ChoiceField({ ctx, item, group, scope, rules, priced, disabled }: GroupProps & { group: ChoiceGroup }): ReactElement {
  const key = prefixOf(scope) + group.id;
  const rule = group.perUnit && scope.kind === "unit" ? rules?.[group.id] : undefined;
  const lock = ruleLock(rule);
  if (lock) {
    const o = group.options.find((x) => x.id === lock);
    if (o) return <LockChip ctx={ctx} ruleKey={group.id} name={group.name} option={o} />;
  }
  const options = scope.kind === "unit" ? groupOptions(group, rules) : group.options;
  const look = lookOf(ctx, group.kind, options, group.display);
  const start = startOf(group.kind, options, rule);
  const pg = item ? photoGroupOf(item) : null;
  const swaps = pg && pg.gid === group.id && !pg.dim;
  // F2 (LAN-§3.5 OF3): a group with one value to pick is never shown; its one radio stays checked, so the value is
  // posted as the only choice (CSS hides `[data-one]`; the control stays enabled for the runtime and the payload)
  const one = options.length === 1 && start === options[0] ? { "data-one": "" } : undefined;
  return (
    <GroupShell field={key} look={look} name={group.name} value={start?.label} msgs={groupMessages(ctx, group)} extra={one}>
      <OptionSet
        ctx={ctx}
        name={key}
        field={key}
        kind={group.kind}
        options={options}
        start={start}
        look={look}
        vimg={swaps ? (o) => vimgKey(item, group.id, o.id, ctx.asset(o.image)) : undefined}
        priced={priced}
        required={scope.kind !== "extra"}
        disabled={disabled}
      />
    </GroupShell>
  );
}

/** "Noir · M" — a combination's label, dims in order. */
const comboLabel = (g: MatrixGroup, values: { value: Choice }[]) => values.map((v) => v.value.label).join(" · ");

/** Combined display: one list of the valid combinations ("auto": combined when ≤ 8 are made — the same rule as the runtime config). */
function useCombined(g: MatrixGroup): boolean {
  if (g.display === "combined") return true;
  if (g.display === "linked") return false;
  return groupCombos(g).filter((c) => c.state !== "none").length <= 8;
}

function MatrixField({ ctx, item, group, scope, rules, priced, disabled }: GroupProps & { group: MatrixGroup }): ReactElement {
  const key = prefixOf(scope) + group.id;
  const unitRules = group.perUnit && scope.kind === "unit" ? rules : undefined;
  const r = dimRules(group, unitRules);
  const msgs = groupMessages(ctx, group);
  const combos = groupCombos(group, unitRules);

  if (useCombined(group)) {
    const shown = combos.filter((c) => c.state !== "none");
    const available = shown.filter((c) => c.state === "in");
    const startCombo = available.length === 1 ? available[0] : undefined;
    const swatchDim = group.dims.find((d) => d.kind === "swatch");
    return (
      <GroupShell field={key} look="chip" name={group.name} msgs={msgs} extra={{ "data-matrix": "combined" }}>
        <span className="lp-vg__opts" data-layout="flow">
          {shown.map((c) => {
            const sw = swatchDim ? safeHex(c.values.find((v) => v.dim.id === swatchDim.id)?.value.swatch) : undefined;
            const plus = priced ? plusMoney(ctx, c.delta) : undefined;
            const out = c.state === "out";
            const img = c.image ?? c.values.find((v) => v.value.image)?.value.image;
            return (
              <label key={c.key} className="lp-vo" data-soldout={out ? "" : undefined}>
                <input
                  className="lp-vo__in"
                  type="radio"
                  name={key}
                  value={c.key}
                  required
                  disabled={out || disabled}
                  defaultChecked={c === startCombo}
                  aria-describedby={errId(key)}
                  data-sw={sw}
                  data-delta={priced && c.delta > 0 ? c.delta : undefined}
                  data-vimg={item && img ? `${item.id}:${group.id}:${c.image ? c.key : `${c.values.find((v) => v.value.image)!.dim.id}=${c.values.find((v) => v.value.image)!.value.id}`}` : undefined}
                />
                <span className="lp-vo__face">
                  {sw ? <span className="lp-vo__mini lp-vo__mini--sw" style={cssVars({ "--sw": sw })} /> : null}
                  <span className="lp-vo__txt">
                    {comboLabel(group, c.values)}
                    {out ? <span className="lp-visually-hidden">{`, ${optionLabels(ctx.locale).soldOut}`}</span> : null}
                    {plus ? <span className="lp-vo__delta">{plus}</span> : null}
                  </span>
                  {out ? <span className="lp-vo__x" aria-hidden="true" /> : null}
                </span>
              </label>
            );
          })}
        </span>
      </GroupShell>
    );
  }

  // linked: one selector per dim (nested fieldsets); a locked dim is a static chip
  const starts = new Map<string, Choice | undefined>();
  for (const d of group.dims) {
    if (ruleLock(r[d.id])) continue;
    const opts = d.values.filter((v) => ruleAllows(r[d.id], v.id));
    // a value no available combination uses (within the rules) is disabled
    const usable = opts.filter((v) => combos.some((c) => c.state === "in" && c.values.some((x) => x.dim.id === d.id && x.value.id === v.id)));
    starts.set(d.id, startOf(d.kind, usable.length ? usable : opts, r[d.id]));
  }
  const fixed = (dimId: string) => ruleLock(r[dimId]) ?? starts.get(dimId)?.id;
  return (
    <GroupShell field={key} look="matrix" name={group.name} msgs={msgs} extra={{ "data-matrix": "linked" }} className="lp-vm">
      {group.dims.map((d) => {
        const lock = ruleLock(r[d.id]);
        if (lock) {
          const o = d.values.find((v) => v.id === lock);
          return o ? <LockChip key={d.id} ctx={ctx} ruleKey={`${group.id}.${d.id}`} name={d.name} option={o} /> : null;
        }
        const opts = d.values.filter((v) => ruleAllows(r[d.id], v.id));
        const blocked = (v: Choice): "out" | "none" | undefined => {
          const withV = combos.filter((c) => c.values.some((x) => x.dim.id === d.id && x.value.id === v.id));
          if (withV.some((c) => c.state === "in")) return undefined;
          return withV.every((c) => c.state === "none") ? "none" : "out";
        };
        // struck but selectable: no available combination with the other dims' current values
        const conflict = (v: Choice): boolean => {
          const combo: Record<string, string> = { [d.id]: v.id };
          for (const x of group.dims) {
            if (x.id === d.id) continue;
            const id = fixed(x.id);
            if (!id) return false;
            combo[x.id] = id;
          }
          const hit = combos.find((c) => c.key === cellKey(combo));
          return !!hit && hit.state !== "in";
        };
        const look = lookOf(ctx, d.kind, opts);
        const start = starts.get(d.id);
        const dimKey = `${key}.${d.id}`;
        const pg = item ? photoGroupOf(item) : null;
        const swaps = pg && pg.gid === group.id && pg.dim === d.id;
        return (
          <fieldset key={d.id} className="lp-vg lp-vm__dim" data-look={look} data-dim={d.id}>
            <legend className="lp-vg__head">
              <span className="lp-vg__name">{d.name}</span>
              {look !== "chip" ? (
                <span className="lp-vg__val" data-lp-vval="" aria-hidden="true">
                  {start?.label ?? ""}
                </span>
              ) : null}
            </legend>
            <OptionSet
              ctx={ctx}
              name={dimKey}
              field={key}
              kind={d.kind}
              options={opts}
              start={start}
              look={look}
              vimg={swaps ? (o) => vimgKey(item, group.id, `${d.id}=${o.id}`, ctx.asset(o.image)) : undefined}
              blocked={blocked}
              conflict={conflict}
              priced={priced}
              required
              disabled={disabled}
            />
          </fieldset>
        );
      })}
      <p className="lp-vm__note" data-lp-mnote="" aria-live="polite" />
    </GroupShell>
  );
}

function FieldInput({ ctx, group, scope, priced, disabled }: GroupProps & { group: FieldGroup }): ReactElement {
  const key = prefixOf(scope) + group.id;
  const id = ctlId(key);
  const msgs = groupMessages(ctx, group);
  const delta = priced && !group.required && group.delta ? toCents(group.delta) : 0;
  const note = group.required ? undefined : delta ? unitWord(ctx.locale, "optionalPrice", { price: ctx.money(fromCents(delta)) }) : unitWord(ctx.locale, "optional");
  const numeric = group.input === "number" || group.charset === "digits";
  const max = group.input === "number" ? String(group.max ?? 1_000_000).length : group.maxLength;
  return (
    <div className="lp-field lp-vf" data-field={key} {...msgs}>
      <label className="lp-field__label lp-vf__label" htmlFor={id}>
        <span>{group.name}</span>
        {note ? <span className="lp-vf__opt">{note}</span> : null}
      </label>
      <span className="lp-vf__wrap">
        <input
          className="lp-input lp-vf__in"
          id={id}
          name={key}
          type="text"
          inputMode={numeric ? "numeric" : "text"}
          maxLength={max}
          dir="auto"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="next"
          required={group.required}
          aria-required={group.required || undefined}
          disabled={disabled}
          placeholder={group.placeholder?.trim() || undefined}
          aria-describedby={`${group.help ? `${id}-hint ` : ""}${errId(key)}`}
          data-delta={delta || undefined}
          data-charset={group.charset}
          data-input={group.input}
          data-min={group.input === "number" ? (group.min ?? 0) : undefined}
          data-max={group.input === "number" ? (group.max ?? 1_000_000) : undefined}
        />
        <span className="lp-vf__count" data-lp-count="" aria-hidden="true">
          <bdi dir="ltr">{`0/${max}`}</bdi>
        </span>
      </span>
      {group.help?.trim() ? (
        <p className="lp-field__hint" id={`${id}-hint`}>
          {group.help.trim()}
        </p>
      ) : null}
      <p className="lp-field__error" id={errId(key)} data-error="" aria-live="polite" />
    </div>
  );
}

/** One group of any kind. */
export function GroupView(p: GroupProps): ReactElement | null {
  const g = p.group;
  if (isChoiceGroup(g)) return g.options.length ? <ChoiceField {...p} group={g} /> : null;
  if (isMatrixGroup(g)) return <MatrixField {...p} group={g} />;
  if (isFieldGroup(g)) return <FieldInput {...p} group={g} />;
  return null;
}

/* ------------------------------------------------------------------ */
/* Units                                                               */
/* ------------------------------------------------------------------ */

/** Does a unit of `item` have something to choose under these rules (a per-unit group not locked)? */
export function unitFillable(item: Item | undefined, rules: Rules): boolean {
  if (!item) return false;
  return item.groups.some((g) => {
    if (!g.perUnit) return false;
    if (isFieldGroup(g)) return true;
    if (isChoiceGroup(g)) return g.options.length > 0 && !ruleLock(rules?.[g.id]);
    if (isMatrixGroup(g)) return g.dims.some((d) => !ruleLock(rules?.[`${g.id}.${d.id}`]));
    return false;
  });
}

/** The units of an offer that are rendered (a choice to make, or an option to pick). */
export function fillableSlots(ctx: RenderContext, offer: OfferView["offer"]): UnitSlot[] {
  const byId = new Map(ctx.items.map((it) => [it.id, it]));
  return expandUnits(offer, ctx.items).filter((s) => (s.choices ? true : unitFillable(byId.get(s.item ?? ""), s.rules)));
}

/** The item body of a unit: the item's per-unit groups under the line's rules. */
function ItemBody({ ctx, item, k, rules, free, disabled }: { ctx: RenderContext; item: Item; k: K; rules?: Rules; free: boolean; disabled?: boolean }): ReactElement {
  return (
    <div className="lp-vrow__groups lp-unit__body" data-lp-item-body={item.id}>
      {item.groups
        .filter((g) => g.perUnit)
        .map((g) => (
          <GroupView key={g.id} ctx={ctx} item={item} group={g} scope={{ kind: "unit", k }} rules={rules} priced={!free} disabled={disabled} />
        ))}
    </div>
  );
}

/** The item chooser of a choice unit: 56 px photo chips + short name, "+50 DH" when it costs more. */
function ItemPick({ ctx, k, slot, start }: { ctx: RenderContext; k: K; slot: Pick<UnitSlot, "choices" | "available" | "surcharge" | "free">; start?: string }): ReactElement {
  const key = `u.${k}.@item`;
  const byId = new Map(ctx.items.map((it) => [it.id, it]));
  const declared = (slot.choices ?? []).map((id) => byId.get(id)).filter((x): x is Item => !!x);
  const avail = new Set(slot.available ?? []);
  const base = Math.min(...declared.map((it) => toCents(it.price)));
  const chosen = start ? byId.get(start) : undefined;
  return (
    <GroupShell field={key} look="pick" name={unitWord(ctx.locale, "chooseItem")} value={chosen ? itemShort(ctx.doc, chosen) : undefined} msgs={pickMessages(ctx.locale)} className="lp-ipick" extra={{ "data-lp-item-pick": "" }}>
      <span className="lp-vg__opts" data-layout="pick">
        {declared.map((it) => {
          const out = !avail.has(it.id);
          const diff = !slot.free && slot.surcharge === "difference" ? toCents(it.price) - base : 0;
          const plus = plusMoney(ctx, diff);
          return (
            <label key={it.id} className="lp-vo lp-ipick__o" data-soldout={out ? "" : undefined}>
              <input
                className="lp-vo__in"
                type="radio"
                name={key}
                value={it.id}
                required
                disabled={out}
                defaultChecked={it.id === start}
                aria-describedby={errId(key)}
                data-delta={diff > 0 ? diff : undefined}
                data-vimg={it.id}
              />
              <span className="lp-vo__face lp-ipick__face">
                <ItemThumb ctx={ctx} item={it} sizes="3.5rem" className="lp-ipick__pic" />
                <span className="lp-ipick__txt">
                  <span className="lp-ipick__name">{itemShort(ctx.doc, it)}</span>
                  {plus ? <span className="lp-vo__delta">{plus}</span> : null}
                  {out ? <span className="lp-ipick__out">{optionLabels(ctx.locale).soldOut}</span> : null}
                </span>
                <Tick />
                {out ? <span className="lp-vo__x" aria-hidden="true" /> : null}
              </span>
            </label>
          );
        })}
      </span>
    </GroupShell>
  );
}

interface UnitProps {
  ctx: RenderContext;
  sid: string;
  k: K;
  head: string;
  aria: string;
  slot: UnitSlot | null;
  item: Item | null;
  /** first paint: hidden (steps / box panels other than the current one) */
  hidden?: boolean;
  /** template shell: no body */
  shell?: boolean;
}

/** One unit: head (+ "Offert", prefill tag, collapsed summary, Modifier) and its body. */
function UnitView({ ctx, sid, k, head, aria, slot, item, hidden, shell }: UnitProps): ReactElement {
  const free = !!slot?.free;
  const choice = !!slot?.choices;
  const start = choice && slot?.available?.length === 1 ? slot.available[0] : undefined;
  const bodyItem = choice ? (start ? (ctx.items.find((x) => x.id === start) ?? null) : null) : item;
  return (
    <div
      className="lp-vrow lp-unit"
      id={`${sid}-u-${k}`}
      role="group"
      aria-label={aria}
      data-lp-unit={k}
      data-item={slot ? (slot.item ?? start ?? "") : undefined}
      data-line={slot?.line}
      data-free={free ? "" : undefined}
      data-choice={choice ? "" : undefined}
      hidden={hidden}
    >
      <div className="lp-vrow__head lp-unit__head">
        <span className="lp-vrow__n lp-unit__n" data-lp-unit-head="">
          {head}
        </span>
        <span className="lp-unit__free" aria-hidden={!free || undefined}>
          {offerWord(ctx.locale, "free")}
        </span>
        <span className="lp-unit__tag" data-lp-prefill-tag="" hidden>
          {unitWord(ctx.locale, "prefilled")}
        </span>
        <span className="lp-unit__sum" data-lp-unit-sum="" aria-hidden="true" />
        <button type="button" className="lp-unit__edit" data-lp-unit-edit="" hidden>
          {unitWord(ctx.locale, "edit")}
        </button>
      </div>
      <div className="lp-unit__in" data-lp-unit-body="">
        {shell ? null : (
          <>
            {choice && slot ? <ItemPick ctx={ctx} k={k} slot={slot} start={start} /> : null}
            {bodyItem && (!choice || hasUnitGroups(bodyItem)) ? <ItemBody ctx={ctx} item={bodyItem} k={k} rules={choice ? undefined : slot?.rules} free={free} /> : null}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Steps / box navigation                                              */
/* ------------------------------------------------------------------ */

function StepChip({ ctx, sid, k, n, current, item, rules }: { ctx: RenderContext; sid: string; k: K; n: string; current: boolean; item?: Item | null; rules?: Rules }) {
  return (
    <button type="button" className="lp-ustep" data-lp-step={k} aria-controls={`${sid}-u-${k}`} aria-current={current ? "step" : undefined}>
      <span className="lp-ustep__pic" aria-hidden="true">
        {item ? <ItemThumb ctx={ctx} item={item} rules={rules} sizes="2.25rem" /> : null}
        <span className="lp-ustep__n">{n}</span>
        <svg className="lp-ustep__tick" viewBox="0 0 24 24" focusable="false">
          <path d="M6.6 12.6l3.7 3.6 7.2-8" />
        </svg>
        <span className="lp-ustep__err" />
      </span>
      <span className="lp-visually-hidden">{unitWord(ctx.locale, "head", { n })}</span>
    </button>
  );
}

function BoxTile({ ctx, sid, k, n, label, current }: { ctx: RenderContext; sid: string; k: K; n: string; label: string; current: boolean }) {
  return (
    <button type="button" className="lp-uslot" data-lp-slot={k} aria-controls={`${sid}-u-${k}`} aria-expanded={current}>
      <span className="lp-uslot__face" aria-hidden="true">
        <svg className="lp-uslot__plus" viewBox="0 0 24 24" focusable="false">
          <path d="M12 6v12M6 12h12" />
        </svg>
        <span className="lp-uslot__pic" data-lp-slot-pic="" />
        <span className="lp-uslot__dot" data-lp-slot-dot="" />
        <svg className="lp-uslot__tick" viewBox="0 0 24 24" focusable="false">
          <path d="M6.6 12.6l3.7 3.6 7.2-8" />
        </svg>
      </span>
      <span className="lp-uslot__n">{label}</span>
      <span className="lp-visually-hidden">{unitWord(ctx.locale, "head", { n })}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Photo templates                                                     */
/* ------------------------------------------------------------------ */

const PV_SIZES = "(min-width: 64rem) 22rem, 44vw";

function VimgTemplate({ k, asset, box }: { k: string; asset: ResolvedAsset; box?: import("@/lib/page/schema").CropBox }) {
  return (
    <template data-lp-vimg={k}>
      <span data-slot="thumb">
        {box ? (
          <Picture asset={asset} box={box} ratio={1} sizes="4.5rem" alt="" />
        ) : (
          <Picture asset={asset} sizes="4.5rem" alt="" ratio={1} fit={asset.alpha ? "contain" : "cover"} imgClassName={asset.alpha ? "lp-of__line-cut" : undefined} />
        )}
      </span>
      <span data-slot="pv">
        {box ? <Picture asset={asset} box={box} ratio={Math.min(1.25, Math.max(0.8, boxRatio(asset, box)))} sizes={PV_SIZES} alt="" /> : <Picture asset={asset} sizes={PV_SIZES} alt="" fit={asset.alpha ? "contain" : "cover"} />}
      </span>
    </template>
  );
}

/** Every swap photo of the page: item visuals and option / dim value / cell photos. */
export function PhotoTemplates({ ctx }: { ctx: RenderContext }): ReactElement | null {
  const out: ReactElement[] = [];
  const seen = new Set<string>();
  const push = (k: string, asset: ResolvedAsset | null, box?: import("@/lib/page/schema").CropBox) => {
    if (!asset || seen.has(k)) return;
    seen.add(k);
    out.push(<VimgTemplate key={k} k={k} asset={asset} box={box} />);
  };
  for (const it of ctx.items) {
    const pg = photoGroupOf(it);
    // the item's own visual: what a unit shows before its item / photo option is chosen
    if (ctx.items.length > 1 || pg) {
      const v = itemVisual(ctx.doc, it, ctx);
      push(it.id, v.asset, v.box);
    }
    if (!pg) continue;
    for (const o of pg.options) push(`${it.id}:${pg.gid}:${pg.dim ? `${pg.dim}=${o.id}` : o.id}`, ctx.asset(o.image));
    const g = it.groups.find((x) => x.id === pg.gid);
    if (g && isMatrixGroup(g)) for (const c of g.cells) if (c.image) push(`${it.id}:${g.id}:${cellKey(c.v)}`, ctx.asset(c.image));
  }
  return out.length ? <>{out}</> : null;
}

/* ------------------------------------------------------------------ */
/* Shared groups, extras, contents                                     */
/* ------------------------------------------------------------------ */

/** "Pour vos {n} {item}": an item's shared groups, shown while the selected offer contains the item. */
function SharedBlock({ ctx, item, count, hidden }: { ctx: RenderContext; item: Item; count: number; hidden: boolean }) {
  const groups = item.groups.filter((g) => !g.perUnit);
  if (!groups.length) return null;
  const name = itemShort(ctx.doc, item);
  return (
    <div className="lp-vrow lp-ushared" data-lp-shared={item.id} hidden={hidden} role="group" aria-label={name} data-h={unitWord(ctx.locale, "forAll", { item: name })}>
      <div className="lp-vrow__head">
        <span className="lp-vrow__n" data-lp-shared-head="">
          {unitWord(ctx.locale, "forAll", { n: ctx.num(count), item: name })}
        </span>
      </div>
      <div className="lp-vrow__groups">
        {groups.map((g) => (
          <GroupView key={g.id} ctx={ctx} item={item} group={g} scope={{ kind: "shared", item: item.id }} priced disabled={hidden} />
        ))}
      </div>
    </div>
  );
}

/** Page extras (gift wrap, card message): once per order, enabled when the selected offer is in scope. */
export function Extras({ ctx, offerId }: { ctx: RenderContext; offerId: string }): ReactElement | null {
  const extras = ctx.offers.extras;
  if (!extras.length) return null;
  return (
    <div className="lp-uextras">
      {extras.map((x: ExtraGroup) => {
        const inScope = x.scope === "all" || x.scope.includes(offerId);
        return (
          <div key={x.id} className="lp-uextra" data-lp-extra={x.id} data-scope={x.scope === "all" ? "all" : x.scope.join(" ")} hidden={!inScope}>
            <GroupView ctx={ctx} item={null} group={x as OptionGroup} scope={{ kind: "extra" }} priced disabled={!inScope} />
          </div>
        );
      })}
    </div>
  );
}

/** "Contenu du pack": what an offer with nothing to fill holds (thumbnails + names). */
function ContentsBlock({ ctx, view }: { ctx: RenderContext; view: OfferView }) {
  const byId = new Map(ctx.items.map((it) => [it.id, it]));
  return (
    <div className="lp-ucontents" data-lp-contents={view.id} data-bundle-card={view.id} data-selected={view.selected ? "" : undefined}>
      <p className="lp-ucontents__k">{offerWord(ctx.locale, "contents")}</p>
      <ul className="lp-ucontents__list" role="list">
        {view.offer.lines.map((l) => {
          const id = "item" in l.pick ? l.pick.item : l.pick.choice[0]!;
          const it = byId.get(id);
          if (!it) return null;
          return (
            <li key={l.id} className="lp-ucontents__i">
              <ItemThumb ctx={ctx} item={it} rules={l.rules} sizes="2.75rem" />
              <span className="lp-ucontents__t">
                <bdi>{"item" in l.pick ? itemShort(ctx.doc, it) : view.contents.find((c) => c.choice)?.label}</bdi>
                {l.qty > 1 ? (
                  <bdi className="lp-ucontents__q" dir="ltr">
                    ×{ctx.num(l.qty)}
                  </bdi>
                ) : null}
              </span>
              {l.free ? <span className="lp-unit__free">{offerWord(ctx.locale, "free")}</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The container                                                       */
/* ------------------------------------------------------------------ */

export interface UnitsProps {
  ctx: RenderContext;
  sid: string;
  fill: "inline" | "rows" | "steps" | "box";
  packs: OfferView[];
  /** the offer selected on first paint */
  current: OfferView;
  surface?: SectionBg;
}

/** Items whose units some offer renders (fixed lines with groups, chosen items with groups). */
function templateItems(ctx: RenderContext): Item[] {
  const ids = new Set<string>();
  for (const o of ctx.offers.bundles)
    for (const l of o.lines) {
      if ("item" in l.pick) ids.add(l.pick.item);
      else for (const id of l.pick.choice) ids.add(id);
    }
  return ctx.items.filter((it) => ids.has(it.id) && hasUnitGroups(it));
}

/**
 * [data-lp-units]: the selected offer's units (+ shared groups, steps / box navigation) and the
 * templates the runtime clones for the other offers.
 */
export function Units({ ctx, sid, fill, packs, current, surface }: UnitsProps): ReactElement {
  const heads = unitHeads(ctx, current.offer);
  const slots = fillableSlots(ctx, current.offer);
  const byId = new Map(ctx.items.map((it) => [it.id, it]));
  const nav = fill === "steps" || fill === "box";
  const units = current.qty;
  const h = headPatterns(ctx.locale);
  const pats = {
    "data-h-unit": h.unit,
    "data-h-of": h.of,
    "data-h-choice": h.choice,
    "data-h-free": offerWord(ctx.locale, "free"),
  };
  // shared blocks: every item with shared groups, shown while the offer holds it
  const counts = new Map<string, number>();
  for (const s of expandUnits(current.offer, ctx.items)) if (s.item) counts.set(s.item, (counts.get(s.item) ?? 0) + 1);
  const sharedItems = ctx.items.filter((it) => it.groups.some((g) => !g.perUnit));
  const noFill = packs.filter((p) => fillableSlots(ctx, p.offer).length === 0);
  // steps / box: the strip and the prev/next pair exist whenever SOME offer needs them (the runtime fills
  // and shows them on an offer switch), not only when the default offer does
  const most = nav ? Math.max(0, ...packs.map((p) => fillableSlots(ctx, p.offer).length)) : 0;
  return (
    <div
      className={cx("lp-vars lp-units", `lp-units--${fill}`)}
      data-lp-units=""
      data-fill={fill}
      data-units={units}
      data-n={slots.length}
      data-bg={fill === "inline" ? surface : undefined}
      {...pats}
    >
      {sharedItems.map((it) => (
        <SharedBlock key={it.id} ctx={ctx} item={it} count={counts.get(it.id) ?? 0} hidden={!counts.has(it.id)} />
      ))}
      {most > 0 ? (
        <div className={fill === "steps" ? "lp-usteps" : "lp-ubox"} data-lp-steps="" role="group" aria-label={unitWord(ctx.locale, fill === "steps" ? "steps" : "box")}>
          {slots.map((s, i) =>
            fill === "steps" ? (
              <StepChip key={s.k} ctx={ctx} sid={sid} k={s.k} n={ctx.num(s.k + 1)} current={i === 0} item={s.item ? byId.get(s.item) : null} rules={s.rules} />
            ) : (
              <BoxTile key={s.k} ctx={ctx} sid={sid} k={s.k} n={ctx.num(s.k + 1)} label={heads[s.k]!.head} current={i === 0} />
            ),
          )}
        </div>
      ) : null}
      <div className="lp-units__list" data-lp-unit-list="">
        {slots.map((s, i) => (
          <UnitView
            key={s.k}
            ctx={ctx}
            sid={sid}
            k={s.k}
            head={heads[s.k]!.head}
            aria={heads[s.k]!.aria}
            slot={s}
            item={s.item ? (byId.get(s.item) ?? null) : null}
            hidden={nav && i > 0}
          />
        ))}
      </div>
      {most > 1 ? (
        <div className="lp-unav">
          <button type="button" className="lp-unav__b lp-unav__b--prev" data-lp-prev="" disabled hidden={slots.length < 2 || undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M14.5 6.5L9 12l5.5 5.5" />
            </svg>
            <span>{unitWord(ctx.locale, "prev")}</span>
          </button>
          <button type="button" className="lp-unav__b lp-unav__b--next" data-lp-next="" hidden={slots.length < 2 || undefined}>
            <span>{unitWord(ctx.locale, "next")}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9.5 6.5L15 12l-5.5 5.5" />
            </svg>
          </button>
        </div>
      ) : null}
      {fill !== "inline" ? noFill.map((p) => <ContentsBlock key={p.id} ctx={ctx} view={p} />) : null}
      <UnitTemplates ctx={ctx} sid={sid} fill={fill} />
    </div>
  );
}

/** The templates the runtime clones (tokens {k} {n}). */
function UnitTemplates({ ctx, sid, fill }: { ctx: RenderContext; sid: string; fill: UnitsProps["fill"] }): ReactElement {
  const pickLines: { key: string; slot: Pick<UnitSlot, "choices" | "available" | "surcharge" | "free"> }[] = [];
  for (const o of ctx.offers.bundles) {
    const slots = expandUnits(o, ctx.items);
    o.lines.forEach((l, line) => {
      if ("choice" in l.pick) {
        const s = slots.find((x) => x.line === line);
        if (s) pickLines.push({ key: `${o.id}.${line}`, slot: s });
      }
    });
  }
  return (
    <>
      <template data-lp-unit-tpl="">
        <UnitView ctx={ctx} sid={sid} k="{k}" head="{head}" aria="{aria}" slot={null} item={null} shell />
      </template>
      {templateItems(ctx).map((it) => (
        <template key={it.id} data-lp-item-tpl={it.id}>
          <ItemBody ctx={ctx} item={it} k="{k}" free={false} />
        </template>
      ))}
      {pickLines.map((p) => (
        <template key={p.key} data-lp-pick-tpl={p.key}>
          <ItemPick ctx={ctx} k="{k}" slot={p.slot} />
        </template>
      ))}
      {fill === "steps" ? (
        <template data-lp-step-tpl="">
          <StepChip ctx={ctx} sid={sid} k="{k}" n="{n}" current={false} />
        </template>
      ) : null}
      {fill === "box" ? (
        <template data-lp-slot-tpl="">
          <BoxTile ctx={ctx} sid={sid} k="{k}" n="{n}" label="{head}" current={false} />
        </template>
      ) : null}
      <PhotoTemplates ctx={ctx} />
    </>
  );
}

/** Does the page have anything to personalize at all (resolved fill ≠ none)? */
export const pageHasUnits = (fill: string): fill is UnitsProps["fill"] => fill === "inline" || fill === "rows" || fill === "steps" || fill === "box";

/** Bump item options (§F.4 "Bump with an item"): names b.<gid>, disabled until the bump is ticked. */
export function BumpBody({ ctx, item }: { ctx: RenderContext; item: Item }): ReactElement | null {
  const groups = item.groups;
  if (!groups.length) return null;
  return (
    <div className="lp-bump__opts lp-vrow__groups" data-lp-bump-body="" hidden>
      {groups.map((g) => (
        <GroupView key={g.id} ctx={ctx} item={item} group={g} scope={{ kind: "bump" }} priced={false} disabled />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

/**
 * The live one-line summary of the chosen units ("2 × Crème jour · Noir / M + 1 × Sérum · Offert") and
 * the surcharge reasons (XL +20 DH, Gravure +30 DH): drawn by the runtime into elements React leaves
 * empty. `as="row"` = the last rows of the order summary (<dl>), `as="line"` = a standalone line.
 */
export function OptionsSummary({ ctx, as }: { ctx: RenderContext; as: "row" | "line" }): ReactElement | null {
  const any = ctx.items.some((it) => it.groups.length > 0) || ctx.items.length > 1 || ctx.offers.extras.length > 0;
  if (!any) return null;
  const label = unitWord(ctx.locale, "otherOptions");
  if (as === "row")
    return (
      <>
        <div className="lp-sum__row lp-sum__row--reasons">
          <dt className="lp-visually-hidden">{label}</dt>
          <dd className="lp-sum__reasons" data-lp-sum-reasons="" data-other={label} aria-live="polite" />
        </div>
        <div className="lp-sum__row lp-sum__row--opts">
          <dt className="lp-visually-hidden">{uiLabels(ctx.locale).options}</dt>
          <dd className="lp-vsum" data-lp-vsum="" aria-live="polite" />
        </div>
      </>
    );
  return <p className="lp-vsum lp-vsum--line" data-lp-vsum="" aria-live="polite" />;
}

"use client";
/**
 * The release / ops flag editor (platform.md PLA-§12.2; `flags.manage`): the typed default (JSON checked as typed for
 * `json`), the ordered rules (drag a rule by its handle, or move it with its arrow buttons or Alt+↑ / Alt+↓; each rule
 * has conditions, a value and an optional rollout), and the overrides (scope store / user / plan / market, the id,
 * a value, a note ≤ 200 and an optional expiry; Undo for 10 s after adding). Archived flags open read-only. The
 * server checks everything again (src/lib/platform/flag-rules.ts `checkFlagEdit`).
 *
 *   <FlagEditor row={row} overrides={[…]} canManage lists={{ plans, markets, modes, statuses, roles }} />
 */
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { clearFlagOverrideAction, saveFlagAction, setFlagOverrideAction } from "@/app/admin/(console)/flags/actions";
import { useT } from "@/lib/i18n/admin/client";
import type { FlagRule } from "@/lib/flags/registry";
import type { FlagOverrideView, FlagRowView } from "@/lib/platform/flags";
import type { FlagType, OverrideScope } from "@/lib/platform/flag-eval";
import { cn } from "@/lib/utils";
import { Ago, Until } from "../ago";
import { useGuarded } from "../guarded";
import { button } from "../queue/decision-dialogs";

const CONDITIONS = ["plans", "modes", "markets", "storeStatus", "platformRoles"] as const;
type Condition = (typeof CONDITIONS)[number];
const SCOPES: readonly OverrideScope[] = ["store", "user", "plan", "market"];
export const RULES_LIMIT = 20;
const NOTE_LIMIT = 200;

type Raw = boolean | string;
interface DraftRule {
  id: string;
  when: Partial<Record<Condition, string[]>>;
  value: Raw;
  rollout: string;
}
export interface FlagLists {
  plans: string[];
  markets: readonly string[];
  modes: readonly string[];
  statuses: readonly string[];
  roles: readonly string[];
}

const field =
  "h-[var(--ctl)] w-full rounded-[var(--r-control)] bg-background px-3 text-[13px] shadow-[inset_0_0_0_1px_var(--input)] outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)] disabled:opacity-60 aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--c-danger-ink)] max-md:h-11";
const card = "rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]";

/** a stored value as the editor's raw input */
export function rawOf(type: FlagType, v: unknown): Raw {
  if (type === "boolean") return v === true;
  if (type === "json") return JSON.stringify(v ?? {}, null, 2);
  return v === undefined || v === null ? "" : String(v);
}

/** the raw input checked as typed: null when it fits the type, else the problem's message key */
export function rawProblem(type: FlagType, raw: Raw): string | null {
  if (type === "boolean") return typeof raw === "boolean" ? null : "console.flag.value_type";
  const s = String(raw);
  if (type === "number") return s.trim() !== "" && Number.isFinite(Number(s)) ? null : "console.flag.value_type";
  if (type === "string") return s.length <= 500 ? null : "console.flag.value_type";
  try {
    const v: unknown = JSON.parse(s);
    return v && typeof v === "object" && !Array.isArray(v) && s.length <= 8_000 ? null : "console.flag.json_invalid";
  } catch {
    return "console.flag.json_invalid";
  }
}

let seq = 0;
const nextId = () => `r${++seq}`;

export function FlagEditor({ row, overrides, canManage, lists }: { row: FlagRowView; overrides: FlagOverrideView[]; canManage: boolean; lists: FlagLists }) {
  const t = useT();
  const router = useRouter();
  const g = useGuarded("console.flags.save_failed");
  const editable = canManage && !row.archived;
  const [def, setDef] = useState<Raw>(rawOf(row.type, row.value));
  const [rules, setRules] = useState<DraftRule[]>(() =>
    row.rules.map((r) => ({ id: nextId(), when: { ...(r.when as DraftRule["when"]) }, value: rawOf(row.type, r.value), rollout: r.rollout === undefined || r.rollout === null ? "" : String(r.rollout) })),
  );
  const [drag, setDrag] = useState<number | null>(null);
  const [tried, setTried] = useState(false);

  const move = (from: number, to: number) =>
    setRules((list) => {
      if (to < 0 || to >= list.length || from === to) return list;
      const next = [...list];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x!);
      return next;
    });
  const patch = (i: number, p: Partial<DraftRule>) => setRules((list) => list.map((r, n) => (n === i ? { ...r, ...p } : r)));

  const defProblem = rawProblem(row.type, def);
  const ruleProblems = rules.map((r) => rawProblem(row.type, r.value) ?? (r.rollout !== "" && !/^(100|\d{1,2})$/.test(r.rollout) ? "console.flag.rollout_invalid" : null));
  const invalid = !!defProblem || ruleProblems.some(Boolean);

  const save = async () => {
    setTried(true);
    if (invalid) return;
    const out: FlagRule[] = rules.map((r) => {
      const when = Object.fromEntries(Object.entries(r.when).filter(([, v]) => v && v.length > 0));
      return { when, value: r.value as FlagRule["value"], ...(r.rollout !== "" ? { rollout: Number(r.rollout) } : {}) };
    });
    await g.run(
      (opId) => saveFlagAction({ key: row.key, default: def, rules: out, opId }),
      (d) => {
        toast.success(d.saved ? t("console.flags.saved", { key: row.key }) : t("console.flags.no_change"));
        g.reset();
        router.refresh();
      },
    );
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {row.archived && <p className="rounded-[var(--r-control)] bg-[var(--c-warn-soft)] px-3.5 py-2.5 text-[12.5px]">{t("console.flag.archived")}</p>}

      <section aria-labelledby="flag-default" className={cn(card, "grid gap-2 px-4 py-4")}>
        <h2 id="flag-default" className="text-[13px] font-semibold">
          {t("console.flags.default_value")}
        </h2>
        <p className="text-[12px] text-muted-foreground">{t("console.flags.default_lead", { value: String(rawOf(row.type, row.declared)) })}</p>
        <ValueInput type={row.type} value={def} onChange={setDef} disabled={!editable} problem={tried || row.type === "json" ? defProblem : null} label={t("console.flags.default_value")} />
      </section>

      <section aria-labelledby="flag-rules" className={cn(card, "grid gap-3 px-4 py-4")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="flag-rules" className="text-[13px] font-semibold">
            {t("console.flags.rules")}
          </h2>
          <span className="text-[11.5px] text-muted-foreground">{t("console.flags.rules_lead")}</span>
        </div>
        {rules.length === 0 && <p className="text-[12.5px] text-muted-foreground">{t("console.flags.rules_none")}</p>}
        <ol className="grid gap-2">
          {rules.map((r, i) => (
            <li
              key={r.id}
              draggable={editable}
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => {
                if (drag === null) return;
                e.preventDefault();
                if (drag !== i) {
                  move(drag, i);
                  setDrag(i);
                }
              }}
              onDragEnd={() => setDrag(null)}
              onKeyDown={(e: KeyboardEvent<HTMLLIElement>) => {
                if (!editable || !e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
                e.preventDefault();
                move(i, e.key === "ArrowUp" ? i - 1 : i + 1);
              }}
              className={cn("grid gap-3 rounded-[var(--r-control)] bg-background p-3 shadow-[inset_0_0_0_1px_var(--c-hairline)]", drag === i && "opacity-60 shadow-[inset_0_0_0_1px_var(--ring)]")}
            >
              <div className="flex items-center gap-2">
                {editable && <GripVerticalIcon aria-hidden="true" className="size-4 shrink-0 cursor-grab text-muted-foreground" />}
                <span className="text-[12.5px] font-medium">{t("console.flags.rule_n", { n: i + 1 })}</span>
                {editable && (
                  <span className="ms-auto flex items-center gap-1">
                    <IconButton label={t("console.flags.move_up")} disabled={i === 0} onClick={() => move(i, i - 1)}>
                      <ArrowUpIcon className="size-3.5" />
                    </IconButton>
                    <IconButton label={t("console.flags.move_down")} disabled={i === rules.length - 1} onClick={() => move(i, i + 1)}>
                      <ArrowDownIcon className="size-3.5" />
                    </IconButton>
                    <IconButton label={t("console.flags.remove_rule")} onClick={() => setRules((list) => list.filter((_, n) => n !== i))}>
                      <Trash2Icon className="size-3.5" />
                    </IconButton>
                  </span>
                )}
              </div>
              <div className="grid gap-2">
                {CONDITIONS.map((c) => {
                  const options = c === "plans" ? lists.plans : c === "markets" ? lists.markets : c === "modes" ? lists.modes : c === "storeStatus" ? lists.statuses : lists.roles;
                  const picked = r.when[c] ?? [];
                  return (
                    <fieldset key={c} className="grid gap-1 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-start sm:gap-3">
                      <legend className="sr-only">{t(`console.flags.cond.${c}`)}</legend>
                      <span aria-hidden="true" className="pt-1 text-[12px] text-muted-foreground">
                        {t(`console.flags.cond.${c}`)}
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {options.map((o) => {
                          const on = picked.includes(o);
                          return (
                            <button
                              key={o}
                              type="button"
                              aria-pressed={on}
                              disabled={!editable}
                              onClick={() => patch(i, { when: { ...r.when, [c]: on ? picked.filter((x) => x !== o) : [...picked, o] } })}
                              className={cn(
                                "inline-flex h-6 items-center rounded-full px-2 font-mono text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60 max-md:h-9",
                                on ? "bg-[var(--brand-soft)] font-medium text-[var(--c-brand-ink)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--brand)_35%,transparent)]" : "bg-secondary text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {o}
                            </button>
                          );
                        })}
                      </span>
                    </fieldset>
                  );
                })}
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                <ValueInput type={row.type} value={r.value} onChange={(v) => patch(i, { value: v })} disabled={!editable} problem={tried ? rawProblem(row.type, r.value) : null} label={t("console.flags.rule_value")} />
                <div className="grid content-start gap-1">
                  <label className="text-[11.5px] text-muted-foreground" htmlFor={`${r.id}-rollout`}>
                    {t("console.flags.rollout")}
                  </label>
                  <div className="relative">
                    <input id={`${r.id}-rollout`} dir="ltr" inputMode="numeric" disabled={!editable} value={r.rollout} placeholder="100" aria-invalid={(tried && ruleProblems[i] === "console.flag.rollout_invalid") || undefined} onChange={(e) => patch(i, { rollout: e.target.value.trim() })} className={cn(field, "num pe-7 text-start")} />
                    <span aria-hidden="true" className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">
                      %
                    </span>
                  </div>
                </div>
              </div>
              {tried && ruleProblems[i] === "console.flag.rollout_invalid" && <p className="text-[12px] text-[var(--c-danger-ink)]">{t("console.flag.rollout_invalid")}</p>}
            </li>
          ))}
        </ol>
        {editable && (
          <button
            type="button"
            disabled={rules.length >= RULES_LIMIT}
            onClick={() => setRules((list) => [...list, { id: nextId(), when: {}, value: rawOf(row.type, row.type === "boolean" ? true : row.value), rollout: "" }])}
            className={cn(button.base, button.secondary, "justify-self-start")}
          >
            <PlusIcon aria-hidden="true" className="size-3.5" />
            {t("console.flags.add_rule")}
          </button>
        )}
        {editable && <p className="text-[11.5px] text-muted-foreground">{t("console.flags.reorder_hint")}</p>}
      </section>

      {editable && (
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-end gap-3 rounded-[var(--r-card)] bg-popover px-4 py-3 shadow-[0_12px_40px_-12px_oklch(0.2_0.01_230/0.35),inset_0_0_0_1px_var(--c-hairline)]">
          {g.problem && (
            <p role="alert" className="me-auto text-[12.5px] text-[var(--c-danger-ink)]">
              {g.problem}
            </p>
          )}
          <button type="button" disabled={g.busy} onClick={() => void save()} className={cn(button.base, button.primary)}>
            {t("console.flags.save")}
          </button>
        </div>
      )}

      <Overrides row={row} overrides={overrides} editable={editable} />
      {g.sheet}
    </div>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="inline-grid size-7 place-items-center rounded-[var(--r-control)] text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-40 max-md:size-11">
      {children}
    </button>
  );
}

function ValueInput({ type, value, onChange, disabled, problem, label }: { type: FlagType; value: Raw; onChange(v: Raw): void; disabled: boolean; problem: string | null; label: string }) {
  const t = useT();
  const id = useId();
  return (
    <div className="grid content-start gap-1">
      <label htmlFor={id} className="text-[11.5px] text-muted-foreground">
        {label}
      </label>
      {type === "boolean" ? (
        <span className="inline-flex rounded-[var(--r-control)] bg-secondary p-0.5 justify-self-start" role="radiogroup" aria-label={label}>
          {[true, false].map((v) => (
            <button
              key={String(v)}
              id={v ? id : undefined}
              type="button"
              role="radio"
              aria-checked={value === v}
              disabled={disabled}
              onClick={() => onChange(v)}
              className={cn("h-7 rounded-[calc(var(--r-control)-2px)] px-3 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60 max-md:h-10", value === v ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}
            >
              {t(v ? "console.plans.value.on" : "console.plans.value.off")}
            </button>
          ))}
        </span>
      ) : type === "json" ? (
        <textarea id={id} dir="ltr" rows={5} spellCheck={false} disabled={disabled} value={String(value)} aria-invalid={!!problem || undefined} onChange={(e) => onChange(e.target.value)} className={cn(field, "h-auto resize-y py-2 font-mono text-[12px] leading-[1.5]")} />
      ) : (
        <input id={id} dir={type === "number" ? "ltr" : "auto"} inputMode={type === "number" ? "decimal" : undefined} disabled={disabled} value={String(value)} aria-invalid={!!problem || undefined} onChange={(e) => onChange(e.target.value)} className={cn(field, type === "number" && "num")} />
      )}
      {problem && <p className="text-[12px] text-[var(--c-danger-ink)]">{t(problem)}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overrides                                                           */
/* ------------------------------------------------------------------ */

function Overrides({ row, overrides, editable }: { row: FlagRowView; overrides: FlagOverrideView[]; editable: boolean }) {
  const t = useT();
  const router = useRouter();
  const g = useGuarded("console.flags.override_failed");
  const ids = { scope: useId(), target: useId(), note: useId(), expiry: useId() };
  const [scope, setScope] = useState<OverrideScope>("store");
  const [target, setTarget] = useState("");
  const [value, setValue] = useState<Raw>(rawOf(row.type, row.type === "boolean" ? true : row.value));
  const [note, setNote] = useState("");
  const [expiry, setExpiry] = useState("");

  const remove = async (o: { scope: OverrideScope; scopeId: string }, quiet = false) => {
    const r = await clearFlagOverrideAction({ key: row.key, scope: o.scope, scopeId: o.scopeId }).catch(() => null);
    if (r?.ok) {
      if (!quiet) toast.success(t("console.flags.override_removed"));
      router.refresh();
    } else toast.error(r?.message ? t(r.message) : t("console.flags.override_failed"));
  };

  const add = async () => {
    if (!target.trim() || rawProblem(row.type, value) || note.length > NOTE_LIMIT) return g.setProblem(t(rawProblem(row.type, value) ?? (note.length > NOTE_LIMIT ? "console.flag.note_too_long" : "console.flag.scope_id_invalid")));
    const added = { scope, scopeId: target.trim() };
    await g.run(
      (opId) => setFlagOverrideAction({ key: row.key, ...added, value, note: note.trim() || null, expiresAt: expiry ? new Date(expiry).toISOString() : null, opId }),
      () => {
        toast.success(t("console.flags.override_added"), { duration: 10_000, action: { label: t("console.notes_tab.undo"), onClick: () => void remove(added, true) } });
        setTarget("");
        setNote("");
        setExpiry("");
        g.reset();
        router.refresh();
      },
    );
  };

  return (
    <section aria-labelledby="flag-overrides" className={cn(card, "grid gap-3 px-4 py-4")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="flag-overrides" className="text-[13px] font-semibold">
          {t("console.flags.overrides")}
        </h2>
        <span className="text-[11.5px] text-muted-foreground">{t("console.flags.overrides_lead")}</span>
      </div>
      {overrides.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">{t("console.flags.overrides_none")}</p>
      ) : (
        <ul className="divide-y divide-[var(--c-hairline)] overflow-hidden rounded-[var(--r-control)] shadow-[inset_0_0_0_1px_var(--c-hairline)]">
          {overrides.map((o) => (
            <li key={`${o.scope}:${o.scopeId}`} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[12.5px]", o.expired && "opacity-60")}>
              <span className="inline-flex h-5 items-center rounded-full bg-secondary px-2 text-[11px] font-medium">{t(`console.flags.scope.${o.scope}`)}</span>
              <bdi dir="ltr" className="min-w-0 truncate font-mono text-[12px]">
                {o.scopeId}
              </bdi>
              <span className="font-mono text-[12px]">→ {String(rawOf(row.type, o.value)).slice(0, 60)}</span>
              {o.note && <span className="min-w-0 truncate text-muted-foreground">{o.note}</span>}
              <span className="ms-auto flex items-center gap-2 text-[11.5px] text-muted-foreground">
                {o.expired ? t("console.flags.expired") : o.expiresAt ? <Until iso={o.expiresAt} template="console.flags.expires" /> : t("console.flags.no_expiry")}
                {o.updatedAt && (
                  <span className="hidden md:inline">
                    · {o.updatedBy?.name ?? ""} <Ago iso={o.updatedAt} className="num" />
                  </span>
                )}
                {editable && (
                  <IconButton label={t("console.flags.remove_override")} onClick={() => void remove(o)}>
                    <Trash2Icon className="size-3.5" />
                  </IconButton>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div className="grid gap-3 rounded-[var(--r-control)] bg-background p-3 shadow-[inset_0_0_0_1px_var(--c-hairline)]">
          <h3 className="text-[12.5px] font-medium">{t("console.flags.add_override")}</h3>
          <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
            <div className="grid gap-1">
              <label htmlFor={ids.scope} className="text-[11.5px] text-muted-foreground">
                {t("console.flags.scope")}
              </label>
              <select id={ids.scope} value={scope} onChange={(e) => setScope(e.target.value as OverrideScope)} className={field}>
                {SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {t(`console.flags.scope.${s}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <label htmlFor={ids.target} className="text-[11.5px] text-muted-foreground">
                {t(`console.flags.scope_id.${scope}`)}
              </label>
              <input id={ids.target} dir="ltr" autoComplete="off" spellCheck={false} value={target} onChange={(e) => setTarget(e.target.value)} className={cn(field, "font-mono")} />
            </div>
          </div>
          <ValueInput type={row.type} value={value} onChange={setValue} disabled={false} problem={null} label={t("console.flags.override_value")} />
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
            <div className="grid gap-1">
              <label htmlFor={ids.note} className="text-[11.5px] text-muted-foreground">
                {t("console.flags.note")}
              </label>
              <input id={ids.note} dir="auto" maxLength={NOTE_LIMIT} value={note} onChange={(e) => setNote(e.target.value)} className={field} />
            </div>
            <div className="grid gap-1">
              <label htmlFor={ids.expiry} className="text-[11.5px] text-muted-foreground">
                {t("console.flags.expiry")}
              </label>
              <input id={ids.expiry} type="datetime-local" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={cn(field, "num")} />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {g.problem && (
              <p role="alert" className="me-auto text-[12.5px] text-[var(--c-danger-ink)]">
                {g.problem}
              </p>
            )}
            <button type="button" disabled={g.busy} onClick={() => void add()} className={cn(button.base, button.secondary)}>
              {t("console.flags.add_override")}
            </button>
          </div>
          {g.sheet}
        </div>
      )}
    </section>
  );
}

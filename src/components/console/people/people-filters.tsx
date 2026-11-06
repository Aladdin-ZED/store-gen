"use client";
/**
 * The people list's search and filters (platform.md PLA-§11.1, PD35): everything lives in the URL (`q`, `role`,
 * `banned`, `2fa`, `from`, `to`, `nostore`), a change drops the cursor. The search reads an exact e-mail for every
 * role; admin+ may also type a name prefix or an E.164 phone (the read model decides, `search: "ignored"` otherwise).
 *
 *   <PeopleFilters filter={filter} adminSearch={isAdmin} />
 */
import { ChevronDownIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryState, type QueryPatch } from "@/components/admin/lib/use-query-state";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n/admin/client";
import type { PeopleFilter } from "@/lib/platform/people";
import { cn } from "@/lib/utils";

const ROLES = ["none", "super_admin", "admin", "support", "analyst"] as const;
const KEYS = ["q", "role", "banned", "2fa", "from", "to", "nostore", "cursor"] as const;

const control =
  "inline-flex h-[var(--ctl)] shrink-0 items-center gap-1.5 rounded-[var(--r-control)] px-2.5 text-[12.5px] whitespace-nowrap shadow-[inset_0_0_0_1px_var(--border)] outline-none transition-[background-color,box-shadow] duration-[var(--dur-1)] hover:bg-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)] data-[state=open]:bg-accent max-md:h-11";
const activeControl = "bg-[var(--brand-soft)] text-[var(--c-brand-ink)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--brand)_35%,transparent)]";

function Menu({ label, value, active, current, options, onPick }: { label: string; value: string | null; active: boolean; current: string; options: { value: string; label: string }[]; onPick(v: string): void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(control, active && activeControl)}>
        <span className={cn(!active && "text-muted-foreground")}>{label}</span>
        {value && <span className="max-w-[140px] truncate font-medium">{value}</span>}
        <ChevronDownIcon aria-hidden="true" className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        <DropdownMenuRadioGroup value={current} onValueChange={onPick}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value} className="text-[13px] max-md:min-h-11">
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn(control, on && activeControl)}>
      {children}
    </button>
  );
}

export function PeopleFilters({ filter, adminSearch }: { filter: PeopleFilter; adminSearch: boolean }) {
  const t = useT();
  const query = useQueryState();
  const set = (patch: QueryPatch) => query.set({ ...patch, cursor: null });
  const [value, setValue] = useState(filter.q ?? "");
  const [seen, setSeen] = useState(filter.q ?? "");
  if ((filter.q ?? "") !== seen) {
    setSeen(filter.q ?? "");
    setValue(filter.q ?? "");
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const push = (v: string, now = false) => {
    if (timer.current) clearTimeout(timer.current);
    const go = () => set({ q: v.trim() || null });
    if (now) go();
    else timer.current = setTimeout(go, 320);
  };

  const any = KEYS.some((k) => k !== "cursor" && query.get(k));
  const bool = (v: boolean | undefined) => (v === undefined ? "" : v ? "1" : "0");

  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative w-full md:w-[320px]">
          <label htmlFor="people-search" className="sr-only">
            {t("console.people.search.label")}
          </label>
          <SearchIcon aria-hidden="true" className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            id="people-search"
            type="search"
            dir="auto"
            autoComplete="off"
            spellCheck={false}
            value={value}
            placeholder={t(adminSearch ? "console.people.search.admin" : "console.people.search.email")}
            onChange={(e) => {
              setValue(e.target.value);
              push(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") push(value, true);
            }}
            className="h-[var(--ctl)] w-full rounded-[var(--r-control)] bg-background ps-8 pe-3 text-[13px] shadow-[inset_0_0_0_1px_var(--input)] outline-none placeholder:text-muted-foreground focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)] max-md:h-11"
          />
        </div>
        <Menu
          label={t("console.people.filter.role")}
          value={filter.role ? t(filter.role === "none" ? "console.people.role.none" : `console.role.${filter.role}`) : null}
          active={!!filter.role}
          current={filter.role ?? ""}
          options={[{ value: "", label: t("console.people.filter.any") }, ...ROLES.map((r) => ({ value: r, label: t(r === "none" ? "console.people.role.none" : `console.role.${r}`) }))]}
          onPick={(v) => set({ role: v || null })}
        />
        <Menu
          label={t("console.people.filter.2fa")}
          value={filter.twoFactor === undefined ? null : t(filter.twoFactor ? "console.people.2fa.on" : "console.people.2fa.off")}
          active={filter.twoFactor !== undefined}
          current={bool(filter.twoFactor)}
          options={[
            { value: "", label: t("console.people.filter.any") },
            { value: "1", label: t("console.people.2fa.on") },
            { value: "0", label: t("console.people.2fa.off") },
          ]}
          onPick={(v) => set({ "2fa": v || null })}
        />
        <Toggle on={filter.banned === true} onClick={() => set({ banned: filter.banned ? null : "1" })}>
          {t("console.people.filter.banned")}
        </Toggle>
        <Toggle on={filter.noStore === true} onClick={() => set({ nostore: filter.noStore ? null : "1" })}>
          {t("console.people.filter.no_store")}
        </Toggle>
        <div className="flex items-center gap-1.5">
          <label className="sr-only" htmlFor="people-from">
            {t("console.people.filter.from")}
          </label>
          <input id="people-from" type="date" value={filter.createdFrom ?? ""} onChange={(e) => set({ from: e.target.value || null })} className={cn(control, "num text-[12px]", filter.createdFrom && activeControl)} aria-label={t("console.people.filter.from")} />
          <span aria-hidden="true" className="text-muted-foreground">
            –
          </span>
          <label className="sr-only" htmlFor="people-to">
            {t("console.people.filter.to")}
          </label>
          <input id="people-to" type="date" value={filter.createdTo ?? ""} onChange={(e) => set({ to: e.target.value || null })} className={cn(control, "num text-[12px]", filter.createdTo && activeControl)} aria-label={t("console.people.filter.to")} />
        </div>
        {any && (
          <button
            type="button"
            onClick={() => query.set(Object.fromEntries(KEYS.map((k) => [k, null])))}
            className="inline-flex h-[var(--ctl)] items-center gap-1 rounded-[var(--r-control)] px-2 text-[12.5px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:h-11"
          >
            <XIcon aria-hidden="true" className="size-3.5" />
            {t("console.people.clear")}
          </button>
        )}
      </div>
    </div>
  );
}

"use client";
/**
 * The stores list's filter bar (platform.md PLA-§6.1 "Filters, columns, sorting"; PLA-§4.5 "Lists"): the saved chips
 * (Needs attention, In review, Restricted, Suspended, Dormant, Quota ≥ 80 %, Sync errors, Internal), the search (a
 * name or handle prefix, or an exact owner e-mail; `/` focuses it), status (several), mode, plan, market, risk band,
 * health flag, attention, dormant and the sort. Everything lives in the URL (`useQueryState`, as orders-view.tsx), so
 * every view is linkable from ⌘K and notes; a change drops the cursor.
 *
 *   <StoresFilters filter={page.filter} plans={[{ id: "internal", name: "Internal" }]} markets={["MA", "FR"]} />
 */
import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryState, type QueryPatch } from "@/components/admin/lib/use-query-state";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n/admin/client";
import { chipOf, SAVED_CHIPS, STORE_BANDS, STORE_FLAG_CODES, STORE_MODES, STORE_SORTS, STORE_STATUSES, type SavedChip, type StoresFilter } from "@/lib/platform/stores-filter";
import { cn } from "@/lib/utils";

const CHIP_ORDER: readonly SavedChip[] = ["attention", "in_review", "restricted", "suspended", "dormant", "quota_80", "sync_errors", "internal"];
/** every key a filter writes (a saved chip replaces them all) */
const FILTER_KEYS = ["status", "mode", "plan", "market", "band", "flag", "attention", "dormant", "q", "sort", "cursor"] as const;

const control =
  "inline-flex h-[var(--ctl)] shrink-0 items-center gap-1.5 rounded-[var(--r-control)] px-2.5 text-[12.5px] whitespace-nowrap shadow-[inset_0_0_0_1px_var(--border)] outline-none transition-[background-color,box-shadow] duration-[var(--dur-1)] hover:bg-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)] data-[state=open]:bg-accent max-md:h-11";

function Menu({ label, value, children, active }: { label: string; value: string | null; children: ReactNode; active: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(control, active && "bg-[var(--brand-soft)] text-[var(--c-brand-ink)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--brand)_35%,transparent)]")}>
        <span className={cn(!active && "text-muted-foreground")}>{label}</span>
        {value && <span className="max-w-[160px] truncate font-medium">{value}</span>}
        <ChevronDownIcon aria-hidden="true" className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[min(420px,70dvh)] min-w-[220px] overflow-y-auto">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Search({ q, onSearch }: { q: string; onSearch(v: string): void }) {
  const t = useT();
  const [value, setValue] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // a URL change (back, Clear filters) puts its query in the field
  const [seenQ, setSeenQ] = useState(q);
  if (q !== seenQ) {
    setSeenQ(q);
    setValue(q);
  }
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const push = (v: string, now = false) => {
    if (timer.current) clearTimeout(timer.current);
    if (now) onSearch(v.trim());
    else timer.current = setTimeout(() => onSearch(v.trim()), 280);
  };
  return (
    <div className="relative w-full md:w-[260px]">
      <label htmlFor="stores-search" className="sr-only">
        {t("console.stores.search.label")}
      </label>
      <SearchIcon aria-hidden="true" className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        id="stores-search"
        data-page-search
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={t("console.stores.search.placeholder")}
        onChange={(e) => {
          setValue(e.target.value);
          push(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") push(value, true);
          if (e.key === "Escape") {
            if (value) {
              setValue("");
              push("", true);
            } else (e.target as HTMLInputElement).blur();
          }
        }}
        className="h-[var(--ctl)] w-full rounded-[var(--r-control)] bg-background ps-8 pe-7 text-[13px] shadow-[inset_0_0_0_1px_var(--input)] outline-none transition-shadow duration-[var(--dur-1)] placeholder:text-muted-foreground focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)] max-md:h-11 [&::-webkit-search-cancel-button]:hidden"
      />
      {!value && (
        <kbd aria-hidden="true" className="pointer-events-none absolute end-2 top-1/2 hidden -translate-y-1/2 rounded-[4px] border border-border px-1 font-mono text-[10px] text-muted-foreground md:block">
          /
        </kbd>
      )}
    </div>
  );
}

export function hasFilters(f: StoresFilter): boolean {
  return Object.entries(f).some(([k, v]) => k !== "sort" && v !== undefined && v !== false && !(Array.isArray(v) && v.length === 0));
}

export function StoresFilters({ filter, plans, markets }: { filter: StoresFilter; plans: { id: string; name: string }[]; markets: readonly string[] }) {
  const t = useT();
  const query = useQueryState();
  const chip = chipOf(filter);
  const set = (patch: QueryPatch) => query.set({ ...patch, cursor: null });
  const status = filter.status ?? [];
  const toggleStatus = (s: string) => {
    const next = status.includes(s as (typeof status)[number]) ? status.filter((x) => x !== s) : [...status, s];
    set({ status: next.length ? next.join(",") : null });
  };
  const applyChip = (id: SavedChip) => {
    const clear: QueryPatch = Object.fromEntries(FILTER_KEYS.map((k) => [k, null]));
    if (chip === id) return query.set({ ...clear, sort: filter.sort ?? null });
    const c = SAVED_CHIPS[id] as StoresFilter;
    query.set({
      ...clear,
      sort: filter.sort ?? null,
      ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v === true ? "1" : String(v)])),
    });
  };
  const any = hasFilters(filter);
  const labelOf = (list: readonly string[] | undefined, key: (v: string) => string) => (list && list.length ? (list.length === 1 ? key(list[0]!) : t("console.stores.filter.n_selected", { count: list.length })) : null);

  return (
    <div className={cn("grid gap-2.5", query.pending && "[&_[data-busy]]:opacity-60")}>
      <div role="group" aria-label={t("console.stores.chips.label")} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
        {CHIP_ORDER.map((id) => {
          const on = chip === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => applyChip(id)}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-3 text-[12.5px] whitespace-nowrap outline-none transition-[background-color,box-shadow,color] duration-[var(--dur-1)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:h-10",
                on ? "bg-[var(--brand)] font-medium text-[var(--brand-foreground)]" : "text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent hover:text-foreground",
              )}
            >
              {on && <CheckIcon aria-hidden="true" className="-ms-0.5 size-3.5" />}
              {t(`console.stores.chip.${id}`)}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Search q={filter.q ?? ""} onSearch={(v) => set({ q: v || null })} />
        <Menu label={t("console.stores.filter.status")} value={labelOf(status, (v) => t(`console.status.${v}`))} active={status.length > 0}>
          <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">{t("console.stores.filter.status_hint")}</DropdownMenuLabel>
          {STORE_STATUSES.filter((s) => s !== "purged").map((s) => (
            <DropdownMenuCheckboxItem key={s} checked={status.includes(s)} onSelect={(e) => e.preventDefault()} onCheckedChange={() => toggleStatus(s)} className="text-[13px] max-md:min-h-11">
              {t(`console.status.${s}`)}
            </DropdownMenuCheckboxItem>
          ))}
        </Menu>
        <Menu label={t("console.stores.filter.mode")} value={filter.mode ? t(`console.mode.${filter.mode}`) : null} active={!!filter.mode}>
          <DropdownMenuRadioGroup value={filter.mode ?? ""} onValueChange={(v) => set({ mode: v || null })}>
            <DropdownMenuRadioItem value="" className="text-[13px] max-md:min-h-11">
              {t("console.stores.filter.any")}
            </DropdownMenuRadioItem>
            {STORE_MODES.map((m) => (
              <DropdownMenuRadioItem key={m} value={m} className="text-[13px] max-md:min-h-11">
                {t(`console.mode.${m}`)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </Menu>
        <Menu label={t("console.stores.filter.plan")} value={filter.plan ? (plans.find((p) => p.id === filter.plan)?.name ?? filter.plan) : null} active={!!filter.plan}>
          <DropdownMenuRadioGroup value={filter.plan ?? ""} onValueChange={(v) => set({ plan: v || null })}>
            <DropdownMenuRadioItem value="" className="text-[13px] max-md:min-h-11">
              {t("console.stores.filter.any")}
            </DropdownMenuRadioItem>
            {plans.map((p) => (
              <DropdownMenuRadioItem key={p.id} value={p.id} className="text-[13px] max-md:min-h-11">
                {p.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </Menu>
        <Menu label={t("console.stores.filter.market")} value={filter.market ?? null} active={!!filter.market}>
          <DropdownMenuRadioGroup value={filter.market ?? ""} onValueChange={(v) => set({ market: v || null })}>
            <DropdownMenuRadioItem value="" className="text-[13px] max-md:min-h-11">
              {t("console.stores.filter.any")}
            </DropdownMenuRadioItem>
            {markets.map((m) => (
              <DropdownMenuRadioItem key={m} value={m} className="font-mono text-[12.5px] max-md:min-h-11">
                {m}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </Menu>
        <Menu label={t("console.stores.filter.band")} value={labelOf(filter.band, (v) => t(`console.band.${v}`))} active={!!filter.band?.length}>
          {STORE_BANDS.map((b) => (
            <DropdownMenuCheckboxItem
              key={b}
              checked={!!filter.band?.includes(b)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => {
                const cur = filter.band ?? [];
                const next = cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b];
                set({ band: next.length ? next.join(",") : null });
              }}
              className="text-[13px] max-md:min-h-11"
            >
              {t(`console.band.${b}`)}
            </DropdownMenuCheckboxItem>
          ))}
        </Menu>
        <Menu label={t("console.stores.filter.flag")} value={labelOf(filter.flag, (v) => t(`console.hflag.${v}`))} active={!!filter.flag?.length}>
          {STORE_FLAG_CODES.map((f) => (
            <DropdownMenuCheckboxItem
              key={f}
              checked={!!filter.flag?.includes(f)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => {
                const cur = filter.flag ?? [];
                const next = cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f];
                set({ flag: next.length ? next.join(",") : null });
              }}
              className="text-[13px] max-md:min-h-11"
            >
              {t(`console.hflag.${f}`)}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={!!filter.attention} onSelect={(e) => e.preventDefault()} onCheckedChange={(v) => set({ attention: v ? "1" : null })} className="text-[13px] max-md:min-h-11">
            {t("console.stores.filter.attention")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={!!filter.dormant} onSelect={(e) => e.preventDefault()} onCheckedChange={(v) => set({ dormant: v ? "1" : null })} className="text-[13px] max-md:min-h-11">
            {t("console.stores.filter.dormant")}
          </DropdownMenuCheckboxItem>
        </Menu>

        <span className="ms-auto flex items-center gap-1.5 max-md:ms-0">
          {any && (
            <button type="button" onClick={() => query.set({ ...Object.fromEntries(FILTER_KEYS.map((k) => [k, null])), sort: filter.sort ?? null })} className={cn(control, "text-muted-foreground shadow-none")}>
              <XIcon aria-hidden="true" className="size-3.5" />
              {t("console.stores.clear")}
            </button>
          )}
          <Menu label={t("console.stores.sort.label")} value={t(`console.stores.sort.${filter.sort ?? "created"}`)} active={false}>
            <DropdownMenuRadioGroup value={filter.sort ?? "created"} onValueChange={(v) => set({ sort: v === "created" ? null : v })}>
              {STORE_SORTS.map((s) => (
                <DropdownMenuRadioItem key={s} value={s} className="text-[13px] max-md:min-h-11">
                  {t(`console.stores.sort.${s}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </Menu>
        </span>
      </div>
    </div>
  );
}

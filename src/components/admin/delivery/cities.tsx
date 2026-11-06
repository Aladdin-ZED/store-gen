"use client";
/**
 * The cities column of the delivery editor (landing.md LAN-§7.3): a folded search over the market's cities in fr and
 * ar (and the English exonym), rows keyed by `CityKey` with the fr and ar labels and the zone pill, filter chips All ·
 * Unassigned · per zone, tap or Space to select, Shift to select a range, then "Move to zone". The browser posts keys,
 * never labels; moving a city takes it out of its old zone, so the UI can't make a city sit in two zones.
 */
import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from "lucide-react";
import { useDeferredValue, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { DeliveryZoneRow } from "@/lib/delivery/types";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { cityMatches, fold, STAR, zoneOfCity, type CityRow } from "./model";

type Filter = "all" | "none" | string;

export function CitiesColumn({
  cities,
  zones,
  canWrite,
  onMove,
  className,
}: {
  cities: CityRow[];
  zones: DeliveryZoneRow[];
  canWrite: boolean;
  onMove: (keys: string[], zoneId: string | null) => void;
  className?: string;
}) {
  const t = useT();
  const id = useId();
  const [query, setQuery] = useState("");
  const q = fold(useDeferredValue(query));
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<number | null>(null);
  const star = zones.find((z) => z.cities.includes(STAR)) ?? null;

  const owner = useMemo(() => {
    const m = new Map<string, DeliveryZoneRow>();
    for (const c of cities) {
      const z = zoneOfCity(zones, c.key);
      if (z) m.set(c.key, z);
    }
    return m;
  }, [cities, zones]);

  const rows = useMemo(
    () =>
      cities.filter((c) => {
        if (!cityMatches(c, q)) return false;
        if (filter === "all") return true;
        const z = owner.get(c.key);
        return filter === "none" ? !z : z?.id === filter;
      }),
    [cities, q, filter, owner],
  );
  const unassigned = cities.filter((c) => !owner.has(c.key)).length;

  const toggle = (i: number, shift: boolean) => {
    const row = rows[i];
    if (!row || !canWrite) return;
    setSelected((cur) => {
      const next = new Set(cur);
      if (shift && anchor.current !== null) {
        const [a, b] = [Math.min(anchor.current, i), Math.max(anchor.current, i)];
        for (const r of rows.slice(a, b + 1)) next.add(r.key);
      } else if (next.has(row.key)) next.delete(row.key);
      else next.add(row.key);
      return next;
    });
    anchor.current = i;
  };
  const move = (zoneId: string | null) => {
    onMove([...selected], zoneId);
    setSelected(new Set());
    anchor.current = null;
  };

  const chips: { id: Filter; label: string; n: number }[] = [
    { id: "all", label: t("landing.dz.cities.all"), n: cities.length },
    { id: "none", label: t("landing.dz.cities.unassigned"), n: unassigned },
    ...zones.filter((z) => !z.cities.includes(STAR) || z.cities.length > 1).map((z) => ({ id: z.id, label: z.name, n: cities.filter((c) => owner.get(c.key)?.id === z.id).length })),
  ];

  return (
    <section aria-labelledby={`${id}-h`} className={cn("flex min-h-0 flex-col", className)}>
      <div className="sticky top-0 z-10 grid gap-3 bg-card pb-3">
        <h3 id={`${id}-h`} className="px-1 text-sm font-semibold">
          {t("landing.dz.cities.title")}
        </h3>
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-q`} className="px-1 text-xs font-medium text-muted-foreground">
            {t("landing.dz.cities.search")}
          </label>
          <div className="relative">
            <SearchIcon aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id={`${id}-q`}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              className="h-11 w-full rounded-xl bg-background ps-9 pe-3 text-sm ring-1 ring-border outline-none transition-shadow duration-200 focus-visible:ring-2 focus-visible:ring-ring/60 sm:h-10"
            />
          </div>
        </div>
        <div role="group" aria-label={t("landing.dz.cities.filter")} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 adm-scroll">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={filter === c.id}
              onClick={() => setFilter(c.id)}
              className={cn(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs ring-1 transition-colors duration-200 ease-out outline-none ring-inset focus-visible:ring-2 focus-visible:ring-ring/60",
                filter === c.id ? "bg-foreground text-background ring-foreground" : "text-muted-foreground ring-border hover:text-foreground",
              )}
            >
              <span className="max-w-40 truncate">{c.label}</span>
              <span className="tabular-nums opacity-70">{c.n}</span>
            </button>
          ))}
        </div>
        {canWrite && selected.size > 0 && (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-foreground/[0.04] px-3 py-2 ring-1 ring-border">
            <span className="text-sm font-medium tabular-nums">{t("landing.dz.cities.selected", { n: selected.size })}</span>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="sm" className="h-9 rounded-lg" onClick={() => setSelected(new Set())} aria-label={t("landing.dz.cities.clear")}>
                <XIcon aria-hidden="true" className="size-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="sm" className="h-9 gap-1 rounded-lg">
                    {t("landing.dz.cities.moveTo")}
                    <ChevronDownIcon aria-hidden="true" className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-52 rounded-xl">
                  {zones.map((z) => (
                    <DropdownMenuItem key={z.id} onSelect={() => move(z.id)}>
                      {z.name}
                    </DropdownMenuItem>
                  ))}
                  {zones.length > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuItem onSelect={() => move(null)}>{star ? t("landing.dz.cities.toRest", { zone: star.name }) : t("landing.dz.cities.toNone")}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-muted-foreground">{t("landing.dz.cities.noMatch")}</p>
      ) : (
        <ul className="grid gap-px overflow-hidden rounded-xl ring-1 ring-border" aria-label={t("landing.dz.cities.title")}>
          {rows.map((c, i) => {
            const z = owner.get(c.key);
            const on = selected.has(c.key);
            return (
              <li key={c.key}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  disabled={!canWrite}
                  onClick={(e) => toggle(i, e.shiftKey)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 bg-card px-3 py-2 text-start text-sm outline-none transition-colors duration-150 ease-out focus-visible:relative focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset disabled:cursor-default",
                    on ? "bg-foreground/[0.05]" : canWrite && "hover:bg-foreground/[0.025]",
                  )}
                >
                  {canWrite && (
                    <span aria-hidden="true" className={cn("flex size-4 shrink-0 items-center justify-center rounded-[5px] ring-1 transition-colors", on ? "bg-foreground text-background ring-foreground" : "ring-foreground/25")}>
                      {on && <CheckIcon className="size-3" strokeWidth={3} />}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{c.fr}</span>
                  <span lang="ar" dir="rtl" className="hidden min-w-0 truncate text-muted-foreground sm:block">
                    {c.ar}
                  </span>
                  <span
                    className={cn(
                      "max-w-32 shrink-0 truncate rounded-full px-2 py-0.5 text-[0.7rem] font-medium",
                      z ? (z.notServed ? "bg-destructive/10 text-destructive" : "bg-foreground/[0.06] text-foreground/80") : star ? "text-muted-foreground" : "text-muted-foreground italic",
                    )}
                  >
                    {z ? z.name : star ? star.name : t("landing.dz.cities.none")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

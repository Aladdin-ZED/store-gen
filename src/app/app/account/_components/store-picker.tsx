"use client";

import { PlusIcon, SearchIcon, ShieldIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { setLastStoreAction } from "@/lib/auth/actions";
import { useAuthT } from "@/lib/auth/i18n/client";
import type { MembershipSummary } from "@/lib/auth/landing";
import { cn } from "@/lib/utils";
import { Monogram, Pill } from "@/app/(public)/_components/kit";
import { storeStatusTone } from "./store-status";

type PickerStore = MembershipSummary & { usable: boolean; href: string };

const card =
  "group relative grid min-h-[8.5rem] content-between gap-4 rounded-[12px] border border-[color-mix(in_oklab,var(--foreground)_9%,transparent)] bg-card p-4 text-start outline-none transition-[border-color,background-color] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * PLA-§22.3: the store cards (monogram, name, @handle, mode, state, the viewer's role), "Create a store" and, for
 * staff, the console. Arrow keys move between cards, Enter opens one, `/` focuses the filter (above 6 stores).
 * Choosing a store remembers it on the session (a picker hint, never an authorisation) and opens its dashboard.
 */
export function StorePicker({ stores, canCreate, console: showConsole }: { stores: PickerStore[]; canCreate: boolean; console: boolean }) {
  const t = useAuthT();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [, start] = useTransition();
  const grid = useRef<HTMLDivElement>(null);
  const filter = useRef<HTMLInputElement>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? stores.filter((s) => s.name.toLowerCase().includes(q) || s.handle.includes(q)) : stores;
  }, [stores, query]);

  const open = (s: PickerStore) => {
    setOpening(s.storeId);
    start(async () => {
      await setLastStoreAction(s.storeId).catch(() => undefined);
      router.push(s.href);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "/" && filter.current && document.activeElement !== filter.current) {
      e.preventDefault();
      filter.current.focus();
      return;
    }
    const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"];
    if (!keys.includes(e.key) || !grid.current) return;
    const cards = [...grid.current.querySelectorAll<HTMLElement>("[data-card]")];
    const at = cards.indexOf(document.activeElement as HTMLElement);
    if (at === -1) return;
    e.preventDefault();
    const rtl = getComputedStyle(grid.current).direction === "rtl";
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : (e.key === "ArrowRight") !== rtl ? 1 : -1;
    cards[Math.max(0, Math.min(cards.length - 1, at + step))]?.focus();
  };

  return (
    <div className="grid gap-5" onKeyDown={onKeyDown}>
      {stores.length > 6 && (
        <div className="relative max-w-sm">
          <SearchIcon aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input ref={filter} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("app.picker.filter")} aria-label={t("app.picker.filter")} className="h-10 bg-card ps-9" />
        </div>
      )}
      <div ref={grid} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((s) => (
          <button
            key={s.storeId}
            type="button"
            data-card
            disabled={!s.usable || opening !== null}
            onClick={() => open(s)}
            className={cn(card, s.usable ? "hover:border-[color-mix(in_oklab,var(--foreground)_18%,transparent)] hover:bg-[color-mix(in_oklab,var(--card),var(--foreground)_2%)]" : "cursor-not-allowed opacity-60", opening === s.storeId && "border-brand/40")}
          >
            <div className="flex items-start gap-3">
              <Monogram name={s.name} seed={s.storeId} size="lg" />
              <div className="grid min-w-0 gap-0.5">
                <span className="truncate text-[0.95rem] font-semibold tracking-[-0.01em]">{s.name}</span>
                <bdi dir="ltr" className="truncate text-xs text-muted-foreground">
                  @{s.handle}
                </bdi>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill tone={storeStatusTone(s.storeStatus)}>{t(`app.status.${s.storeStatus}`)}</Pill>
              <Pill>{t(`app.mode.${s.mode}`)}</Pill>
              <span className="ms-auto text-xs text-muted-foreground">{s.status === "suspended" ? t("app.member.suspended") : t(`team.role.${s.role}`)}</span>
            </div>
            {/* the selected card's one-line confirmation: a hairline that draws in, no spinner */}
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-x-4 bottom-0 h-px origin-left rtl:origin-right scale-x-0 bg-brand transition-transform duration-240 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none",
                opening === s.storeId && "scale-x-100",
              )}
            />
          </button>
        ))}
        {canCreate ? (
          <Link data-card href="/app/new" className={cn(card, "content-center justify-items-center border-dashed text-center text-muted-foreground hover:border-[color-mix(in_oklab,var(--foreground)_22%,transparent)] hover:text-foreground")}>
            <PlusIcon aria-hidden="true" className="size-5" />
            <span className="text-sm font-medium">{t("app.picker.create")}</span>
          </Link>
        ) : (
          <div className={cn(card, "content-center justify-items-center border-dashed text-center text-xs text-muted-foreground")}>{t("app.picker.create_limit")}</div>
        )}
        {showConsole && (
          <Link data-card href="/admin" className={cn(card, "content-center justify-items-center text-center hover:border-[oklch(0.6_0.1_205/0.45)]")}>
            <ShieldIcon aria-hidden="true" className="size-5 text-[oklch(0.5_0.09_205)] dark:text-[oklch(0.78_0.08_205)]" />
            <span className="text-sm font-medium">{t("app.bar.console")}</span>
          </Link>
        )}
      </div>
      {shown.length === 0 && <p className="text-sm text-muted-foreground">{t("app.picker.no_match")}</p>}
    </div>
  );
}

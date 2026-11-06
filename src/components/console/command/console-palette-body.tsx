"use client";
/**
 * The console ⌘K itself (platform.md PLA-§4.4, design.md DES-§16.10; UX-02 console side), code-split out of the shell
 * by ./console-palette.tsx. Sources, in order:
 *   1. typed patterns that act at once: `@handle`, an order id (the ORDER_ID rule), a 26-character id, an e-mail;
 *   2. `GET /api/admin/search?q=` (2 characters or more, 120 ms debounce, skeleton rows after 150 ms kept ≥ 300 ms):
 *      stores, people (masked per role on the server), the open reviews of the matched stores, an order card;
 *   3. actions the server granted (`shell.can`): Approve next, Start view as…, New invite code, Invite staff, Open kill
 *      switches (opens the page, never toggles, PD43), Go to every nav item, Toggle density, Toggle theme.
 * Every row is a cmdk item, so the whole list is reachable with the keyboard only.
 */
import { Command } from "cmdk";
import {
  ArrowUpRightIcon,
  AtSignIcon,
  EyeIcon,
  HashIcon,
  KeyRoundIcon,
  KeyboardIcon,
  ListChecksIcon,
  MailIcon,
  OctagonPauseIcon,
  ReceiptTextIcon,
  Rows3Icon,
  SearchIcon,
  StoreIcon,
  SunMoonIcon,
  UserPlusIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StatusPill } from "@/components/admin/common/status-pill";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/admin/client";
import type { ConsoleSearchResult } from "@/lib/platform/search";
import { formatMoney } from "@/lib/markets/money";
import { consoleIcon } from "../icons";
import { useConsoleShell } from "../shell/context";
import styles from "../shell/console.module.css";
import { consoleUrl } from "@/lib/platform/console-url";

const ORDER_ID = /^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$/;
const ULID = /^[0-9A-Z]{26}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HANDLE = /^@([a-z0-9][a-z0-9-]{0,29})$/;
const DEBOUNCE_MS = 120;
const SKELETON_AFTER_MS = 150;
const SKELETON_MIN_MS = 300;

type Pattern = { kind: "handle"; value: string } | { kind: "order"; value: string } | { kind: "id"; value: string } | { kind: "email"; value: string } | null;

function patternOf(q: string): Pattern {
  const h = HANDLE.exec(q.toLowerCase());
  if (h) return { kind: "handle", value: h[1]! };
  const upper = q.toUpperCase();
  if (ORDER_ID.test(upper)) return { kind: "order", value: upper };
  if (ULID.test(upper)) return { kind: "id", value: upper };
  if (EMAIL.test(q)) return { kind: "email", value: q.toLowerCase() };
  return null;
}

type SearchState = { q: string; data: ConsoleSearchResult | null; error: "limited" | "failed" | null };

/** Skeleton rows only when a search takes more than 150 ms, and then for at least 300 ms (no flash either way). */
function useSkeleton(loading: boolean): boolean {
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (loading && shown === null) {
      const id = setTimeout(() => setShown(Date.now()), SKELETON_AFTER_MS);
      return () => clearTimeout(id);
    }
    if (!loading && shown !== null) {
      const id = setTimeout(() => setShown(null), Math.max(0, SKELETON_MIN_MS - (Date.now() - shown)));
      return () => clearTimeout(id);
    }
  }, [loading, shown]);
  return shown !== null;
}

function Row({ icon: Icon, children, hint, chord, mono }: { icon: LucideIcon; children: ReactNode; hint?: ReactNode; chord?: string; mono?: boolean }) {
  return (
    <>
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground group-data-[selected=true]:text-[var(--c-brand-ink)]" />
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className={cn("truncate", mono && "font-mono text-[12px]")}>{children}</span>
        {hint && <span className="truncate text-[12px] text-muted-foreground">{hint}</span>}
      </span>
      {chord && (
        <span className="hidden shrink-0 items-center gap-1 md:flex" aria-hidden="true">
          <Kbd>G</Kbd>
          <Kbd>{chord.toUpperCase()}</Kbd>
        </span>
      )}
    </>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-border bg-background px-1 font-mono text-[11px] leading-none text-muted-foreground">{children}</kbd>;
}

const itemClass =
  "group relative flex min-h-[var(--row)] cursor-default select-none items-center gap-3 rounded-[var(--r-control)] px-3 py-1.5 text-[13px] outline-none data-[selected=true]:bg-accent data-[disabled=true]:opacity-50 data-[selected=true]:before:absolute data-[selected=true]:before:inset-y-1.5 data-[selected=true]:before:start-0 data-[selected=true]:before:w-0.5 data-[selected=true]:before:rounded-full data-[selected=true]:before:bg-brand max-md:min-h-11";
const groupClass = "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground";

export function ConsolePaletteBody({ mode, onMode, close }: { mode: "default" | "view_as"; onMode(m: "default" | "view_as"): void; close(): void }) {
  const t = useT();
  const router = useRouter();
  const shell = useConsoleShell();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchState>({ q: "", data: null, error: null });
  const q = query.trim();
  const searching = q.length >= 2;
  const pattern = mode === "default" ? patternOf(q) : null;

  useEffect(() => {
    if (!searching) return;
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, { cache: "no-store", credentials: "same-origin", signal: ctrl.signal });
        if (res.status === 429) return setResult({ q, data: null, error: "limited" });
        if (!res.ok) return setResult({ q, data: null, error: "failed" });
        setResult({ q, data: (await res.json()) as ConsoleSearchResult, error: null });
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") setResult({ q, data: null, error: "failed" });
      }
    }, DEBOUNCE_MS);
    return () => {
      ctrl.abort();
      clearTimeout(id);
    };
  }, [q, searching]);

  const loading = searching && result.q !== q;
  const skeleton = useSkeleton(loading);
  const data = searching && result.q === q ? result.data : null;
  const error = searching && result.q === q ? result.error : null;

  const go = (href: string) => {
    close();
    router.push(href);
  };

  const navItems = useMemo(() => shell.nav.flatMap((g) => g.items), [shell.nav]);

  // the typed pattern's target, from the server's answer when it has one
  const patternHref = (() => {
    if (!pattern) return null;
    switch (pattern.kind) {
      case "handle":
        return data?.stores.find((s) => s.handle === pattern.value)?.href ?? consoleUrl(`/stores?q=${encodeURIComponent(`@${pattern.value}`)}`);
      case "order":
        return consoleUrl(`/orders?id=${encodeURIComponent(pattern.value)}`);
      case "id":
        return data?.stores[0]?.href ?? data?.people[0]?.href ?? consoleUrl(`/stores/${pattern.value}`);
      case "email":
        return data?.people[0]?.href ?? consoleUrl(`/users?q=${encodeURIComponent(pattern.value)}`);
    }
  })();

  const actions: { id: string; label: string; icon: LucideIcon; run(): void; show: boolean }[] = [
    { id: "approve_next", label: t("console.cmdk.action.approve_next"), icon: ListChecksIcon, show: shell.can("signups.decide"), run: () => go(consoleUrl("/queue?tab=review&next=1")) },
    { id: "view_as", label: t("console.cmdk.action.view_as"), icon: EyeIcon, show: shell.can("stores.impersonate"), run: () => (setQuery(""), onMode("view_as")) },
    { id: "invite_code", label: t("console.cmdk.action.invite_code"), icon: KeyRoundIcon, show: shell.can("signups.decide"), run: () => go(consoleUrl("/settings/signup?tab=codes&new=1")) },
    { id: "invite_staff", label: t("console.cmdk.action.invite_staff"), icon: UserPlusIcon, show: shell.can("staff.manage"), run: () => go(consoleUrl("/security/staff?invite=1")) },
    { id: "kill", label: t("console.cmdk.action.kill"), icon: OctagonPauseIcon, show: shell.can("console.read"), run: () => go(consoleUrl("/flags?tab=kill")) },
    { id: "density", label: t("console.cmdk.action.density"), icon: Rows3Icon, show: true, run: () => (close(), shell.toggleDensity()) },
    { id: "theme", label: t("console.cmdk.action.theme"), icon: SunMoonIcon, show: true, run: () => (close(), shell.toggleTheme()) },
    { id: "shortcuts", label: t("console.cmdk.action.shortcuts"), icon: KeyboardIcon, show: true, run: () => (close(), shell.openShortcuts()) },
  ];

  // the local rows (actions, Go to) filter on the label as the person types; the server answers the rest
  const needle = q.toLowerCase();
  const shownActions = mode === "default" ? actions.filter((a) => a.show && (!needle || a.label.toLowerCase().includes(needle))) : [];
  const shownNav = mode === "default" ? navItems.filter((i) => !needle || t(i.label).toLowerCase().includes(needle)) : [];
  const stores = data?.stores ?? [];
  const people = mode === "default" ? (data?.people ?? []) : [];
  const reviews = mode === "default" ? (data?.reviews ?? []) : [];
  const order = mode === "default" ? (data?.order ?? null) : null;
  const nothing = searching && !loading && !error && !pattern && stores.length + people.length + reviews.length + shownActions.length + shownNav.length === 0 && !order;

  return (
    <Command loop shouldFilter={false} label={t("console.cmdk.title")} className="flex h-full min-h-0 flex-col max-md:flex-col-reverse">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--c-hairline)] px-4 max-md:border-t max-md:border-b-0">
        <SearchIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="shrink-0 rounded-[var(--r-chip)] bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-[var(--c-brand-ink)]">{t("console.cmdk.prefix")}</span>
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && query === "" && mode === "view_as") onMode("default");
          }}
          placeholder={t(mode === "view_as" ? "console.cmdk.view_as_placeholder" : "console.cmdk.placeholder")}
          className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground max-md:h-14 max-md:text-base"
        />
        {mode === "view_as" && <span className="shrink-0 text-[12px] text-muted-foreground">{t("console.cmdk.action.view_as")}</span>}
      </div>

      <Command.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 md:max-h-[min(60vh,420px)]">
        {skeleton && (
          <div aria-hidden="true" className={cn(styles.skeleton, "grid gap-1 p-1.5")}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex h-[var(--row)] items-center gap-3 px-1.5">
                <div className={cn(styles.bone, "size-4")} />
                <div className={cn(styles.bone, "h-3")} style={{ width: `${48 - i * 9}%` }} />
              </div>
            ))}
          </div>
        )}
        {!searching && mode === "view_as" && <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">{t("console.cmdk.hint")}</p>}
        {error && <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">{t(error === "limited" ? "console.cmdk.limited" : "console.cmdk.failed")}</p>}
        {nothing && <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">{t("console.cmdk.empty", { q })}</p>}

        {pattern && patternHref && (
          <Command.Group heading={t("console.cmdk.group.match")} className={groupClass}>
            <Command.Item value={`pattern ${q}`} onSelect={() => go(patternHref)} className={itemClass}>
              {pattern.kind === "handle" && <Row icon={AtSignIcon}>{t("console.cmdk.pattern.handle", { handle: pattern.value })}</Row>}
              {pattern.kind === "order" && <Row icon={HashIcon}>{t("console.cmdk.pattern.order", { id: pattern.value })}</Row>}
              {pattern.kind === "id" && <Row icon={HashIcon}>{t("console.cmdk.pattern.id", { id: pattern.value })}</Row>}
              {pattern.kind === "email" && <Row icon={MailIcon}>{t("console.cmdk.pattern.email", { email: pattern.value })}</Row>}
            </Command.Item>
          </Command.Group>
        )}

        {shownActions.length > 0 && (
          <Command.Group heading={t("console.cmdk.group.actions")} className={groupClass}>
            {shownActions.map((a) => (
              <Command.Item key={a.id} value={`action ${a.id}`} onSelect={a.run} className={itemClass}>
                <Row icon={a.icon}>{a.label}</Row>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {shownNav.length > 0 && (
          <Command.Group heading={t("console.cmdk.group.go")} className={groupClass}>
            {shownNav.map((i) => (
              <Command.Item key={i.id} value={`go ${i.id}`} onSelect={() => go(i.href)} className={itemClass}>
                <Row icon={consoleIcon(i.icon)} chord={i.chord}>
                  {t(i.label)}
                </Row>
                <ArrowUpRightIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-data-[selected=true]:opacity-100 rtl:-scale-x-100" />
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {order && (
          <Command.Group heading={t("console.cmdk.group.order")} className={groupClass}>
            <Command.Item value={`order ${order.id}`} onSelect={() => go(consoleUrl(`/orders?id=${encodeURIComponent(order.id)}`))} className={itemClass}>
              <Row icon={ReceiptTextIcon} hint={t("console.cmdk.order", { store: order.store.handle ? `@${order.store.handle}` : order.store.name, total: formatMoney(order.totalCents / 100, order.currency, "en") })}>
                <bdi dir="ltr" className="font-mono text-[12px]">
                  {order.id}
                </bdi>
              </Row>
            </Command.Item>
          </Command.Group>
        )}

        {stores.length > 0 && (
          <Command.Group heading={t("console.cmdk.group.stores")} className={groupClass}>
            {stores.map((s) => (
              <Command.Item key={s.id} value={`store ${s.id}`} onSelect={() => go(mode === "view_as" ? `${s.href}?view_as=1` : s.href)} className={itemClass}>
                <Row icon={StoreIcon} hint={s.handle ? <bdi dir="ltr">@{s.handle}</bdi> : undefined}>
                  {s.name}
                </Row>
                <StatusPill status={s.status} size="sm" />
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {people.length > 0 && (
          <Command.Group heading={t("console.cmdk.group.people")} className={groupClass}>
            {people.map((p) => (
              <Command.Item key={p.id} value={`person ${p.id}`} onSelect={() => go(p.href)} className={itemClass}>
                <Row icon={UserRoundIcon} hint={<bdi dir="ltr">{p.email}</bdi>}>
                  {p.name || "·"}
                </Row>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {reviews.length > 0 && (
          <Command.Group heading={t("console.cmdk.group.reviews")} className={groupClass}>
            {reviews.map((r) => (
              <Command.Item key={r.id} value={`review ${r.id}`} onSelect={() => go(r.href)} className={itemClass}>
                <Row icon={ListChecksIcon} hint={t("console.cmdk.review", { kind: r.kind, score: r.score })}>
                  {r.handle ? <bdi dir="ltr">@{r.handle}</bdi> : r.storeId}
                </Row>
              </Command.Item>
            ))}
          </Command.Group>
        )}

      </Command.List>

      <div className="hidden shrink-0 items-center gap-4 border-t border-[var(--c-hairline)] px-4 py-2 text-[11px] text-muted-foreground md:flex">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          {t("console.cmdk.key.move")}
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd>
          {t("console.cmdk.key.open")}
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>esc</Kbd>
          {t("console.cmdk.key.close")}
        </span>
        <span className="ms-auto flex items-center gap-1.5">
          <Kbd>?</Kbd>
          {t("console.keys.title")}
        </span>
      </div>
    </Command>
  );
}

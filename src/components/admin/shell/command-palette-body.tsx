"use client";
/**
 * The tenant ⌘K palette (P2 SHELL; platform.md PLA-§22.13, UX-02; design.md DES-§16.10): code-split out of the shell,
 * mounted by ./command-palette.tsx on open. Everything it lists belongs to the store on screen:
 *
 * - the local index (`buildLocalIndex`: the nav `navFor` allows, the settings tabs, the 20 recent pages, the members
 *   for `members.read`), matched as you type;
 * - the server answer of `GET /api/app/<h>/search` (2+ characters, 120 ms debounce; skeleton rows after 150 ms, kept
 *   300 ms; a provider over its budget shows "Slow, try again" under its group);
 * - the actions of the command registry (`commandsFor`: permission, mode, release), `>` for actions only;
 * - a typed order id opens the order drawer; `?` opens the shortcut sheet; `/` searches only.
 *
 * First open: 5 recents (this store and member, localStorage), up to 4 suggestions by role and mode, then the nav.
 * Pages: Create (`C`), Language, Stores (`G W`); Backspace on an empty field goes back. On a phone the input sits at the
 * bottom and the list reads upward from it, the most relevant row nearest the thumb.
 */
import {
  ArrowLeftRightIcon,
  BellIcon,
  CheckIcon,
  CommandIcon,
  ContactRoundIcon,
  CornerDownLeftIcon,
  DownloadIcon,
  HeartPulseIcon,
  InboxIcon,
  KeyboardIcon,
  LanguagesIcon,
  LifeBuoyIcon,
  PanelsTopLeftIcon,
  ReceiptTextIcon,
  RefreshCwIcon,
  Rows3Icon,
  SearchIcon,
  SparklesIcon,
  SunMoonIcon,
  UserPlusIcon,
  UserRoundIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { Command as CommandPrimitive } from "cmdk";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { setLocaleAction } from "@/app/(public)/actions";
import { setLastStoreAction } from "@/app/app/actions";
import type { SearchGroup, StoreSearchResult } from "@/app/api/app/[store]/search/run";
import type { SearchHit } from "@/lib/admin-data/search";
import { ADMIN_LOCALES, messageOf, type AdminLocale } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { Skeleton } from "../common/skeleton";
import { FOCUS_RING } from "../common/ui-classes";
import type { PaletteIndex } from "./command-palette";
import { commandsFor, type CommandCtx, type CommandDef } from "./commands";
import { COMMAND_KEYWORDS } from "./commands/shell";
import { clearStoreClientState } from "./client-state";
import { useDensity } from "./density";
import { Kbd, KbdGroup } from "./kbd";
import {
  buildLocalIndex,
  matchLocal,
  orderDrawerHref,
  paletteSuggestions,
  parsePaletteQuery,
  pushRecent,
  rank,
  readRecents,
  recentsKey,
  revealAt,
  RECENTS_SHOWN,
  SEARCH_DEBOUNCE_MS,
  SERVER_MIN_CHARS,
  skeletonVisible,
  SKELETON_AFTER_MS,
  writeRecents,
  type LocalEntry,
  type PaletteMode,
  type RecentEntry,
} from "./palette-logic";
import { shellServices, type PalettePage } from "./shell-bridge";
import { useShortcutSheet } from "./shortcut-sheet";
import { useStore } from "./store-context";
import { navIcon, settingsTabs, storeNav } from "./store-nav";
import type { SwitcherProps } from "./store-switcher";

/* ------------------------------------------------------------------ rows */

interface Row {
  key: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** an order id or another code: mono */
  mono?: boolean;
  /** "G W" → two chips */
  shortcut?: string;
  /** the trailing check of the current language or store */
  current?: boolean;
  tone?: "brand";
  select(): void;
}

interface RowGroup {
  key: string;
  heading: string;
  rows: Row[];
}

const KIND_ICONS: Readonly<Record<string, LucideIcon>> = {
  page: PanelsTopLeftIcon,
  order: ReceiptTextIcon,
  customer: ContactRoundIcon,
  lead: InboxIcon,
  member: UserRoundIcon,
};

const COMMAND_ICONS: Readonly<Record<string, LucideIcon>> = {
  "shell.create_page": SparklesIcon,
  "shell.invite": UserPlusIcon,
  "shell.switch_store": ArrowLeftRightIcon,
  "shell.notifications": BellIcon,
  "shell.help": LifeBuoyIcon,
  "shell.shortcuts": KeyboardIcon,
  "shell.toggle_theme": SunMoonIcon,
  "shell.toggle_density": Rows3Icon,
  "shell.language": LanguagesIcon,
  "shell.recompute_health": HeartPulseIcon,
  "shell.install_app": DownloadIcon,
};

/** The server groups in the palette's order; any other label follows in the answer's order. */
const SERVER_ORDER = ["shell.cmdk.group.pages", "shell.cmdk.group.orders", "shell.cmdk.group.customers"];
const LOCAL_GROUP: Readonly<Record<LocalEntry["kind"], string>> = {
  nav: "shell.cmdk.group.jump",
  setting: "shell.cmdk.group.settings",
  page: "shell.cmdk.group.pages",
  member: "shell.cmdk.group.members",
};
const GROUP_MAX = 8;
const ACTIONS_MAX = 6;

type Answer = { ok: true; result: StoreSearchResult } | { ok: false; error: "rate_limited" | "failed" };

interface Request {
  q: string;
  startedAt: number;
  doneAt: number | null;
  answer: Answer | null;
}

/* ------------------------------------------------------------------ the palette */

export function Palette({
  initialPage,
  initialMode,
  index,
  switcher,
  phone,
  close,
}: {
  initialPage: PalettePage;
  initialMode: PaletteMode;
  index: Promise<PaletteIndex | null> | null;
  switcher: SwitcherProps;
  phone: boolean;
  close(): void;
}) {
  const t = useT();
  const locale = useAdminLocale();
  const router = useRouter();
  const store = useStore();
  const shortcuts = useShortcutSheet();
  const { density } = useDensity();
  const [page, setPage] = useState<PalettePage>(initialPage);
  const [mode, setMode] = useState<PaletteMode>(initialPage === "root" ? initialMode : "all");
  const [input, setInput] = useState("");
  const [idx, setIdx] = useState<PaletteIndex | null>(null);
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const [req, setReq] = useState<Request | null>(null);
  const [now, setNow] = useState(0);
  const [retry, setRetry] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const storageKey = recentsKey(store.id, store.viewerId);

  // the streamed index and this browser's recents (both per store)
  useEffect(() => {
    let live = true;
    // the layout's streamed promise is a React thenable whose `then` returns nothing: wrap it before chaining
    if (index)
      Promise.resolve(index)
        .then((v) => live && setIdx(v))
        .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [index]);
  useEffect(() => {
    const timer = setTimeout(() => setRecents(readRecents(() => localStorage, storageKey, store.handle)), 0);
    return () => clearTimeout(timer);
  }, [storageKey, store.handle]);

  const query = parsePaletteQuery(mode === "all" && page === "root" ? input : input.replace(/^[>/]/, ""));
  const q = mode === "all" && page === "root" ? query.q : input.trim();
  const orderId = page === "root" && mode !== "actions" ? query.orderId : null;

  /* ---- the server search: 120 ms debounce, skeleton after 150 ms, held 300 ms ---- */
  const wantsServer = page === "root" && mode !== "actions" && q.length >= SERVER_MIN_CHARS;
  const searchUrl = store.api("/search");
  useEffect(() => {
    if (!wantsServer) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      const startedAt = performance.now();
      setReq({ q, startedAt, doneAt: null, answer: null });
      let answer: Answer;
      try {
        const res = await fetch(`${searchUrl}?q=${encodeURIComponent(q)}`, { cache: "no-store", credentials: "same-origin", signal: ctrl.signal });
        if (res.status === 429) answer = { ok: false, error: "rate_limited" };
        else if (!res.ok) answer = { ok: false, error: "failed" };
        else {
          const body = (await res.json()) as Partial<StoreSearchResult>;
          answer = { ok: true, result: { groups: Array.isArray(body.groups) ? body.groups : [], slow: Array.isArray(body.slow) ? body.slow : [] } };
        }
      } catch {
        if (ctrl.signal.aborted) return;
        answer = { ok: false, error: "failed" };
      }
      const doneAt = performance.now();
      setReq({ q, startedAt, doneAt, answer });
      setNow(doneAt);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [wantsServer, q, searchUrl, retry]);
  // the two moments the skeleton changes: it appears (150 ms) and it may give way (≥ 300 ms after it appeared)
  useEffect(() => {
    if (!req) return;
    const at = req.doneAt === null ? req.startedAt + SKELETON_AFTER_MS : revealAt(req.startedAt, req.doneAt);
    const wait = at - performance.now();
    if (wait <= 0) return;
    const timer = setTimeout(() => setNow(performance.now()), wait + 1);
    return () => clearTimeout(timer);
  }, [req]);
  const current = wantsServer && req?.q === q ? req : null;
  const skeleton = current !== null && skeletonVisible(current.startedAt, current.doneAt, now);
  const answer = current && current.doneAt !== null && now >= revealAt(current.startedAt, current.doneAt) ? current.answer : null;

  /* ---- what the palette knows locally ---- */
  const viewer = useMemo(() => ({ handle: store.handle, mode: store.mode, can: store.can }), [store]);
  const navGroups = useMemo(() => storeNav(viewer, locale), [viewer, locale]);
  const tabs = useMemo(() => settingsTabs(viewer, locale), [viewer, locale]);
  const navMap = useMemo(() => new Map(navGroups.flatMap((g) => g.items.map((i) => [i.id, i.href] as const))), [navGroups]);
  const iconById = useMemo(() => new Map(navGroups.flatMap((g) => g.items.map((i) => [i.id, i.icon] as const))), [navGroups]);
  const iconFor = (id: string | undefined, fallback: LucideIcon = CommandIcon) => (id && iconById.get(id)) || fallback;
  const local = useMemo(
    () =>
      buildLocalIndex({
        handle: store.handle,
        nav: navGroups.flatMap((g) => g.items),
        tabs,
        pages: idx?.pages ?? [],
        members: idx?.members ?? [],
        roleLabel: (r) => t(`team.role.${r}`),
        statusLabel: (s) => (messageOf(`shell.cmdk.page.${s}`) !== undefined ? t(`shell.cmdk.page.${s}`) : s),
        canReadMembers: store.can("members.read"),
      }),
    [store, navGroups, tabs, idx, t],
  );
  const commands = useMemo(() => {
    const services = shellServices();
    return commandsFor({ store: { id: store.id, handle: store.handle, name: store.name, mode: store.mode, status: store.status }, can: store.can }).filter((c) => services?.available(c.id) ?? true);
  }, [store]);

  /* ---- selecting ---- */
  const remember = useCallback(
    (entry: Omit<RecentEntry, "at">) => {
      const next = pushRecent(readRecents(() => localStorage, storageKey, store.handle), entry, Date.now());
      writeRecents(() => localStorage, storageKey, next);
    },
    [storageKey, store.handle],
  );
  const go = useCallback(
    (href: string, recent?: Omit<RecentEntry, "at">) => {
      if (recent) remember(recent);
      close();
      router.push(href);
    },
    [close, router, remember],
  );
  const ctx: CommandCtx = useMemo(
    () => ({ store: { id: store.id, handle: store.handle, name: store.name, mode: store.mode, status: store.status }, can: store.can, navigate: (href) => router.push(href) }),
    [store, router],
  );
  const runCommand = useCallback(
    (c: CommandDef) => {
      close();
      try {
        void Promise.resolve(c.run(ctx)).catch(() => undefined);
      } catch {
        // a command that throws leaves the palette closed; its own surface reports what failed
      }
    },
    [close, ctx],
  );

  const navRow = (e: LocalEntry): Row => ({
    key: `${e.kind}:${e.id}`,
    icon: e.kind === "page" ? PanelsTopLeftIcon : e.kind === "member" ? UserRoundIcon : iconFor(e.navId),
    title: e.title,
    subtitle: e.subtitle,
    select: () => go(e.href, e.kind === "nav" ? undefined : { kind: e.kind, id: e.id, title: e.title, ...(e.subtitle ? { subtitle: e.subtitle } : {}), href: e.href }),
  });
  const hitRow = (h: SearchHit): Row => ({
    key: `${h.kind}:${h.id}`,
    icon: KIND_ICONS[h.kind] ?? iconFor(h.kind === "setting" ? h.id : undefined),
    title: h.title,
    subtitle: h.subtitle,
    mono: h.kind === "order",
    select: () => go(h.href, { kind: h.kind, id: h.id, title: h.title, ...(h.subtitle ? { subtitle: h.subtitle } : {}), href: h.href }),
  });
  const commandRow = (c: CommandDef): Row => ({
    key: `cmd:${c.id}`,
    icon: COMMAND_ICONS[c.id] ?? CommandIcon,
    title: t(c.label),
    shortcut: c.shortcut,
    select: () => runCommand(c),
  });
  const rankCommands = (list: readonly CommandDef[], text: string) => rank(list, text, (c) => ({ title: t(c.label), keywords: [...(COMMAND_KEYWORDS[c.id] ?? []), c.id] }));

  /* ---- the lists of each page ---- */
  const groups: RowGroup[] = [];
  let emptyText: string | null = null;

  if (page === "create") {
    const rows = rankCommands(
      commands.filter((c) => c.group === "create"),
      q,
    ).map(commandRow);
    groups.push({ key: "create", heading: t("shell.cmdk.group.create"), rows });
    if (rows.length === 0) emptyText = q ? t("shell.cmdk.no_results", { q }) : t("shell.cmdk.empty");
  } else if (page === "language") {
    const rows = rank(ADMIN_LOCALES, q, (l) => ({ title: t(`shell.cmdk.lang.${l}`), keywords: [l] })).map(
      (l): Row => ({
        key: `lang:${l}`,
        icon: LanguagesIcon,
        title: t(`shell.cmdk.lang.${l}`),
        current: l === locale,
        select: () => {
          close();
          if (l !== locale) void changeLanguage(l, router, t);
        },
      }),
    );
    groups.push({ key: "language", heading: t("shell.cmdk.group.language"), rows });
  } else if (page === "stores") {
    const others = (switcher.stores ?? []).filter((m) => m.storeId !== store.id);
    const rows = rank(others, q, (m) => ({ title: m.name, keywords: [m.handle] })).map(
      (m): Row => ({
        key: `store:${m.storeId}`,
        icon: ArrowLeftRightIcon,
        title: m.name,
        subtitle: m.status === "suspended" ? t("shell.cmdk.member_paused") : t(`team.role.${m.role}`),
        select: () => {
          if (!m.usable) return;
          close();
          clearStoreClientState(store.id, store.viewerId);
          void setLastStoreAction(m.storeId).catch(() => undefined);
          router.push(m.href);
        },
      }),
    );
    groups.push({ key: "stores", heading: t("shell.cmdk.group.stores"), rows });
    if (others.length === 0) emptyText = t("shell.cmdk.no_store");
    else if (rows.length === 0) emptyText = t("shell.cmdk.no_results", { q });
  } else if (mode === "actions") {
    const list = rankCommands(commands, q);
    for (const g of ["create", "run", "jump"] as const) {
      const rows = list.filter((c) => c.group === g).map(commandRow);
      if (rows.length) groups.push({ key: `cmd-${g}`, heading: t(`shell.cmdk.group.${g}`), rows });
    }
    if (list.length === 0) emptyText = t("shell.cmdk.no_results", { q });
  } else if (!q) {
    // the first-open state: recents, suggestions, then the nav (search mode: the recents only)
    const rec = recents.slice(0, RECENTS_SHOWN).map(
      (r): Row => ({ key: `recent:${r.kind}:${r.id}`, icon: KIND_ICONS[r.kind] ?? iconFor(r.kind === "setting" ? r.id : undefined), title: r.title, subtitle: r.subtitle, mono: r.kind === "order", select: () => go(r.href, r) }),
    );
    if (rec.length) groups.push({ key: "recent", heading: t("shell.cmdk.group.recent"), rows: rec });
    if (mode === "all") {
      const sug = paletteSuggestions({ role: store.role, mode: store.mode, can: store.can, nav: navMap, handle: store.handle }).map(
        ({ def, href }): Row => ({ key: `suggest:${def.id}`, icon: navIcon(def.icon), title: t(def.label), select: () => go(href) }),
      );
      if (sug.length) groups.push({ key: "suggested", heading: t("shell.cmdk.group.suggested"), rows: sug });
      const jump = local.filter((e) => e.kind === "nav").map(navRow);
      if (jump.length) groups.push({ key: "jump", heading: t("shell.cmdk.group.jump"), rows: jump });
    } else if (!rec.length) {
      emptyText = t("shell.cmdk.placeholder_search");
    }
  } else {
    // a query: the order drawer, the local matches, the server's groups, the actions
    const drawer = orderDrawerHref(store.handle, orderId, store.can("orders.read"));
    const matched = matchLocal(local, q);
    const byLabel = new Map<string, Row[]>();
    const seen = new Set<string>();
    const add = (label: string, row: Row) => {
      if (seen.has(row.key)) return;
      const list = byLabel.get(label) ?? [];
      if (list.length >= GROUP_MAX) return;
      seen.add(row.key);
      list.push(row);
      byLabel.set(label, list);
    };
    if (drawer && orderId) {
      add("shell.cmdk.group.orders", { key: `order:${orderId}`, icon: ReceiptTextIcon, title: t("shell.cmdk.open_order", { id: orderId }), mono: false, tone: "brand", select: () => go(drawer, { kind: "order", id: orderId, title: orderId, href: drawer }) });
    }
    if (mode === "all") for (const e of matched.nav) add(LOCAL_GROUP.nav, navRow(e));
    for (const kind of ["page", "setting", "member"] as const) for (const e of matched[kind]) add(LOCAL_GROUP[kind], navRow(e));
    const server: SearchGroup[] = answer?.ok ? answer.result.groups : [];
    for (const g of server) for (const h of g.hits) add(g.label, hitRow(h));

    const labels = [...byLabel.keys()];
    const order = [
      ...(labels.includes("shell.cmdk.group.orders") && drawer ? ["shell.cmdk.group.orders"] : []),
      "shell.cmdk.group.jump",
      ...SERVER_ORDER,
      ...server.map((g) => g.label),
      ...labels,
    ].filter((l, i, all) => all.indexOf(l) === i && byLabel.has(l));
    for (const label of order) groups.push({ key: label, heading: t(label), rows: byLabel.get(label)! });

    if (mode === "all") {
      const acts = rankCommands(commands, q).slice(0, ACTIONS_MAX).map(commandRow);
      if (acts.length) groups.push({ key: "actions", heading: t("shell.cmdk.group.run"), rows: acts });
    }
    // a provider over its budget: its groups say so, with a retry (never awaited)
    const slowLabels = answer?.ok ? [...new Set(answer.result.slow.flatMap((s) => s.groups))].filter((l) => !byLabel.has(l)) : [];
    for (const label of slowLabels) {
      groups.push({ key: `slow:${label}`, heading: t(label), rows: [{ key: `retry:${label}`, icon: RefreshCwIcon, title: t("shell.cmdk.slow"), select: () => setRetry((n) => n + 1) }] });
    }
    if (answer && !answer.ok) {
      groups.push({
        key: "failed",
        heading: t("shell.cmdk.group.run"),
        rows: [{ key: "retry:failed", icon: RefreshCwIcon, title: t(answer.error === "rate_limited" ? "shell.cmdk.rate_limited" : "shell.cmdk.search_failed"), subtitle: t("shell.cmdk.retry"), select: () => setRetry((n) => n + 1) }],
      });
    }
    if (groups.length === 0 && !skeleton && (answer || !wantsServer || (current === null && q.length < SERVER_MIN_CHARS))) emptyText = t("shell.cmdk.no_results", { q });
  }

  const noResults = groups.every((g) => g.rows.length === 0) && !skeleton;
  const fallback =
    noResults && emptyText !== null && page === "root" && mode !== "actions" && q
      ? paletteSuggestions({ role: store.role, mode: store.mode, can: store.can, nav: navMap, handle: store.handle }, 3).map(
          ({ def, href }): Row => ({ key: `try:${def.id}`, icon: navIcon(def.icon), title: t(def.label), select: () => go(href) }),
        )
      : [];

  /* ---- the field ---- */
  const onValue = (v: string) => {
    if (page === "root" && mode === "all") {
      if (v.trim() === "?") {
        close();
        shortcuts.open();
        return;
      }
      if (v.startsWith(">")) {
        setMode("actions");
        setInput(v.slice(1));
        return;
      }
      if (v.startsWith("/")) {
        setMode("search");
        setInput(v.slice(1));
        return;
      }
    }
    setInput(v);
  };
  const back = () => {
    if (mode !== "all") setMode("all");
    else if (page !== "root") setPage("root");
    inputRef.current?.focus();
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && input === "" && (mode !== "all" || page !== "root")) {
      e.preventDefault();
      back();
    }
  };
  const chip = page === "create" ? t("shell.cmdk.group.create") : page === "language" ? t("shell.cmdk.group.language") : page === "stores" ? t("shell.cmdk.group.stores") : mode === "actions" ? t("shell.cmdk.hint.actions") : mode === "search" ? t("shell.cmdk.mode.search") : null;
  const placeholder =
    page === "create"
      ? t("shell.cmdk.placeholder_create")
      : page === "language"
        ? t("shell.cmdk.placeholder_language")
        : page === "stores"
          ? t("shell.cmdk.placeholder_stores")
          : mode === "actions"
            ? t("shell.cmdk.placeholder_actions")
            : mode === "search"
              ? t("shell.cmdk.placeholder_search")
              : t("shell.cmdk.placeholder");

  const rowH = density === "compact" ? "h-8" : "h-9";
  const firstOpen = page === "root" && mode === "all" && !q;
  const chord = (id: "orders" | "pages") => (navMap.has(id) ? { id, label: t(`shell.shortcuts.go.${id}`), key: id === "orders" ? "O" : "P" } : null);

  return (
    <CommandPrimitive
      loop
      shouldFilter={false}
      label={t("shell.cmdk.title")}
      className="flex min-h-0 flex-1 flex-col text-sm max-md:h-full"
    >
      {phone && (
        <div className="flex h-12 shrink-0 items-center justify-end border-b border-border/70 px-1">
          <button type="button" onClick={close} aria-label={t("shell.cmdk.close")} className={cn("grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground", FOCUS_RING)}>
            <XIcon aria-hidden="true" className="size-5" />
          </button>
        </div>
      )}

      <div className={cn("relative flex shrink-0 items-center gap-2 px-4", phone ? "order-last h-14 border-t border-border/70 pb-[env(safe-area-inset-bottom)]" : "h-12 border-b border-border/70")}>
        <SearchIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        {chip && (
          <button
            type="button"
            onClick={back}
            aria-label={t("shell.cmdk.back")}
            className={cn("inline-flex h-6 shrink-0 items-center rounded-[var(--r-chip)] bg-brand/10 px-2 text-[12px] font-medium text-brand transition-colors duration-[var(--dur-2)] hover:bg-brand/15", FOCUS_RING)}
          >
            {chip}
          </button>
        )}
        <CommandPrimitive.Input
          ref={inputRef}
          autoFocus
          value={input}
          onValueChange={onValue}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          enterKeyHint="go"
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        {skeleton && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-brand/70" />}
      </div>

      <CommandPrimitive.List
        className={cn(
          "adm-scroll min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain p-1.5 outline-none",
          "**:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:pt-2.5 **:[[cmdk-group-heading]]:pb-1 **:[[cmdk-group-heading]]:text-[11px] **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground",
          // the phone: the list reads upward from the input (the first row nearest the thumb)
          phone ? "flex flex-1 flex-col-reverse [&_[cmdk-list-sizer]]:flex [&_[cmdk-list-sizer]]:flex-col-reverse [&_[cmdk-group-items]]:flex [&_[cmdk-group-items]]:flex-col-reverse" : "max-h-[420px]",
        )}
      >
        {groups
          .filter((g) => g.rows.length > 0)
          .map((g) => (
            <CommandPrimitive.Group key={g.key} heading={g.heading}>
              {g.rows.map((r) => (
                <PaletteRow key={r.key} row={r} height={rowH} phone={phone} />
              ))}
            </CommandPrimitive.Group>
          ))}

        {skeleton && (
          <CommandPrimitive.Loading label={t("shell.cmdk.searching")}>
            <div className="grid gap-1 px-3 py-2" aria-hidden="true">
              {["w-3/5", "w-2/5", "w-1/2"].map((w) => (
                <div key={w} className={cn("flex items-center gap-3", rowH)}>
                  <Skeleton immediate className="size-4 shrink-0 rounded-[4px]" />
                  <Skeleton immediate className={cn("h-3", w)} />
                </div>
              ))}
            </div>
          </CommandPrimitive.Loading>
        )}

        {noResults && (emptyText || fallback.length > 0) && (
          <div className="grid gap-1 px-3 py-6 text-center">
            {emptyText && <p className="text-[13px] text-muted-foreground">{emptyText}</p>}
          </div>
        )}
        {fallback.length > 0 && (
          <CommandPrimitive.Group heading={t("shell.cmdk.try")}>
            {fallback.map((r) => (
              <PaletteRow key={r.key} row={r} height={rowH} phone={phone} />
            ))}
          </CommandPrimitive.Group>
        )}
      </CommandPrimitive.List>

      {!phone && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/70 bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="flex min-w-0 items-center gap-3">
            {firstOpen ? (
              <>
                <Hint keys={["?"]} label={t("shell.cmdk.hint.shortcuts")} />
                {[chord("orders"), chord("pages")].map((c) => c && <Hint key={c.id} keys={["G", c.key]} label={c.label} />)}
              </>
            ) : (
              <>
                <Hint keys={["↑", "↓"]} label={t("shell.cmdk.hint.move")} />
                <Hint keys={["↵"]} label={t("shell.cmdk.hint.open")} />
                {page === "root" && mode === "all" && <Hint keys={[">"]} label={t("shell.cmdk.hint.actions")} />}
              </>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-3">
            {firstOpen && <Hint keys={["↑", "↓"]} label={t("shell.cmdk.hint.move")} />}
            <Hint keys={["Esc"]} label={t("shell.cmdk.hint.close")} />
          </span>
        </div>
      )}
    </CommandPrimitive>
  );
}

/* ------------------------------------------------------------------ pieces */

function PaletteRow({ row, height, phone }: { row: Row; height: string; phone: boolean }) {
  const Icon = row.icon;
  return (
    <CommandPrimitive.Item
      value={row.key}
      onSelect={row.select}
      className={cn(
        "group/row relative flex cursor-default items-center gap-3 rounded-[var(--r-control)] px-3 text-[13.5px] text-foreground outline-none select-none",
        phone ? "min-h-11" : height,
        "data-[selected=true]:bg-accent data-[disabled=true]:opacity-50",
        // the 2 px inline-start indicator of the selected row
        "before:absolute before:inset-y-1.5 before:start-0 before:w-0.5 before:rounded-full before:bg-brand before:opacity-0 data-[selected=true]:before:opacity-100",
      )}
    >
      <Icon aria-hidden="true" className={cn("size-4 shrink-0", row.tone === "brand" ? "text-brand" : "text-muted-foreground group-data-[selected=true]/row:text-foreground")} />
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className={cn("truncate", row.mono && "font-mono text-[12.5px]")}>{row.title}</span>
        {row.subtitle && <span className="min-w-0 truncate text-[12px] text-muted-foreground">{row.subtitle}</span>}
      </span>
      {row.current && <CheckIcon aria-hidden="true" className="size-4 shrink-0 text-brand" />}
      {row.shortcut && !phone && (
        <span className="flex shrink-0 items-center gap-1">
          {row.shortcut.split(" ").map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </span>
      )}
      {!row.shortcut && !row.current && !phone && <CornerDownLeftIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-data-[selected=true]/row:opacity-100 rtl:-scale-x-100" />}
    </CommandPrimitive.Item>
  );
}

function Hint({ keys, label }: { keys: readonly string[]; label: ReactNode }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
      <KbdGroup keys={keys} />
      <span>{label}</span>
    </span>
  );
}

async function changeLanguage(l: AdminLocale, router: ReturnType<typeof useRouter>, t: ReturnType<typeof useT>): Promise<void> {
  try {
    await setLocaleAction(l);
    router.refresh();
  } catch {
    toast.error(t("shell.cmd.language_failed"));
  }
}


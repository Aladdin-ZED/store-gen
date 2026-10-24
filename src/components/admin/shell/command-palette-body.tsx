"use client";
/**
 * The command palette itself (search, jump-to, actions, appearance) — code-split out of the panel
 * shell: CommandPaletteProvider loads it on first open (and prefetches it once the screen is idle).
 */
import {
  ArrowRightIcon,
  FileDownIcon,
  Loader2Icon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  PanelsTopLeftIcon,
  ReceiptTextIcon,
  SheetIcon,
  SparklesIcon,
  SunIcon,
  UploadIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { logout } from "@/lib/auth/actions";
import { legacyCan as can, type Role } from "@/lib/auth/permissions";
import type { SearchHit } from "@/lib/admin-data/search";
import { Kbd } from "./kbd";
import { navFor } from "./nav";

export function Palette({ role, search, close }: { role: Role; search: (q: string) => Promise<SearchHit[]>; close: () => void }) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [query, setQuery] = useState("");
  // results are keyed by the query they answer, so "loading" is derived (no state juggling)
  const [result, setResult] = useState<{ q: string; hits: SearchHit[] }>({ q: "", hits: [] });
  const formRef = useRef<HTMLFormElement>(null);
  const q = query.trim();
  const searching = q.length >= 2;

  useEffect(() => {
    if (!searching) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      let hits: SearchHit[] = [];
      try {
        hits = await search(q);
      } catch {
        hits = [];
      }
      if (!cancelled) setResult({ q, hits });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, searching, search]);

  const loading = searching && result.q !== q;
  const hits = searching && result.q === q ? result.hits : [];

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  const nav = navFor(role);
  const pageHits = hits.filter((h) => h.kind === "page");
  const orderHits = hits.filter((h) => h.kind === "order");

  return (
    <Command loop className="rounded-2xl! bg-popover p-0">
      <div className="relative border-b border-border/70 px-1 pt-1">
        <CommandInput value={query} onValueChange={setQuery} placeholder="Search pages and orders, or jump to…" className="h-12 text-[0.95rem]" />
        {loading && <Loader2Icon aria-hidden="true" className="absolute end-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      <CommandList className="adm-scroll max-h-[min(60vh,26rem)] p-1.5">
        <CommandEmpty className="py-10 text-center text-sm text-muted-foreground">
          {loading ? "Searching…" : q.length >= 2 ? `Nothing matches “${q}”.` : "Type to search."}
        </CommandEmpty>

        {pageHits.length > 0 && (
          <CommandGroup heading="Pages">
            {pageHits.map((h) => (
              <CommandItem key={h.id} value={`page ${h.id} ${h.title}`} keywords={[q]} onSelect={() => go(h.href)} className="gap-3 rounded-lg py-2">
                <PanelsTopLeftIcon className="text-muted-foreground" />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate">{h.title}</span>
                  <span className="truncate text-xs text-muted-foreground">{h.subtitle}</span>
                </span>
                <ArrowRightIcon className="size-3.5 text-muted-foreground" />
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {orderHits.length > 0 && (
          <CommandGroup heading="Orders">
            {orderHits.map((h) => (
              <CommandItem key={h.id} value={`order ${h.id} ${h.title}`} keywords={[q]} onSelect={() => go(h.href)} className="gap-3 rounded-lg py-2">
                <ReceiptTextIcon className="text-muted-foreground" />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-mono text-[0.82rem]">{h.title}</span>
                  <span className="truncate text-xs text-muted-foreground">{h.subtitle}</span>
                </span>
                <ArrowRightIcon className="size-3.5 text-muted-foreground" />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Jump to">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem key={item.id} value={`go ${item.label}`} keywords={item.keywords} onSelect={() => go(item.href)} className="gap-3 rounded-lg">
                <Icon className="text-muted-foreground" />
                {item.label}
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Actions">
          {can(role, "pages.write") && (
            <CommandItem value="action generate new page" keywords={["create", "ai"]} onSelect={() => go("/admin/generate")} className="gap-3 rounded-lg">
              <SparklesIcon className="text-brand" />
              Generate a new page
            </CommandItem>
          )}
          {can(role, "media.write") && (
            <CommandItem value="action upload media" keywords={["image", "photo"]} onSelect={() => go("/admin/media?upload=1")} className="gap-3 rounded-lg">
              <UploadIcon className="text-muted-foreground" />
              Upload photos
            </CommandItem>
          )}
          {can(role, "orders.read") && (
            <CommandItem
              value="action export orders csv"
              keywords={["download", "excel"]}
              onSelect={() => {
                close();
                // a file download (route handler), not a page: let the browser fetch it
                const a = document.createElement("a");
                a.href = "/admin/orders/export";
                a.download = "";
                a.click();
              }}
              className="gap-3 rounded-lg"
            >
              <FileDownIcon className="text-muted-foreground" />
              Export all orders (CSV)
            </CommandItem>
          )}
          {can(role, "settings.read") && (
            <CommandItem value="action google sheets" keywords={["connect", "sync"]} onSelect={() => go("/admin/settings/sheets")} className="gap-3 rounded-lg">
              <SheetIcon className="text-muted-foreground" />
              Google Sheets connection
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Appearance">
          <CommandItem value="theme light" onSelect={() => setTheme("light")} className="gap-3 rounded-lg">
            <SunIcon className="text-muted-foreground" /> Light theme
          </CommandItem>
          <CommandItem value="theme dark" onSelect={() => setTheme("dark")} className="gap-3 rounded-lg">
            <MoonIcon className="text-muted-foreground" /> Dark theme
          </CommandItem>
          <CommandItem value="theme system" onSelect={() => setTheme("system")} className="gap-3 rounded-lg">
            <MonitorIcon className="text-muted-foreground" /> Match the system
          </CommandItem>
          <CommandItem value="sign out logout" onSelect={() => formRef.current?.requestSubmit()} className="gap-3 rounded-lg text-destructive data-[selected=true]:text-destructive">
            <LogOutIcon className="text-destructive" /> Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center justify-between gap-3 border-t border-border/70 bg-muted/40 px-4 py-2 text-[0.72rem] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> to move · <Kbd>↵</Kbd> to open
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>Esc</Kbd> to close
        </span>
      </div>
      <form ref={formRef} action={logout} className="hidden" />
    </Command>
  );
}

"use client";
/**
 * The store profile's tab bar (platform.md PLA-§7.1, PD32; PLA-§4.7 rules 2 and 6): Overview · Orders · Team · Activity
 * · Usage & plan · Notes (Notes hidden from analysts); keys 1-6 jump to them (never with a modifier, in a text field,
 * under an overlay or as a "G" chord's second key); the bar scrolls sideways at 360 px and keeps the active tab in
 * view. The `?` sheet lists 1-6 and, when the viewer may view as the store, V.
 *
 *   <ProfileTabs storeId={id} tabs={["overview", …]} viewAs />
 */
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { isEditable, overlayOpen } from "../_compat/chords";
import { PrefetchLink } from "../prefetch-link";
import { useScreenKeys } from "../shell/context";
import { profileHref, tabOfKey, tabOfPath, type ProfileTab } from "./tabs";

export function ProfileTabs({ storeId, tabs, viewAs }: { storeId: string; tabs: ProfileTab[]; viewAs: boolean }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const active = tabOfPath(pathname, storeId);
  const bar = useRef<HTMLDivElement>(null);

  useScreenKeys({
    title: t("console.keys.profile.title"),
    lines: [
      ...tabs.map((tab, i) => ({ label: t(`console.profile.tab.${tab}`), keys: [String(i + 1)] })),
      ...(viewAs ? [{ label: t("console.keys.profile.view_as"), keys: ["V"] }] : []),
    ],
  });

  useEffect(() => {
    let gAt = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || isEditable(e.target) || overlayOpen()) return;
      if (e.key.toLowerCase() === "g") {
        gAt = Date.now();
        return;
      }
      const chord = gAt && Date.now() - gAt <= 1_200;
      gAt = 0;
      const tab = chord ? null : tabOfKey(e.key);
      if (!tab) return;
      const i = ["1", "2", "3", "4", "5", "6"].indexOf(e.key);
      const target = tabs[i];
      if (!target) return;
      e.preventDefault();
      router.push(profileHref(storeId, target));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tabs, storeId, router]);

  // the active tab stays in view when the bar scrolls (360 px)
  useEffect(() => {
    const el = bar.current?.querySelector<HTMLElement>('[aria-current="page"]');
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <nav aria-label={t("console.profile.tabs")} className="-mx-4 min-w-0 border-b border-[var(--c-hairline)] md:mx-0">
      <div ref={bar} className="flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] md:px-0 [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab, i) => {
          const on = active === tab;
          return (
            <PrefetchLink
              key={tab}
              href={profileHref(storeId, tab)}
              aria-current={on ? "page" : undefined}
              className={cn(
                "relative inline-flex h-10 shrink-0 items-center gap-1.5 px-2.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors duration-[var(--dur-1)] hover:text-foreground focus-visible:rounded-[var(--r-control)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:h-11",
                on && "text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-[2px] after:rounded-full after:bg-[var(--brand)]",
              )}
            >
              {t(`console.profile.tab.${tab}`)}
              <kbd aria-hidden="true" className="num hidden text-[10.5px] font-normal opacity-50 lg:inline">
                {i + 1}
              </kbd>
            </PrefetchLink>
          );
        })}
      </div>
    </nav>
  );
}

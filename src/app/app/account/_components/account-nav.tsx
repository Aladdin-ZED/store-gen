"use client";

import { KeyRoundIcon, ShieldCheckIcon, StoreIcon, Trash2Icon, UserRoundIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthT } from "@/lib/auth/i18n/client";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/app/account", key: "account.nav.profile", icon: UserRoundIcon, exact: true },
  { href: "/app/account/security", key: "account.nav.security", icon: KeyRoundIcon },
  { href: "/app/account/two-factor", key: "account.nav.two_factor", icon: ShieldCheckIcon },
  { href: "/app/account/stores", key: "account.nav.stores", icon: StoreIcon },
  { href: "/app/account/danger", key: "account.nav.danger", icon: Trash2Icon },
] as const;

/** The account pages' section list: a column on wide screens, a scrolling row on phones. */
export function AccountNav() {
  const t = useAuthT();
  const pathname = usePathname();
  return (
    <nav aria-label={t("account.nav.label")} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
      <ul className="flex gap-1 md:grid md:gap-0.5">
        {ITEMS.map((item) => {
          const active = "exact" in item ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-2.5 rounded-[8px] px-3 text-sm whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active ? "bg-foreground/[0.06] font-medium text-foreground" : "text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground",
                  item.href.endsWith("/danger") && !active && "hover:text-destructive",
                )}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

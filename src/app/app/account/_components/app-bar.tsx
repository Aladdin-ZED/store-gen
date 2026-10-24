import { LogOutIcon, ShieldIcon } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/admin/shell/brand-mark";
import { consoleHref } from "@/lib/urls";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/auth";
import { logout } from "@/lib/auth/actions";
import { authTranslator } from "@/lib/auth/i18n";
import type { AdminLocale } from "@/lib/i18n/admin";
import { Monogram } from "@/app/(public)/_components/kit";

/*
 * The top bar of the dashboard's store-less pages (the store picker, /app/new, the account pages): the brand back to
 * the stores, the console for staff, the account and sign-out. The one frosted surface of these screens (§I.6).
 */
export function AppBar({ user, brand, locale }: { user: SessionUser; brand: string; locale: AdminLocale }) {
  const t = authTranslator(locale);
  return (
    <header className="sticky top-0 z-20 border-b border-[color-mix(in_oklab,var(--foreground)_8%,transparent)] bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/app" className="flex items-center gap-2.5 rounded-[8px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <BrandMark className="size-7" />
          <span className="text-[0.95rem] font-semibold tracking-[-0.02em]">{brand}</span>
        </Link>
        <nav className="flex items-center gap-1">
          {user.platformRole !== "none" && (
            <Button asChild variant="ghost" size="sm" className="text-[oklch(0.45_0.09_205)] dark:text-[oklch(0.78_0.08_205)]">
              <Link href={consoleHref()}>
                <ShieldIcon aria-hidden="true" />
                {t("app.bar.console")}
              </Link>
            </Button>
          )}
          <Button asChild variant="ghost" size="sm" className="gap-2 ps-1">
            <Link href="/app/account">
              <Monogram name={user.name} seed={user.id} size="sm" />
              <span className="hidden max-w-[12rem] truncate sm:inline">{user.name}</span>
            </Link>
          </Button>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="icon-sm" aria-label={t("app.bar.sign_out")} title={t("app.bar.sign_out")}>
              <LogOutIcon aria-hidden="true" className="rtl:rotate-180" />
            </Button>
          </form>
        </nav>
      </div>
    </header>
  );
}

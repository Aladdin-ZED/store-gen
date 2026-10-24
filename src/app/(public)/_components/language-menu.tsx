"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { AdminLocale } from "@/lib/i18n/admin";
import { cn } from "@/lib/utils";
import { setLocaleAction } from "../actions";

/** Each language in its own script, never translated. */
const LANGUAGES: { locale: AdminLocale; label: string }[] = [
  { locale: "en", label: "English" },
  { locale: "fr", label: "Français" },
  { locale: "ar", label: "العربية" },
];

/** A three-way segmented switch; the choice is a preference cookie (and the account's language when signed in). */
export function LanguageMenu({ locale, label }: { locale: AdminLocale; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex rounded-[8px] border border-[color-mix(in_oklab,var(--foreground)_9%,transparent)] p-0.5 transition-opacity duration-150",
        pending && "opacity-60",
      )}
    >
      {LANGUAGES.map((l) => (
        <button
          key={l.locale}
          type="button"
          lang={l.locale}
          aria-pressed={l.locale === locale}
          disabled={pending}
          onClick={() =>
            start(async () => {
              await setLocaleAction(l.locale);
              router.refresh();
            })
          }
          className={cn(
            "h-7 rounded-[6px] px-2.5 text-xs font-medium transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            l.locale === locale ? "bg-foreground/[0.07] text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

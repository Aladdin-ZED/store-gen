"use client";
/**
 * One Overview strip's frame (platform.md PLA-§7.3; PL-07, PD55): a header with the strip's name and when its data was
 * read, at most six lines of content, and one end link (the full tab when it exists in this release) or the neutral
 * line "Full view arrives with R2", never a disabled button. At 360 px the strips collapse to their header line and a
 * count and open on tap; a link to `#strip-<id>` (the "Arrives with R2" pages) opens its strip.
 *
 *   <StripFrame strip="team" title="Team" at={iso} summary="4 members" end={{ href, label }}>…</StripFrame>
 *   <StripSkeleton title="Team" />           // loading: rows that mirror the strip
 */
import { ChevronDownIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { markHealthDirtyAction } from "@/app/admin/(console)/stores/[id]/actions";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { Ago } from "../../ago";
import { PrefetchLink } from "../../prefetch-link";
import { button } from "../../queue/decision-dialogs";
import { stripAnchor, type ProfileStrip } from "../tabs";
import styles from "../../shell/console.module.css";

const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

export function StripFrame({
  strip,
  title,
  at,
  summary,
  end,
  aside,
  children,
  className,
}: {
  strip: ProfileStrip;
  title: string;
  /** when the strip's data was read (ISO) */
  at?: string | null;
  /** the collapsed line on a phone ("4 members"), and a quiet count next to the title on wider screens */
  summary?: string | null;
  /** the full tab, or "r2" for the honest "arrives with R2" line, or nothing */
  end: { href: string; label: string } | "r2" | null;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const t = useT();
  const body = useId();
  const [toggled, setToggled] = useState<boolean | null>(null);
  // a link to `#strip-<id>` opens the strip on a phone until it is toggled by hand
  const hashed = useSyncExternalStore(subscribeHash, () => window.location.hash === `#${stripAnchor(strip)}`, () => false);
  const open = toggled ?? hashed;

  return (
    <section id={stripAnchor(strip)} aria-labelledby={`${body}-t`} data-open={open || undefined} className={cn("group/strip flex min-w-0 scroll-mt-20 flex-col rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]", className)}>
      <div className="flex min-h-11 items-center gap-2 border-[var(--c-hairline)] px-4 md:border-b max-md:group-data-[open]/strip:border-b">
        <h2 id={`${body}-t`} className="min-w-0 truncate text-[13px] font-semibold tracking-[-0.006em]">
          {title}
        </h2>
        {summary && <span className="num min-w-0 truncate text-[12px] text-muted-foreground max-md:flex-1 md:hidden">{summary}</span>}
        <span className="flex-1 max-md:hidden" />
        {aside && <div className="max-md:hidden">{aside}</div>}
        {at && <Ago iso={at} className="shrink-0 text-[11px] text-muted-foreground max-md:hidden" />}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={body}
          onClick={() => setToggled(!open)}
          className="-me-2 inline-grid size-11 shrink-0 place-items-center rounded-[var(--r-control)] text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)] md:hidden"
        >
          <span className="sr-only">{open ? t("console.strip.collapse", { name: title }) : t("console.strip.expand", { name: title })}</span>
          <ChevronDownIcon aria-hidden="true" className={cn("size-4 transition-transform duration-[var(--dur-1)]", open && "rotate-180")} />
        </button>
      </div>
      <div id={body} className="flex min-w-0 flex-1 flex-col max-md:hidden max-md:group-data-[open]/strip:flex">
        <div className="min-w-0 flex-1 px-4 py-3">
          {aside && <div className="mb-2 md:hidden">{aside}</div>}
          {children}
        </div>
        {end && (
          <div className="border-t border-[var(--c-hairline)] px-4 py-2.5">
            {end === "r2" ? (
              <p className="text-[12px] text-muted-foreground">{t("console.profile.arrives_r2")}</p>
            ) : (
              <PrefetchLink href={end.href} className="text-[12px] font-medium text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:inline-flex max-md:min-h-11 max-md:items-center">
                {end.label}
              </PrefetchLink>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** Loading: the strip's header and four rows of bones (shown after 150 ms by the console's CSS). */
export function StripSkeleton({ title, rows = 4 }: { title: string; rows?: number }) {
  return (
    <div aria-busy="true" aria-label={title} className="flex min-w-0 flex-col rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]">
      <div className="flex min-h-11 items-center px-4 md:border-b md:border-[var(--c-hairline)]">
        <span className="text-[13px] font-semibold text-muted-foreground">{title}</span>
      </div>
      <div className={cn(styles.skeleton, "grid gap-2.5 px-4 py-3.5 max-md:hidden")}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className={cn(styles.bone, "h-3")} style={{ width: `${68 - ((i * 17) % 34)}%` }} />
            <div className={cn(styles.bone, "ms-auto h-3 w-10 shrink-0")} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** One line of a strip: a label and its value, the value in tabular numerals. */
export function StripLine({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 py-1 text-[13px]", className)}>
      <dt className="min-w-0 truncate text-muted-foreground">{label}</dt>
      <dd className="num min-w-0 text-end">{children}</dd>
    </div>
  );
}

/** Health strip's "Mark dirty": the next health run recomputes this store first (within 5 min). */
export function MarkDirtyButton({ storeId, dirty }: { storeId: string; dirty: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [marked, setMarked] = useState(dirty);
  return (
    <button
      type="button"
      disabled={pending || marked}
      onClick={() =>
        start(async () => {
          const r = await markHealthDirtyAction({ storeId });
          if (r.ok) {
            setMarked(true);
            toast.success(t("console.strip.health.marked"));
            router.refresh();
          } else toast.error(t("console.strip.health.mark_failed"));
        })
      }
      className={cn(button.base, button.secondary, "h-7 px-2.5 text-[12px]")}
    >
      {marked ? t("console.strip.health.dirty") : t("console.strip.health.mark_dirty")}
    </button>
  );
}

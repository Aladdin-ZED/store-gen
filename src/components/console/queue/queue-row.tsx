"use client";
/**
 * One approval queue row (platform.md PLA-§3.5 "List row"; DES-§16.8): the 24 px score ring tinted by band with its
 * number, the store name and `@handle` (protected substrings underlined by a dotted crimson hairline), the applicant's
 * first name and masked e-mail, the phone country, up to 3 flag chips + "+n", the readiness chip, the market, the
 * waiting time and the cluster badge ("3 linked"). Two compact lines, so the 44 % pane holds every fact without a
 * third; the active row carries a 3 px accent rail on its inline-start edge (mirrors in RTL), focus a 2 px ring.
 * Below 768 px the same facts stack as a card with 44 px targets.
 *
 *   <QueueRow row={row} active={row.id === active} selected={sel.has(row.id)} onOpen={open} onToggle={toggle} />
 */
import { CheckIcon, LinkIcon, PhoneIcon, RotateCcwIcon, SendIcon, StoreIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { useT } from "@/lib/i18n/admin/client";
import type { QueueListRow } from "@/lib/platform/queue";
import { cn } from "@/lib/utils";
import { Ago, Until } from "../ago";
import { ScoreRing } from "../ring";
import { bandTint, TINT_INK, TINT_SOFT } from "../tints";

/** The protected terms a row's brand flags name, per field (the evidence of `brand_exact` / `brand_near`). */
export function protectedTerms(flags: QueueListRow["flags"], field: "store_name" | "handle"): string[] {
  return flags.filter((f) => (f.code === "brand_exact" || f.code === "brand_near") && f.evidence?.field === field && typeof f.evidence.term === "string" && f.evidence.term).map((f) => String(f.evidence!.term).toLowerCase());
}

/** `text` with every occurrence of a protected term underlined (dotted crimson hairline, never colour alone: the flag says it). */
export function MarkTerms({ text, terms }: { text: string; terms: readonly string[] }) {
  if (!terms.length || !text) return <>{text}</>;
  const lower = text.toLowerCase();
  const out: ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    let hit: string | null = null;
    for (const t of terms) if (t && lower.startsWith(t, i) && (!hit || t.length > hit.length)) hit = t;
    if (hit) {
      out.push(
        <span key={i} className="underline decoration-[oklch(0.6_0.19_17)] decoration-dotted decoration-1 underline-offset-[3px]">
          {text.slice(i, i + hit.length)}
        </span>,
      );
      i += hit.length;
    } else {
      let j = i + 1;
      while (j < text.length && !terms.some((t) => t && lower.startsWith(t, j))) j++;
      out.push(<Fragment key={i}>{text.slice(i, j)}</Fragment>);
      i = j;
    }
  }
  return <>{out}</>;
}

const READINESS_TINT = { no_page: "neutral", draft: "neutral", submitted: "emerald" } as const;

export function Chip({ children, tint = "neutral", title, className }: { children: ReactNode; tint?: keyof typeof TINT_SOFT; title?: string; className?: string }) {
  return (
    <span title={title} className={cn("inline-flex h-[18px] max-w-[160px] shrink-0 items-center gap-1 truncate rounded-[5px] px-1.5 text-[11px] leading-none font-medium whitespace-nowrap", TINT_INK[tint], className)} style={{ background: TINT_SOFT[tint] }}>
      {children}
    </span>
  );
}

const REQUEST_ICON = { go_live: RotateCcwIcon, plan_change: SendIcon, limit_raise: SendIcon, mode_change: SendIcon, domain: LinkIcon } as const;

/** The leading mark: the score ring for a review row, the kind's glyph for a store request (it has no score). */
function Lead({ row }: { row: QueueListRow }) {
  const t = useT();
  if (row.request || (row.kind !== "signup" && row.kind !== "reopen")) {
    const Icon = REQUEST_ICON[row.kind as keyof typeof REQUEST_ICON] ?? SendIcon;
    return (
      <span aria-hidden="true" className="inline-grid size-6 shrink-0 place-items-center rounded-full bg-[var(--c-info-soft)] text-[var(--c-info-ink)]">
        <Icon className="size-3.5" />
      </span>
    );
  }
  return <ScoreRing score={row.score} tint={bandTint(row.band)} size={24} title={t("console.queue.row.score", { score: row.score, band: t(`console.band.${row.band}`) })} />;
}

function Facts({ row }: { row: QueueListRow }) {
  const t = useT();
  const isRequest = !!row.request;
  return (
    <>
      {isRequest ? (
        <Chip tint="neutral">{t(`console.queue.kind.${row.kind}`)}</Chip>
      ) : (
        <Chip tint={READINESS_TINT[row.readiness]}>{t(`console.queue.readiness.${row.readiness}`)}</Chip>
      )}
      {row.kind === "reopen" && <Chip tint="yellow">{t("console.queue.appeal")}</Chip>}
      {row.status === "needs_info" && <Chip tint="neutral">{t("console.queue.status.needs_info")}</Chip>}
      {row.flags.map((f) => (
        <Chip key={f.code} tint={f.points < 0 ? "emerald" : row.holds.includes(f.code) ? "crimson" : "neutral"} title={`${f.points > 0 ? "+" : ""}${f.points}`}>
          {t(`console.sflag.${f.code}`)}
        </Chip>
      ))}
      {row.moreFlags > 0 && <span className="num shrink-0 text-[11px] text-muted-foreground">{t("console.queue.more_flags", { count: row.moreFlags })}</span>}
    </>
  );
}

export function QueueRow({
  row,
  active,
  selected,
  selecting,
  onOpen,
  onToggle,
}: {
  row: QueueListRow;
  active: boolean;
  selected: boolean;
  /** some row is selected: every row shows its check box */
  selecting: boolean;
  onOpen(id: string): void;
  onToggle(id: string): void;
}) {
  const t = useT();
  const nameTerms = protectedTerms(row.flags, "store_name");
  const handleTerms = protectedTerms(row.flags, "handle");
  const decided = row.decision ? (row.status === "approved" ? t("console.queue.decided.approved") : row.status === "rejected" ? t("console.queue.decided.rejected") : t("console.queue.decided.withdrawn")) : null;
  return (
    <div
      role="option"
      aria-selected={active}
      id={`qrow-${row.id}`}
      data-row-id={row.id}
      tabIndex={active ? 0 : -1}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-row-check]")) return;
        onOpen(row.id);
      }}
      onKeyDown={(e) => {
        if (e.key === " ") {
          e.preventDefault();
          onToggle(row.id);
        }
      }}
      className={cn(
        "group/row relative flex cursor-default items-center gap-2.5 border-b border-[var(--c-hairline)] ps-3 pe-3 outline-none transition-colors duration-[var(--dur-1)]",
        "focus-visible:z-[1] focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]",
        // below 768 px the card layout (CSS only, so the server's first paint is already right on a phone)
        "min-h-[calc(var(--row)+14px)] py-1.5 max-md:min-h-[72px] max-md:py-2.5",
        active ? "bg-[color-mix(in_oklch,var(--brand)_7%,var(--card))]" : "hover:bg-accent",
        selected && !active && "bg-[color-mix(in_oklch,var(--brand)_4%,var(--card))]",
      )}
    >
      {active && <span aria-hidden="true" className="absolute inset-y-0 start-0 w-[3px] bg-[var(--brand)]" />}

      <span data-row-check className={cn("flex shrink-0 items-center max-md:-ms-1 max-md:size-11 max-md:justify-center md:w-4", !selecting && !selected && "max-md:hidden md:opacity-0 md:group-hover/row:opacity-100 md:group-focus-within/row:opacity-100")}>
        <button
          type="button"
          tabIndex={-1}
          role="checkbox"
          aria-checked={selected}
          aria-label={t("console.queue.select_row", { name: row.store.name })}
          onClick={() => onToggle(row.id)}
          className={cn(
            "inline-grid size-4 place-items-center rounded-[4px] shadow-[inset_0_0_0_1.5px_var(--input)] transition-colors duration-[var(--dur-1)]",
            selected && "bg-[var(--brand)] text-[var(--brand-foreground)] shadow-none",
          )}
        >
          {selected && <CheckIcon aria-hidden="true" className="size-3" strokeWidth={3} />}
        </button>
      </span>

      <Lead row={row} />

      <span className="grid min-w-0 flex-1 gap-[3px]">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-[13px] leading-[18px] font-medium">
            <MarkTerms text={row.store.name} terms={nameTerms} />
          </span>
          {row.store.handle && (
            <bdi dir="ltr" className="min-w-0 shrink truncate font-mono text-[11.5px] leading-[18px] text-muted-foreground">
              @<MarkTerms text={row.store.handle} terms={handleTerms} />
            </bdi>
          )}
          {row.linked > 0 && (
            <span className="inline-flex h-[18px] shrink-0 items-center gap-1 rounded-[5px] px-1.5 text-[11px] font-medium text-[var(--c-imp-ink)]" style={{ background: "var(--c-imp-soft)" }}>
              <LinkIcon aria-hidden="true" className="size-3" />
              {t("console.queue.linked", { count: row.linked })}
            </span>
          )}
          <span className="ms-auto shrink-0 ps-2 text-[11.5px] text-muted-foreground">
            {decided ? (
              <span className="inline-flex items-center gap-1">
                {decided}
                {row.decidedAt && (
                  <>
                    {" "}
                    <Ago iso={row.decidedAt} className="num" />
                  </>
                )}
              </span>
            ) : row.status === "snoozed" && row.snoozeUntil ? (
              <Until iso={row.snoozeUntil} template="console.queue.snoozed_until" className="num" />
            ) : (
              <Ago iso={row.waitingSince} className="num" />
            )}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] leading-4 text-muted-foreground max-md:flex-wrap max-md:gap-y-1">
          <span className="min-w-0 shrink truncate">
            {row.applicant.firstName && <span className="text-foreground/80">{row.applicant.firstName}</span>}
            {row.applicant.firstName && <span aria-hidden="true"> · </span>}
            <bdi dir="ltr">{row.applicant.email}</bdi>
          </span>
          {row.applicant.phoneCountry && (
            <span title={t("console.queue.phone_country", { country: row.applicant.phoneCountry })} className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[10.5px] tracking-wide">
              <PhoneIcon aria-hidden="true" className="size-2.5" />
              {row.applicant.phoneCountry}
            </span>
          )}
          <span title={t("console.queue.market", { market: row.store.market })} className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[10.5px] tracking-wide">
            <StoreIcon aria-hidden="true" className="size-2.5" />
            {row.store.market}
          </span>
          <span className="flex min-w-0 items-center gap-1 overflow-hidden max-md:basis-full max-md:flex-wrap md:ms-auto">
            <Facts row={row} />
          </span>
        </span>
      </span>
    </div>
  );
}

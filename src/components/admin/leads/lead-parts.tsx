"use client";
/**
 * The pieces every lead surface shares (P3 LANDING; landing.md LAN-§10.3; docs/STORE-SAAS.md §I.8 rules 6 to 8): the
 * inbox context (grants, the read-only reason, the team), the status pill, the kind mark, the masked phone in an LTR
 * isolate, the WhatsApp and Call buttons (44 px on a phone) and the row menu (convert, lost, follow-up, assign). Every
 * write button is disabled with the read-only reason under "View as store".
 */
import { CalendarClockIcon, ClipboardListIcon, MessageCircleIcon, MoreHorizontalIcon, PhoneIcon, ShoppingBagIcon, UserRoundIcon, XCircleIcon } from "lucide-react";
import { createContext, useContext } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n/admin/client";
import type { LeadRow, LeadStatus } from "@/lib/leads/types";
import { cn } from "@/lib/utils";
import { STATUS_TONE } from "./format";

export interface LeadMember {
  id: string;
  name: string;
  role: string;
}

/** What the member may do here (`can`), the read-only reason under impersonation, and the team for Assign. */
export interface LeadInboxCtx {
  me: string;
  role: string;
  can: { write: boolean; contact: boolean; assign: boolean; convert: boolean; export: boolean };
  /** the reason every write is off ("View as store is read-only."), or null */
  readOnly: string | null;
  members: LeadMember[];
  timeZone: string;
}

/** The inbox's operations (optimistic, with Undo where a write can be undone). */
export interface LeadOps {
  open(lead: LeadRow): void;
  contact(lead: LeadRow, channel: "whatsapp" | "call"): void;
  convert(lead: LeadRow): void;
  lost(leads: LeadRow[]): void;
  followUp(lead: LeadRow, at: Date | null): void;
  assign(leads: LeadRow[], userId: string | null): void;
}

export const InboxContext = createContext<LeadInboxCtx | null>(null);
export const OpsContext = createContext<LeadOps | null>(null);

export function useInbox(): LeadInboxCtx {
  const v = useContext(InboxContext);
  if (!v) throw new Error("useInbox outside the lead inbox");
  return v;
}
export function useOps(): LeadOps {
  const v = useContext(OpsContext);
  if (!v) throw new Error("useOps outside the lead inbox");
  return v;
}

const OPEN: readonly LeadStatus[] = ["new", "contacted"];
export const isOpen = (lead: LeadRow) => OPEN.includes(lead.status);

export function StatusPill({ status, className }: { status: LeadStatus; className?: string }) {
  const t = useT();
  return <span className={cn("inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", STATUS_TONE[status], className)}>{t(`landing.leads.status.${status}`)}</span>;
}

export function TestChip() {
  const t = useT();
  return <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-foreground/[0.06] px-1.5 text-[0.6875rem] font-medium text-foreground/70">{t("landing.leads.test")}</span>;
}

/** The kind mark: the order form, or WhatsApp with the intent's `WA-` ref. */
export function KindMark({ lead }: { lead: LeadRow }) {
  const t = useT();
  const wa = lead.kind === "whatsapp";
  const Icon = wa ? MessageCircleIcon : ClipboardListIcon;
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground" title={t(wa ? "landing.leads.kind.whatsapp" : "landing.leads.kind.form")}>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="sr-only">{t(wa ? "landing.leads.kind.whatsapp" : "landing.leads.kind.form")}</span>
      {wa && lead.ref && (
        <bdi dir="ltr" className="font-mono text-[0.6875rem]">
          {lead.ref}
        </bdi>
      )}
    </span>
  );
}

/** The masked phone ("06 •• •• 12 34") in an LTR isolate, or "No phone yet" for an intent. */
export function MaskedPhone({ phone, className }: { phone: string | null; className?: string }) {
  const t = useT();
  if (!phone) return <span className={cn("text-muted-foreground", className)}>{t("landing.leads.noPhone")}</span>;
  return (
    <bdi dir="ltr" className={cn("shrink-0 font-mono whitespace-nowrap tabular-nums tracking-tight", className)}>
      {phone}
    </bdi>
  );
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

export function Assignee({ id, compact }: { id: string | null; compact?: boolean }) {
  const t = useT();
  const { me, members } = useInbox();
  if (!id) return <span className="text-xs text-muted-foreground">{t("landing.leads.unassigned")}</span>;
  const member = members.find((m) => m.id === id);
  const name = id === me ? t("landing.leads.you") : (member?.name ?? "…");
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5" title={member?.name}>
      <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-[0.625rem] font-semibold text-foreground/70">
        {initialsOf(member?.name ?? name)}
      </span>
      {!compact && <span className="truncate text-xs">{name}</span>}
    </span>
  );
}

/** WhatsApp and Call: the two main actions, on the card on a phone (44 px). */
export function ContactButtons({ lead, size = "row" }: { lead: LeadRow; size?: "row" | "sheet" }) {
  const t = useT();
  const { can, readOnly } = useInbox();
  const ops = useOps();
  const off = !!readOnly || !can.contact || !lead.phone;
  const title = readOnly ?? (!lead.phone ? t("landing.leads.noPhone") : undefined);
  const base =
    size === "sheet"
      ? "h-11 flex-1 rounded-xl px-4 text-sm"
      : "size-11 rounded-full p-0 lg:size-8 [&_svg]:size-[1.05rem] lg:[&_svg]:size-4";
  return (
    <div className={cn("flex shrink-0 items-center gap-1.5", size === "sheet" && "w-full gap-2")}>
      <Button
        type="button"
        variant={size === "sheet" ? "brand" : "ghost"}
        disabled={off}
        title={title ?? t("landing.leads.action.whatsapp")}
        aria-label={t("landing.leads.action.whatsapp")}
        className={cn(base, size === "row" && "text-foreground/80 ring-1 ring-foreground/10 ring-inset hover:bg-foreground/[0.04]")}
        onClick={(e) => {
          e.stopPropagation();
          ops.contact(lead, "whatsapp");
        }}
      >
        <MessageCircleIcon />
        {size === "sheet" && t("landing.leads.action.whatsapp")}
      </Button>
      <Button
        type="button"
        variant={size === "sheet" ? "outline" : "ghost"}
        disabled={off}
        title={title ?? t("landing.leads.action.call")}
        aria-label={t("landing.leads.action.call")}
        className={cn(base, size === "row" && "text-foreground/80 ring-1 ring-foreground/10 ring-inset hover:bg-foreground/[0.04]")}
        onClick={(e) => {
          e.stopPropagation();
          ops.contact(lead, "call");
        }}
      >
        <PhoneIcon />
        {size === "sheet" && t("landing.leads.action.call")}
      </Button>
    </div>
  );
}

/** The follow-up choices (LAN-§10.3 "Next follow-up"); the time is computed when the agent picks one. */
export const FOLLOW_UPS = ["in2h", "tomorrow", "in3d", "none"] as const;
export type FollowUpChoice = (typeof FOLLOW_UPS)[number];

/** In 2 hours, tomorrow at 10:00 (the agent's clock), in 3 days, or none. */
export function followUpAt(choice: FollowUpChoice, now: Date = new Date()): Date | null {
  if (choice === "none") return null;
  if (choice === "in2h") return new Date(now.getTime() + 2 * 3_600_000);
  if (choice === "in3d") return new Date(now.getTime() + 3 * 86_400_000);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  return tomorrow;
}

/** The row menu: Convert, Next follow-up, Assign (managers) and Mark lost. */
export function LeadMenu({ lead, className }: { lead: LeadRow; className?: string }) {
  const t = useT();
  const { can, readOnly, members, me } = useInbox();
  const ops = useOps();
  const open = isOpen(lead);
  const off = !!readOnly;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn("size-11 shrink-0 rounded-full text-muted-foreground data-open:bg-muted lg:size-8", className)}
          aria-label={t("landing.leads.action.more")}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-xl p-1.5" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem disabled={off || !can.convert || !open || !lead.phone} onSelect={() => ops.convert(lead)}>
          <ShoppingBagIcon /> {t("landing.leads.action.convert")}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={off || !can.write || !open}>
            <CalendarClockIcon /> {t("landing.leads.action.followUp")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="rounded-xl p-1.5">
            {FOLLOW_UPS.map((c) => (
              <DropdownMenuItem key={c} onSelect={() => ops.followUp(lead, followUpAt(c))}>
                {t(`landing.leads.followUp.${c}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {can.assign && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={off}>
              <UserRoundIcon /> {t("landing.leads.action.assign")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto rounded-xl p-1.5">
              <DropdownMenuItem onSelect={() => ops.assign([lead], me)}>{t("landing.leads.assign.toMe")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => ops.assign([lead], null)}>{t("landing.leads.assign.pool")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              {members
                .filter((m) => m.id !== me)
                .map((m) => (
                  <DropdownMenuItem key={m.id} onSelect={() => ops.assign([lead], m.id)}>
                    <span className="truncate">{m.name}</span>
                  </DropdownMenuItem>
                ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={off || !can.write || !open} onSelect={() => ops.lost([lead])}>
          <XCircleIcon /> {t("landing.leads.action.lost")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

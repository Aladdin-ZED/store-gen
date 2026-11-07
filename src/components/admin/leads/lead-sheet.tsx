"use client";
/**
 * The lead sheet, the convert sheet and the lost-reason sheet of the inbox (P3 LANDING; landing.md LAN-§10.3;
 * docs/STORE-SAAS.md §I.8 rule 6: drawers become full-height sheets on a phone, every swipe has a tap alternative).
 * The lead sheet shows what the read repository returned (masked phone, masked names under "View as store") and every
 * action of the row; the convert sheet sends only what the agent confirmed (the selection and the phone are read on
 * the server); the lost sheet asks for the reason; the set-phone sheet takes the number a WhatsApp chat revealed.
 */
import { CalendarClockIcon, PhoneIncomingIcon, ShoppingBagIcon, XCircleIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { LOST_REASONS, type ConvertLeadInput, type LeadRow, type LostReason } from "@/lib/leads/types";
import { cn } from "@/lib/utils";
import { ConfirmSheet } from "../landing/confirm-sheet";
import { ageText, intFmt, moneyText, whenText } from "./format";
import { Assignee, ContactButtons, FOLLOW_UPS, followUpAt, isOpen, KindMark, MaskedPhone, StatusPill, TestChip, useInbox, useOps } from "./lead-parts";

export function LeadSheet({ lead, now, onClose }: { lead: LeadRow | null; now: number; onClose: () => void }) {
  const t = useT();
  const locale = useAdminLocale();
  const { can, readOnly, members, me, timeZone } = useInbox();
  const ops = useOps();
  const num = intFmt(locale);
  return (
    <Sheet open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md">
        {lead && (
          <>
            <div className="sticky top-0 z-10 grid gap-3 border-b border-border/60 bg-popover/95 px-5 pt-5 pb-4 backdrop-blur">
              <div className="flex items-center gap-2">
                <StatusPill status={lead.status} />
                <KindMark lead={lead} />
                {lead.isTest && <TestChip />}
                <SheetClose asChild>
                  <Button variant="ghost" size="icon-sm" className="ms-auto rounded-full" aria-label={t("landing.leads.sheet.close")}>
                    <XIcon />
                  </Button>
                </SheetClose>
              </div>
              <div className="grid gap-1">
                <SheetTitle className="truncate text-lg font-semibold tracking-[-0.01em]">{lead.name || t("landing.leads.noName")}</SheetTitle>
                <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <MaskedPhone phone={lead.phone} className="text-foreground/80" />
                  <span aria-hidden="true" className="text-border">|</span>
                  <span>{t("landing.leads.sheet.captured", { time: whenText(lead.createdAt, timeZone, locale) })}</span>
                </SheetDescription>
              </div>
              {isOpen(lead) && <ContactButtons lead={lead} size="sheet" />}
              {isOpen(lead) && (
                <div className="flex gap-2">
                  <Button variant="outline" className="h-11 flex-1 rounded-xl" disabled={!!readOnly || !can.convert || !lead.phone} title={readOnly ?? undefined} onClick={() => ops.convert(lead)}>
                    <ShoppingBagIcon /> {t("landing.leads.action.convert")}
                  </Button>
                  <Button variant="ghost" className="h-11 rounded-xl text-destructive hover:bg-destructive/[0.06] hover:text-destructive" disabled={!!readOnly || !can.write} title={readOnly ?? undefined} onClick={() => ops.lost([lead])}>
                    <XCircleIcon /> {t("landing.leads.action.lost")}
                  </Button>
                </div>
              )}
            </div>

            <dl className="grid gap-px bg-border/50 text-sm">
              <Row label={t("landing.leads.sheet.selection")}>
                <span dir="auto">{lead.selection || "…"}</span>
              </Row>
              <Row label={t("landing.leads.sheet.total")}>
                <span className="font-semibold tabular-nums">{moneyText(lead.totalCents, lead.currency, locale) ?? "…"}</span>
              </Row>
              <Row label={t("landing.leads.sheet.page")}>{lead.pageName ?? "…"}</Row>
              <Row label={t("landing.leads.sheet.city")}>{lead.city ?? "…"}</Row>
              <Row label={t("landing.leads.sheet.attempts")}>
                <span className="tabular-nums">{num.format(lead.attempts)}</span>
                {lead.contactedAt && <span className="text-muted-foreground"> · {ageText(lead.contactedAt, now, locale)}</span>}
              </Row>
              <Row label={t("landing.leads.sheet.nextAt")}>{lead.nextAt ? whenText(lead.nextAt, timeZone, locale) : t("landing.leads.sheet.none")}</Row>
              <Row label={t("landing.leads.sheet.assignee")}>
                <Assignee id={lead.assigneeId} />
              </Row>
              {lead.lostReason && <Row label={t("landing.leads.sheet.reason")}>{t(`landing.leads.reason.${lead.lostReason}`)}</Row>}
              {lead.convertedOrderId && (
                <Row label={t("landing.leads.sheet.order")}>
                  <bdi dir="ltr" className="font-mono text-xs">
                    {lead.convertedOrderId}
                  </bdi>
                </Row>
              )}
              {lead.note && (
                <Row label={t("landing.leads.sheet.note")}>
                  <span dir="auto" className="whitespace-pre-wrap">
                    {lead.note}
                  </span>
                </Row>
              )}
              {lead.risk && (
                <Row label={t("landing.leads.sheet.history")}>
                  {lead.risk.blocked && <span className="me-2 font-medium text-destructive">{t("landing.leads.risk.blocked")}</span>}
                  <span className="text-muted-foreground">{t("landing.leads.risk.history", { orders: lead.risk.orders, delivered: lead.risk.delivered, refused: lead.risk.refused })}</span>
                </Row>
              )}
            </dl>

            {isOpen(lead) && (
              <div className="grid gap-5 px-5 py-5">
                <section className="grid gap-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <CalendarClockIcon aria-hidden="true" className="size-3.5" />
                    {t("landing.leads.action.followUp")}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {FOLLOW_UPS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        disabled={!!readOnly || !can.write}
                        title={readOnly ?? undefined}
                        onClick={() => ops.followUp(lead, followUpAt(c))}
                        className="inline-flex h-11 items-center rounded-full px-4 text-sm ring-1 ring-foreground/10 ring-inset outline-none transition-colors hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 lg:h-9"
                      >
                        {t(`landing.leads.followUp.${c}`)}
                      </button>
                    ))}
                  </div>
                </section>
                {can.assign && (
                  <section className="grid gap-2">
                    <Label htmlFor="lead-assignee" className="text-xs font-medium text-muted-foreground">
                      {t("landing.leads.action.assign")}
                    </Label>
                    <Select disabled={!!readOnly} value={lead.assigneeId ?? "none"} onValueChange={(v) => ops.assign([lead], v === "none" ? null : v)}>
                      <SelectTrigger id="lead-assignee" className="h-11 w-full rounded-xl lg:h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="none">{t("landing.leads.unassigned")}</SelectItem>
                        {members.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.id === me ? `${m.name} (${t("landing.leads.you")})` : m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </section>
                )}
                <p className="hidden text-xs text-muted-foreground lg:block">{t("landing.leads.keys")}</p>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 bg-popover px-5 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** "Mark lost" with its reason, for one lead or a bulk selection. */
export function LostSheet({ leads, onClose, onConfirm }: { leads: LeadRow[] | null; onClose: () => void; onConfirm: (leads: LeadRow[], reason: LostReason) => Promise<boolean> }) {
  const t = useT();
  const [reason, setReason] = useState<LostReason | null>(null);
  if (!leads) return null;
  const title = leads.length === 1 ? `${t("landing.leads.action.lost")}: ${leads[0]!.name || t("landing.leads.noName")}` : `${t("landing.leads.action.lost")} (${leads.length})`;
  return (
    <ConfirmSheet
      open
      onOpenChange={(o) => !o && onClose()}
      icon={<XCircleIcon />}
      destructive
      title={title}
      description={t("landing.leads.sheet.reason")}
      confirmLabel={t("landing.leads.action.lost")}
      cancelLabel={t("landing.leads.convert.cancel")}
      disabled={!reason}
      onConfirm={async () => (reason ? onConfirm(leads, reason) : false)}
    >
      <div role="radiogroup" aria-label={t("landing.leads.sheet.reason")} className="grid grid-cols-2 gap-2">
        {LOST_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={reason === r}
            onClick={() => setReason(r)}
            className={cn(
              "flex h-11 items-center justify-center rounded-xl px-3 text-sm ring-1 ring-inset outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
              reason === r ? "bg-destructive/[0.07] font-medium text-destructive ring-destructive/30" : "ring-foreground/10 hover:bg-foreground/[0.03]",
            )}
          >
            {t(`landing.leads.reason.${r}`)}
          </button>
        ))}
      </div>
    </ConfirmSheet>
  );
}

/**
 * Convert to order: the lead's name and city prefilled, address and note optional, "The customer already confirmed"
 * on by default (a phone order). The draft id is drawn once per sheet: it is the order's `idem`, so a double submit
 * answers the first order.
 */
export function ConvertSheet({
  lead,
  idem,
  onClose,
  onSubmit,
}: {
  lead: LeadRow | null;
  /** the sheet's draft id (a UUID drawn when the sheet opened): the order's `idem` */
  idem: string;
  onClose: () => void;
  onSubmit: (lead: LeadRow, input: ConvertLeadInput) => Promise<string | null>;
}) {
  const t = useT();
  const locale = useAdminLocale();
  const [name, setName] = useState(lead?.name ?? "");
  const [city, setCity] = useState(lead?.city ?? "");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  if (!lead) return null;
  const total = moneyText(lead.totalCents, lead.currency, locale);
  return (
    <ConfirmSheet
      open
      onOpenChange={(o) => !o && onClose()}
      icon={<ShoppingBagIcon />}
      title={t("landing.leads.convert.title")}
      description={t("landing.leads.convert.description")}
      confirmLabel={t("landing.leads.convert.submit")}
      cancelLabel={t("landing.leads.convert.cancel")}
      error={error}
      disabled={!name.trim() || !city.trim()}
      onConfirm={async () => {
        setError(null);
        const problem = await onSubmit(lead, { name: name.trim(), city: city.trim(), ...(address.trim() ? { address: address.trim() } : {}), ...(note.trim() ? { note: note.trim() } : {}), confirmed, idem });
        if (problem) setError(problem);
        return !problem;
      }}
    >
      <div className="grid gap-4">
        <div className="flex items-start justify-between gap-3 rounded-xl bg-foreground/[0.03] px-3.5 py-3 ring-1 ring-foreground/[0.06] ring-inset">
          <span dir="auto" className="min-w-0 text-sm text-pretty">
            {lead.selection || "…"}
          </span>
          {total && <span className="shrink-0 text-sm font-semibold tabular-nums">{total}</span>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cv-name">{t("landing.leads.convert.name")}</Label>
          <Input id="cv-name" dir="auto" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" autoComplete="off" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cv-city">{t("landing.leads.convert.city")}</Label>
          <Input id="cv-city" dir="auto" value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} className="h-11 rounded-xl" autoComplete="off" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cv-address">
            {t("landing.leads.convert.address")} <span className="font-normal text-muted-foreground">{t("landing.common.optional")}</span>
          </Label>
          <Input id="cv-address" dir="auto" value={address} maxLength={240} onChange={(e) => setAddress(e.target.value)} className="h-11 rounded-xl" autoComplete="off" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cv-note">
            {t("landing.leads.convert.note")} <span className="font-normal text-muted-foreground">{t("landing.common.optional")}</span>
          </Label>
          <Textarea id="cv-note" dir="auto" value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} className="rounded-xl" />
        </div>
        <label className="flex items-start justify-between gap-4 rounded-xl px-3.5 py-3 ring-1 ring-foreground/10 ring-inset">
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">{t("landing.leads.convert.confirmed")}</span>
            <span className="text-xs text-muted-foreground">{t("landing.leads.convert.confirmedHint")}</span>
          </span>
          <Switch checked={confirmed} onCheckedChange={setConfirmed} className="mt-0.5" />
        </label>
      </div>
    </ConfirmSheet>
  );
}

/**
 * "Set phone" on a WhatsApp intent (LAN-§10.3, LP-11): the number the chat shows, in an LTR field. The server checks it
 * against the store's market and links a form lead of the same person (24 h); a refusal shows inline.
 */
export function SetPhoneSheet({ lead, onClose, onSave }: { lead: LeadRow | null; onClose: () => void; onSave: (lead: LeadRow, phone: string) => Promise<string | null> }) {
  const t = useT();
  const locale = useAdminLocale();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!lead) return null;
  const total = moneyText(lead.totalCents, lead.currency, locale);
  return (
    <ConfirmSheet
      open
      onOpenChange={(o) => !o && onClose()}
      icon={<PhoneIncomingIcon />}
      title={t("landing.leads.setPhone.title")}
      description={t("landing.leads.setPhone.description")}
      confirmLabel={t("landing.leads.setPhone.save")}
      cancelLabel={t("landing.leads.convert.cancel")}
      error={error}
      disabled={phone.replace(/\D/g, "").length < 6}
      onConfirm={async () => {
        setError(null);
        const problem = await onSave(lead, phone.trim());
        if (problem) setError(problem);
        return !problem;
      }}
    >
      <div className="grid gap-4">
        <div className="flex items-start justify-between gap-3 rounded-xl bg-foreground/[0.03] px-3.5 py-3 ring-1 ring-foreground/[0.06] ring-inset">
          <span className="grid min-w-0 gap-1">
            <KindMark lead={lead} />
            <span dir="auto" className="text-sm text-pretty">
              {lead.selection || "…"}
            </span>
          </span>
          {total && <span className="shrink-0 text-sm font-semibold tabular-nums">{total}</span>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sp-phone">{t("landing.leads.setPhone.label")}</Label>
          <Input
            id="sp-phone"
            dir="ltr"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={phone}
            maxLength={24}
            onChange={(e) => setPhone(e.target.value)}
            className="h-11 rounded-xl font-mono tracking-tight tabular-nums"
          />
        </div>
      </div>
    </ConfirmSheet>
  );
}

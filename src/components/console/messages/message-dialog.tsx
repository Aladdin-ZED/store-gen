"use client";
/**
 * "Message" to stores (platform.md PLA-§19.1, §M.1 `messageStoresAction`, `notify.stores`): plain text ≤ 600
 * characters, an optional link (an `/app/<handle>/…` path, or an https URL that travels as text, never a link), the
 * audience (owners, or owners and admins), info or warn, and the preview as the store will see it in its
 * notification centre. One store from the profile; up to 50 from the stores list's bulk bar (admin and super admin;
 * support messages one store at a time). Never an e-mail in R1. One operation id per opening (PLA-§4.5).
 *
 *   <MessageDialog open stores={[{ id, name, handle }]} onOpenChange={setOpen} onSent={() => setSelected(new Set())} />
 */
import { BellIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { messageStoresAction } from "@/app/admin/(console)/stores/actions";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { newOpId } from "../op";
import { button, ConsoleDialog, NoteField } from "../queue/decision-dialogs";

export const MESSAGE_LIMIT = 600;
export const MESSAGE_STORES_LIMIT = 50;

/** The same rule as the server (src/lib/platform/messages.ts `linkOk`): a dashboard path, or an https URL. */
export function linkProblem(v: string): "path" | null {
  if (!v) return null;
  return /^\/app\/[a-z0-9-]{3,30}(\/[A-Za-z0-9/_.?=&%-]*)?$/.test(v) || /^https:\/\/[^\s/$.?#][^\s]*$/i.test(v) ? null : "path";
}

export interface MessageTarget {
  id: string;
  name: string;
  handle: string | null;
}

export function MessageDialog({ open, onOpenChange, stores, onSent }: { open: boolean; onOpenChange(o: boolean): void; stores: MessageTarget[]; onSent?(): void }) {
  const t = useT();
  const linkId = useId();
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [audience, setAudience] = useState<"owners" | "owners_admins">("owners");
  const [severity, setSeverity] = useState<"info" | "warn">("info");
  const [tried, setTried] = useState(false);
  const [pending, start] = useTransition();
  const [opId, setOpId] = useState(newOpId);
  // each opening starts empty, with its own operation id
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setText("");
      setLink("");
      setAudience("owners");
      setSeverity("info");
      setTried(false);
      setOpId(newOpId());
    }
  }

  const linkBad = linkProblem(link.trim());
  const external = !!link.trim() && link.trim().startsWith("https://");
  const total = text.trim().length + (external ? link.trim().length + 1 : 0);
  const tooMany = stores.length > MESSAGE_STORES_LIMIT;
  const send = () => {
    setTried(true);
    if (!text.trim() || total > MESSAGE_LIMIT || linkBad || tooMany) return;
    start(async () => {
      const r = await messageStoresAction({ storeIds: stores.map((s) => s.id), text: text.trim(), ...(link.trim() ? { link: link.trim() } : {}), audience, severity, opId });
      if (!r.ok) {
        toast.error(r.message ? t(r.message) : t("console.message.failed"));
        return;
      }
      const { sent, skipped } = r.data;
      if (skipped.length) toast.warning(t("console.message.sent_skipped", { sent: sent.length, skipped: skipped.length }));
      else toast.success(sent.length === 1 ? t("console.message.sent_one", { store: stores[0]?.handle ? `@${stores[0].handle}` : (stores[0]?.name ?? "") }) : t("console.message.sent", { count: sent.length }));
      onOpenChange(false);
      onSent?.();
    });
  };

  const SevIcon = severity === "warn" ? TriangleAlertIcon : InfoIcon;
  const to = stores.length === 1 ? (stores[0]!.handle ? `@${stores[0]!.handle}` : stores[0]!.name) : t("console.message.n_stores", { count: stores.length });

  return (
    <ConsoleDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("console.message.title", { to })}
      description={t("console.message.lead")}
      footer={
        <>
          <DialogPrimitive.Close className={cn(button.base, button.ghost)}>{t("console.dialog.cancel")}</DialogPrimitive.Close>
          <button type="button" disabled={pending || tooMany} onClick={send} className={cn(button.base, button.primary)}>
            {stores.length === 1 ? t("console.message.send_one") : t("console.message.send", { count: stores.length })}
          </button>
        </>
      }
    >
      {tooMany && <p className="rounded-[var(--r-control)] bg-[var(--c-warn-soft)] px-3 py-2 text-[12.5px]">{t("console.message.too_many", { max: MESSAGE_STORES_LIMIT })}</p>}
      <NoteField label={t("console.message.text")} value={text} onChange={setText} max={MESSAGE_LIMIT} required rows={4} autoFocus problem={tried && !text.trim() ? t("console.message.text_required") : tried && total > MESSAGE_LIMIT ? t("console.message.too_long") : null} />

      <div className="grid gap-1.5">
        <label htmlFor={linkId} className="text-[12.5px] font-medium">
          {t("console.message.link")}
          <span className="ms-1.5 font-normal text-muted-foreground">{t("console.form.optional")}</span>
        </label>
        <input
          id={linkId}
          dir="ltr"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={link}
          onChange={(e) => setLink(e.target.value)}
          aria-invalid={(tried && !!linkBad) || undefined}
          className="h-[var(--ctl)] w-full rounded-[var(--r-control)] bg-background px-3 font-mono text-[12.5px] shadow-[inset_0_0_0_1px_var(--input)] outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)] aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--c-danger-ink)] max-md:h-11"
        />
        <p className={cn("text-[12px]", tried && linkBad ? "text-[var(--c-danger-ink)]" : "text-muted-foreground")}>{tried && linkBad ? t("console.message.link_invalid") : t("console.message.link_hint")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset className="grid gap-1.5">
          <legend className="mb-1 text-[12.5px] font-medium">{t("console.message.audience")}</legend>
          {(["owners", "owners_admins"] as const).map((a) => (
            <label key={a} className="flex min-h-8 cursor-pointer items-center gap-2 text-[13px] max-md:min-h-11">
              <input type="radio" name="msg-audience" checked={audience === a} onChange={() => setAudience(a)} className="size-3.5 accent-[var(--brand)]" />
              {t(`console.message.audience.${a}`)}
            </label>
          ))}
        </fieldset>
        <fieldset className="grid gap-1.5">
          <legend className="mb-1 text-[12.5px] font-medium">{t("console.message.severity")}</legend>
          {(["info", "warn"] as const).map((s) => (
            <label key={s} className="flex min-h-8 cursor-pointer items-center gap-2 text-[13px] max-md:min-h-11">
              <input type="radio" name="msg-severity" checked={severity === s} onChange={() => setSeverity(s)} className="size-3.5 accent-[var(--brand)]" />
              {t(`console.message.severity.${s}`)}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="grid gap-1.5">
        <span className="text-[12.5px] font-medium">{t("console.message.preview")}</span>
        <div className="rounded-[var(--r-card)] bg-background p-3 shadow-[inset_0_0_0_1px_var(--c-hairline)]">
          <div className="flex items-start gap-2.5">
            <span className={cn("mt-0.5 inline-grid size-7 shrink-0 place-items-center rounded-full", severity === "warn" ? "bg-[var(--c-warn-soft)] text-[oklch(0.45_0.09_95)] dark:text-[oklch(0.86_0.11_95)]" : "bg-[var(--c-info-soft)] text-[var(--c-info-ink)]")}>
              <SevIcon aria-hidden="true" className="size-3.5" />
            </span>
            <div className="grid min-w-0 flex-1 gap-0.5">
              <span className="flex items-center gap-1.5 text-[13px] font-medium">
                {t("notify.staff.message.title")}
                <BellIcon aria-hidden="true" className="size-3 text-muted-foreground" />
              </span>
              <p className={cn("text-[13px] whitespace-pre-wrap break-words", !text.trim() && "text-muted-foreground italic")}>{text.trim() || t("console.message.preview_empty")}</p>
              {external && (
                <bdi dir="ltr" className="block truncate font-mono text-[12px] text-muted-foreground">
                  {link.trim()}
                </bdi>
              )}
              {link.trim().startsWith("/app/") && !linkBad && <span className="text-[12px] font-medium text-[var(--c-brand-ink)]">{t("console.message.preview_open")}</span>}
            </div>
          </div>
        </div>
        <p className="text-[11.5px] text-muted-foreground">{t("console.message.preview_hint")}</p>
      </div>
    </ConsoleDialog>
  );
}

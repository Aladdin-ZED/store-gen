"use client";
/**
 * The console's form and status kit for the settings, security, health and domains screens (platform.md PLA-§4.7,
 * §13-§17; design.md DES-§16.17): one card frame, one field frame, the status line (text + icon, never colour
 * alone), meters, the segmented control, the typed confirmation, the shown-once secret (Copy + WhatsApp) and the
 * save hook (opId + step-up through useGuarded, then a toast and a refresh).
 *
 *   const save = useSave();
 *   await save.run((opId) => savePlatformSettingsAction({ section: "brand", patch, opId }), t("console.settings.saved"));
 *   <SettingsCard title=… lead=… footer={<SaveBar save={save} dirty={dirty} onSave={…} />}>…</SettingsCard>
 */
import { AlertTriangleIcon, CheckCircle2Icon, CircleIcon, InfoIcon, LinkIcon, MessageCircleIcon, XCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, type ReactNode } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/admin/common/copy-button";
import { useT } from "@/lib/i18n/admin/client";
import type { ActionResult } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import { useGuarded, type Guarded } from "./guarded";
import { PrefetchLink } from "./prefetch-link";
import { card, inputCls } from "./kit-styles";
import { button } from "./queue/decision-dialogs";

export { button };

export { card, inputCls, td, th } from "./kit-styles";

/** The page heading of a console screen. */
export function PageHeader({ title, lead, aside }: { title: string; lead?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid min-w-0 gap-1">
        <h1 className="text-[20px] leading-tight font-semibold tracking-[-0.014em]">{title}</h1>
        {lead && <p className="max-w-[68ch] text-[13px] text-muted-foreground">{lead}</p>}
      </div>
      {aside}
    </header>
  );
}

/** Tabs as links (the tab lives in the URL): `?tab=` on the current path. */
export function TabNav({ label, tabs, current }: { label: string; tabs: { id: string; href: string; label: string; count?: number | null }[]; current: string }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1 border-b border-[var(--c-hairline)]">
        {tabs.map((x) => (
          <li key={x.id}>
            <PrefetchLink
              href={x.href}
              aria-current={x.id === current ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex h-10 items-center gap-1.5 border-b-2 border-transparent px-3 text-[13px] text-muted-foreground outline-none transition-colors duration-[var(--dur-1)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:h-11",
                x.id === current && "border-[var(--brand)] font-medium text-foreground",
              )}
            >
              {x.label}
              {typeof x.count === "number" && x.count > 0 && <span className="num rounded-full bg-muted px-1.5 text-[11px] leading-[18px] text-muted-foreground">{x.count}</span>}
            </PrefetchLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** One settings block: a title, a sentence of what it does, the fields, and its own save bar. */
export function SettingsCard({ title, lead, aside, children, footer, className, id }: { title: string; lead?: ReactNode; aside?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} aria-label={title} className={cn(card, "scroll-mt-20", className)}>
      <div className="flex flex-wrap items-start gap-3 px-4 pt-4 pb-3 md:px-5">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 className="text-[14px] font-semibold tracking-[-0.006em]">{title}</h2>
          {lead && <p className="max-w-[68ch] text-[12.5px] text-muted-foreground">{lead}</p>}
        </div>
        {aside}
      </div>
      <div className="grid gap-4 px-4 pb-4 md:px-5">{children}</div>
      {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--c-hairline)] px-4 py-3 md:px-5">{footer}</div>}
    </section>
  );
}

/** A labelled field: the label, the control (`children(id)`), and one line of hint or problem. */
export function Field({ label, hint, problem, optional, children, className }: { label: string; hint?: ReactNode; problem?: string | null; optional?: boolean; children: (id: string, describedBy: string | undefined) => ReactNode; className?: string }) {
  const id = useId();
  const t = useT();
  const d = hint || problem ? `${id}-d` : undefined;
  return (
    <div className={cn("grid min-w-0 content-start gap-1.5", className)}>
      <label htmlFor={id} className="text-[12.5px] font-medium">
        {label}
        {optional && <span className="ms-1.5 font-normal text-muted-foreground">{t("console.form.optional")}</span>}
      </label>
      {children(id, d)}
      {(problem || hint) && (
        <p id={d} className={cn("text-[12px]", problem ? "text-[var(--c-danger-ink)]" : "text-muted-foreground")}>
          {problem ?? hint}
        </p>
      )}
    </div>
  );
}

/** A switch with its label and the sentence of what it changes. */
export function SwitchRow({ label, hint, checked, onChange, disabled }: { label: string; hint?: ReactNode; checked: boolean; onChange(v: boolean): void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid min-w-0 gap-0.5">
        <label htmlFor={id} className="text-[12.5px] font-medium">
          {label}
        </label>
        {hint && <p className="text-[12px] text-muted-foreground">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full outline-none transition-colors duration-[var(--dur-1)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1 disabled:opacity-50 max-md:my-2.5",
          checked ? "bg-[var(--brand)]" : "bg-[color-mix(in_oklch,var(--foreground)_18%,transparent)]",
        )}
      >
        <span className={cn("inline-block size-4 rounded-full bg-white shadow-sm transition-transform duration-[var(--dur-1)]", checked ? "translate-x-[18px] rtl:-translate-x-[18px]" : "translate-x-0.5 rtl:-translate-x-0.5")} />
      </button>
    </div>
  );
}

/** A segmented control (radio group) whose options each carry one sentence. */
export function Segmented<V extends string>({ label, value, options, onChange, disabled }: { label: string; value: V | null; options: { value: V; label: string; note?: string; mark?: string }[]; onChange(v: V): void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "grid min-h-11 content-start gap-1 rounded-[var(--r-control)] px-3 py-2.5 text-start outline-none transition-[background-color,box-shadow] duration-[var(--dur-1)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60",
              on ? "bg-[color-mix(in_oklch,var(--brand)_9%,var(--card))] shadow-[inset_0_0_0_1.5px_var(--brand)]" : "bg-card shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent",
            )}
          >
            <span className="flex items-center gap-2 text-[13px] font-medium">
              <span aria-hidden="true" className={cn("inline-grid size-3.5 place-items-center rounded-full shadow-[inset_0_0_0_1.5px_currentColor]", on ? "text-[var(--brand)]" : "text-muted-foreground/60")}>
                {on && <span className="size-1.5 rounded-full bg-current" />}
              </span>
              {o.label}
              {o.mark && <span className="rounded-[var(--r-chip)] bg-muted px-1.5 text-[10.5px] font-medium text-muted-foreground">{o.mark}</span>}
            </span>
            {o.note && <span className="text-[11.5px] leading-[1.45] text-muted-foreground">{o.note}</span>}
          </button>
        );
      })}
    </div>
  );
}

export type Tone = "ok" | "warn" | "danger" | "info" | "neutral";
const TONE: Record<Tone, { icon: typeof InfoIcon; cls: string }> = {
  ok: { icon: CheckCircle2Icon, cls: "text-[oklch(0.42_0.1_160)] dark:text-[oklch(0.82_0.1_160)]" },
  warn: { icon: AlertTriangleIcon, cls: "text-[oklch(0.45_0.09_95)] dark:text-[oklch(0.86_0.11_95)]" },
  danger: { icon: XCircleIcon, cls: "text-[var(--c-danger-ink)]" },
  info: { icon: InfoIcon, cls: "text-[var(--c-info-ink)]" },
  neutral: { icon: CircleIcon, cls: "text-muted-foreground" },
};
export const toneSoft: Record<Tone, string> = {
  ok: "bg-[var(--c-success-soft)]",
  warn: "bg-[var(--c-warn-soft)]",
  danger: "bg-[var(--c-danger-soft)]",
  info: "bg-[var(--c-info-soft)]",
  neutral: "bg-muted",
};

/** A state as text with its icon (PLA-§4.7 rule 8: never colour alone); `title` names the alarm behind it. */
export function StatusText({ tone, children, title, className }: { tone: Tone; children: ReactNode; title?: string; className?: string }) {
  const { icon: Icon, cls } = TONE[tone];
  return (
    <span title={title} className={cn("inline-flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium", cls, className)}>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </span>
  );
}

/** A tinted one-line banner (warnings, the owner rule, the red facts). */
export function Banner({ tone, children, action }: { tone: Tone; children: ReactNode; action?: ReactNode }) {
  const { icon: Icon, cls } = TONE[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex flex-wrap items-start gap-2.5 rounded-[var(--r-control)] px-3 py-2.5 text-[12.5px]", toneSoft[tone])}>
      <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", cls)} />
      <div className="min-w-0 flex-1 leading-[1.5]">{children}</div>
      {action}
    </div>
  );
}

/** A meter: used of limit, the bar tinted by its tone, and the sentence under it. */
export function Meter({ label, used, limit, text, tone }: { label: string; used: number; limit: number; text: ReactNode; tone?: Tone }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const k: Tone = tone ?? (pct >= 95 ? "danger" : pct >= 80 ? "warn" : "ok");
  const bar = k === "danger" ? "bg-[var(--c-danger-ink)]" : k === "warn" ? "bg-[oklch(0.72_0.13_95)]" : "bg-[var(--brand)]";
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
        <span className="font-medium">{label}</span>
        <span className="num text-muted-foreground">{pct} %</span>
      </div>
      <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)} className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-[width] duration-[var(--dur-2)]", bar)} style={{ width: `${Math.max(pct, used > 0 ? 2 : 0)}%` }} />
      </div>
      <p className="text-[12px] text-muted-foreground">{text}</p>
    </div>
  );
}

/** The typed confirmation of a dangerous switch: the word shown in mono, the input, matched case-folded. */
export function TypedConfirm({ word, value, onChange, label }: { word: string; value: string; onChange(v: string): void; label?: string }) {
  const t = useT();
  return (
    <Field label={label ?? t("console.form.type_to_confirm", { word })}>
      {(id, d) => <input id={id} aria-describedby={d} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" spellCheck={false} dir="ltr" placeholder={word} className={cn(inputCls, "font-mono")} />}
    </Field>
  );
}
export const typedOk = (value: string, word: string) => value.trim().toLowerCase() === word;

/** A secret shown once (an invite link or code): Copy, WhatsApp share with a prepared text, and the once line. */
export function ShownOnce({ value, shareText, copyLabel, mono = true }: { value: string; shareText: string; copyLabel: string; mono?: boolean }) {
  const t = useT();
  return (
    <div className="grid gap-2">
      <div className="flex min-w-0 items-center gap-2 rounded-[var(--r-control)] bg-background px-3 py-2 shadow-[inset_0_0_0_1px_var(--input)]">
        <LinkIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <bdi dir="ltr" className={cn("min-w-0 flex-1 truncate text-[12.5px] select-all", mono && "font-mono")}>
          {value}
        </bdi>
        <CopyButton value={value} label={copyLabel} toastMessage={t("console.form.copied")} />
      </div>
      <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className={cn(button.base, button.secondary, "justify-self-start")}>
        <MessageCircleIcon aria-hidden="true" className="size-3.5" />
        {t("console.form.whatsapp")}
      </a>
    </div>
  );
}

/** The save hook of a settings card: one opId per open form, step-up when asked, toast + refresh on success. */
export function useSave(): Guarded & { save<T>(call: (opId: string) => Promise<ActionResult<T>>, done?: string, onDone?: (data: T) => void): Promise<T | null> } {
  const g = useGuarded("console.settings.save_failed");
  const router = useRouter();
  return {
    ...g,
    async save(call, done, onDone) {
      return g.run(call, (data) => {
        g.reset();
        if (done) toast.success(done);
        onDone?.(data);
        router.refresh();
      });
    },
  };
}

/** The footer of a settings card: the problem line, Reset and Save. */
export function SaveBar({ save, dirty, onSave, onReset, label, disabled }: { save: Guarded; dirty: boolean; onSave(): void; onReset?(): void; label?: string; disabled?: boolean }) {
  const t = useT();
  return (
    <>
      {save.problem && (
        <p role="alert" className="me-auto text-[12px] text-[var(--c-danger-ink)]">
          {save.problem}
        </p>
      )}
      {!save.problem && dirty && <p className="me-auto text-[12px] text-muted-foreground">{t("console.form.unsaved")}</p>}
      {onReset && dirty && (
        <button type="button" onClick={onReset} className={cn(button.base, button.ghost)}>
          {t("console.form.reset")}
        </button>
      )}
      <button type="button" disabled={!dirty || save.busy || disabled} onClick={onSave} className={cn(button.base, button.primary)}>
        {save.busy ? t("console.form.saving") : (label ?? t("console.form.save"))}
      </button>
      {save.sheet}
    </>
  );
}

/** A quiet empty line inside a card or a table. */
export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-[12.5px] text-muted-foreground md:px-5">{children}</p>;
}

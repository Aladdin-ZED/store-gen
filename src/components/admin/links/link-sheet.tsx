"use client";
/**
 * The create sheet and the "change what it opens" sheet of the links screen (P3 LANDING; landing.md LAN-§12.2, rev 3
 * SEC-6). The target is picked, never typed: a live page of the store, the store home or a policy page. The channel
 * preset fills `utm_source` / `utm_medium` (both stay editable), then the campaign, the content and an optional code.
 * The preview shows the short address and where a visitor lands with the tags, built by the same query rule as the
 * route (src/lib/links/query.ts). Refusals show inline under their field; a refused charge opens the limit sheet.
 */
import { Loader2Icon, XIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n/admin/client";
import { codeProblem, normaliseCode } from "@/lib/links/codes";
import { linkQuery } from "@/lib/links/query";
import type { LinkPageOption } from "@/lib/links/read";
import { CHANNEL_PRESETS, POLICY_KINDS, SHORT_LINK_CHANNELS, type CampaignChannel, type LinkTarget, type ShortLinkUtm } from "@/lib/links/types";
import { cn } from "@/lib/utils";
import { useStore } from "../shell/store-context";
import { shortPath } from "./link-parts";

export type FieldErrors = Partial<Record<"target" | "code" | "utm" | "form", string>>;

/** "page:<id>" | "home" | "policy:<kind>" (the picker's value) */
export const targetValue = (t: LinkTarget | null): string => (!t ? "" : t.kind === "page" ? `page:${t.pageId}` : t.kind === "home" ? "home" : `policy:${t.policy}`);
export function targetOfValue(v: string): LinkTarget | null {
  if (v === "home") return { kind: "home" };
  if (v.startsWith("page:")) return { kind: "page", pageId: v.slice(5) };
  const kind = v.startsWith("policy:") ? v.slice(7) : "";
  return (POLICY_KINDS as readonly string[]).includes(kind) ? { kind: "policy", policy: kind as (typeof POLICY_KINDS)[number] } : null;
}

/** The store path a target opens (the preview), "" for the home. */
function targetSlug(t: LinkTarget | null, pages: readonly LinkPageOption[]): string | null {
  if (!t) return null;
  if (t.kind === "home") return "";
  if (t.kind === "policy") return `policies/${t.policy}`;
  return pages.find((p) => p.id === t.pageId)?.slug ?? null;
}

function Field({ id, label, hint, error, children, className }: { id: string; label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={id} className="text-[0.8125rem] font-medium">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[0.8125rem] leading-snug text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[0.8125rem] leading-snug text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TargetPicker({ id, value, onChange, pages, invalid }: { id: string; value: LinkTarget | null; onChange: (t: LinkTarget | null) => void; pages: readonly LinkPageOption[]; invalid?: boolean }) {
  const t = useT();
  return (
    <Select value={targetValue(value)} onValueChange={(v) => onChange(targetOfValue(v))}>
      <SelectTrigger id={id} aria-invalid={invalid || undefined} className="h-10 w-full">
        <SelectValue placeholder={t("landing.links.field.targetPlaceholder")} />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-80">
        <SelectGroup>
          <SelectLabel>{t("landing.links.group.pages")}</SelectLabel>
          {pages.length ? (
            pages.map((p) => (
              <SelectItem key={p.id} value={`page:${p.id}`}>
                <span className="truncate">{p.title}</span>
                <bdi dir="ltr" className="ms-2 truncate font-mono text-xs text-muted-foreground">
                  /{p.slug}
                </bdi>
              </SelectItem>
            ))
          ) : (
            <p className="px-2 py-1.5 text-[0.8125rem] text-muted-foreground">{t("landing.links.noPages")}</p>
          )}
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>{t("landing.links.group.store")}</SelectLabel>
          <SelectItem value="home">{t("landing.links.target.home")}</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>{t("landing.links.group.policies")}</SelectLabel>
          {POLICY_KINDS.map((k) => (
            <SelectItem key={k} value={`policy:${k}`}>
              {t(`landing.links.policy.${k}`)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function SheetShell({ open, onClose, title, description, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; description: ReactNode; children: ReactNode; footer: ReactNode }) {
  const t = useT();
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="flex w-full flex-col gap-0 p-0 sm:max-w-[30rem]">
        <div className="flex items-start gap-3 border-b border-border/70 px-6 pt-5 pb-4">
          <div className="grid min-w-0 flex-1 gap-1">
            <SheetTitle className="text-lg font-semibold tracking-[-0.01em] text-balance">{title}</SheetTitle>
            <SheetDescription className="text-sm leading-relaxed text-pretty">{description}</SheetDescription>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("landing.links.close")} className="-me-2 shrink-0 text-muted-foreground">
              <XIcon className="size-4" />
            </Button>
          </SheetClose>
        </div>
        <div className="grid flex-1 content-start gap-5 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t border-border/70 px-6 py-4">{footer}</div>
      </SheetContent>
    </Sheet>
  );
}

export interface CreateLinkValues {
  target: LinkTarget;
  channel: CampaignChannel | null;
  utm: ShortLinkUtm;
  code: string | null;
}

export function CreateLinkSheet(p: {
  open: boolean;
  onClose: () => void;
  pages: readonly LinkPageOption[];
  /** answers the field errors to show, or null when the link was created (the sheet then closes) */
  onSubmit: (v: CreateLinkValues) => Promise<FieldErrors | null>;
}) {
  const t = useT();
  const store = useStore();
  const [target, setTarget] = useState<LinkTarget | null>(p.pages[0] ? { kind: "page", pageId: p.pages[0].id } : null);
  const [channel, setChannel] = useState<CampaignChannel | null>("meta");
  const [utm, setUtm] = useState<Required<Pick<ShortLinkUtm, "source" | "medium" | "campaign" | "content">>>({ ...CHANNEL_PRESETS.meta, campaign: "", content: "" });
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  const chosen = normaliseCode(code);
  const codeError = chosen && codeProblem(chosen) ? t(codeProblem(chosen) === "reserved" ? "landing.links.error.code_reserved" : "landing.links.error.code_format") : undefined;
  const slug = targetSlug(target, p.pages);
  const landing = useMemo(() => {
    if (slug === null) return null;
    const q = linkQuery(utm, "");
    return store.live(slug) + (q ? `?${q}` : "");
  }, [slug, utm, store]);

  const pickChannel = (c: CampaignChannel | null) => {
    setChannel(c);
    if (c) setUtm((u) => ({ ...u, ...CHANNEL_PRESETS[c] }));
  };
  const set = (k: keyof typeof utm) => (e: React.ChangeEvent<HTMLInputElement>) => setUtm((u) => ({ ...u, [k]: e.target.value }));

  const submit = async () => {
    if (!target) return setErrors({ target: t("landing.links.error.target") });
    if (codeError) return setErrors({ code: codeError });
    setPending(true);
    try {
      const res = await p.onSubmit({ target, channel, utm, code: chosen });
      setErrors(res ?? {});
    } finally {
      setPending(false);
    }
  };

  return (
    <SheetShell
      open={p.open}
      onClose={p.onClose}
      title={t("landing.links.sheet.title")}
      description={t("landing.links.sheet.description")}
      footer={
        <>
          <Button variant="ghost" onClick={p.onClose} disabled={pending}>
            {t("landing.links.cancel")}
          </Button>
          <Button variant="brand" onClick={submit} disabled={pending || !target} className="min-w-32">
            {pending && <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />}
            {pending ? t("landing.links.saving") : t("landing.links.create")}
          </Button>
        </>
      }
    >
      {errors.form && (
        <p role="alert" className="rounded-xl bg-destructive/[0.07] px-3 py-2 text-sm text-destructive ring-1 ring-destructive/15 ring-inset">
          {errors.form}
        </p>
      )}
      <Field id="link-target" label={t("landing.links.field.target")} error={errors.target}>
        <TargetPicker id="link-target" value={target} onChange={(v) => (setTarget(v), setErrors((e) => ({ ...e, target: undefined })))} pages={p.pages} invalid={!!errors.target} />
      </Field>

      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-[0.8125rem] font-medium">{t("landing.links.field.channel")}</legend>
        <div role="radiogroup" aria-label={t("landing.links.field.channel")} className="flex flex-wrap gap-1.5">
          {[...SHORT_LINK_CHANNELS, null].map((c) => {
            const on = channel === c;
            return (
              <button
                key={c ?? "none"}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pickChannel(c)}
                className={cn(
                  "inline-flex h-8 items-center rounded-full px-3 text-[0.8125rem] font-medium ring-1 transition-colors outline-none ring-inset focus-visible:ring-2 focus-visible:ring-ring/60",
                  on ? "bg-foreground text-background ring-foreground" : "bg-transparent text-foreground/80 ring-border hover:bg-foreground/[0.04]",
                )}
              >
                {t(c ? `landing.links.channel.${c}` : "landing.links.channel.none")}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="grid gap-3 rounded-2xl bg-foreground/[0.025] p-4 ring-1 ring-border/70 ring-inset">
        <legend className="sr-only">{t("landing.links.tags")}</legend>
        <p aria-hidden="true" className="text-[0.75rem] font-medium tracking-wide text-muted-foreground uppercase">
          {t("landing.links.tags")}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field id="utm-source" label={<UtmLabel name="source" text={t("landing.links.field.source")} />}>
            <Input id="utm-source" dir="ltr" value={utm.source} onChange={set("source")} maxLength={120} autoComplete="off" className="h-9 font-mono text-[0.8125rem]" />
          </Field>
          <Field id="utm-medium" label={<UtmLabel name="medium" text={t("landing.links.field.medium")} />}>
            <Input id="utm-medium" dir="ltr" value={utm.medium} onChange={set("medium")} maxLength={120} autoComplete="off" className="h-9 font-mono text-[0.8125rem]" />
          </Field>
          <Field id="utm-campaign" label={<UtmLabel name="campaign" text={t("landing.links.field.campaign")} />}>
            <Input id="utm-campaign" dir="ltr" value={utm.campaign} onChange={set("campaign")} maxLength={200} autoComplete="off" placeholder={t("landing.links.field.campaignPlaceholder")} className="h-9 font-mono text-[0.8125rem]" />
          </Field>
          <Field id="utm-content" label={<UtmLabel name="content" text={t("landing.links.field.content")} />}>
            <Input id="utm-content" dir="ltr" value={utm.content} onChange={set("content")} maxLength={200} autoComplete="off" className="h-9 font-mono text-[0.8125rem]" />
          </Field>
        </div>
        <p className="text-[0.8125rem] leading-snug text-muted-foreground">{t("landing.links.field.contentHint")}</p>
        {errors.utm && (
          <p role="alert" className="text-[0.8125rem] text-destructive">
            {errors.utm}
          </p>
        )}
      </fieldset>

      <Field id="link-code" label={t("landing.links.field.code")} hint={t("landing.links.field.codeHint")} error={errors.code ?? codeError}>
        <div dir="ltr" className={cn("flex h-10 items-center overflow-hidden rounded-md border border-input bg-transparent shadow-xs focus-within:ring-2 focus-within:ring-ring/50", (errors.code ?? codeError) && "border-destructive")}>
          <span className="flex h-full items-center border-e border-input bg-foreground/[0.03] px-3 font-mono text-[0.8125rem] text-muted-foreground select-none">/go/</span>
          <input
            id="link-code"
            value={code}
            onChange={(e) => (setCode(e.target.value.toLowerCase()), setErrors((x) => ({ ...x, code: undefined })))}
            maxLength={16}
            autoComplete="off"
            spellCheck={false}
            placeholder={t("landing.links.field.codePlaceholder")}
            aria-invalid={!!(errors.code ?? codeError) || undefined}
            className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-[0.875rem] outline-none placeholder:font-sans placeholder:text-muted-foreground/70"
          />
        </div>
      </Field>

      <div className="grid gap-2 rounded-2xl p-4 ring-1 ring-border ring-inset">
        <div className="flex min-w-0 items-baseline gap-2">
          <bdi dir="ltr" className="min-w-0 truncate font-mono text-[0.9375rem] font-medium">
            {store.live(`go/${chosen && !codeError ? chosen : "a1b2c3"}`).replace(/^https?:\/\//, "")}
          </bdi>
        </div>
        <p className="text-[0.8125rem] text-muted-foreground">{t("landing.links.preview")}</p>
        <bdi dir="ltr" className="block font-mono text-[0.75rem] leading-relaxed break-all text-foreground/75">
          {landing ? landing.replace(/^https?:\/\//, "") : "..."}
        </bdi>
        <p className="text-[0.75rem] leading-snug text-muted-foreground">{t("landing.links.previewNote")}</p>
      </div>
    </SheetShell>
  );
}

function UtmLabel({ name, text }: { name: string; text: string }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span>{text}</span>
      <bdi dir="ltr" className="truncate font-mono text-[0.6875rem] font-normal text-muted-foreground">
        utm_{name}
      </bdi>
    </span>
  );
}

export function EditTargetSheet(p: {
  link: { id: string; code: string; target: LinkTarget } | null;
  onClose: () => void;
  pages: readonly LinkPageOption[];
  onSubmit: (id: string, target: LinkTarget) => Promise<FieldErrors | null>;
}) {
  const t = useT();
  const [target, setTarget] = useState<LinkTarget | null>(p.link?.target ?? null);
  const [shownFor, setShownFor] = useState(p.link?.id ?? null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  // a new link on screen: start from its own target
  if ((p.link?.id ?? null) !== shownFor) {
    setShownFor(p.link?.id ?? null);
    setTarget(p.link?.target ?? null);
    setErrors({});
  }
  const code = p.link?.code ?? "";
  const title = t("landing.links.edit.title", { code }).split(shortPath(code));

  const submit = async () => {
    if (!p.link || !target) return setErrors({ target: t("landing.links.error.target") });
    setPending(true);
    try {
      setErrors((await p.onSubmit(p.link.id, target)) ?? {});
    } finally {
      setPending(false);
    }
  };

  return (
    <SheetShell
      open={!!p.link}
      onClose={p.onClose}
      title={
        <>
          {title[0]}
          <bdi dir="ltr" className="font-mono">
            {shortPath(code)}
          </bdi>
          {title[1]}
        </>
      }
      description={t("landing.links.edit.description")}
      footer={
        <>
          <Button variant="ghost" onClick={p.onClose} disabled={pending}>
            {t("landing.links.cancel")}
          </Button>
          <Button variant="brand" onClick={submit} disabled={pending || !target} className="min-w-28">
            {pending && <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />}
            {pending ? t("landing.links.saving") : t("landing.links.edit.save")}
          </Button>
        </>
      }
    >
      {errors.form && (
        <p role="alert" className="rounded-xl bg-destructive/[0.07] px-3 py-2 text-sm text-destructive ring-1 ring-destructive/15 ring-inset">
          {errors.form}
        </p>
      )}
      <Field id="edit-target" label={t("landing.links.field.target")} error={errors.target}>
        <TargetPicker id="edit-target" value={target} onChange={setTarget} pages={p.pages} invalid={!!errors.target} />
      </Field>
    </SheetShell>
  );
}

"use client";
/**
 * The new-campaign sheet (P3 LANDING, wave 2; landing.md LAN-§13.1): the page (a live page of the store), the channels
 * (Meta, TikTok, Snap, WhatsApp broadcast, Instagram organic, print; one short link each) and a name, whose slug becomes
 * the `utm_campaign` value (shown as it will be sent). Field errors stay on their field; a refused gauge closes the
 * sheet and the screen opens the limit sheet.
 */
import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KIT_CHANNELS, slugOf, type KitChannel } from "@/lib/campaigns/types";
import { useT } from "@/lib/i18n/admin/client";
import type { LinkPageOption } from "@/lib/links/read";
import { cn } from "@/lib/utils";
import { Field, SheetShell } from "../links/link-sheet";

export interface CreateCampaignValues {
  pageId: string;
  channels: KitChannel[];
  name: string;
}
export type CampaignFieldErrors = Partial<Record<"pageId" | "channels" | "name" | "form", string>>;

export function CreateCampaignSheet(p: { open: boolean; onClose: () => void; pages: readonly LinkPageOption[]; initialPageId: string | null; onSubmit: (v: CreateCampaignValues) => Promise<CampaignFieldErrors | null> }) {
  const t = useT();
  const [pageId, setPageId] = useState<string>(p.initialPageId && p.pages.some((x) => x.id === p.initialPageId) ? p.initialPageId : (p.pages[0]?.id ?? ""));
  const [channels, setChannels] = useState<KitChannel[]>(["meta", "whatsapp"]);
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<CampaignFieldErrors>({});
  const [pending, setPending] = useState(false);
  const slug = slugOf(name);

  const toggle = (c: KitChannel) => {
    setChannels((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
    setErrors((e) => ({ ...e, channels: undefined }));
  };

  const submit = async () => {
    const next: CampaignFieldErrors = {};
    if (!pageId) next.pageId = t("landing.campaigns.error.page");
    if (!channels.length) next.channels = t("landing.campaigns.error.channels");
    if (!name.trim()) next.name = t("landing.campaigns.error.name");
    if (Object.keys(next).length) return setErrors(next);
    setPending(true);
    try {
      const res = await p.onSubmit({ pageId, channels: KIT_CHANNELS.filter((c) => channels.includes(c)), name: name.trim() });
      if (res) setErrors(res);
    } finally {
      setPending(false);
    }
  };

  return (
    <SheetShell
      open={p.open}
      onClose={p.onClose}
      title={t("landing.campaigns.sheet.title")}
      description={t("landing.campaigns.sheet.description")}
      footer={
        <>
          <Button variant="ghost" onClick={p.onClose}>
            {t("landing.links.cancel")}
          </Button>
          <Button variant="brand" onClick={submit} disabled={pending || !p.pages.length} className="min-w-36" aria-busy={pending || undefined}>
            {pending && <Loader2Icon aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />}
            {t("landing.campaigns.sheet.create")}
          </Button>
        </>
      }
    >
      {errors.form && (
        <p role="alert" className="rounded-xl bg-destructive/[0.07] px-3 py-2 text-sm text-destructive ring-1 ring-destructive/15 ring-inset">
          {errors.form}
        </p>
      )}
      <Field id="cp-page" label={t("landing.campaigns.field.page")} error={errors.pageId} hint={p.pages.length ? undefined : t("landing.links.noPages")}>
        <Select value={pageId} onValueChange={(v) => (setPageId(v), setErrors((e) => ({ ...e, pageId: undefined })))} disabled={!p.pages.length}>
          <SelectTrigger id="cp-page" aria-invalid={!!errors.pageId || undefined} className="h-10 w-full">
            <SelectValue placeholder={t("landing.links.field.targetPlaceholder")} />
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-80">
            {p.pages.map((pg) => (
              <SelectItem key={pg.id} value={pg.id}>
                <span className="truncate">{pg.title}</span>
                <bdi dir="ltr" className="ms-2 truncate font-mono text-xs text-muted-foreground">
                  /{pg.slug}
                </bdi>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <fieldset className="grid gap-2" aria-describedby={errors.channels ? "cp-channels-error" : "cp-channels-hint"}>
        <legend className="mb-1.5 text-[0.8125rem] font-medium">{t("landing.campaigns.field.channels")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {KIT_CHANNELS.map((c) => {
            const on = channels.includes(c);
            return (
              <button
                key={c}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(c)}
                className={cn(
                  "inline-flex h-8 items-center rounded-full px-3 text-[0.8125rem] font-medium ring-1 transition-colors outline-none ring-inset focus-visible:ring-2 focus-visible:ring-ring/60",
                  on ? "bg-foreground text-background ring-foreground" : "bg-transparent text-foreground/80 ring-border hover:bg-foreground/[0.04]",
                )}
              >
                {t(`landing.campaigns.channel.${c}`)}
              </button>
            );
          })}
        </div>
        {errors.channels ? (
          <p id="cp-channels-error" role="alert" className="text-[0.8125rem] text-destructive">
            {errors.channels}
          </p>
        ) : (
          <p id="cp-channels-hint" className="text-[0.8125rem] leading-snug text-muted-foreground">
            {t("landing.campaigns.field.channelsHint")}
          </p>
        )}
      </fieldset>

      <Field id="cp-name" label={t("landing.campaigns.field.name")} error={errors.name}>
        <Input id="cp-name" value={name} maxLength={120} onChange={(e) => (setName(e.target.value), setErrors((x) => ({ ...x, name: undefined })))} placeholder={t("landing.campaigns.field.namePlaceholder")} aria-invalid={!!errors.name || undefined} className="h-10" />
      </Field>
      <div className="grid gap-1 rounded-2xl bg-foreground/[0.025] p-4 ring-1 ring-border/70 ring-inset">
        <p className="text-[0.75rem] font-medium text-muted-foreground">{t("landing.campaigns.field.slug")}</p>
        <bdi dir="ltr" className="font-mono text-[0.8125rem] break-all">
          utm_campaign={slug || "kit"}
        </bdi>
        <p className="text-[0.75rem] leading-snug text-muted-foreground">{t("landing.campaigns.field.slugHint")}</p>
      </div>
    </SheetShell>
  );
}

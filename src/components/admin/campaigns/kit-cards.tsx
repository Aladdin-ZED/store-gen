"use client";
/**
 * The copyable cards of a Campaign Kit (P3 LANDING, wave 2; landing.md LAN-§13.4, §13.5), shared by the detail screen
 * and the read-only share page `/kit/<token>`, in this order: Links (per channel: the address as text, copy, QR),
 * WhatsApp confirmation (locale tabs), Call script, Ad brief (one card per angle, ar / fr tabs, "Copy all"), Pixel plan,
 * Delivery text. Every address renders as text with a copy button, never as a free href (SEC-6). Copy buttons announce
 * their confirmation (`CopyButton`: a toast and a polite live region). Stacked cards on phones; RTL through logical
 * properties; the kit's own texts keep their language and direction (`lang` / `dir` per block).
 */
import { QrCodeIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { CampaignKit } from "@/lib/campaigns/types";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { CopyButton } from "../common/copy-button";
import { Segmented } from "../common/segmented";
import { QrDialog } from "../links/link-parts";

type Loc = "ar" | "fr" | "en";
const dirOf = (l: Loc) => (l === "ar" ? "rtl" : "ltr");
const LOC_LABEL: Record<Loc, string> = { ar: "العربية", fr: "Français", en: "English" };

/* ------------------------------------------------------------------ */
/* building blocks                                                     */
/* ------------------------------------------------------------------ */

export function KitCard({ title, hint, action, children, className, id }: { title: ReactNode; hint?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("adm-surface grid min-w-0 content-start gap-4 p-5 sm:p-6", className)} aria-labelledby={id ? `${id}-title` : undefined}>
      <header className="flex min-w-0 items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h2 id={id ? `${id}-title` : undefined} className="text-[0.95rem] font-semibold tracking-[-0.01em] text-balance">
            {title}
          </h2>
          {hint && <p className="text-[0.8125rem] leading-relaxed text-pretty text-muted-foreground">{hint}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
      </header>
      {children}
    </section>
  );
}

function LocaleTabs({ locales, value, onChange, label }: { locales: readonly Loc[]; value: Loc; onChange: (l: Loc) => void; label: string }) {
  if (locales.length < 2) return null;
  return <Segmented size="sm" label={label} value={value} onChange={onChange} options={locales.map((l) => ({ value: l, label: LOC_LABEL[l] }))} />;
}

/** A kit text in its own language, with a soft cross-fade when it changes (a locale tab, a Cloud field arriving). */
function KitText({ text, locale, className }: { text: string; locale: Loc; className?: string }) {
  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.p
        key={`${locale}:${text}`}
        lang={locale}
        dir={dirOf(locale)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className={cn("text-[0.875rem] leading-relaxed whitespace-pre-line text-pretty text-foreground/90", className)}
      >
        {text}
      </motion.p>
    </AnimatePresence>
  );
}

/** One labelled kit text with its own copy button. */
function CopyRow({ label, text, locale, copyLabel }: { label: ReactNode; text: string; locale: Loc; copyLabel: string }) {
  const t = useT();
  if (!text) return null;
  return (
    <div className="grid min-w-0 gap-1.5 rounded-xl bg-foreground/[0.025] p-3 ring-1 ring-border/60 ring-inset">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.75rem] font-medium text-muted-foreground">{label}</p>
        <CopyButton value={text} label={copyLabel} toastMessage={t("landing.campaigns.copied")} size="icon-xs" />
      </div>
      <KitText text={text} locale={locale} />
    </div>
  );
}

/** The kit's first language (the page's own: the service lists it first). */
const firstLoc = (locales: readonly Loc[]): Loc => locales[0] ?? "fr";

/* ------------------------------------------------------------------ */
/* the cards                                                           */
/* ------------------------------------------------------------------ */

export interface KitLinkView {
  channel: CampaignKit["links"][number]["channel"];
  url: string;
  status?: "active" | "paused";
  clicks?: number;
}

export function LinksCard({ links }: { links: readonly KitLinkView[] }) {
  const t = useT();
  const [qr, setQr] = useState<{ code: string; url: string } | null>(null);
  return (
    <KitCard id="kit-links" title={t("landing.campaigns.card.links")} hint={t("landing.campaigns.card.linksHint")}>
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("landing.campaigns.noLinks")}</p>
      ) : (
        <ul className="grid gap-2">
          {links.map((l) => {
            const code = l.url.split("/").pop() ?? "";
            const shown = l.url.replace(/^https?:\/\//, "");
            return (
              <li key={l.url} className="flex min-w-0 items-center gap-3 rounded-xl bg-foreground/[0.025] px-3 py-2.5 ring-1 ring-border/60 ring-inset">
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <p className="flex items-center gap-2 text-[0.8125rem] font-medium">
                    {t(`landing.links.channel.${l.channel}`)}
                    {l.status === "paused" && <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[0.6875rem] font-medium text-muted-foreground">{t("landing.links.status.paused")}</span>}
                  </p>
                  <bdi dir="ltr" className="block truncate font-mono text-[0.75rem] text-muted-foreground" title={l.url}>
                    {shown}
                  </bdi>
                </div>
                {typeof l.clicks === "number" && <span className="hidden shrink-0 text-[0.75rem] text-muted-foreground tabular-nums sm:inline">{t("landing.links.clicks", { n: l.clicks })}</span>}
                <CopyButton value={l.url} label={t("landing.campaigns.copyLink", { channel: t(`landing.links.channel.${l.channel}`) })} toastMessage={t("landing.campaigns.copied")} />
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t("landing.links.action.qr")} title={t("landing.links.action.qr")} onClick={() => setQr({ code, url: l.url })}>
                  <QrCodeIcon className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <QrDialog link={qr} onClose={() => setQr(null)} />
    </KitCard>
  );
}

export function WhatsAppCard({ kit }: { kit: Pick<CampaignKit, "whatsappConfirm" | "locales"> }) {
  const t = useT();
  const locales = kit.locales.filter((l) => kit.whatsappConfirm[l]);
  const [loc, setLoc] = useState<Loc>(firstLoc(locales));
  const text = kit.whatsappConfirm[loc] ?? "";
  return (
    <KitCard
      id="kit-wa"
      title={t("landing.campaigns.card.whatsapp")}
      hint={t("landing.campaigns.card.whatsappHint")}
      action={text ? <CopyButton value={text} label={t("landing.campaigns.copyText")} toastMessage={t("landing.campaigns.copied")} /> : undefined}
    >
      <LocaleTabs locales={locales} value={loc} onChange={setLoc} label={t("landing.campaigns.language")} />
      {text ? <KitText text={text} locale={loc} className="rounded-xl bg-foreground/[0.025] p-3 ring-1 ring-border/60 ring-inset" /> : <p className="text-sm text-muted-foreground">{t("landing.campaigns.empty")}</p>}
    </KitCard>
  );
}

const STEP_KEYS = new Set(["hours", "greeting", "recap", "address", "availability", "offer", "close"]);

export function ScriptCard({ kit }: { kit: Pick<CampaignKit, "script" | "locales"> }) {
  const t = useT();
  const [loc, setLoc] = useState<Loc>(firstLoc(kit.locales));
  const steps = kit.script.steps.filter((s) => s.text[loc]);
  const all = steps.map((s) => s.text[loc]).join("\n\n");
  const label = (id: string) => (STEP_KEYS.has(id) ? t(`landing.campaigns.step.${id}`) : id.startsWith("obj_") ? t("landing.campaigns.step.objection", { which: t(`ops.script.obj.${id.slice(4)}`) }) : id);
  return (
    <KitCard
      id="kit-script"
      title={t("landing.campaigns.card.script")}
      hint={t("landing.campaigns.card.scriptHint")}
      action={all ? <CopyButton value={all} label={t("landing.campaigns.copyAll")} toastMessage={t("landing.campaigns.copied")} /> : undefined}
    >
      <LocaleTabs locales={kit.locales} value={loc} onChange={setLoc} label={t("landing.campaigns.language")} />
      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("landing.campaigns.empty")}</p>
      ) : (
        <ol className="grid gap-3">
          {steps.map((s, i) => (
            <li key={s.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3">
              <span aria-hidden="true" className="mt-0.5 inline-flex size-6 items-center justify-center rounded-full bg-foreground/[0.05] text-[0.6875rem] font-semibold text-muted-foreground tabular-nums">
                {i + 1}
              </span>
              <div className="grid min-w-0 gap-0.5">
                <p className="text-[0.75rem] font-medium text-muted-foreground">{label(s.id)}</p>
                <KitText text={s.text[loc]} locale={loc} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </KitCard>
  );
}

export function BriefCards({ kit, chip, stacked = false }: { kit: Pick<CampaignKit, "brief" | "locales">; chip?: ReactNode; stacked?: boolean }) {
  const t = useT();
  const tabs: Loc[] = kit.locales.filter((l) => l === "ar" || l === "fr");
  const locales: Loc[] = tabs.length ? tabs : [firstLoc(kit.locales)];
  const [loc, setLoc] = useState<Loc>(locales[0]!);
  const { brief } = kit;
  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[1.05rem] font-semibold tracking-[-0.015em]">{t("landing.campaigns.card.brief")}</h2>
          {chip}
        </div>
        <LocaleTabs locales={locales} value={loc} onChange={setLoc} label={t("landing.campaigns.language")} />
      </div>
      <div className={cn("grid gap-4", !stacked && "xl:grid-cols-3")}>
        {brief.angles.map((a, i) => {
          const all = [a.hook[loc], a.primary[loc], a.headline[loc]].filter(Boolean).join("\n\n");
          return (
            <KitCard
              key={a.id}
              title={
                <span className="grid gap-1.5">
                  <span className="inline-flex w-fit items-center rounded-full bg-brand/10 px-2 py-0.5 text-[0.6875rem] font-medium text-brand ring-1 ring-brand/15 ring-inset">
                    {t("landing.campaigns.angle", { n: i + 1 })} · {t(`landing.campaigns.tag.${a.tag}`)}
                  </span>
                  <span className="text-[0.9rem] leading-snug font-semibold">{a.name}</span>
                </span>
              }
              action={all ? <CopyButton value={all} label={t("landing.campaigns.copyAll")} toastMessage={t("landing.campaigns.copied")} /> : undefined}
            >
              <div className="grid gap-2">
                <CopyRow label={t("landing.campaigns.hook")} text={a.hook[loc]} locale={loc} copyLabel={t("landing.campaigns.copyHook")} />
                <CopyRow label={t("landing.campaigns.primary")} text={a.primary[loc]} locale={loc} copyLabel={t("landing.campaigns.copyPrimary")} />
                <CopyRow label={t("landing.campaigns.headline")} text={a.headline[loc]} locale={loc} copyLabel={t("landing.campaigns.copyHeadline")} />
              </div>
              <div className="grid gap-1.5">
                <p className="text-[0.75rem] font-medium text-muted-foreground">{t("landing.campaigns.visual")}</p>
                <p className="text-[0.8125rem] leading-relaxed text-pretty">{a.visual}</p>
              </div>
              <div className="grid gap-1.5">
                <p className="text-[0.75rem] font-medium text-muted-foreground">{t("landing.campaigns.ugc")}</p>
                <ol className="grid gap-1 text-[0.8125rem] leading-snug">
                  {a.ugc15.map((beat, k) => (
                    <li key={k} className="flex gap-2">
                      <span className="w-4 shrink-0 text-muted-foreground tabular-nums">{k + 1}</span>
                      <span className="min-w-0 text-pretty">{beat}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                <p className="text-[0.75rem] text-muted-foreground">{t("landing.campaigns.utmContent")}</p>
                <span className="flex items-center gap-1">
                  <bdi dir="ltr" className="rounded-md bg-foreground/[0.05] px-1.5 py-0.5 font-mono text-[0.6875rem] text-foreground/80">
                    {a.id}
                  </bdi>
                  <CopyButton value={a.id} label={t("landing.campaigns.copyTag")} toastMessage={t("landing.campaigns.copied")} size="icon-xs" />
                </span>
              </div>
            </KitCard>
          );
        })}
      </div>
      <KitCard title={t("landing.campaigns.card.rules")} hint={t("landing.campaigns.card.rulesHint")}>
        <div className={cn("grid gap-4", !stacked && "sm:grid-cols-2")}>
          <ul className="grid gap-1.5 text-[0.8125rem]">
            {brief.doNotSay.map((c) => (
              <li key={c} className="flex gap-2">
                <span aria-hidden="true" className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-destructive/70" />
                <span className="text-pretty">{t(`landing.campaigns.dns.${c}`)}</span>
              </li>
            ))}
          </ul>
          <ul className="grid gap-1.5 text-[0.8125rem]">
            {brief.compliance.map((c) => (
              <li key={c} className="flex gap-2">
                <span aria-hidden="true" className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-emerald-500/80" />
                <span className="text-pretty">{t(`landing.campaigns.rule.${c}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </KitCard>
    </div>
  );
}

export function PixelCard({ plan }: { plan: CampaignKit["pixelPlan"] }) {
  const t = useT();
  return (
    <KitCard id="kit-pixels" title={t("landing.campaigns.card.pixels")} hint={t(`landing.campaigns.trigger.${plan.trigger}`)}>
      {plan.pixels.length === 0 ? (
        <p className="rounded-xl bg-warn/10 px-3 py-2 text-[0.8125rem] text-warn-ink ring-1 ring-warn/20 ring-inset">{t("landing.campaigns.noPixel")}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {plan.pixels.map((p) => (
              <span key={p} className="rounded-full bg-foreground/[0.05] px-2.5 py-1 text-[0.75rem] font-medium">
                {p}
              </span>
            ))}
          </div>
          <dl className="grid gap-1.5 text-[0.8125rem]">
            {plan.events.map((e) => (
              <div key={`${e.name}:${e.where}`} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-3">
                <dt className="truncate font-mono text-[0.75rem] text-foreground/85">{e.name}</dt>
                <dd className="text-muted-foreground">{t(`landing.campaigns.where.${e.where}`)}</dd>
              </div>
            ))}
          </dl>
          {plan.testHint && <p className="rounded-xl bg-foreground/[0.03] px-3 py-2 text-[0.8125rem] text-muted-foreground ring-1 ring-border/60 ring-inset">{t("landing.campaigns.testHint")}</p>}
        </>
      )}
    </KitCard>
  );
}

export function DeliveryCard({ kit }: { kit: Pick<CampaignKit, "facts" | "locales"> }) {
  const t = useT();
  const { facts } = kit;
  const [loc, setLoc] = useState<Loc>(firstLoc(kit.locales));
  const text = [facts.product, ...facts.offers.map((o) => `${o.label}: ${o.price}`), facts.fee ?? "", facts.eta?.[loc] ?? ""].filter(Boolean).join("\n");
  return (
    <KitCard id="kit-delivery" title={t("landing.campaigns.card.delivery")} hint={t("landing.campaigns.card.deliveryHint")} action={<CopyButton value={text} label={t("landing.campaigns.copyText")} toastMessage={t("landing.campaigns.copied")} />}>
      <dl className="grid gap-2 text-[0.8125rem]">
        <div className="grid gap-0.5">
          <dt className="text-[0.75rem] text-muted-foreground">{t("landing.campaigns.fact.product")}</dt>
          <dd className="font-medium">{facts.product}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-[0.75rem] text-muted-foreground">{t("landing.campaigns.fact.offers")}</dt>
          <dd className="grid gap-0.5">
            {facts.offers.map((o) => (
              <span key={o.label} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{o.label}</span>
                <bdi dir="ltr" className="tabular-nums">
                  {o.price}
                </bdi>
              </span>
            ))}
          </dd>
        </div>
        {facts.fee && (
          <div className="grid gap-0.5">
            <dt className="text-[0.75rem] text-muted-foreground">{t("landing.campaigns.fact.fee")}</dt>
            <dd>{facts.fee}</dd>
          </div>
        )}
        <div className="grid gap-1">
          <dt className="flex items-center justify-between gap-2 text-[0.75rem] text-muted-foreground">
            {t("landing.campaigns.fact.eta")}
            <LocaleTabs locales={kit.locales} value={loc} onChange={setLoc} label={t("landing.campaigns.language")} />
          </dt>
          <dd>{facts.eta ? <KitText text={facts.eta[loc]} locale={loc} /> : <span className="text-muted-foreground">{t("landing.campaigns.noEta")}</span>}</dd>
        </div>
      </dl>
    </KitCard>
  );
}

/** Every card of a kit in the LAN-§13.4 order (the share page: `stacked`, one column whatever the viewport). */
export function KitCards({ kit, links, chip, stacked = false }: { kit: CampaignKit; links: readonly KitLinkView[]; chip?: ReactNode; stacked?: boolean }) {
  const pair = cn("grid gap-4", !stacked && "lg:grid-cols-2");
  return (
    <div className="grid min-w-0 gap-4">
      <LinksCard links={links} />
      <div className={pair}>
        <WhatsAppCard kit={kit} />
        <ScriptCard kit={kit} />
      </div>
      <BriefCards kit={kit} chip={chip} stacked={stacked} />
      <div className={pair}>
        <PixelCard plan={kit.pixelPlan} />
        <DeliveryCard kit={kit} />
      </div>
    </div>
  );
}

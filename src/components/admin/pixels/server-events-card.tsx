"use client";
/**
 * Connect → Pixels → **Server events** (operations.md OPE-§20.7, §20.2, §20.3, OD18; core §H.5, §I.8), mounted at
 * #server-events under the library: the Purchase trigger as three cards, the custom-events switch (Meta only), the
 * manual-orders switch, per-page overrides, "Updating N pages…" from the render queue after a change, the exports to
 * re-export, and the last result per pixel with "Send test event".
 *
 * The trigger, switches and overrides edit one draft; Save sends it (`saveConversionsAction`, a step-up-gated write:
 * a `step_up` answer opens the sheet and the save runs again). Without a pixel that has a server token the card is
 * the quiet empty state: one sentence and one action to the library above.
 */
import { ArrowUpRightIcon, Loader2Icon, RadioTowerIcon, RefreshCwIcon, UploadIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { saveConversionsAction } from "@/app/app/[store]/integrations/pixels/actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { PurchaseTrigger, ServerEventsView } from "@/lib/pixels/server-events-shared";
import type { ConversionsSetting } from "@/lib/settings/keys/conversions";
import { cn } from "@/lib/utils";
import { intlLocale } from "../integrations/hub-format";
import { InlineError } from "../integrations/hub-states";
import { StateBadge } from "../integrations/state-badge";
import { useStore } from "../shell/store-context";
import { useStoreStepUp } from "../shell/step-up";
import { PageOverrides } from "./page-overrides";
import { PixelResults } from "./pixel-results";
import { TriggerCards } from "./trigger-cards";

/** A stable comparison of two settings (override order does not matter). */
function same(a: ConversionsSetting, b: ConversionsSetting): boolean {
  const ka = Object.keys(a.pageOverrides).sort();
  const kb = Object.keys(b.pageOverrides).sort();
  return (
    a.purchaseTrigger === b.purchaseTrigger &&
    a.customEvents === b.customEvents &&
    a.manualOrders === b.manualOrders &&
    ka.length === kb.length &&
    ka.every((k, i) => k === kb[i] && a.pageOverrides[k] === b.pageOverrides[k])
  );
}

export function ServerEventsCard({ view, canWrite, now }: { view: ServerEventsView; canWrite: boolean; now: number }) {
  const t = useT();
  const titleId = useId();

  return (
    <section id="server-events" aria-labelledby={titleId} className="adm-surface grid scroll-mt-24 gap-6 p-4 sm:p-6">
      <header className="grid max-w-[68ch] gap-1">
        <h2 id={titleId} className="flex items-center gap-2 text-[0.95rem] font-semibold tracking-[-0.01em]">
          <RadioTowerIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          {t("int.px.title")}
        </h2>
        <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{t("int.px.lead")}</p>
      </header>

      {view.pixels.length === 0 ? (
        <EmptyServerEvents />
      ) : view.conversions === "error" ? (
        <InlineError />
      ) : (
        <ConversionsEditor view={view} conversions={view.conversions} canWrite={canWrite} />
      )}

      {view.pixels.length > 0 && (
        <div className="border-t border-border/60 pt-5">
          <PixelResults pixels={view.pixels} canWrite={canWrite} now={now} />
        </div>
      )}
    </section>
  );
}

/** No pixel with a server token: one sentence and one action, to the library on this page. */
function EmptyServerEvents() {
  const t = useT();
  return (
    <div className="grid justify-items-start gap-4 rounded-2xl bg-foreground/[0.02] p-5 ring-1 ring-foreground/[0.05] ring-inset sm:p-6">
      <p className="max-w-[56ch] text-sm leading-relaxed text-pretty">{t("int.px.empty.lead")}</p>
      <Button asChild variant="outline" className="h-11 px-3 sm:h-8">
        <a href="#pixel-library">{t("int.px.empty.action")}</a>
      </Button>
    </div>
  );
}

function ConversionsEditor({ view, conversions, canWrite }: { view: ServerEventsView; conversions: ConversionsSetting; canWrite: boolean }) {
  const t = useT();
  const locale = useAdminLocale();
  const store = useStore();
  const router = useRouter();
  const stepUp = useStoreStepUp();
  const customId = useId();
  const manualId = useId();
  const [saved, setSaved] = useState(conversions);
  const [draft, setDraft] = useState(conversions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // the save's own count until the server's render queue answers on the refresh
  const [justQueued, setJustQueued] = useState<number | null>(null);
  const dirty = !same(saved, draft);
  const disabled = !canWrite || saving;
  const updating = view.updating ?? justQueued;

  const set = (patch: Partial<ConversionsSetting>) => {
    setError(null);
    setDraft((d) => ({ ...d, ...patch }));
  };

  async function save() {
    if (saving || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      const res = await stepUp.action(() => saveConversionsAction(draft));
      if (!res.ok) return setError(res.error === "step_up" ? t("int.sheets.stepUpNeeded") : t(res.message ?? `error.${res.error}`));
      setSaved(draft);
      setJustQueued(res.data.pages);
      toast.success(res.data.pages > 0 ? t("int.px.savedPages", { n: res.data.pages }) : t("int.px.saved"));
      router.refresh();
    } catch {
      setError(t("int.sheets.network"));
    } finally {
      setSaving(false);
    }
  }

  const date = (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }).format(new Date(iso));

  return (
    <div className="grid gap-6">
      <TriggerCards value={draft.purchaseTrigger} saved={saved.purchaseTrigger} onChange={(v: PurchaseTrigger) => set({ purchaseTrigger: v })} disabled={disabled} />

      <div className="grid gap-2.5 md:grid-cols-2">
        {(
          [
            [customId, "custom", draft.customEvents, (v: boolean) => set({ customEvents: v })],
            [manualId, "manual", draft.manualOrders, (v: boolean) => set({ manualOrders: v })],
          ] as const
        ).map(([id, k, on, flip]) => (
          <div key={k} className="flex items-start justify-between gap-4 rounded-2xl bg-foreground/[0.025] p-4 ring-1 ring-foreground/[0.05] ring-inset">
            <div className="grid min-w-0 gap-1">
              <label htmlFor={id} className="text-sm font-medium">
                {t(`int.px.${k}.label`)}
              </label>
              <p className="text-xs leading-relaxed text-pretty text-muted-foreground">{t(`int.px.${k}.help`)}</p>
            </div>
            {/* the shared switch's thumb moves with translate-x, which RTL does not mirror: keep its own box left to right */}
            <span dir="ltr" className="flex min-h-11 shrink-0 items-center sm:min-h-0">
              <Switch id={id} checked={on} disabled={disabled} onCheckedChange={flip} />
            </span>
          </div>
        ))}
      </div>

      <PageOverrides overrides={draft.pageOverrides} pages={view.pages} storeTrigger={draft.purchaseTrigger} onChange={(o) => set({ pageOverrides: o })} disabled={disabled} />

      {canWrite && (dirty || error) && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-background/90 p-3 shadow-[0_8px_30px_-12px_rgb(0_0_0/0.25)] ring-1 ring-foreground/10 backdrop-blur ring-inset">
          <p role={error ? "alert" : "status"} className={cn("text-sm", error ? "text-destructive" : "text-muted-foreground")}>
            {error ?? t("int.px.unsaved")}
          </p>
          <div className="flex items-center gap-2">
            {dirty && (
              <Button variant="ghost" className="h-11 px-3 sm:h-8" disabled={saving} onClick={() => {
                  setDraft(saved);
                  setError(null);
                }}>
                {t("int.px.discard")}
              </Button>
            )}
            <Button variant="brand" className="h-11 px-4 sm:h-8" disabled={saving || !dirty} onClick={() => void save()}>
              {saving && <Loader2Icon className="animate-spin" aria-hidden="true" />}
              {t("int.px.save")}
            </Button>
          </div>
        </div>
      )}

      {updating !== null && updating > 0 && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCwIcon className="size-3.5 animate-spin [animation-duration:2.4s] motion-reduce:animate-none" aria-hidden="true" />
          {t("int.px.updating", { n: updating })}
        </p>
      )}

      {view.reexport === "error" ? (
        <InlineError />
      ) : (
        view.reexport.length > 0 && (
          <div className="grid gap-3 rounded-2xl bg-warn/[0.07] p-4 ring-1 ring-warn/25 ring-inset">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="grid max-w-[64ch] gap-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <UploadIcon className="size-4 text-warn-ink" aria-hidden="true" />
                  {t("int.px.reexport.title")}
                </p>
                <p className="text-xs leading-relaxed text-pretty text-muted-foreground">{t("int.px.reexport.body")}</p>
              </div>
              <StateBadge tone="warn">{t("int.px.reexport.count", { n: view.reexport.length })}</StateBadge>
            </div>
            <ul className="grid gap-1.5">
              {view.reexport.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-background/70 px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{r.pageName || t("int.px.overrides.unknownPage")}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t(`int.px.reexport.${r.mode}`)} · {t("int.px.reexport.built", { date: date(r.createdAt) })}
                    </span>
                  </span>
                  <Link href={store.href("/exports?active=1")} className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-foreground/80 underline-offset-4 hover:underline sm:min-h-0">
                    {t("int.px.reexport.open")}
                    <ArrowUpRightIcon className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  );
}

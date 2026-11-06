"use client";
/**
 * The connected sheet (operations.md OPE-§19.8 "Connected", "Paused", "Failing"): its state as a word, the tab and the
 * link, the last push, the last pull, the orders waiting and the oldest one; Sync now, Pause / Resume, the switch
 * "Bring status changes back from the sheet", Repair sheet with one tick per optional header, and Disconnect behind a
 * confirm. Paused shows the warn (yellow) band with the backlog and Resume; failing shows the last cause in plain
 * words with Retry (the screen puts What to check right under the card).
 *
 * Pause / Resume and the switch are optimistic: they flip at once and roll back when the server refuses. Every write
 * is idempotent on the server (setting a state it already has changes nothing). Without `canWrite` (view as store)
 * the card is read-only: the link stays, the actions are gone.
 */
import { ArrowUpRightIcon, Loader2Icon, PauseIcon, PlayIcon, RefreshCwIcon, RotateCwIcon, UnplugIcon, WrenchIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
  disconnectSheetAction,
  repairSheetAction,
  setSheetsEnabledAction,
  setSheetsPullAction,
  syncSheetNowAction,
} from "@/app/app/[store]/integrations/sheets/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import type { MessageKey } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { IntegrationHealthRow, SheetsBacklog } from "@/lib/integrations/health";
import type { SheetsScreenSheet } from "@/lib/integrations/sheets-screen.server";
import { cn } from "@/lib/utils";
import { useStore } from "../shell/store-context";
import { age, HEALTH_TONE, num, relTime } from "./hub-format";
import { useNow } from "./hub-states";
import { IntConfirm } from "./int-confirm";
import { StateBadge } from "./state-badge";

/** The optional headers Repair offers, in the sheet's own words (src/lib/sheets/row.ts R1_HEADERS, REPAIR_HEADERS). */
const REPAIR_TICKS = [
  { key: "landmark", header: "Repère" },
  { key: "agent", header: "Agent" },
  { key: "agentNote", header: "Note agent" },
  { key: "tracking", header: "Tracking" },
  { key: "carrier", header: "Transporteur" },
  { key: "shipStatus", header: "Statut livraison" },
  { key: "shipAfter", header: "Livrer à partir du" },
] as const;
type RepairKey = (typeof REPAIR_TICKS)[number]["key"];

/** A refusal of either answer shape (the action itself, or `stepUp.action` around it). */
type Refusal = { ok: false; error: string; message?: string };

export function SheetsStatusCard({
  sheet,
  status,
  backlog,
  lastPushAt,
  lastPullAt,
  canWrite,
  now: serverNow,
}: {
  sheet: SheetsScreenSheet;
  status: IntegrationHealthRow | null;
  backlog: SheetsBacklog | null;
  lastPushAt: string | null;
  lastPullAt: string | null;
  canWrite: boolean;
  now: number;
}) {
  const t = useT();
  const locale = useAdminLocale();
  const store = useStore();
  const router = useRouter();
  const now = useNow(serverNow);
  const pullId = useId();
  const [enabled, setEnabled] = useState(sheet.enabled);
  const [pull, setPull] = useState(sheet.pull);
  const [busy, setBusy] = useState<"sync" | "enabled" | "pull" | "repair" | null>(null);
  const [repairOpen, setRepairOpen] = useState(false);
  const [ticks, setTicks] = useState<RepairKey[]>([]);
  const [repairNote, setRepairNote] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const words = (res: Refusal) => t(res.message ?? `error.${res.error}`);
  const failing = enabled && status?.state === "failing";
  const tone = !enabled ? "warn" : status ? HEALTH_TONE[status.state] ?? "neutral" : "neutral";
  const stateWord: MessageKey = !enabled ? "int.sheets.state.paused" : status ? `int.health.state.${status.state}` : "int.health.state.new";
  const pending = backlog?.pending ?? status?.backlog ?? 0;
  const oldest = backlog?.oldestPendingAt ?? status?.oldestPendingAt ?? null;
  const ago = (iso: string | null) => (iso ? relTime(iso, locale, now) : t("int.health.never"));

  async function sync() {
    if (busy) return;
    setBusy("sync");
    try {
      const res = await syncSheetNowAction();
      if (!res.ok) return void toast.error(words(res));
      const r = res.data;
      if (r.message) toast.error(t("int.sheets.toast.syncFailed"), { description: <span lang="fr">{r.message}</span> });
      else if (r.appended + r.updated + r.pulled === 0) toast.success(t("int.cmd.sync_sheets.nothing"));
      else toast.success(t("int.cmd.sync_sheets.done", { sent: r.appended + r.updated, pulled: r.pulled }));
      router.refresh();
    } catch {
      toast.error(t("int.sheets.network"));
    } finally {
      setBusy(null);
    }
  }

  /** Pause / Resume and the pull switch: the new value at once, the old one back on a refusal. */
  async function flip(which: "enabled" | "pull", next: boolean) {
    if (busy) return;
    const set = which === "enabled" ? setEnabled : setPull;
    set(next);
    setBusy(which);
    try {
      const res = await (which === "enabled" ? setSheetsEnabledAction(next) : setSheetsPullAction(next));
      if (!res.ok) {
        set(!next);
        return void toast.error(words(res));
      }
      toast.success(t(which === "enabled" ? (next ? "int.sheets.toast.resumed" : "int.sheets.toast.paused") : next ? "int.sheets.toast.pullOn" : "int.sheets.toast.pullOff"));
      router.refresh();
    } catch {
      set(!next);
      toast.error(t("int.sheets.network"));
    } finally {
      setBusy(null);
    }
  }

  async function repair() {
    if (busy) return;
    setBusy("repair");
    setRepairNote(null);
    try {
      const res = await repairSheetAction({ add: ticks });
      if (!res.ok) return setRepairNote({ text: words(res), tone: "error" });
      const r = res.data;
      if (!r.repaired) return setRepairNote({ text: t(r.message), tone: "error" });
      const parts = [t("int.sheets.repair.done")];
      if (r.added.length) parts.push(t("int.sheets.repair.added", { n: r.added.length, list: r.added.join(", ") }));
      if (r.present.length) parts.push(t("int.sheets.repair.present", { list: r.present.join(", ") }));
      setRepairNote({ text: parts.join(" "), tone: "ok" });
      setTicks([]);
      router.refresh();
    } catch {
      setRepairNote({ text: t("int.sheets.network"), tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="sheets-status-title" className="adm-surface grid gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="sheets-status-title" className="text-[0.95rem] font-semibold tracking-[-0.01em]">
              {t("int.sheets.status.title")}
            </h2>
            <StateBadge tone={tone} live={enabled && status?.state === "ok"}>
              {t(stateWord)}
            </StateBadge>
          </div>
          <p className="truncate text-sm text-muted-foreground" suppressHydrationWarning>
            {t("int.sheets.status.tab", { tab: sheet.sheetTitle })}
            {sheet.connectedAt && <> · {t("int.sheets.status.connectedAgo", { ago: relTime(sheet.connectedAt, locale, now) })}</>}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button asChild variant="outline" className="h-11 flex-1 px-3 sm:h-8 sm:flex-none">
            <a href={sheet.url} target="_blank" rel="noopener noreferrer">
              {t("int.sheets.open")}
              <ArrowUpRightIcon className="rtl:-scale-x-100" aria-hidden="true" />
            </a>
          </Button>
          {canWrite && (
            <Button variant="brand" className="h-11 flex-1 px-3 sm:h-8 sm:flex-none" onClick={sync} disabled={busy !== null || !enabled}>
              {busy === "sync" ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <RefreshCwIcon aria-hidden="true" />}
              {t("int.sheets.syncNow")}
            </Button>
          )}
        </div>
      </header>

      <AnimatePresence initial={false}>
        {!enabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 rounded-2xl bg-warn/15 px-4 py-3 ring-1 ring-warn/40 ring-inset sm:flex-row sm:items-center sm:justify-between">
              <div className="grid gap-0.5">
                <p className="text-sm font-semibold text-warn-ink">{t("int.sheets.paused")}</p>
                <p className="text-sm text-warn-ink/85">{t("int.sheets.pausedBacklog", { n: pending })}</p>
              </div>
              {canWrite && (
                <Button variant="outline" className="h-11 shrink-0 px-3 sm:h-8" onClick={() => flip("enabled", true)} disabled={busy !== null}>
                  {busy === "enabled" ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <PlayIcon className="rtl:-scale-x-100" aria-hidden="true" />}
                  {t("int.sheets.resume")}
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {failing && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl bg-destructive/[0.06] px-4 py-3 ring-1 ring-destructive/15 ring-inset sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-0.5">
            <p className="text-sm font-semibold text-destructive">{t("int.sheets.failing")}</p>
            <p className="text-sm text-pretty text-destructive/85">{t("int.sheets.lastError", { cause: t(status?.lastErrorKey ?? "int.cause.unknown") })}</p>
          </div>
          {canWrite && (
            <Button variant="outline" className="h-11 shrink-0 px-3 sm:h-8" onClick={sync} disabled={busy !== null}>
              {busy === "sync" ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <RotateCwIcon aria-hidden="true" />}
              {t("int.sheets.retry")}
            </Button>
          )}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-foreground/[0.06] ring-1 ring-foreground/[0.06] lg:grid-cols-4">
        <Metric label={t("int.sheets.metric.lastPush")} value={ago(lastPushAt)} muted={!lastPushAt} />
        <Metric label={t("int.sheets.metric.lastPull")} value={pull ? ago(lastPullAt) : t("int.health.state.off")} muted={!pull || !lastPullAt} />
        <Metric label={t("int.sheets.metric.backlog")} value={num(pending, locale)} warn={!enabled && pending > 0} />
        <Metric label={t("int.sheets.metric.oldest")} value={oldest ? age(oldest, locale, now) : t("int.health.none")} muted={!oldest} />
      </dl>

      {(backlog?.failed ?? 0) > 0 && (
        <p className="-mt-2 text-sm">
          {store.can("orders.read") ? (
            <Link href={store.href("/orders?sheet=failed")} className="inline-flex min-h-11 items-center gap-1 font-medium text-destructive hover:underline sm:min-h-0">
              {t("int.sheets.metric.failed", { n: backlog!.failed })}
              <ArrowUpRightIcon className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
            </Link>
          ) : (
            <span className="text-destructive">{t("int.sheets.metric.failed", { n: backlog!.failed })}</span>
          )}
        </p>
      )}
      {!failing && status?.lastErrorKey && status.state !== "ok" && (
        <p className="-mt-2 text-sm text-muted-foreground">{t("int.sheets.lastError", { cause: t(status.lastErrorKey) })}</p>
      )}

      <div className="flex items-start justify-between gap-4 rounded-2xl bg-foreground/[0.025] p-4 ring-1 ring-foreground/[0.05] ring-inset">
        <div className="grid min-w-0 gap-1">
          <label htmlFor={pullId} className="text-sm font-medium">
            {t("int.sheets.pull.label")}
          </label>
          <p className="text-xs leading-relaxed text-pretty text-muted-foreground">{t("int.sheets.pull.help")}</p>
        </div>
        {/* the shared switch's thumb moves with translate-x, which RTL does not mirror: keep its own box left to right */}
        <span dir="ltr" className="flex min-h-11 shrink-0 items-center sm:min-h-0">
          <Switch id={pullId} checked={pull} disabled={!canWrite || busy !== null} onCheckedChange={(v) => flip("pull", v)} />
        </span>
      </div>

      {canWrite && (
        <div className="grid gap-3 border-t border-border/60 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {enabled && (
              <Button variant="ghost" className="h-11 px-3 sm:h-8" onClick={() => flip("enabled", false)} disabled={busy !== null}>
                {busy === "enabled" ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <PauseIcon aria-hidden="true" />}
                {t("int.sheets.pause")}
              </Button>
            )}
            <Button variant="ghost" className="h-11 px-3 sm:h-8" aria-expanded={repairOpen} aria-controls="sheets-repair" onClick={() => setRepairOpen((o) => !o)}>
              <WrenchIcon aria-hidden="true" />
              {t("int.sheets.repair.title")}
            </Button>
            <Button variant="ghost" className="ms-auto h-11 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-8" onClick={() => setConfirmDisconnect(true)}>
              <UnplugIcon className="rtl:-scale-x-100" aria-hidden="true" />
              {t("int.sheets.disconnect")}
            </Button>
          </div>

          <AnimatePresence initial={false}>
            {repairOpen && (
              <motion.div
                id="sheets-repair"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <fieldset className="grid gap-4 rounded-2xl bg-foreground/[0.025] p-4 ring-1 ring-foreground/[0.05] ring-inset">
                  <legend className="sr-only">{t("int.sheets.repair.title")}</legend>
                  <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{t("int.sheets.repair.lead")}</p>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {REPAIR_TICKS.map(({ key, header }) => (
                      <label key={key} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-2 py-2 hover:bg-foreground/[0.03]">
                        <Checkbox
                          className="mt-0.5"
                          checked={ticks.includes(key)}
                          disabled={busy !== null}
                          onCheckedChange={(v) => setTicks((cur) => (v === true ? [...cur, key] : cur.filter((k) => k !== key)))}
                        />
                        <span className="grid min-w-0 gap-0.5">
                          <bdi lang="fr" className="text-sm font-medium">
                            {header}
                          </bdi>
                          <span className="text-xs text-muted-foreground">{t(`int.sheets.repair.hint.${key}`)}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="outline" className="h-11 px-3 sm:h-8" onClick={repair} disabled={busy !== null}>
                      {busy === "repair" ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <WrenchIcon aria-hidden="true" />}
                      {t("int.sheets.repair.run")}
                    </Button>
                    {repairNote && (
                      <p role="status" className={cn("text-sm text-pretty", repairNote.tone === "ok" ? "text-success-ink" : "text-destructive")}>
                        {repairNote.text}
                      </p>
                    )}
                  </div>
                </fieldset>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <IntConfirm
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        destructive
        icon={<UnplugIcon className="size-5" />}
        title={t("int.sheets.disconnect.title")}
        body={t("int.sheets.disconnect.body")}
        confirmLabel={t("int.sheets.disconnect")}
        onConfirm={async () => {
          try {
            const res = await disconnectSheetAction();
            if (!res.ok) {
              toast.error(words(res));
              return false;
            }
            toast.success(t("int.sheets.disconnect.done"));
            router.refresh();
            return true;
          } catch {
            toast.error(t("int.sheets.network"));
            return false;
          }
        }}
      />
    </section>
  );
}

function Metric({ label, value, muted = false, warn = false }: { label: string; value: string; muted?: boolean; warn?: boolean }) {
  return (
    <div className="grid content-start gap-1 bg-card px-4 py-3">
      <dt className="text-[0.7rem] font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("text-lg font-semibold tracking-[-0.02em] tabular-nums", muted && "text-base font-medium text-muted-foreground", warn && "text-warn-ink")} suppressHydrationWarning>
        {value}
      </dd>
    </div>
  );
}

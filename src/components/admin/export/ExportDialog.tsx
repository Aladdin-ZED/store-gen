"use client";
/**
 * Export a landing page as a standalone site (one ZIP): pick the version, how orders arrive
 * (connected / standalone PHP / WhatsApp), the allowed domains, the site address and the host
 * files — with a live size estimate, a streamed download with progress, and the page's recent
 * exports (revocable keys).
 *
 *   <ExportDialog pageId versionId? open onOpenChange />
 *
 * Server side: /api/admin/export (context + ZIP), /api/admin/export/estimate, /api/admin/export/<id>.
 */
import {
  ArrowLeftRightIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  DownloadIcon,
  InfoIcon,
  LoaderCircleIcon,
  MessageCircleIcon,
  PackageIcon,
  RotateCwIcon,
  SheetIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Illustration } from "@/components/admin/common/illustrations";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { normalizeAllowedOrigins, normalizeSiteUrl, originCovered, type ExportMode, type ExportRequestField } from "@/lib/export/options";
import type { ExportContextResponse } from "@/lib/export/types";
import { cn } from "@/lib/utils";
import { DomainInput } from "./domain-input";
import { absoluteTime, displayPhone, formatBytes, versionTitle } from "./format";
import { MODE_META, ModeCards } from "./mode-cards";
import { RecentExports } from "./recent-exports";
import { SizeSummary } from "./summary";
import { useStoreStepUp } from "../shell/step-up";
import { downloadExport, useEstimate, useExportContext } from "./use-export";

export interface ExportDialogProps {
  pageId: string;
  /** version to preselect (default: the published one, else the latest) */
  versionId?: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}

const EASE = [0.22, 1, 0.36, 1] as const;

export function ExportDialog({ pageId, versionId, open, onOpenChange }: ExportDialogProps) {
  // every opening loads fresh data, and the form below starts from fresh defaults (keyed by opening)
  const ctx = useExportContext(pageId, open, versionId);
  const [busy, setBusy] = useState(false);

  const data = ctx.data;
  return (
    <Dialog open={open} onOpenChange={(next) => (next || !busy) && onOpenChange(next)}>
      <DialogContent
        showCloseButton={!busy}
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onPointerDownOutside={(e) => busy && e.preventDefault()}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-[1.4rem] p-0 sm:max-w-[min(62rem,calc(100%-2rem))]"
      >
        <header className="relative shrink-0 overflow-hidden border-b px-5 pt-5 pb-4 sm:px-6 sm:pt-6 sm:pb-5">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-28 -right-16 h-64 w-[min(36rem,80%)] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--brand)_16%,transparent),transparent)]"
          />
          <p className="relative flex items-center gap-1.5 text-[0.7rem] font-semibold tracking-[0.08em] text-brand uppercase">
            <PackageIcon className="size-3.5" />
            Static export
          </p>
          <DialogTitle className="relative mt-2 pe-8 font-display text-[1.45rem] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[1.6rem]">
            {data ? <>Take “{data.page.name}” anywhere</> : "Export page"}
          </DialogTitle>
          <DialogDescription className="relative mt-1.5 max-w-2xl text-[0.82rem] leading-relaxed text-pretty max-sm:sr-only">
            One ZIP with the page, its images and fonts, legal pages and host settings — ready for Hostinger, Netlify, Vercel or Cloudflare Pages.
          </DialogDescription>
        </header>

        {data ? (
          data.versions.length ? (
            <ExportForm key={`${pageId}:${ctx.opening}`} data={data} requestedVersionId={versionId} reload={ctx.reload} onBusy={setBusy} onClose={() => onOpenChange(false)} />
          ) : (
            <NoVersions />
          )
        ) : ctx.error ? (
          <LoadError
            message={ctx.error.message ?? (ctx.error.error === "not_found" ? "This page no longer exists." : "The export settings could not be loaded.")}
            retry={ctx.reload}
          />
        ) : (
          <LoadingState />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* form                                                                */
/* ------------------------------------------------------------------ */

type Phase = { kind: "idle" } | { kind: "downloading" } | { kind: "done"; fileName: string; exportId: string; bytes: number };

const BLOCKING = new Set(["invalid", "not_found", "unavailable", "forbidden"]);

function initialVersion(data: ExportContextResponse, requested?: string): string {
  const ids = new Set(data.versions.map((v) => v.id));
  if (requested && ids.has(requested)) return requested;
  if (data.page.publishedVersionId && ids.has(data.page.publishedVersionId)) return data.page.publishedVersionId;
  return data.versions[0]?.id ?? "";
}

/**
 * Mode to start with: the one of the export being repeated ("Download again" passes its version),
 * else the last one used for this page, else Connected — never a mode that is unavailable.
 */
function initialMode(data: ExportContextResponse, versionId: string): ExportMode {
  const blocked = (m: ExportMode) => m === "connected" && !!data.defaults.connectedBlocker;
  const recent = data.exports.filter((e) => !e.revokedAt);
  const preferred = (recent.find((e) => e.versionId === versionId) ?? recent[0])?.mode;
  if (preferred && !blocked(preferred)) return preferred;
  return blocked("connected") ? "whatsapp" : "connected";
}

function ExportForm({
  data,
  requestedVersionId,
  reload,
  onBusy,
  onClose,
}: {
  data: ExportContextResponse;
  requestedVersionId?: string;
  reload: () => void;
  onBusy: (busy: boolean) => void;
  onClose: () => void;
}) {
  const uid = useId();
  const stepUp = useStoreStepUp();
  const ids = {
    version: `${uid}-version`,
    mode: `${uid}-mode`,
    domains: `${uid}-domains`,
    domainsHint: `${uid}-domains-hint`,
    wa: `${uid}-wa`,
    site: `${uid}-site`,
    host: `${uid}-host`,
    key: `${uid}-key`,
  };
  const { defaults } = data;

  const [versionId, setVersionId] = useState(() => initialVersion(data, requestedVersionId));
  const [mode, setMode] = useState<ExportMode>(() => initialMode(data, versionId));
  const [origins, setOrigins] = useState<string[]>(() => {
    const connected = data.exports.filter((e) => e.mode === "connected" && !e.revokedAt);
    return (connected.find((e) => e.versionId === versionId) ?? connected[0])?.allowedOrigins ?? [];
  });
  const [siteUrl, setSiteUrl] = useState(defaults.siteUrl ?? "");
  const [whatsapp, setWhatsapp] = useState(() => displayPhone(defaults.whatsapp));
  const [hostConfigs, setHostConfigs] = useState(true);
  const [embedKey, setEmbedKey] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [progress, setProgress] = useState(0);
  const [fields, setFields] = useState<Partial<Record<ExportRequestField, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [siteTouched, setSiteTouched] = useState(false);
  const abort = useRef<AbortController | null>(null);

  // closing the dialog (or leaving the screen) cancels a running download
  useEffect(() => {
    const running = abort;
    return () => running.current?.abort();
  }, []);

  const site = siteUrl.trim() ? normalizeSiteUrl(siteUrl) : null;
  const siteError = siteUrl.trim() && !site ? "Use a full https:// address, e.g. https://shop.ma" : null;
  const estimate = useEstimate(versionId && !siteError ? { versionId, mode, hostConfigs, siteUrl: site?.base ?? "", whatsapp } : null);
  const estimateFields = estimate.error?.fields ?? {};
  const fieldError = (f: ExportRequestField) => fields[f] ?? estimateFields[f];
  const siteUncovered = mode === "connected" && site && !originCovered(site.origin, origins) ? site : null;

  const blocker =
    (!versionId && "Choose a version to export.") ||
    (mode === "connected" && defaults.connectedBlocker) ||
    (mode === "connected" && !origins.length && "Add the domain where you will host the page — press Enter after each one.") ||
    siteError ||
    (mode === "whatsapp" && !whatsapp.trim() && "Add the WhatsApp number orders are sent to.") ||
    (estimate.error && BLOCKING.has(estimate.error.error) ? (estimate.error.message ?? "This export is not possible.") : null) ||
    null;

  const downloading = phase.kind === "downloading";
  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setFields({});
      setFailure(null);
      if (phase.kind === "done") setPhase({ kind: "idle" });
    };

  const run = async (retried = false): Promise<void> => {
    if (blocker || (downloading && !retried)) return;
    const ctl = new AbortController();
    abort.current = ctl;
    setPhase({ kind: "downloading" });
    setProgress(0);
    setFields({});
    setFailure(null);
    onBusy(true);
    let last = -1;
    const res = await downloadExport(
      {
        versionId,
        mode,
        allowedOrigins: mode === "connected" ? origins : [],
        options: {
          hostConfigs,
          ...(site ? { siteUrl: site.base } : {}),
          ...(mode === "whatsapp" && whatsapp.trim() ? { whatsappNumber: whatsapp.trim() } : {}),
          embedServiceAccount: mode === "php" && embedKey,
        },
      },
      (p) => {
        const pct = Math.round(p * 100);
        if (pct !== last) {
          last = pct;
          setProgress(p);
        }
      },
      ctl.signal,
    );
    abort.current = null;
    onBusy(false);
    if (ctl.signal.aborted) {
      setPhase({ kind: "idle" });
      return;
    }
    // the store's Google key in the ZIP asks for a fresh step-up (§B.7): the sheet, then the export once more
    if (!res.ok && res.error === "step_up" && !retried) {
      setPhase({ kind: "idle" });
      if (await stepUp.request()) return run(true);
      setFailure("Confirm it's you to include the Google key in this export.");
      return;
    }
    if (!res.ok) {
      setPhase({ kind: "idle" });
      setFields(res.fields ?? {});
      setFailure(res.message ?? "The export failed. Please try again.");
      return;
    }
    setPhase({ kind: "done", fileName: res.fileName, exportId: res.exportId, bytes: res.bytes });
    toast.success(`${res.fileName} downloaded`);
    reload();
  };

  const nextStep =
    mode === "connected"
      ? `Upload the contents of public_html to ${origins[0]?.replace(/^https?:\/\//, "") ?? "your domain"} — orders appear in Orders as soon as it is live.`
      : mode === "php"
        ? "Extract it next to public_html on your hosting (cod-private must stay outside), then open /order.php?check=1."
        : "Upload the contents of public_html to any host — orders arrive in WhatsApp.";

  return (
    <>
      <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_19.5rem] md:overflow-hidden">
        <div className="grid grid-cols-1 content-start gap-8 px-6 py-6 md:min-h-0 md:overflow-y-auto">
          <AnimatePresence initial={false}>
            {phase.kind === "done" && (
              <motion.div
                key="done"
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="flex items-start gap-3 rounded-2xl bg-emerald-500/[0.08] p-4 ring-1 ring-emerald-500/20 ring-inset"
                role="status"
              >
                <motion.span initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 520, damping: 22, delay: 0.1 }}>
                  <CircleCheckIcon className="size-5 text-emerald-600 dark:text-emerald-400" />
                </motion.span>
                <div className="grid min-w-0 gap-1">
                  <p className="truncate text-sm font-semibold">{phase.fileName}</p>
                  <p className="text-xs leading-relaxed text-pretty text-foreground/75">
                    Unzip it and open <span className="font-mono">README.md</span>. {nextStep}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <fieldset disabled={downloading} className="m-0 grid min-w-0 grid-cols-1 content-start gap-8 border-0 p-0">
            <Step n={1} title="Version" id={ids.version}>
              <Select value={versionId} onValueChange={edit(setVersionId)} disabled={downloading}>
                <SelectTrigger id={ids.version} aria-labelledby={`${ids.version}-title`} className="h-11 w-full min-w-0 rounded-xl px-3">
                  <SelectValue placeholder="Choose a version" />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-72 rounded-xl">
                  {data.versions.map((v) => (
                    <SelectItem key={v.id} value={v.id} className="rounded-lg py-1.5">
                      <span className="font-medium">{versionTitle(v)}</span>
                      <span className="text-muted-foreground">{absoluteTime(v.createdAt)}</span>
                      {v.published && <span className="rounded-full bg-emerald-500/12 px-1.5 py-px text-[0.65rem] font-semibold text-emerald-700 dark:text-emerald-300">Live</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldError("versionId") && <FieldError>{fieldError("versionId")}</FieldError>}
            </Step>

            <Step n={2} title="How orders arrive" id={ids.mode} labelOnly>
              <ModeCards value={mode} onChange={edit(setMode)} labelledBy={ids.mode} disabled={defaults.connectedBlocker ? { connected: defaults.connectedBlocker } : {}} />
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2, ease: EASE }}
                  className="grid gap-3 rounded-2xl bg-foreground/[0.025] p-4 ring-1 ring-foreground/[0.06] ring-inset"
                >
                  {mode === "connected" && (
                    <>
                      <Label htmlFor={ids.domains} className="text-[0.8rem]">
                        Allowed domains
                      </Label>
                      <DomainInput id={ids.domains} value={origins} onChange={edit(setOrigins)} error={fieldError("allowedOrigins")} describedBy={ids.domainsHint} />
                      <p id={ids.domainsHint} className="text-xs leading-relaxed text-muted-foreground">
                        Orders from any other site are refused. <span className="font-mono">shop.ma</span> and <span className="font-mono">www.shop.ma</span> are different sites —
                        add both, or <span className="font-mono">*.shop.ma</span>.
                      </p>
                      {defaults.apiOrigin && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <ArrowLeftRightIcon className="size-3.5 shrink-0" />
                          <span className="min-w-0 truncate">
                            Orders are sent to <span className="font-mono text-foreground/80">{defaults.apiOrigin}</span>
                          </span>
                        </p>
                      )}
                    </>
                  )}
                  {mode === "php" && (
                    <>
                      <StatusLine ok={defaults.sheetConnected} icon={<SheetIcon />}>
                        {defaults.sheetConnected ? (
                          <>
                            <b className="font-semibold">Google Sheet connected</b> — its id is pre-filled in config.php, orders land in the same tab as your live pages.
                          </>
                        ) : (
                          <>
                            <b className="font-semibold">No Google Sheet connected</b> — orders are kept in a private file on your hosting; add a sheet later in config.php.
                          </>
                        )}
                      </StatusLine>
                      {defaults.canEmbedServiceAccount ? (
                        <SwitchRow
                          id={ids.key}
                          checked={embedKey}
                          onCheckedChange={edit(setEmbedKey)}
                          disabled={downloading}
                          title="Include the Google key in config.php"
                          warn={embedKey}
                          error={fieldError("embedServiceAccount")}
                        >
                          {embedKey ? (
                            <>
                              Takes orders right after upload. The key of{" "}
                              <span className="font-mono break-all text-foreground/80">{defaults.exportServiceAccountEmail ?? "your export service account"}</span> can read and
                              change every order in your sheet — every page’s customers, not just this one’s. Keep the ZIP private; if it ever leaks, delete
                              that key in Google Cloud (README explains how).
                            </>
                          ) : (
                            "Leave off to upload a key of your own to cod-private/ (README explains how)."
                          )}
                        </SwitchRow>
                      ) : (
                        <div className="grid gap-1.5 text-xs leading-relaxed text-muted-foreground">
                          <p>You will upload a service-account key to cod-private/ yourself — README.md explains how.</p>
                          {defaults.embedKeyBlocker && <p className="text-pretty">{defaults.embedKeyBlocker}</p>}
                        </div>
                      )}
                      <Note>Needs PHP 8.1+ hosting such as Hostinger or any cPanel host. Netlify, Vercel and Cloudflare Pages can’t run PHP.</Note>
                    </>
                  )}
                  {mode === "whatsapp" && (
                    <>
                      <Label htmlFor={ids.wa} className="text-[0.8rem]">
                        WhatsApp number
                      </Label>
                      <div className="relative">
                        <MessageCircleIcon aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id={ids.wa}
                          type="tel"
                          inputMode="tel"
                          autoComplete="off"
                          value={whatsapp}
                          disabled={downloading}
                          aria-invalid={fieldError("whatsappNumber") ? true : undefined}
                          onChange={(e) => edit(setWhatsapp)(e.target.value)}
                          placeholder="+212 6 12 34 56 78"
                          className="h-11 rounded-xl ps-9 font-mono text-[0.85rem]"
                        />
                      </div>
                      {fieldError("whatsappNumber") ? (
                        <FieldError>{fieldError("whatsappNumber")}</FieldError>
                      ) : (
                        <p className="text-xs text-muted-foreground">With the country code. Every order message is addressed to this number.</p>
                      )}
                      <Note>WhatsApp orders don’t appear in Orders or your Google Sheet — you confirm them in the chat.</Note>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            </Step>

            <Step n={3} title="Site details" id={ids.site}>
              <div className="grid gap-1.5">
                <Label htmlFor={ids.site} className="text-[0.8rem]">
                  Site address <span className="font-normal text-muted-foreground">· optional</span>
                </Label>
                <Input
                  id={ids.site}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={siteUrl}
                  disabled={downloading}
                  aria-invalid={(siteTouched && siteError) || fieldError("siteUrl") ? true : undefined}
                  onChange={(e) => edit(setSiteUrl)(e.target.value)}
                  onBlur={() => setSiteTouched(true)}
                  placeholder="https://shop.ma/"
                  className="h-11 rounded-xl px-3 font-mono text-[0.85rem]"
                />
                {(siteTouched && siteError) || fieldError("siteUrl") ? (
                  <FieldError>{(siteTouched && siteError) || fieldError("siteUrl")}</FieldError>
                ) : (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Adds the canonical link, the social preview image and sitemap.xml. Leave it empty if you don’t know it yet.
                  </p>
                )}
                <AnimatePresence initial={false}>
                  {siteUncovered && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25, ease: EASE }}
                      className="overflow-hidden"
                    >
                      <div className="mt-1 flex flex-wrap items-center gap-2 rounded-xl bg-warn/[0.09] px-3 py-2 text-xs text-warn-ink ring-1 ring-warn/40 ring-inset">
                        <TriangleAlertIcon className="size-3.5 shrink-0" />
                        <span className="min-w-0 flex-1">Orders from {siteUncovered.origin.replace(/^https?:\/\//, "")} would be refused.</span>
                        <Button
                          size="xs"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => {
                            const add = normalizeAllowedOrigins([siteUncovered.origin]).origins;
                            edit(setOrigins)([...origins, ...add.filter((o) => !origins.includes(o))]);
                          }}
                        >
                          Allow it
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <SwitchRow id={ids.host} checked={hostConfigs} onCheckedChange={edit(setHostConfigs)} disabled={downloading} title="Host configuration files">
                {mode === "php"
                  ? ".htaccess — HTTPS redirect, security headers and long-lived caching."
                  : ".htaccess, _headers and vercel.json — HTTPS redirect, security headers and long-lived caching on Hostinger, Netlify, Cloudflare Pages and Vercel."}
              </SwitchRow>
            </Step>
          </fieldset>

          <section aria-labelledby={`${uid}-recent`} className="grid gap-3 border-t pt-6">
            <h3 id={`${uid}-recent`} className="flex items-center gap-2 text-sm font-semibold">
              Recent exports
              {data.exports.length > 0 && (
                <span className="rounded-full bg-foreground/[0.06] px-1.5 text-[0.7rem] font-medium tabular-nums text-muted-foreground">{data.exports.length}</span>
              )}
            </h3>
            <RecentExports exports={data.exports} versions={data.versions} highlightId={phase.kind === "done" ? phase.exportId : undefined} onChanged={reload} />
          </section>
        </div>

        <aside className="border-t bg-muted/35 px-6 py-6 md:min-h-0 md:overflow-y-auto md:border-t-0 md:border-s">
          <SizeSummary estimate={estimate} mode={mode} hostConfigs={hostConfigs} hasSite={!!site} />
        </aside>
      </div>

      <footer className="relative shrink-0 border-t bg-background px-6 py-3.5">
        <AnimatePresence>
          {downloading && (
            <motion.div key="bar" className="absolute inset-x-0 -top-px h-0.5 overflow-hidden bg-brand/15" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div
                className="h-full origin-left bg-brand"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: Math.max(0.04, progress) }}
                transition={{ duration: 0.3, ease: EASE }}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1 text-xs" aria-live="polite">
            {failure ? (
              <p role="alert" className="flex items-start gap-1.5 font-medium text-destructive">
                <CircleAlertIcon className="mt-px size-3.5 shrink-0" />
                {failure}
              </p>
            ) : downloading ? (
              <p className="text-muted-foreground tabular-nums">Packing your site… {Math.round(progress * 100)}%</p>
            ) : phase.kind === "done" ? (
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <CircleCheckIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                Saved · {formatBytes(phase.bytes)}
              </p>
            ) : blocker ? (
              <p className="flex items-start gap-1.5 text-muted-foreground">
                <InfoIcon className="mt-px size-3.5 shrink-0" />
                {blocker}
              </p>
            ) : (
              <p className="truncate text-muted-foreground">
                {MODE_META[mode].title}
                {mode === "connected" ? ` · ${origins.length} domain${origins.length > 1 ? "s" : ""}` : ""}
                {site ? ` · ${site.base.replace(/^https?:\/\//, "")}` : ""}
                {estimate.data ? ` · ≈ ${formatBytes(estimate.data.bytes)}` : ""}
              </p>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            {downloading ? (
              <Button variant="ghost" className="h-10 rounded-full px-4" onClick={() => abort.current?.abort()}>
                Cancel
              </Button>
            ) : (
              <Button variant="ghost" className="h-10 rounded-full px-4" onClick={onClose}>
                {phase.kind === "done" ? "Close" : "Cancel"}
              </Button>
            )}
            <Button
              onClick={() => void run()}
              disabled={!!blocker || downloading}
              className={cn(
                "h-10 min-w-40 rounded-full border-0 bg-brand px-5 font-semibold text-brand-foreground hover:bg-brand/90",
                "shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_10px_24px_-12px_color-mix(in_oklab,var(--brand)_80%,transparent)] transition-[transform,box-shadow,background-color] duration-300 hover:-translate-y-px active:translate-y-0 active:scale-[0.98]",
              )}
            >
              {downloading ? <LoaderCircleIcon className="animate-spin" /> : phase.kind === "done" ? <RotateCwIcon /> : <DownloadIcon />}
              {downloading ? "Downloading…" : phase.kind === "done" ? "Download again" : "Download ZIP"}
            </Button>
          </div>
        </div>
      </footer>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* pieces                                                              */
/* ------------------------------------------------------------------ */

/** A numbered step: a small index disc, a title, then its fields. */
function Step({ n, title, id, labelOnly, children }: { n: number; title: string; id: string; labelOnly?: boolean; children: ReactNode }) {
  const headingId = labelOnly ? id : `${id}-title`;
  return (
    <section aria-labelledby={headingId} className="grid grid-cols-1 gap-3">
      <h3 id={headingId} className="flex items-center gap-2.5 text-sm font-semibold tracking-[-0.005em]">
        <span aria-hidden="true" className="flex size-5 items-center justify-center rounded-full bg-foreground text-[0.65rem] font-semibold text-background tabular-nums">
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function SwitchRow({
  id,
  title,
  checked,
  onCheckedChange,
  disabled,
  warn,
  error,
  children,
}: {
  id: string;
  title: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  warn?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl p-3 ring-1 ring-inset transition-colors duration-300",
        warn ? "bg-warn/[0.07] ring-warn/40" : "bg-card ring-foreground/[0.07]",
      )}
    >
      <div className="grid min-w-0 flex-1 gap-0.5">
        <Label htmlFor={id} className="text-[0.82rem]">
          {title}
        </Label>
        <p id={`${id}-desc`} className={cn("text-xs leading-relaxed text-pretty", warn ? "text-warn-ink/85" : "text-muted-foreground")}>
          {children}
        </p>
        {error && <FieldError>{error}</FieldError>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-describedby={`${id}-desc`} className="mt-0.5" />
    </div>
  );
}

function StatusLine({ ok, icon, children }: { ok: boolean; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-xs leading-relaxed">
      <span
        aria-hidden="true"
        className={cn(
          "mt-px flex size-6 shrink-0 items-center justify-center rounded-lg [&_svg]:size-3.5",
          ok ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-foreground/[0.06] text-foreground/60",
        )}
      >
        {icon}
      </span>
      <p className="text-foreground/80">{children}</p>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
      <InfoIcon className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-xs text-destructive">
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* states                                                              */
/* ------------------------------------------------------------------ */

function LoadingState() {
  return (
    <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_19.5rem]" aria-busy="true" aria-label="Loading export settings">
      <div className="grid content-start gap-7 px-6 py-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid gap-3">
            <span className="h-4 w-36 animate-pulse rounded-md bg-foreground/[0.07]" />
            <span className={cn("animate-pulse rounded-2xl bg-foreground/[0.05]", i === 1 ? "h-40" : "h-11")} />
          </div>
        ))}
      </div>
      <div className="hidden gap-4 border-s bg-muted/35 px-6 py-6 md:grid md:content-start">
        <span className="h-3 w-28 animate-pulse rounded bg-foreground/[0.07]" />
        <span className="h-10 w-32 animate-pulse rounded-lg bg-foreground/[0.07]" />
        <span className="h-2 w-full animate-pulse rounded-full bg-foreground/[0.06]" />
      </div>
    </div>
  );
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="grid place-items-center gap-4 px-6 py-16 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
        <CircleAlertIcon className="size-5" />
      </span>
      <p className="max-w-sm text-sm text-pretty text-muted-foreground">{message}</p>
      <Button variant="outline" className="rounded-full" onClick={retry}>
        <RotateCwIcon />
        Try again
      </Button>
    </div>
  );
}

function NoVersions() {
  return (
    <div className="grid place-items-center gap-4 px-6 py-14 text-center">
      <Illustration name="exports" className="w-40" />
      <div className="grid max-w-sm gap-1.5">
        <p className="font-semibold">Nothing to export yet</p>
        <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
          Exports are made from a saved version. Save or publish this page in the builder, then come back here.
        </p>
      </div>
    </div>
  );
}

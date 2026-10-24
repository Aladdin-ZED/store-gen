"use client";

import {
  AlertTriangleIcon,
  ArrowUpRightIcon,
  CheckIcon,
  ClockIcon,
  FingerprintIcon,
  KeyRoundIcon,
  Link2Icon,
  Loader2Icon,
  PlugZapIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  StethoscopeIcon,
  UnplugIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { SheetHealth } from "@/lib/admin-data/dashboard";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "../common/confirm-dialog";
import { CopyButton } from "../common/copy-button";
import { StatusChip } from "../common/status-chip";
import { RelativeTime } from "../common/time";
import { int } from "../lib/format";
import { runSheetSync } from "../lib/sheets-client";
import { SettingsSection, TextInput } from "./form-kit";

export interface SheetsState {
  configured: boolean;
  envPresent: boolean;
  /** French explanation when the key is present but unusable */
  problem: string | null;
  serviceAccountEmail: string | null;
  sheet: { url: string; sheetTitle: string; connectedAt: string | null; enabled: boolean } | null;
  /** an ownership proof is waiting (SHT-09): when it expires (the code itself is only shown when issued) */
  pendingProof: { expiresAt: string } | null;
  health: SheetHealth;
  /** url: browser test with ?key=; endpoint: what the cron job calls with the X-Cron-Key header */
  cron: { configured: boolean; url: string; endpoint: string };
}

async function call(path: string, method: string, body?: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`/api/admin/sheets/${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  return { status: res.status, data };
}

const msg = (d: Record<string, unknown>, fallback: string) => (typeof d.message === "string" && d.message ? d.message : fallback);

export function SheetsWizard({ state, canWrite, canSync }: { state: SheetsState; canWrite: boolean; canSync: boolean }) {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [spreadsheetTitle, setSpreadsheetTitle] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pause" | "test" | "sync" | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  // the ownership proof of a new spreadsheet: the code is known only right after it is issued
  const [proof, setProof] = useState<{ code: string | null; expiresAt: string } | null>(state.pendingProof ? { code: null, expiresAt: state.pendingProof.expiresAt } : null);
  const [verifying, setVerifying] = useState(false);

  const { configured, serviceAccountEmail: email, sheet, health } = state;

  const connected = (data: Record<string, unknown>) => {
    const title = typeof data.spreadsheetTitle === "string" ? data.spreadsheetTitle : null;
    const tab = (data.sheet as { sheetTitle?: string } | undefined)?.sheetTitle ?? "Commandes";
    setSpreadsheetTitle(title);
    setLink("");
    setChanging(false);
    setProof(null);
    toast.success(data.created ? `Connected — the “${tab}” tab was created and formatted` : `Connected to the “${tab}” tab`, {
      description: title ? `Spreadsheet: ${title}` : undefined,
    });
    router.refresh();
  };

  const verify = async () => {
    setVerifying(true);
    setError(null);
    try {
      const { status, data } = await call("verify", "POST");
      if (data.ok) connected(data);
      else {
        if (data.error === "no_proof") setProof(null);
        setError(status === 429 ? "Too many attempts — wait a few minutes." : msg(data, "The check failed. Try again in a minute."));
      }
    } catch {
      setError("Network problem — check your connection and try again.");
    } finally {
      setVerifying(false);
    }
  };

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    setError(null);
    try {
      const { status, data } = await call("connect", "POST", { url: link });
      const issued = data.proof as { code?: unknown; expiresAt?: unknown } | undefined;
      if (data.ok && issued && typeof issued.code === "string" && typeof issued.expiresAt === "string") {
        setProof({ code: issued.code, expiresAt: issued.expiresAt });
      } else if (data.ok) {
        connected(data);
      } else {
        setError(status === 429 ? "Too many attempts — wait a few minutes." : msg(data, "Connection failed. Check the link and the sharing settings."));
      }
    } catch {
      setError("Network problem — check your connection and try again.");
    } finally {
      setConnecting(false);
    }
  };

  const setEnabled = async (enabled: boolean) => {
    setBusy("pause");
    try {
      const { data } = await call("connect", "PATCH", { enabled });
      if (data.ok) {
        toast.success(enabled ? "Sync resumed — queued orders are being sent" : "Sync paused — new orders will wait in the queue");
        router.refresh();
      } else toast.error("Couldn't change the sync state.");
    } catch {
      toast.error("Network problem — the sync state didn't change.");
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy("test");
    try {
      const { data } = await call("test", "POST");
      if (data.ok && data.headerOk) toast.success(msg(data, "Connection verified"));
      else if (data.ok) toast.warning("The sheet is reachable, but its header row changed", { description: msg(data, "") });
      else toast.error("The sheet isn't reachable", { description: msg(data, "Check the sharing settings.") });
    } catch {
      toast.error("Network problem — the test didn't run.");
    } finally {
      setBusy(null);
    }
  };

  const sync = async () => {
    setBusy("sync");
    try {
      if (await runSheetSync()) router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {sheet && !changing && (
        <SettingsSection
          title={
            <span className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">
                <PlugZapIcon className="size-4" />
              </span>
              Connected sheet
            </span>
          }
          aside={
            <StatusChip tone={sheet.enabled ? "emerald" : "warn"} pulse={sheet.enabled}>
              {sheet.enabled ? "Syncing" : "Paused"}
            </StatusChip>
          }
          style={{ ["--i" as string]: 1 }}
        >
          <div className="adm-aurora adm-grain relative grid gap-4 rounded-2xl p-5 ring-1 ring-foreground/[0.07] ring-inset sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="relative z-10 grid min-w-0 gap-1">
              <span className="text-xs font-medium text-muted-foreground">Orders tab</span>
              <span className="truncate text-xl font-semibold tracking-tight">“{sheet.sheetTitle}”</span>
              <span className="truncate text-sm text-muted-foreground">
                {spreadsheetTitle ? `in ${spreadsheetTitle} · ` : ""}
                {sheet.connectedAt ? (
                  <>
                    connected <RelativeTime iso={sheet.connectedAt} />
                  </>
                ) : (
                  "connected"
                )}
              </span>
            </div>
            <div className="relative z-10 flex flex-wrap gap-2">
              <Button asChild variant="outline" className="rounded-full bg-background/70">
                <a href={sheet.url} target="_blank" rel="noopener noreferrer">
                  Open sheet <ArrowUpRightIcon />
                </a>
              </Button>
              {canSync && (
                <Button className="rounded-full" onClick={sync} disabled={busy !== null}>
                  {busy === "sync" ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
                  Sync now
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <QueueStat label="In the sheet" value={health.synced} />
            <QueueStat label="Waiting" value={health.pending} tone={health.pending && sheet.enabled && (health.oldestPendingMinutes ?? 0) > 15 ? "warn" : undefined} />
            <QueueStat label="Failed" value={health.failed} tone={health.failed ? "danger" : undefined} href={health.failed ? "/admin/orders?sheet=failed" : undefined} />
          </div>
          {health.lastError && (
            <p className="flex gap-2 rounded-xl bg-destructive/8 px-3.5 py-2.5 text-sm leading-relaxed text-destructive ring-1 ring-destructive/15 ring-inset">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong className="font-semibold">Last error from Google:</strong> {health.lastError}
              </span>
            </p>
          )}

          <div className="flex flex-col gap-3 rounded-2xl bg-foreground/[0.025] p-4 ring-1 ring-foreground/[0.05] ring-inset sm:flex-row sm:items-start sm:justify-between">
            <div className="grid max-w-xl gap-1">
              <label htmlFor="sheet-enabled" className="text-sm font-medium">
                Send new orders to the sheet
              </label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                When paused, new orders wait in a queue (nothing is lost) and statuses aren&apos;t pulled from the sheet. Status changes you make here are still
                written to rows already in the sheet. Resuming sends the queue right away.
              </p>
            </div>
            <span className="flex items-center gap-2">
              {busy === "pause" && <Loader2Icon className="size-4 animate-spin text-muted-foreground" />}
              <Switch id="sheet-enabled" checked={sheet.enabled} disabled={!canWrite || busy !== null} onCheckedChange={setEnabled} className="data-checked:bg-brand" />
            </span>
          </div>

          {canWrite && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
              <Button variant="ghost" className="rounded-full" onClick={test} disabled={busy !== null}>
                {busy === "test" ? <Loader2Icon className="animate-spin" /> : <StethoscopeIcon />}
                Test connection
              </Button>
              <Button variant="ghost" className="rounded-full" onClick={() => setChanging(true)}>
                <Link2Icon /> Use another sheet
              </Button>
              <Button variant="ghost" className="ms-auto rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirmDisconnect(true)}>
                <UnplugIcon /> Disconnect
              </Button>
            </div>
          )}
        </SettingsSection>
      )}

      {(!sheet || changing) && (
        <SettingsSection
          title={sheet ? "Connect another sheet" : "Connect Google Sheets"}
          description="Every new order becomes a row your call center can work on, with a status dropdown that syncs back here."
          style={{ ["--i" as string]: 1 }}
          aside={
            changing && (
              <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setChanging(false)}>
                Cancel
              </Button>
            )
          }
        >
          <ol className="relative grid gap-0">
            <Step n={1} state={configured ? "done" : "current"} title="Service account" last={false}>
              {configured ? (
                <div className="grid grid-cols-1 gap-2">
                  <p className="text-sm text-muted-foreground">The server has a working Google service account. This is the address you share your sheet with:</p>
                  <EmailChip email={email} />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 text-sm">
                  {state.envPresent && state.problem ? (
                    <p className="flex gap-2 rounded-xl bg-destructive/8 px-3.5 py-2.5 leading-relaxed text-destructive ring-1 ring-destructive/15 ring-inset">
                      <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                      {state.problem}
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      A one-time setup on the server (5 minutes, free): a Google service account writes the orders for you, so you never share your Google
                      password.
                    </p>
                  )}
                  <ol className="grid list-decimal gap-1.5 ps-5 text-muted-foreground marker:text-foreground/40">
                    <li>
                      In <span className="font-medium text-foreground">console.cloud.google.com</span>, create a project and enable the <span className="font-medium text-foreground">Google Sheets API</span>.
                    </li>
                    <li>Create a service account, then add a JSON key and download it.</li>
                    <li>
                      Convert the file to base64 and set it as the <code className="rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-xs text-foreground">GOOGLE_SA_JSON_B64</code>{" "}
                      environment variable in Hostinger, then restart the app.
                    </li>
                  </ol>
                  <p className="text-xs text-muted-foreground">Step-by-step guide: docs/GOOGLE-SHEETS-SETUP.md in the project.</p>
                </div>
              )}
            </Step>
            <Step n={2} state={!configured ? "todo" : "current"} title="Share your sheet" last={false}>
              <div className="grid grid-cols-1 gap-2 text-sm text-muted-foreground">
                <p>
                  Create an empty Google Sheet (or open an existing one), click <span className="font-medium text-foreground">Share</span>, add the address
                  below as <span className="font-medium text-foreground">Editor</span> and untick “Notify people”.
                </p>
                {configured && (
                  <div className="flex flex-wrap items-center gap-2">
                    <EmailChip email={email} />
                    <Button asChild variant="ghost" size="sm" className="rounded-full">
                      <a href="https://sheets.new" target="_blank" rel="noopener noreferrer">
                        New Google Sheet <ArrowUpRightIcon />
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            </Step>
            <Step n={3} state={!configured ? "todo" : proof ? "done" : "current"} title="Paste the link" last={false}>
              <form onSubmit={connect} className="grid grid-cols-1 gap-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <TextInput
                    value={link}
                    onChange={(e) => {
                      setLink(e.target.value);
                      setError(null);
                    }}
                    type="url"
                    required
                    disabled={!configured || !canWrite || connecting}
                    placeholder="https://docs.google.com/spreadsheets/d/…/edit"
                    aria-label="Google Sheet link"
                    aria-invalid={!!error}
                    className="font-mono text-[0.8rem]"
                  />
                  <Button type="submit" className="h-10 shrink-0 rounded-xl px-5" disabled={!configured || !canWrite || connecting || !link.trim()}>
                    {connecting ? <Loader2Icon className="animate-spin" /> : <PlugZapIcon />}
                    {connecting ? "Connecting…" : "Connect"}
                  </Button>
                </div>
                <AnimatePresence>
                  {error && !proof && (
                    <motion.p
                      role="alert"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex gap-2 rounded-xl bg-destructive/8 px-3.5 py-2.5 text-sm leading-relaxed text-destructive ring-1 ring-destructive/15 ring-inset"
                    >
                      <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                      <span lang="fr">{error}</span>
                    </motion.p>
                  )}
                </AnimatePresence>
                <p className="text-xs text-muted-foreground">
                  We create a formatted orders tab (usually “Commandes”, or “Commandes COD” if your sheet already has a different “Commandes” tab) with a
                  status dropdown. Your other tabs are never touched.
                </p>
              </form>
            </Step>
            <Step n={4} state={proof ? "current" : "todo"} title="Prove it's your sheet" last>
              <div className="grid grid-cols-1 gap-3 text-sm">
                <p className="text-muted-foreground">
                  Many stores share our service account, so we check that you can edit this sheet before writing to it. Type the code below into any cell
                  of the sheet&apos;s first row (A1 is fine), then click Verify. You can delete it afterwards.
                </p>
                {proof?.code ? (
                  <div className="flex items-center gap-2 rounded-2xl bg-foreground/[0.04] py-2 ps-4 pe-2 ring-1 ring-foreground/[0.07] ring-inset">
                    <FingerprintIcon className="size-4 shrink-0 text-muted-foreground" />
                    <code className="min-w-0 flex-1 truncate font-mono text-lg font-semibold tracking-[0.12em] tabular-nums select-all">{proof.code}</code>
                    <CopyButton value={proof.code} label="Copy the code" toastMessage="Code copied — paste it into the first row of your sheet" />
                  </div>
                ) : (
                  proof && (
                    <p className="text-xs text-muted-foreground">
                      A code was issued earlier. If it is already in your sheet, verify now; otherwise paste the link again for a new code.
                    </p>
                  )
                )}
                {proof && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button className="h-10 rounded-xl px-5" onClick={verify} disabled={verifying || !canWrite}>
                      {verifying ? <Loader2Icon className="animate-spin" /> : <ShieldCheckIcon />}
                      {verifying ? "Checking the sheet…" : "Verify"}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      The code expires <RelativeTime iso={proof.expiresAt} />
                    </span>
                  </div>
                )}
                <AnimatePresence>
                  {error && proof && (
                    <motion.p
                      role="alert"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex gap-2 rounded-xl bg-destructive/8 px-3.5 py-2.5 text-sm leading-relaxed text-destructive ring-1 ring-destructive/15 ring-inset"
                    >
                      <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                      <span lang="fr">{error}</span>
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </Step>
          </ol>
        </SettingsSection>
      )}

      <SettingsSection
        id="cron"
        title={
          <span className="flex items-center gap-2">
            <ClockIcon className="size-4 text-muted-foreground" /> Background sync job
          </span>
        }
        description="Orders are sent the moment they're placed. A cron job every 5 minutes retries anything Google refused and pulls the statuses your agents set in the sheet."
        aside={<StatusChip tone={state.cron.configured ? "emerald" : "warn"}>{state.cron.configured ? "Key configured" : "CRON_KEY missing"}</StatusChip>}
        style={{ ["--i" as string]: 2 }}
      >
        <div className="grid grid-cols-1 gap-3 text-sm">
          <p className="text-muted-foreground">
            First open this address in your browser, with your <code className="rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-xs text-foreground">CRON_KEY</code>{" "}
            value at the end. It should answer <code className="font-mono text-xs">{'{"ok":true,…}'}</code>:
          </p>
          <div className="flex items-center gap-2 rounded-xl bg-foreground/[0.04] py-1.5 ps-3.5 pe-1.5 ring-1 ring-foreground/[0.06] ring-inset">
            <KeyRoundIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <code className="min-w-0 flex-1 truncate font-mono text-[0.78rem]">{state.cron.url}</code>
            <CopyButton value={state.cron.url} label="Copy cron URL" toastMessage="Cron URL copied — paste your key at the end" />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Then in Hostinger hPanel → your site → <span className="font-medium text-foreground">Advanced → Cron Jobs → Create Cron Job</span>, type Custom, every
            5 minutes, with this one-line command (your key goes in the header, and never put a % in it):{" "}
            <code className="font-mono break-all">
              curl -fsS --max-time 110 -o /dev/null -H &quot;X-Cron-Key: YOUR_CRON_KEY&quot; &quot;{state.cron.endpoint}&quot; || date &gt;&gt; &quot;$HOME/cron-tick-failures.log&quot;
            </code>
          </p>
        </div>
      </SettingsSection>

      {confirmDisconnect && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirmDisconnect(false)}
          destructive
          icon={<UnplugIcon />}
          title="Disconnect Google Sheets?"
          description="New orders stay in the studio and queue up; nothing is deleted from your sheet. Reconnect any time to send the queue."
          confirmLabel="Disconnect"
          pendingLabel="Disconnecting…"
          onConfirm={async () => {
            const { data } = await call("connect", "DELETE").catch(() => ({ data: {} as Record<string, unknown> }));
            if (data.ok) {
              toast.success("Google Sheets disconnected");
              router.refresh();
              return true;
            }
            toast.error("Couldn't disconnect. Try again.");
            return false;
          }}
        />
      )}
    </>
  );
}

function EmailChip({ email }: { email: string | null }) {
  if (!email) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-emerald-500/8 py-1 ps-3 pe-1 ring-1 ring-emerald-500/20 ring-inset">
      <ShieldCheckIcon className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <span className="truncate font-mono text-[0.78rem] text-foreground">{email}</span>
      <CopyButton value={email} label="Copy service account email" toastMessage="Email copied — paste it in “Share”" size="icon-xs" />
    </span>
  );
}

function Step({ n, state, title, last, children }: { n: number; state: "done" | "current" | "todo"; title: string; last: boolean; children: ReactNode }) {
  return (
    <li className={cn("relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4", !last && "pb-6")}>
      {!last && (
        <span aria-hidden="true" className="absolute start-4 top-9 bottom-1 w-px -translate-x-1/2 bg-gradient-to-b from-border to-border/30 rtl:translate-x-1/2" />
      )}
      <span
        className={cn(
          "relative z-10 flex size-8 items-center justify-center rounded-full text-[0.8rem] font-semibold transition-colors",
          state === "done" && "bg-emerald-500 text-white shadow-[0_6px_14px_-6px_rgb(16_185_129/0.7)]",
          state === "current" && "bg-brand text-brand-foreground shadow-[0_6px_14px_-6px_color-mix(in_oklab,var(--brand)_80%,transparent)]",
          state === "todo" && "bg-foreground/[0.06] text-muted-foreground ring-1 ring-foreground/10 ring-inset",
        )}
      >
        {state === "done" ? <CheckIcon className="size-4" strokeWidth={3} /> : n}
      </span>
      <div className={cn("grid grid-cols-1 gap-2 pt-1", state === "todo" && "opacity-55")}>
        <h3 className="text-sm font-semibold">{title}</h3>
        {children}
      </div>
    </li>
  );
}

function QueueStat({ label, value, tone, href }: { label: string; value: number; tone?: "warn" | "danger"; href?: string }) {
  const body = (
    <>
      <span className={cn("text-xl leading-none font-semibold tabular-nums", tone === "danger" && "text-destructive", tone === "warn" && "text-warn-ink")}>
        {int(value)}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </>
  );
  const cls = "grid gap-1 rounded-xl bg-foreground/[0.03] px-4 py-3 ring-1 ring-foreground/[0.05] ring-inset";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:bg-foreground/[0.05]")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

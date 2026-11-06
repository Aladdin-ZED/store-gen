"use client";
/**
 * Connect → Telegram (operations.md OPE-§21.1, §21.4, OD23; IN-04): the store's own bot and chat in three steps, then
 * the details level and the notification switches.
 *
 *   1. Bot     write-only token field, checked with getMe ("Create a bot with @BotFather and paste its token here");
 *              set → "set" and the bot's @name only, never the token again (Replace opens the field)
 *   2. Chat    Find my chat (one getUpdates; `tg:find` 10 per hour, its limit message), the chats seen, pick one
 *   3. Test    Send test message; success turns Telegram on
 *
 * Details level masked / full (full behind "Everyone in this chat will see customers' numbers"); failing shows the
 * cause and the fix; Turn off (and forget the bot). Without `canWrite` (view as store) every write is hidden. A setup
 * step's refusal is the `int.tg.err.<error>` sentence, never a provider's raw text.
 */
import { BellIcon, BotIcon, CheckIcon, Loader2Icon, MessageSquareIcon, PowerIcon, SearchIcon, SendIcon, ShieldAlertIcon, UsersIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  disableTelegramAction,
  findTelegramChatsAction,
  saveNotificationsAction,
  saveTelegramTokenAction,
  selectTelegramChatAction,
  sendTelegramTestAction,
  setTelegramPiiAction,
} from "@/app/app/[store]/integrations/telegram/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/lib/i18n/admin/client";
import type { CheckItem } from "@/lib/integrations/causes";
import type { IntegrationHealthRow } from "@/lib/integrations/health";
import type { TelegramView } from "@/lib/integrations/telegram/setup.server";
import type { ChatType, FoundChat } from "@/lib/integrations/telegram/wire";
import type { NotificationsSetting } from "@/lib/settings/keys/notifications";
import { cn } from "@/lib/utils";
import { useStoreStepUp } from "../shell/step-up";
import { InlineError } from "./hub-states";
import { IntConfirm } from "./int-confirm";
import { StateBadge } from "./state-badge";

type SetupAnswer = { ok: true } | { ok: false; error: string; retryAfterSec?: number };

const BATCH_CHOICES = [0, 15, 30, 45, 60, 120, 300] as const;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const SWITCHES = ["newOrders", "dailySummary", "integrationErrors", "profitAlerts", "cashHeld"] as const;

export function TelegramSetup({
  initial,
  notifications: initialNotifications,
  status,
  checks,
  canWrite,
  timezone,
}: {
  initial: TelegramView | null;
  notifications: NotificationsSetting | null;
  status: IntegrationHealthRow | null;
  checks: CheckItem[];
  canWrite: boolean;
  timezone: string;
}) {
  const t = useT();
  const router = useRouter();
  const stepUp = useStoreStepUp();
  const tokenId = useId();
  const [view, setView] = useState(initial);
  const [token, setToken] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState<null | "token" | "find" | "select" | "test" | "pii">(null);
  const [error, setError] = useState<{ step: "token" | "chat" | "test" | "pii"; text: string } | null>(null);
  const [chats, setChats] = useState<FoundChat[] | null>(null);
  const [confirmFull, setConfirmFull] = useState(false);
  const [confirmOff, setConfirmOff] = useState<null | "off" | "forget">(null);

  if (!view) return <InlineError />;

  /** A refusal of the action itself (permission, step-up, network) in the screen's words. */
  const refusal = (res: { error: string; message?: string }) => (res.error === "step_up" ? t("int.sheets.stepUpNeeded") : t(res.message ?? `error.${res.error}`));
  /** A setup step's refusal; the `tg:find` limit (10 per hour) names its wait. */
  const stepWords = (r: { error: string; retryAfterSec?: number }, kind: string) =>
    r.error === "rate_limited" && kind === "find" ? t("int.tgs.findLimit", { minutes: Math.max(1, Math.ceil((r.retryAfterSec ?? 3600) / 60)) }) : t(`int.tg.err.${r.error}`);

  async function run<T extends SetupAnswer>(step: "token" | "chat" | "test" | "pii", kind: NonNullable<typeof busy>, call: () => Promise<{ ok: true; data: T } | { ok: false; error: string; message?: string }>): Promise<T | null> {
    setBusy(kind);
    setError(null);
    try {
      const res = await call();
      if (!res.ok) {
        setError({ step, text: refusal(res) });
        return null;
      }
      if (!res.data.ok) {
        const r = res.data as { ok: false; error: string; retryAfterSec?: number };
        setError({ step, text: stepWords(r, kind) });
        return null;
      }
      return res.data;
    } catch {
      setError({ step, text: t("int.sheets.network") });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function saveToken(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !token.trim()) return;
    const r = await run("token", "token", () => stepUp.action(() => saveTelegramTokenAction(token.trim())));
    if (!r || !r.ok) return;
    setToken("");
    setReplacing(false);
    setChats(null);
    setView((v) => v && { ...v, tokenSet: true, botUsername: (r as { botUsername: string | null }).botUsername, chat: null, enabled: false });
    toast.success(t("int.tgs.token.saved"));
    router.refresh();
  }

  async function find() {
    const r = await run("chat", "find", () => findTelegramChatsAction());
    if (r && r.ok) setChats((r as { chats: FoundChat[] }).chats);
  }

  async function pick(chat: FoundChat) {
    const r = await run("chat", "select", () => selectTelegramChatAction(chat.id));
    if (!r || !r.ok) return;
    const c = (r as { chat: { title: string; type: ChatType } }).chat;
    setView((v) => v && { ...v, chat: { title: c.title, type: c.type, last4: chat.id.replace(/[^0-9A-Za-z_]/g, "").slice(-4) }, enabled: false });
    setChats(null);
    router.refresh();
  }

  async function test() {
    const r = await run("test", "test", () => sendTelegramTestAction());
    if (!r || !r.ok) return;
    setView((v) => v && { ...v, enabled: true });
    toast.success(t("int.tgs.test.sent"));
    router.refresh();
  }

  async function setPii(level: "masked" | "full", confirmed = false): Promise<boolean> {
    const r = await run("pii", "pii", () => setTelegramPiiAction(level, confirmed));
    if (!r || !r.ok) return false;
    setView((v) => v && { ...v, pii: level });
    return true;
  }

  const tokenStep: Step = view.tokenSet ? "done" : "current";
  const chatStep: Step = !view.tokenSet ? "todo" : view.chat ? "done" : "current";
  const testStep: Step = !view.chat ? "todo" : view.enabled ? "done" : "current";
  const failing = status && (status.state === "failing" || status.state === "warn") && view.enabled;
  const badge = !view.tokenSet ? null : failing ? (
    <StateBadge tone={status!.state === "failing" ? "danger" : "warn"}>{t(status!.state === "failing" ? "int.tgs.state.failing" : "int.tgs.state.late")}</StateBadge>
  ) : view.enabled ? (
    <StateBadge tone="success">{t("int.tgs.state.on")}</StateBadge>
  ) : (
    <StateBadge tone="neutral">{t("int.tgs.state.off")}</StateBadge>
  );

  return (
    <div className="grid gap-5">
      {failing && (
        <section role="alert" className="grid gap-3 rounded-[var(--adm-radius)] bg-destructive/[0.05] p-4 ring-1 ring-destructive/15 ring-inset sm:p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <ShieldAlertIcon className="size-4" aria-hidden="true" />
            {t("int.tgs.failing.title")}
          </h2>
          {status?.lastErrorKey && <p className="text-sm text-pretty">{t(status.lastErrorKey)}</p>}
          {checks.length > 0 && (
            <ol className="grid gap-2">
              {checks.map((c, i) => (
                <li key={c.code} className="flex gap-3 text-sm">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-[0.7rem] font-semibold tabular-nums">{i + 1}</span>
                  <span className="grid gap-0.5">
                    <span className="font-medium">{t(c.text)}</span>
                    <span className="text-muted-foreground">{t(c.hint)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      <section aria-labelledby="tg-setup-title" className="adm-surface grid gap-1 p-4 sm:p-6">
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 max-w-[60ch] gap-1">
            <h2 id="tg-setup-title" className="text-[0.95rem] font-semibold tracking-[-0.01em]">
              {t("int.tgs.setup.title")}
            </h2>
            <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{t("int.tgs.setup.lead")}</p>
          </div>
          {badge}
        </header>

        <ol className="grid">
          {/* 1. the bot */}
          <StepRow n={1} state={tokenStep} icon={<BotIcon />} title={t("int.tgs.token.title")} last={false}>
            {view.tokenSet && !replacing ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {view.botUsername ? (
                    <>
                      {t("int.tgs.token.setAs")}{" "}
                      <bdi dir="ltr" className="font-medium text-foreground">
                        @{view.botUsername}
                      </bdi>
                    </>
                  ) : (
                    t("int.tgs.token.set")
                  )}
                </p>
                {canWrite && (
                  <Button variant="ghost" className="h-11 px-3 sm:h-8" onClick={() => setReplacing(true)}>
                    {t("int.tgs.token.replace")}
                  </Button>
                )}
              </div>
            ) : canWrite ? (
              <form onSubmit={saveToken} className="grid gap-2.5">
                <label htmlFor={tokenId} className="text-sm text-pretty text-muted-foreground">
                  <WithHandle text={t("int.tgs.token.help")} />
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id={tokenId}
                    type="password"
                    dir="ltr"
                    value={token}
                    onChange={(e) => {
                      setToken(e.target.value);
                      if (error?.step === "token") setError(null);
                    }}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="123456789:AA…"
                    aria-invalid={error?.step === "token"}
                    className="h-11 font-mono text-[0.8rem] sm:h-9"
                  />
                  <div className="flex gap-2">
                    <Button type="submit" variant="brand" className="h-11 flex-1 px-4 sm:h-9 sm:flex-none" disabled={!!busy || !token.trim()}>
                      {busy === "token" && <Loader2Icon className="animate-spin" aria-hidden="true" />}
                      {t("int.tgs.token.save")}
                    </Button>
                    {replacing && (
                      <Button type="button" variant="ghost" className="h-11 px-3 sm:h-9" onClick={() => setReplacing(false)}>
                        {t("int.sheets.cancel")}
                      </Button>
                    )}
                  </div>
                </div>
                <StepError error={error} step="token" />
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">{t("int.tgs.token.notSet")}</p>
            )}
          </StepRow>

          {/* 2. the chat */}
          <StepRow n={2} state={chatStep} icon={<MessageSquareIcon />} title={t("int.tgs.chat.title")} last={false}>
            {chatStep === "todo" ? (
              <p className="text-sm text-muted-foreground">{t("int.tgs.chat.after")}</p>
            ) : (
              <div className="grid gap-3">
                {view.chat ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-foreground/[0.025] px-4 py-3 ring-1 ring-foreground/[0.05] ring-inset">
                    <ChatLabel title={view.chat.title} type={view.chat.type} last4={view.chat.last4} />
                    {canWrite && !chats && (
                      <Button variant="ghost" className="h-11 px-3 sm:h-8" disabled={!!busy} onClick={() => void find()}>
                        {busy === "find" ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <SearchIcon aria-hidden="true" />}
                        {t("int.tgs.chat.change")}
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-pretty text-muted-foreground">{t("int.tgs.chat.help")}</p>
                )}
                {canWrite && !view.chat && !chats && (
                  <div>
                    <Button variant="brand" className="h-11 px-4 sm:h-9" disabled={!!busy} onClick={() => void find()}>
                      {busy === "find" ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <SearchIcon aria-hidden="true" />}
                      {t("int.tgs.chat.find")}
                    </Button>
                  </div>
                )}
                {chats && (
                  <div className="grid gap-2">
                    {chats.length === 0 ? (
                      <p className="rounded-2xl bg-foreground/[0.025] px-4 py-3 text-sm text-pretty text-muted-foreground ring-1 ring-foreground/[0.05] ring-inset">{t("int.tgs.chat.none")}</p>
                    ) : (
                      <ul className="grid gap-1.5" aria-label={t("int.tgs.chat.seen")}>
                        {chats.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => void pick(c)}
                              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2 text-start ring-1 ring-foreground/[0.08] transition-colors ring-inset hover:bg-foreground/[0.03] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                            >
                              <ChatLabel title={c.title} type={c.type} last4={c.id.replace(/[^0-9A-Za-z_]/g, "").slice(-4)} />
                              <span className="text-xs font-medium text-muted-foreground">{t("int.tgs.chat.use")}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" className="h-11 px-3 sm:h-8" disabled={!!busy} onClick={() => void find()}>
                        {busy === "find" && <Loader2Icon className="animate-spin" aria-hidden="true" />}
                        {t("int.tgs.chat.again")}
                      </Button>
                      <Button variant="ghost" className="h-11 px-3 sm:h-8" disabled={!!busy} onClick={() => setChats(null)}>
                        {t("int.sheets.cancel")}
                      </Button>
                    </div>
                  </div>
                )}
                <StepError error={error} step="chat" />
              </div>
            )}
          </StepRow>

          {/* 3. the test message */}
          <StepRow n={3} state={testStep} icon={<SendIcon />} title={t("int.tgs.test.title")} last>
            {testStep === "todo" ? (
              <p className="text-sm text-muted-foreground">{t("int.tgs.test.after")}</p>
            ) : (
              <div className="grid gap-3">
                <p className="text-sm text-pretty text-muted-foreground">{t(view.enabled ? "int.tgs.test.done" : "int.tgs.test.help")}</p>
                {canWrite && (
                  <div>
                    <Button variant={view.enabled ? "outline" : "brand"} className="h-11 px-4 sm:h-9" disabled={!!busy} onClick={() => void test()}>
                      {busy === "test" ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <SendIcon aria-hidden="true" />}
                      {t("int.tgs.test.send")}
                    </Button>
                  </div>
                )}
                <StepError error={error} step="test" />
              </div>
            )}
          </StepRow>
        </ol>
      </section>

      {view.tokenSet && (
        <section aria-labelledby="tg-details-title" className="adm-surface grid gap-4 p-4 sm:p-6">
          <div className="grid max-w-[60ch] gap-1">
            <h2 id="tg-details-title" className="text-[0.95rem] font-semibold tracking-[-0.01em]">
              {t("int.tgs.pii.title")}
            </h2>
            <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{t("int.tgs.pii.lead")}</p>
          </div>
          <div role="radiogroup" aria-labelledby="tg-details-title" className="grid gap-2.5 sm:grid-cols-2">
            {(["masked", "full"] as const).map((level) => {
              const on = view.pii === level;
              return (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!canWrite || !!busy}
                  onClick={() => (on ? undefined : level === "full" ? setConfirmFull(true) : void setPii("masked"))}
                  className={cn(
                    "grid min-h-11 gap-1 rounded-2xl p-4 text-start ring-1 transition-[box-shadow,background-color] ring-inset focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default",
                    on ? "bg-foreground/[0.035] ring-foreground/25" : "ring-foreground/[0.08] enabled:hover:bg-foreground/[0.02]",
                  )}
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-medium">
                    {t(`int.tgs.pii.${level}`)}
                    {on && <CheckIcon className="size-4 text-foreground/70" aria-hidden="true" />}
                  </span>
                  <span className="text-xs leading-relaxed text-pretty text-muted-foreground">{t(`int.tgs.pii.${level}.help`)}</span>
                </button>
              );
            })}
          </div>
          <StepError error={error} step="pii" />
        </section>
      )}

      {initialNotifications ? (
        <NotificationsCard initial={initialNotifications} canWrite={canWrite} timezone={timezone} />
      ) : (
        <InlineError />
      )}

      {canWrite && view.tokenSet && (
        <section className="flex flex-col gap-3 rounded-[var(--adm-radius)] p-4 ring-1 ring-foreground/[0.07] ring-inset sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="grid gap-0.5">
            <h2 className="text-sm font-semibold">{t("int.tgs.off.title")}</h2>
            <p className="text-sm text-pretty text-muted-foreground">{t("int.tgs.off.lead")}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {view.enabled && (
              <Button variant="outline" className="h-11 px-3 sm:h-8" onClick={() => setConfirmOff("off")}>
                <PowerIcon aria-hidden="true" />
                {t("int.tgs.off.pause")}
              </Button>
            )}
            <Button variant="ghost" className="h-11 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-8" onClick={() => setConfirmOff("forget")}>
              {t("int.tgs.off.forget")}
            </Button>
          </div>
        </section>
      )}

      <IntConfirm
        open={confirmFull}
        onOpenChange={setConfirmFull}
        icon={<UsersIcon className="size-5" />}
        title={t("int.tgs.pii.confirm.title")}
        body={t("int.tgs.pii.confirm.body")}
        confirmLabel={t("int.tgs.pii.confirm.action")}
        onConfirm={() => setPii("full", true)}
      />
      <IntConfirm
        open={confirmOff !== null}
        onOpenChange={(o) => !o && setConfirmOff(null)}
        destructive={confirmOff === "forget"}
        icon={<PowerIcon className="size-5" />}
        title={t(confirmOff === "forget" ? "int.tgs.off.forget.title" : "int.tgs.off.pause.title")}
        body={t(confirmOff === "forget" ? "int.tgs.off.forget.body" : "int.tgs.off.pause.body")}
        confirmLabel={t(confirmOff === "forget" ? "int.tgs.off.forget" : "int.tgs.off.pause")}
        onConfirm={async () => {
          const forget = confirmOff === "forget";
          try {
            const res = await disableTelegramAction(forget);
            if (!res.ok) {
              toast.error(refusal(res));
              return false;
            }
            if (!res.data.ok) {
              toast.error(t(`int.tg.err.${res.data.error}`));
              return false;
            }
            setView((v) => v && (forget ? { ...v, enabled: false, tokenSet: false, botUsername: null, chat: null } : { ...v, enabled: false }));
            setChats(null);
            toast.success(t(forget ? "int.tgs.off.forgotten" : "int.tgs.off.paused"));
            router.refresh();
            return true;
          } catch {
            toast.error(t("int.sheets.network"));
            return false;
          }
        }}
      />
    </div>
  );
}

type Step = "done" | "current" | "todo";

function StepRow({ n, state, icon, title, last, children }: { n: number; state: Step; icon: ReactNode; title: string; last: boolean; children: ReactNode }) {
  const t = useT();
  return (
    <li className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4" aria-current={state === "current" ? "step" : undefined}>
      {!last && <span aria-hidden="true" className={cn("absolute start-4 top-9 bottom-1 w-px -translate-x-1/2 rtl:translate-x-1/2", state === "done" ? "bg-foreground/25" : "bg-foreground/10")} />}
      <span
        aria-hidden="true"
        className={cn(
          "relative z-[1] mt-1 flex size-8 items-center justify-center rounded-full ring-1 ring-inset [&_svg]:size-4",
          state === "done" && "bg-foreground text-background ring-foreground",
          state === "current" && "bg-background text-foreground ring-foreground/30",
          state === "todo" && "bg-background text-muted-foreground/60 ring-foreground/10",
        )}
      >
        {state === "done" ? <CheckIcon /> : icon}
      </span>
      <div className={cn("grid min-w-0 gap-2.5 pt-1.5", last ? "pb-1" : "pb-7")}>
        <h3 className={cn("text-sm font-semibold", state === "todo" && "text-muted-foreground")}>
          <span className="sr-only">{t("int.tgs.step", { n })} </span>
          {title}
        </h3>
        {children}
      </div>
    </li>
  );
}

function StepError({ error, step }: { error: { step: string; text: string } | null; step: string }) {
  if (!error || error.step !== step) return null;
  return (
    <p role="alert" className="rounded-xl bg-destructive/[0.06] px-3.5 py-2.5 text-sm text-pretty text-destructive ring-1 ring-destructive/15 ring-inset">
      {error.text}
    </p>
  );
}

function ChatLabel({ title, type, last4 }: { title: string | null; type: ChatType | null; last4: string }) {
  const t = useT();
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.05] text-foreground/70 [&_svg]:size-4">
        {type === "private" ? <MessageSquareIcon aria-hidden="true" /> : <UsersIcon aria-hidden="true" />}
      </span>
      <span className="grid min-w-0">
        <span className="truncate text-sm font-medium">{title || t("int.tgs.chat.untitled")}</span>
        <span className="text-xs text-muted-foreground">
          {t(`int.tgs.chat.type.${type ?? "group"}`)} · <bdi dir="ltr">••{last4}</bdi>
        </span>
      </span>
    </span>
  );
}

/** Which events reach the chat (OPE-§21.4): each change saves at once, as a partial merge. */
function NotificationsCard({ initial, canWrite, timezone }: { initial: NotificationsSetting; canWrite: boolean; timezone: string }) {
  const t = useT();
  const base = useId();
  const [n, setN] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save(patch: { telegram?: Partial<NotificationsSetting["telegram"]>; testOrders?: boolean }) {
    const prev = n;
    setN((cur) => ({ ...cur, telegram: { ...cur.telegram, ...patch.telegram }, testOrders: patch.testOrders ?? cur.testOrders }));
    setSaving(true);
    try {
      const res = await saveNotificationsAction(patch);
      if (!res.ok) {
        setN(prev);
        toast.error(res.error === "step_up" ? t("int.sheets.stepUpNeeded") : t(res.message ?? `error.${res.error}`));
        return;
      }
      setN(res.data);
    } catch {
      setN(prev);
      toast.error(t("int.sheets.network"));
    } finally {
      setSaving(false);
    }
  }

  const disabled = !canWrite || saving;
  const rows: { key: string; on: boolean; flip: (v: boolean) => void }[] = [
    ...SWITCHES.map((k) => ({ key: k, on: n.telegram[k], flip: (v: boolean) => void save({ telegram: { [k]: v } }) })),
    { key: "testOrders", on: n.testOrders, flip: (v: boolean) => void save({ testOrders: v }) },
  ];

  return (
    <section aria-labelledby="tg-notif-title" className="adm-surface grid gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid max-w-[60ch] gap-1">
          <h2 id="tg-notif-title" className="flex items-center gap-2 text-[0.95rem] font-semibold tracking-[-0.01em]">
            <BellIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            {t("int.tgs.notif.title")}
          </h2>
          <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{t("int.tgs.notif.lead")}</p>
        </div>
        {saving && <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label={t("int.tgs.notif.saving")} />}
      </div>

      <ul className="grid divide-y divide-foreground/[0.06] rounded-2xl ring-1 ring-foreground/[0.06] ring-inset">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="grid min-w-0 gap-0.5">
              <label htmlFor={`${base}-${r.key}`} className="text-sm font-medium">
                {t(`int.tgs.notif.${r.key}`)}
              </label>
              <p className="text-xs leading-relaxed text-pretty text-muted-foreground">{t(`int.tgs.notif.${r.key}.help`)}</p>
            </div>
            {/* the shared switch's thumb moves with translate-x, which RTL does not mirror: keep its own box left to right */}
            <span dir="ltr" className="flex min-h-11 shrink-0 items-center sm:min-h-0">
              <Switch id={`${base}-${r.key}`} checked={r.on} disabled={disabled} onCheckedChange={r.flip} />
            </span>
          </li>
        ))}
      </ul>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label htmlFor={`${base}-batch`} className="text-sm font-medium">
            {t("int.tgs.notif.batch")}
          </label>
          <Select value={String(n.telegram.batchSeconds)} disabled={disabled || !n.telegram.newOrders} onValueChange={(v) => void save({ telegram: { batchSeconds: Number(v) } })}>
            <SelectTrigger id={`${base}-batch`} className="h-11 w-full sm:h-9">
              <SelectValue>{n.telegram.batchSeconds === 0 ? t("int.tgs.notif.batch.each") : t("int.tgs.notif.batch.seconds", { seconds: n.telegram.batchSeconds })}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(BATCH_CHOICES.includes(n.telegram.batchSeconds as (typeof BATCH_CHOICES)[number]) ? BATCH_CHOICES : [...BATCH_CHOICES, n.telegram.batchSeconds].sort((a, b) => a - b)).map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s === 0 ? t("int.tgs.notif.batch.each") : t("int.tgs.notif.batch.seconds", { seconds: s })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-pretty text-muted-foreground">{t("int.tgs.notif.batch.help")}</p>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${base}-hour`} className="text-sm font-medium">
            {t("int.tgs.notif.hour")}
          </label>
          <Select value={String(n.telegram.dailySummaryHour)} disabled={disabled || !n.telegram.dailySummary} onValueChange={(v) => void save({ telegram: { dailySummaryHour: Number(v) } })}>
            <SelectTrigger id={`${base}-hour`} className="h-11 w-full sm:h-9">
              <SelectValue>
                <bdi dir="ltr" className="tabular-nums">
                  {String(n.telegram.dailySummaryHour).padStart(2, "0")}:00
                </bdi>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => (
                <SelectItem key={h} value={String(h)}>
                  <bdi dir="ltr" className="tabular-nums">
                    {String(h).padStart(2, "0")}:00
                  </bdi>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-pretty text-muted-foreground">
            {t("int.tgs.notif.hour.help")} <bdi dir="ltr">{timezone}</bdi>
          </p>
        </div>
      </div>
    </section>
  );
}

/** The plan has no `telegram` feature: one sentence, nothing to press. */
export function TelegramOff() {
  const t = useT();
  return (
    <section className="adm-surface-flat flex flex-col items-start gap-3 p-6 sm:p-8">
      <span className="flex size-10 items-center justify-center rounded-xl bg-foreground/[0.05] text-foreground/60">
        <SendIcon className="size-4.5" aria-hidden="true" />
      </span>
      <h2 className="text-base font-semibold tracking-[-0.01em]">{t("int.tgs.plan.title")}</h2>
      <p className="max-w-[52ch] text-sm text-pretty text-muted-foreground">{t("int.tgs.plan.body")}</p>
    </section>
  );
}

/** "@BotFather" kept left to right inside a right-to-left sentence (its "@" would otherwise jump to the far end). */
function WithHandle({ text }: { text: string }) {
  const parts = text.split("@BotFather");
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <bdi dir="ltr">@BotFather</bdi>}
          {p}
        </span>
      ))}
    </>
  );
}

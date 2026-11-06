"use client";
/**
 * The console's smaller parts (P4 CALL CENTER; operations.md OPE-§13.1, §13.4, §5.7, §4.1):
 *
 *   PresenceSwitch    Online / Break / Offline as a segmented control with text (never a lone dot, OPE-§13.1)
 *   TodayCounters     today's confirmed and calls (and, on desktop, decided and the confirmation rate with its n)
 *   InboundPanel      "Customer calling? Type the number": the caller's open orders, Take this order on a callable one
 *   HistoryBlock      the customer's counts in this store (counts only, OPE-§9.2)
 *   TimelineBlock     the held order's last events (the drawer's visibility rule)
 *   NoteComposer      a note for the team on the held order (`T`); the draft stays in the field until saved
 */
import { Loader2Icon, PhoneIncomingIcon, SearchIcon, XIcon } from "lucide-react";
import { useState } from "react";
import type { QueueOrder } from "@/lib/callcenter/card";
import type { InboundResult } from "@/lib/callcenter/inbound";
import type { Presence } from "@/lib/callcenter/presence";
import type { QueueState } from "@/lib/callcenter/board.server";
import type { AdminLocale } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/admin/client";
import type { TimelineItem } from "@/lib/orders/events";
import { cn } from "@/lib/utils";
import { dayClock, money, num, pct } from "./time";

const PRESENCES: Presence[] = ["online", "break", "offline"];

export function PresenceSwitch({ value, onChange, disabled, compact }: { value: Presence; onChange: (p: Presence) => void; disabled: boolean; compact?: boolean }) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t("ops.presence.label")} className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-full bg-foreground/[0.05] p-0.5 ring-1 ring-foreground/[0.06] ring-inset", compact ? "h-9" : "h-10 w-full")}>
      {PRESENCES.map((p) => {
        const on = value === p;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => !on && onChange(p)}
            onKeyDown={(e) => {
              const dir = (e.currentTarget.closest("[dir]")?.getAttribute("dir") ?? "ltr") === "rtl" ? -1 : 1;
              const i = PRESENCES.indexOf(value);
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const step = (e.key === "ArrowRight" ? 1 : -1) * dir;
                onChange(PRESENCES[(i + step + PRESENCES.length) % PRESENCES.length]!);
              }
            }}
            className={cn(
              "q-xs inline-flex h-full items-center justify-center rounded-full px-2.5 font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-[180ms] disabled:opacity-60",
              compact ? "min-w-11" : "flex-1",
              on
                ? p === "online"
                  ? "bg-card text-success-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)] ring-1 ring-[color-mix(in_oklab,var(--success)_35%,transparent)]"
                  : "bg-card text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08)] ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {compact && p === "break" ? t("ops.presence.short.break") : t(`ops.presence.${p}`)}
          </button>
        );
      })}
    </div>
  );
}

export function TodayCounters({ today, locale, compact }: { today: QueueState["today"]; locale: AdminLocale; compact?: boolean }) {
  const t = useT();
  if (compact) {
    return (
      <div className="flex items-center gap-3" aria-label={t("ops.me.today", { confirmed: today.confirmed })}>
        <Mini value={num(today.confirmed, locale)} label={t("ops.counter.confirmed")} />
        <Mini value={num(today.attempts, locale)} label={t("ops.counter.calls")} />
      </div>
    );
  }
  const rate = today.confirmationRate;
  return (
    <section className="grid gap-3">
      <h2 className="q-xs font-semibold text-muted-foreground">{t("ops.counter.today")}</h2>
      <div className="grid grid-cols-3 gap-2">
        <Stat value={num(today.confirmed, locale)} label={t("ops.counter.confirmed")} />
        <Stat value={num(today.decided, locale)} label={t("ops.counter.decided")} />
        <Stat value={num(today.attempts, locale)} label={t("ops.counter.calls")} />
      </div>
      <p className="q-xs q-num flex items-baseline justify-between gap-2 text-muted-foreground">
        <span>{t("ops.counter.rate")}</span>
        {"value" in rate ? (
          <span>
            <span className="q-sm font-semibold text-foreground">{pct(rate.value, locale)}</span> · {t("ops.counter.n", { n: rate.n })}
          </span>
        ) : (
          <span>{t("ops.counter.needs", { min: rate.min })}</span>
        )}
      </p>
    </section>
  );
}

function Mini({ value, label }: { value: string; label: string }) {
  return (
    <span className="grid justify-items-center leading-none">
      <span className="q-sm q-num font-semibold text-foreground">{value}</span>
      <span className="q-2xs mt-0.5 text-muted-foreground">{label}</span>
    </span>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="q-lg q-num font-semibold text-foreground">{value}</p>
      <p className="q-2xs mt-0.5 text-muted-foreground">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* inbound (OPE-§5.7)                                                  */
/* ------------------------------------------------------------------ */

export type InboundAnswer = { ok: true; data: InboundResult } | { ok: false; error: string };

export function InboundPanel({
  inputRef,
  locale,
  currency,
  tz,
  now,
  disabled,
  lookup,
  onTake,
  ordersHref,
  onClose,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  locale: AdminLocale;
  /** the store's currency (an inbound row carries cents only) */
  currency: string;
  tz: string;
  now: Date;
  disabled: boolean;
  lookup: (phone: string) => Promise<InboundAnswer>;
  onTake: (id: string) => Promise<string | null>;
  ordersHref: (id: string) => string;
  onClose?: () => void;
}) {
  const t = useT();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [taking, setTaking] = useState<string | null>(null);
  const [res, setRes] = useState<InboundResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const digits = value.replace(/\D/g, "").length;
  const errorText = (code: string) => (code === "rate_limited" ? t("ops.inbound.paused") : code === "too_short" ? t("ops.inbound.tooShort") : t(`ops.error.${code}`) === `ops.error.${code}` ? t("ops.error.generic") : t(`ops.error.${code}`));

  return (
    <div className="grid gap-2">
      <form
        className="grid gap-1.5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (digits < 8) return setErr("too_short");
          setBusy(true);
          setErr(null);
          const r = await lookup(value).catch(() => ({ ok: false as const, error: "network" }));
          setBusy(false);
          if (r.ok) setRes(r.data);
          else {
            setRes(null);
            setErr(r.error);
          }
        }}
      >
        <label htmlFor="q-inbound" className="q-xs font-medium text-muted-foreground">
          {t("ops.inbound.placeholder")}
        </label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <PhoneIncomingIcon className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" aria-hidden="true" />
            <input
              ref={inputRef}
              id="q-inbound"
              type="tel"
              inputMode="tel"
              dir="ltr"
              autoComplete="off"
              value={value}
              disabled={disabled}
              onChange={(e) => {
                setValue(e.target.value);
                setErr(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape" && onClose) {
                  e.preventDefault();
                  onClose();
                }
              }}
              className="q-sm q-num h-11 w-full rounded-xl border border-input bg-background ps-9 pe-3 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </div>
          <button type="submit" disabled={disabled || busy || !value.trim()} className="q-sm inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border px-3.5 font-medium hover:bg-muted disabled:opacity-50">
            {busy ? <Loader2Icon className="size-4 animate-spin" aria-hidden="true" /> : <SearchIcon className="size-4" aria-hidden="true" />}
            {t("ops.inbound.find")}
          </button>
          {onClose ? (
            <button type="button" onClick={onClose} className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">
              <XIcon className="size-4" aria-hidden="true" />
              <span className="sr-only">{t("ops.inbound.close")}</span>
            </button>
          ) : null}
        </div>
      </form>
      <div aria-live="polite" className="grid gap-1.5">
        {err ? <p className="q-xs text-destructive">{errorText(err)}</p> : null}
        {res && !res.orders.length ? <p className="q-sm text-muted-foreground">{t("ops.inbound.none")}</p> : null}
        {res?.orders.map((o) => (
          <div key={o.id} className="q-rise flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="q-sm truncate font-medium">
                <bdi>{o.product}</bdi>
                <span className="font-normal text-muted-foreground">
                  {" · "}
                  <bdi dir="ltr" className="q-num">{money(o.totalCents, currency, locale)}</bdi>
                </span>
              </p>
              <p className="q-xs q-num text-muted-foreground">
                <bdi dir="ltr">{o.id}</bdi> · <bdi dir="ltr">{dayClock(o.createdAt, tz, locale, now)}</bdi>
                {o.held ? <> · {t("ops.inbound.held", { name: o.held.by, time: dayClock(o.held.until, tz, locale, now) })}</> : null}
              </p>
            </div>
            {o.callable && !o.held ? (
              <button
                type="button"
                disabled={disabled || taking !== null}
                onClick={async () => {
                  setTaking(o.id);
                  const e = await onTake(o.id);
                  setTaking(null);
                  if (e) setErr(e);
                  else {
                    setRes(null);
                    setValue("");
                  }
                }}
                className={cn("ui-primary q-xs inline-flex h-10 shrink-0 items-center rounded-lg px-3 font-semibold", taking === o.id && "opacity-70")}
              >
                {t("ops.inbound.take")}
              </button>
            ) : (
              <a href={ordersHref(o.id)} className="q-xs inline-flex h-10 shrink-0 items-center rounded-lg border border-border px-3 font-medium hover:bg-muted">
                {t("ops.inbound.open")}
              </a>
            )}
          </div>
        ))}
        {res && res.otherOrders > 0 ? <p className="q-xs text-muted-foreground">{t("ops.inbound.closed", { n: res.otherOrders })}</p> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* the right column                                                    */
/* ------------------------------------------------------------------ */

export function HistoryBlock({ history, locale }: { history: QueueOrder["customer"]["history"]; locale: AdminLocale }) {
  const t = useT();
  const rows: [string, number][] = history
    ? [
        [t("ops.history.orders"), history.orders],
        [t("ops.history.delivered"), history.delivered],
        [t("ops.history.refused"), history.refused],
        [t("ops.history.returned"), history.returned],
        [t("ops.history.cancelled"), history.cancelled],
        [t("ops.history.fake"), history.fake],
      ]
    : [];
  return (
    <section className="grid gap-2">
      <h2 className="q-xs font-semibold text-muted-foreground">{t("ops.history.title")}</h2>
      {rows.length && history!.orders > 1 ? (
        <dl className="grid grid-cols-3 gap-1.5">
          {rows.map(([k, v]) => (
            <div key={k} className="rounded-lg bg-foreground/[0.03] px-2.5 py-2">
              <dt className="q-2xs text-muted-foreground">{k}</dt>
              <dd className="q-md q-num font-semibold">{num(v, locale)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="q-sm text-muted-foreground">{t("ops.history.first")}</p>
      )}
    </section>
  );
}

export function TimelineBlock({ items, loading, tz, locale, now }: { items: TimelineItem[] | null; loading: boolean; tz: string; locale: AdminLocale; now: Date }) {
  const t = useT();
  return (
    <section className="grid gap-2">
      <h2 className="q-xs font-semibold text-muted-foreground">{t("ops.timeline.title")}</h2>
      {loading && !items ? (
        <div className="grid gap-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="q-shimmer h-9 rounded-lg" />
          ))}
        </div>
      ) : items && items.length ? (
        <ol className="grid gap-0.5">
          {items.map((it) => (
            <li key={it.id} className="q-rise border-s border-border py-1.5 ps-3">
              <div className="min-w-0">
                <p className="q-sm text-foreground/90">{t(it.text.key, it.text.vars)}</p>
                <p className="q-2xs q-num text-muted-foreground">
                  {it.actor.name ? <bdi>{it.actor.name}</bdi> : null}
                  {it.actor.name ? " · " : null}
                  <bdi dir="ltr">{dayClock(it.at, tz, locale, now)}</bdi>
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="q-sm text-muted-foreground">{t("ops.timeline.empty")}</p>
      )}
    </section>
  );
}

export function NoteComposer({ disabled, onSave, id }: { disabled: boolean; onSave: (text: string) => Promise<boolean>; id: string }) {
  const t = useT();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="grid gap-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        const v = text.trim();
        if (!v) return;
        setBusy(true);
        const ok = await onSave(v);
        setBusy(false);
        if (ok) {
          setText("");
          setSaved(true);
          setTimeout(() => setSaved(false), 1_600);
        }
      }}
    >
      <label htmlFor={id} className="q-xs font-semibold text-muted-foreground">
        {t("ops.note.label")}
      </label>
      <textarea
        id={id}
        data-note-input=""
        rows={3}
        maxLength={2_000}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit();
        }}
        className="q-sm min-h-20 w-full resize-y rounded-xl border border-input bg-background px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      <div className="flex items-center justify-end gap-2">
        <span aria-live="polite" className="q-xs text-success-ink">
          {saved ? t("ops.note.saved") : ""}
        </span>
        <button type="submit" disabled={disabled || busy || !text.trim()} className="q-xs inline-flex h-9 items-center rounded-lg border border-border px-3 font-semibold hover:bg-muted disabled:opacity-50">
          {t("ops.note.save")}
        </button>
      </div>
    </form>
  );
}

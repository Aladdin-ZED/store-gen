"use client";
/**
 * The console's pickers (P4 CALL CENTER; operations.md OPE-§6.4, §6.5, §13.1, §13.3, §22, OD49): one sheet each.
 *
 *   CallbackSheet    In 1 hour · This evening 18:30 · Tomorrow 11:00 · Tomorrow 18:30 · a custom date and time, all in
 *                    the store's time zone; a chip outside the calling window says so (a mark, never a refusal)
 *   ReasonSheet      the cancel reasons of OPE-§6.4 as one tap each, keys 1-9 inside (Cancel… and Cancel & recall…)
 *   MoreSheet        Fake order (+ "Also block this number" for blocklist.write), Wrong number, Duplicate of …
 *   DateSheet        Deliver from… (D) and Reschedule…: Tomorrow · Next Monday · 1st of next month · another date
 *   WaSheet          the WhatsApp templates of the card (the store's rows of the card's language, else the built-ins)
 *   KeysSheet        `?`: the queue's key map of the lane on screen
 *   CallbacksSheet   the phone's "My callbacks (n)": each with Call now (a claim of that id)
 */
import { useMemo, useState } from "react";
import type { QueueOrder } from "@/lib/callcenter/card";
import type { QueueCallback } from "@/lib/callcenter/board.server";
import { isCallable, type EffectiveWindow } from "@/lib/callcenter/window";
import type { AdminLocale } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { QUEUE_KEYS } from "./keys";
import { QSheet } from "./sheet";
import { callbackChips, clock, customInstant, dayClock, holdChips, holdYmdOk, storeLocalInput, ymdLabel } from "./time";

/** the reasons a person picks (OPE-§6.4), in the table's order */
export const PICK_REASONS = ["changed_mind", "price", "mistake", "bought_elsewhere", "not_ordered", "wrong_number", "out_of_zone", "delay", "see_first", "customer_request", "other"] as const;
export type PickReason = (typeof PICK_REASONS)[number];

const chip = "q-sm inline-flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 text-start font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50";

export function CallbackSheet({ open, onOpenChange, now, w, locale, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; now: Date; w: EffectiveWindow; locale: AdminLocale; onPick: (at: Date) => void }) {
  const t = useT();
  const chips = useMemo(() => callbackChips(now, w), [now, w]);
  const [custom, setCustom] = useState("");
  const [bad, setBad] = useState(false);
  const label = (id: string, at: Date) => {
    const time = clock(at, w.tz, locale);
    if (id === "inOneHour") return t("ops.callback.inOneHour");
    if (id === "thisEvening") return t("ops.callback.thisEvening", { time });
    return t("ops.callback.tomorrow", { time });
  };
  return (
    <QSheet open={open} onOpenChange={onOpenChange} title={t("ops.callback.title")}>
      <div className="grid gap-2">
        {chips.map((c) => (
          <button key={c.id} type="button" className={chip} onClick={() => onPick(c.at)}>
            <span>{label(c.id, c.at)}</span>
            <span className="q-xs flex items-center gap-2 font-normal text-muted-foreground">
              {c.outside ? <span className="q-info-chip rounded-md px-1.5 py-0.5">{t("ops.callback.outsideHours")}</span> : null}
              <bdi dir="ltr" className="q-num">{dayClock(c.at, w.tz, locale, now)}</bdi>
            </span>
          </button>
        ))}
        <form
          className="mt-2 grid gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const at = customInstant(custom, w.tz, new Date());
            if (!at) return setBad(true);
            onPick(at);
          }}
        >
          <label htmlFor="q-cb-custom" className="q-xs font-medium text-muted-foreground">
            {t("ops.callback.custom")}
          </label>
          <div className="flex gap-2">
            <input
              id="q-cb-custom"
              type="datetime-local"
              dir="ltr"
              value={custom}
              min={storeLocalInput(new Date(now.getTime() + 5 * 60_000), w.tz)}
              onChange={(e) => {
                setCustom(e.target.value);
                setBad(false);
              }}
              className="q-sm q-num h-12 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            <button type="submit" disabled={!custom} className="ui-primary q-sm h-12 shrink-0 rounded-xl px-4 font-semibold">
              {t("ops.callback.set")}
            </button>
          </div>
          {custom && !bad && customInstant(custom, w.tz, new Date()) && !isOpenAt(customInstant(custom, w.tz, new Date())!, w) ? (
            <p className="q-xs text-[var(--q-info-ink)]">{t("ops.callback.outsideHours")}</p>
          ) : null}
          {bad ? <p className="q-xs text-destructive">{t("ops.callback.bad")}</p> : null}
        </form>
      </div>
    </QSheet>
  );
}

const isOpenAt = (at: Date, w: EffectiveWindow) => isCallable(at, w).open;

export function ReasonSheet({ open, onOpenChange, title, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; onPick: (r: PickReason) => void }) {
  const t = useT();
  return (
    <QSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={t("ops.cancel.hint")}
      onKeyDown={(e) => {
        // keys 1-9 inside the picker (OPE-§13.3), by the physical key
        const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
        if (!m || e.ctrlKey || e.metaKey || e.altKey) return;
        const r = PICK_REASONS[Number(m[1]) - 1];
        if (r) {
          e.preventDefault();
          onPick(r);
        }
      }}
    >
      <div className="grid gap-1.5 sm:grid-cols-2">
        {PICK_REASONS.map((r, i) => (
          <button key={r} type="button" className={cn(chip, "min-h-11")} onClick={() => onPick(r)}>
            <span>{t(`ops.reason.${r}`)}</span>
            {i < 9 ? (
              <kbd aria-hidden="true" className="q-kbd hidden sm:inline-flex">
                {i + 1}
              </kbd>
            ) : null}
          </button>
        ))}
      </div>
    </QSheet>
  );
}

export function MoreSheet({
  open,
  onOpenChange,
  card,
  canBlock,
  onFake,
  onWrongNumber,
  onDuplicate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  card: QueueOrder;
  canBlock: boolean;
  onFake: (block: boolean) => void;
  onWrongNumber: () => void;
  onDuplicate: (of: string) => void;
}) {
  const t = useT();
  const [block, setBlock] = useState(false);
  return (
    <QSheet open={open} onOpenChange={onOpenChange} title={t("ops.outcome.moreTitle")}>
      <div className="grid gap-3">
        <div className="grid gap-2 rounded-2xl border border-[color-mix(in_oklab,var(--destructive)_35%,transparent)] p-2">
          <button type="button" className={cn(chip, "border-transparent text-destructive hover:bg-[color-mix(in_oklab,var(--destructive)_7%,transparent)]")} onClick={() => onFake(canBlock && block)}>
            {t("ops.outcome.fake")}
          </button>
          {canBlock ? (
            <label className="flex cursor-pointer items-start gap-3 px-3 pb-2">
              <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} className="mt-1 size-4 accent-[var(--destructive)]" />
              <span className="grid">
                <span className="q-sm font-medium">{t("ops.outcome.fakeBlock")}</span>
                <span className="q-xs text-muted-foreground">{t("ops.outcome.fakeBlockHint")}</span>
              </span>
            </label>
          ) : null}
        </div>
        <button type="button" className={chip} onClick={onWrongNumber}>
          {t("ops.outcome.wrong_number")}
        </button>
        <div className="grid gap-1.5">
          <p className="q-xs font-medium text-muted-foreground">{t("ops.outcome.duplicateOf")}</p>
          {card.duplicates.length ? (
            card.duplicates.map((d) => (
              <button key={d.id} type="button" className={chip} onClick={() => onDuplicate(d.id)}>
                <span>
                  {t("ops.outcome.duplicate")} <bdi dir="ltr" className="q-num">{d.id}</bdi>
                </span>
              </button>
            ))
          ) : (
            <p className="q-sm rounded-xl bg-foreground/[0.03] px-4 py-3 text-muted-foreground">{t("ops.outcome.duplicateNone")}</p>
          )}
        </div>
      </div>
    </QSheet>
  );
}

export function DateSheet({ open, onOpenChange, title, description, now, tz, locale, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; now: Date; tz: string; locale: AdminLocale; onPick: (ymd: string) => void }) {
  const t = useT();
  const chips = useMemo(() => holdChips(now, tz), [now, tz]);
  const [custom, setCustom] = useState("");
  const [bad, setBad] = useState(false);
  return (
    <QSheet open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="grid gap-2">
        {chips.map((c) => (
          <button key={c.id} type="button" className={chip} onClick={() => onPick(c.ymd)}>
            <span>{t(`ops.hold.${c.id}`)}</span>
            <bdi dir="ltr" className="q-xs q-num font-normal text-muted-foreground">
              {ymdLabel(c.ymd, locale)}
            </bdi>
          </button>
        ))}
        <form
          className="mt-2 grid gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!holdYmdOk(custom, new Date(), tz)) return setBad(true);
            onPick(custom);
          }}
        >
          <label htmlFor="q-hold-custom" className="q-xs font-medium text-muted-foreground">
            {t("ops.hold.custom")}
          </label>
          <div className="flex gap-2">
            <input
              id="q-hold-custom"
              type="date"
              dir="ltr"
              value={custom}
              min={chips[0]?.ymd}
              onChange={(e) => {
                setCustom(e.target.value);
                setBad(false);
              }}
              className="q-sm q-num h-12 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            <button type="submit" disabled={!custom} className="ui-primary q-sm h-12 shrink-0 rounded-xl px-4 font-semibold">
              {t("ops.hold.set")}
            </button>
          </div>
          {bad ? <p className="q-xs text-destructive">{t("ops.hold.bad")}</p> : null}
        </form>
      </div>
    </QSheet>
  );
}

export function WaSheet({ open, onOpenChange, templates, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; templates: QueueOrder["templates"]; onPick: (id: string) => void }) {
  const t = useT();
  return (
    <QSheet open={open} onOpenChange={onOpenChange} title={t("ops.wa.title")} description={t("ops.wa.hint")}>
      <div className="grid gap-2">
        {templates.map((x) => (
          <button key={x.id} type="button" className={chip} onClick={() => onPick(x.id)}>
            {x.id.startsWith("builtin:") ? t(`ops.wa.kind.${x.kind}`) : <bdi>{x.name}</bdi>}
          </button>
        ))}
      </div>
    </QSheet>
  );
}

export function KeysSheet({ open, onOpenChange, lane }: { open: boolean; onOpenChange: (o: boolean) => void; lane: "confirm" | "delivery" }) {
  const t = useT();
  const grid = QUEUE_KEYS.filter((k) => k.id.startsWith("o"));
  const rest = QUEUE_KEYS.filter((k) => !k.id.startsWith("o"));
  const row = (key: string, label: string) => (
    <li key={key} className="flex min-h-9 items-center justify-between gap-3 border-b border-border/70 py-1.5 last:border-0">
      <span className="q-sm text-foreground/85">{label}</span>
      <kbd className="q-kbd">{key}</kbd>
    </li>
  );
  return (
    <QSheet open={open} onOpenChange={onOpenChange} title={t("ops.key.title")} description={t("ops.key.hint")}>
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
        <section>
          <h3 className="q-xs mb-1 font-semibold text-muted-foreground">{t(lane === "delivery" ? "ops.key.lane.delivery" : "ops.key.lane.confirm")}</h3>
          <ul>{grid.map((k) => row(k.key, t(lane === "delivery" && k.delivery ? k.delivery : k.label)))}</ul>
        </section>
        <section>
          <h3 className="q-xs mb-1 font-semibold text-muted-foreground">{t("ops.queue.title")}</h3>
          <ul>{rest.map((k) => row(k.key, t(k.label)))}</ul>
        </section>
      </div>
    </QSheet>
  );
}

export function CallbackList({ callbacks, tz, locale, now, busyId, disabled, onCall }: { callbacks: readonly QueueCallback[]; tz: string; locale: AdminLocale; now: Date; busyId: string | null; disabled: boolean; onCall: (id: string) => void }) {
  const t = useT();
  if (!callbacks.length) return <p className="q-sm text-muted-foreground">{t("ops.callbacks.empty")}</p>;
  return (
    <ul className="grid gap-1.5">
      {callbacks.map((c) => (
        <li key={c.orderId} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="q-sm truncate font-medium">
              <bdi>{c.customer || "·"}</bdi>
              {c.city ? <span className="font-normal text-muted-foreground"> · <bdi>{c.city}</bdi></span> : null}
            </p>
            <p className="q-xs q-num flex items-center gap-1.5 text-muted-foreground">
              {c.overdue ? <span className="font-semibold text-destructive">{t("ops.callbacks.late")}</span> : null}
              {/* the browser's own zone data may differ from the server's: its text wins after hydration */}
              <bdi dir="ltr" suppressHydrationWarning>
                {dayClock(c.dueAt, tz, locale, now)}
              </bdi>
              <span aria-hidden="true">·</span>
              <bdi dir="ltr">{c.phoneMasked}</bdi>
            </p>
          </div>
          <button
            type="button"
            disabled={disabled || busyId !== null}
            onClick={() => onCall(c.orderId)}
            className={cn("q-xs inline-flex h-10 shrink-0 items-center rounded-lg border border-border px-3 font-semibold hover:bg-muted disabled:opacity-50", busyId === c.orderId && "q-shimmer")}
          >
            {t("ops.callbacks.callNow")}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function CallbacksSheet(props: { open: boolean; onOpenChange: (o: boolean) => void } & Parameters<typeof CallbackList>[0]) {
  const t = useT();
  const { open, onOpenChange, ...rest } = props;
  return (
    <QSheet open={open} onOpenChange={onOpenChange} title={t("ops.callbacks.title")}>
      <CallbackList {...rest} />
    </QSheet>
  );
}

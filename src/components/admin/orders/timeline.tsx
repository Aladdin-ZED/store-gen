"use client";

/**
 * The drawer's timeline and notes (P4 CALL CENTER; operations.md OPE-§4.2): newest first, grouped by store-local day,
 * filter chips All / Calls / Changes / Notes, 30 then "Show more" (keyset on the event id), the note composer pinned
 * under the list (≤ 500 characters, counter after 400, Ctrl+Enter, optimistic insert, retry on failure), managers hide
 * a note. Read-only stores and impersonation hide the composer.
 */
import {
  ArrowRightIcon,
  BanIcon,
  CheckIcon,
  CircleDotIcon,
  ClockIcon,
  EyeOffIcon,
  Loader2Icon,
  MessageCircleIcon,
  PackageIcon,
  PencilIcon,
  PhoneIcon,
  RotateCcwIcon,
  SendIcon,
  StickyNoteIcon,
  TruckIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { hideNoteAction, orderTimelineAction } from "@/app/app/[store]/orders/actions";
import { addNoteAction } from "@/app/app/[store]/queue/actions";
import { addDaysYmd, storeYmd } from "@/lib/callcenter/window";
import type { AdminLocale, MessageKey } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/admin/client";
import type { TimelineFilter, TimelineItem } from "@/lib/orders/events";
import { cn } from "@/lib/utils";
import { dayClock, ymdLabel } from "../queue/time";
import { settle } from "./ops-ui";

const NOTE_MAX = 500;
const FILTERS: TimelineFilter[] = ["all", "calls", "changes", "notes"];

type Tone = "neutral" | "success" | "danger" | "warn" | "info";
const TONE: Record<Tone, string> = {
  neutral: "bg-foreground/[0.05] text-muted-foreground",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  danger: "bg-destructive/10 text-destructive",
  warn: "bg-warn/14 text-warn-ink",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

/** state colours only on state changes (OPE-§4.2) */
function toneOf(it: TimelineItem): Tone {
  if (it.type !== "state_changed" && it.type !== "call_attempt" && it.type !== "delivery_rescue") return "neutral";
  const k = it.text.key;
  if (/\.(confirmed|delivered|remitted|collected)$/.test(k)) return "success";
  if (/\.(refused|fake|lost|cancelled|returned|written_off)$/.test(k)) return "danger";
  if (/attempt|no_answer|attempting/.test(k)) return "warn";
  if (/callback|transit|out_for_delivery|postponed|shipped/.test(k)) return "info";
  return "neutral";
}

function iconOf(it: TimelineItem): ReactNode {
  switch (it.type) {
    case "call_attempt":
    case "delivery_rescue":
    case "phone_revealed":
      return <PhoneIcon />;
    case "whatsapp_sent":
      return <MessageCircleIcon />;
    case "note":
      return <StickyNoteIcon />;
    case "field_edited":
      return <PencilIcon />;
    case "blocked":
      return <BanIcon />;
    case "undo":
      return <RotateCcwIcon />;
    case "hold_set":
      return <ClockIcon />;
    case "tracking_set":
    case "manifest_exported":
    case "recall_requested":
      return <TruckIcon />;
    case "created":
      return <PackageIcon />;
    case "state_changed":
      return toneOf(it) === "success" ? <CheckIcon /> : <ArrowRightIcon className="rtl:rotate-180" />;
    default:
      return <CircleDotIcon />;
  }
}

type Row = TimelineItem & { pending?: true };

export function OrderTimeline({
  orderId,
  initial,
  tz,
  locale,
  canNote,
  canHide,
}: {
  orderId: string;
  initial: { items: TimelineItem[]; more: boolean };
  tz: string;
  locale: AdminLocale;
  canNote: boolean;
  canHide: boolean;
}) {
  const t = useT();
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const [items, setItems] = useState<Row[]>(initial.items);
  const [more, setMore] = useState(initial.more);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const seq = useRef(0);
  const now = new Date();

  const load = async (f: TimelineFilter, beforeId?: number) => {
    const n = ++seq.current;
    setLoading(true);
    setError(false);
    const res = await settle<{ items: TimelineItem[]; more: boolean }>(orderTimelineAction(orderId, { filter: f, ...(beforeId ? { beforeId } : {}) }));
    if (n !== seq.current) return;
    setLoading(false);
    if (!res.ok) {
      setError(true);
      return;
    }
    setItems((cur) => (beforeId ? [...cur, ...res.data.items] : res.data.items));
    setMore(res.data.more);
  };

  const pickFilter = (f: TimelineFilter) => {
    setFilter(f);
    if (f === "all") {
      seq.current++;
      setItems(initial.items);
      setMore(initial.more);
      setLoading(false);
      setError(false);
    } else void load(f);
  };

  // a new drawer payload (after a move or an edit) replaces the first page
  useEffect(() => {
    setItems(initial.items);
    setMore(initial.more);
    setFilter("all");
  }, [initial]);

  const groups: { day: string; rows: Row[] }[] = [];
  for (const it of items) {
    const day = storeYmd(new Date(it.at), tz);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.rows.push(it);
    else groups.push({ day, rows: [it] });
  }
  const today = storeYmd(now, tz);
  const dayName = (d: string) => (d === today ? t("ops.drawer.today") : d === addDaysYmd(today, -1) ? t("ops.drawer.yesterday") : ymdLabel(d, locale));

  const hide = async (id: number) => {
    const res = await settle(hideNoteAction(orderId, id));
    if (!res.ok) {
      toast.error(t("ops.error.generic"));
      return;
    }
    setItems((cur) => cur.filter((x) => x.id !== id));
    toast.success(t("ops.drawer.noteHidden"));
  };

  return (
    <section className="grid min-w-0 gap-3" aria-labelledby={`tl-${orderId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`tl-${orderId}`} className="text-[0.8125rem] font-semibold">
          {t("ops.timeline.title")}
        </h3>
        <div role="tablist" aria-label={t("ops.drawer.filterTimeline")} className="flex gap-1 rounded-full bg-foreground/[0.04] p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => pickFilter(f)}
              className={cn(
                "h-7 rounded-full px-2.5 text-xs font-medium transition-colors duration-150",
                filter === f ? "bg-background text-foreground shadow-xs ring-1 ring-foreground/[0.06]" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`ops.drawer.tl.${f}` as MessageKey)}
            </button>
          ))}
        </div>
      </div>

      {loading && !items.length ? (
        <div className="grid gap-2.5" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="adm-shimmer size-7 shrink-0 rounded-full" />
              <div className="adm-shimmer h-3.5 flex-1 rounded-md" style={{ maxWidth: `${80 - i * 9}%` }} />
            </div>
          ))}
        </div>
      ) : error && !items.length ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {t("ops.drawer.tlError")}
          <button type="button" className="font-medium text-foreground underline-offset-4 hover:underline" onClick={() => void load(filter)}>
            {t("ops.state.retry")}
          </button>
        </p>
      ) : !items.length ? (
        <p className="text-sm text-muted-foreground">{t("ops.drawer.tlEmpty")}</p>
      ) : (
        <div className={cn("grid gap-4 transition-opacity duration-150", loading && "opacity-60")}>
          {groups.map((g) => (
            <div key={g.day} className="grid gap-1">
              <p className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">{dayName(g.day)}</p>
              <ol className="relative grid">
                {g.rows.map((it, i) => (
                  <li key={it.id} className={cn("group relative flex gap-3 py-1.5", it.pending && "opacity-60")}>
                    {i < g.rows.length - 1 && <span aria-hidden="true" className="absolute start-[13.5px] top-9 bottom-0 w-px bg-border" />}
                    <span className={cn("grid size-7 shrink-0 place-items-center rounded-full [&_svg]:size-3.5", TONE[toneOf(it)])}>{iconOf(it)}</span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className={cn("text-[0.8125rem] leading-snug [overflow-wrap:anywhere]", it.type === "note" ? "whitespace-pre-wrap text-foreground" : "text-foreground/90")}>
                        {t(it.text.key, it.text.vars)}
                      </p>
                      {it.detail?.map((d, k) => (
                        <p key={k} className="mt-0.5 text-xs leading-snug text-muted-foreground [overflow-wrap:anywhere]">
                          {t(d.key, d.vars)}
                        </p>
                      ))}
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                        {it.actor.name && <bdi className="truncate">{it.actor.name}</bdi>}
                        {it.actor.name && <span aria-hidden="true">·</span>}
                        <bdi dir="ltr">{it.pending ? t("ops.drawer.sending") : dayClock(it.at, tz, locale, now)}</bdi>
                      </p>
                    </div>
                    {canHide && it.type === "note" && !it.pending && (
                      <button
                        type="button"
                        onClick={() => void hide(it.id)}
                        aria-label={t("ops.drawer.hideNote")}
                        title={t("ops.drawer.hideNote")}
                        className="grid size-7 shrink-0 place-items-center self-start rounded-full text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-foreground/[0.05] hover:text-foreground focus-visible:opacity-100 [&_svg]:size-3.5"
                      >
                        <EyeOffIcon />
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ))}
          {more && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void load(filter, items.filter((x) => !x.pending).slice(-1)[0]?.id)}
              className="justify-self-start text-[0.8125rem] font-medium text-foreground/80 underline-offset-4 hover:underline disabled:opacity-50"
            >
              {loading ? <Loader2Icon className="inline size-3.5 animate-spin" /> : t("ops.drawer.showMore")}
            </button>
          )}
        </div>
      )}

      {canNote && (
        <NoteBox
          orderId={orderId}
          onSent={(row) => setItems((cur) => [row, ...cur])}
          onSettled={(tempId, real) => setItems((cur) => (real ? cur.map((x) => (x.id === tempId ? { ...x, id: real, pending: undefined } : x)) : cur.filter((x) => x.id !== tempId)))}
        />
      )}
    </section>
  );
}

function NoteBox({ orderId, onSent, onSettled }: { orderId: string; onSent: (row: Row) => void; onSettled: (tempId: number, realId: number | null) => void }) {
  const t = useT();
  const [text, setText] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const len = Array.from(text).length;

  const send = async () => {
    const v = text.trim();
    if (!v || len > NOTE_MAX || busy) return;
    const tempId = -Date.now();
    setBusy(true);
    setFailed(false);
    onSent({ id: tempId, at: new Date().toISOString(), type: "note", actor: { kind: "user", name: null }, text: { key: "ops.tl.note", vars: { text: v } }, masked: true, pending: true });
    setText("");
    const res = await settle<{ id: number }>(addNoteAction(orderId, v));
    setBusy(false);
    if (res.ok) {
      onSettled(tempId, typeof res.data?.id === "number" ? res.data.id : tempId);
    } else {
      // the text comes back with a retry (OPE-§4.2)
      onSettled(tempId, null);
      setText(v);
      setFailed(true);
    }
  };

  return (
    <form
      className="sticky bottom-0 -mx-1 grid gap-1.5 rounded-2xl bg-background/90 p-1 backdrop-blur-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <div className="rounded-xl ring-1 ring-border transition-shadow ring-inset focus-within:ring-2 focus-within:ring-ring/50">
        <textarea
          rows={2}
          value={text}
          aria-label={t("ops.note.label")}
          placeholder={t("ops.note.placeholder")}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void send();
            }
          }}
          className="block max-h-40 min-h-16 w-full resize-none bg-transparent px-3 pt-2.5 text-[0.8125rem] outline-none placeholder:text-muted-foreground/70"
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <span className={cn("ps-1 text-xs tabular-nums", failed ? "text-destructive" : len > NOTE_MAX ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
            {failed ? t("ops.drawer.noteFailed") : len > 400 ? `${len} / ${NOTE_MAX}` : t("ops.drawer.noteHint")}
          </span>
          <button
            type="submit"
            disabled={!text.trim() || len > NOTE_MAX || busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40 [&_svg]:size-3.5"
          >
            {busy ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
            {failed ? t("ops.state.retry") : t("ops.note.save")}
          </button>
        </div>
      </div>
    </form>
  );
}

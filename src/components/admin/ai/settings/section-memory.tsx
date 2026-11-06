"use client";
/**
 * Settings → AI, "What the AI learned" (P7 AI; ai.md AI-§K.1 5, AI-§G.2, AI-§G.7, AI-06): the store's memory items
 * (kind chip, text, source You / Learned, date), add, delete, pin, the learning switch and the opt-in share of
 * anonymous design statistics (off by default, the k ≥ 5 explanation). The text is store data: it shows under
 * "View as store" too, with every action hidden. Empty: a faded preview of the real list, one sentence, one primary
 * action, one teaching line.
 */
import { PinIcon, PinOffIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "@/components/admin/settings/form-kit";
import { MEMORY_KIND_IDS, type AiSettingsView, type MemoryKindId, type MemoryView } from "@/lib/ai/settings/view";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { addMemoryAction, deleteMemoryAction, pinMemoryAction, toggleLearningAction, toggleShareAction } from "@/app/app/[store]/settings/ai/actions";
import { newKey, SaveError, SwitchRow, useFormat, useSaved, type SavedState } from "./controls";

const IDLE: SavedState = { pending: false, error: null, retry: null };

function KindChip({ kind }: { kind: MemoryKindId }) {
  const t = useT();
  return <span className="inline-flex h-6 shrink-0 items-center rounded-md bg-foreground/[0.06] px-2 text-[0.6875rem] font-medium tracking-[0.01em] text-foreground/75">{t(`ai.settings.memory.kind.${kind}`)}</span>;
}

/** The faded rows behind the empty state: the real list's shape, no invented content. */
function GhostRows() {
  return (
    <div aria-hidden="true" className="grid gap-2 opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent)]">
      {[0.72, 0.5, 0.62].map((w, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl px-3.5 py-3 ring-1 ring-foreground/[0.05]">
          <span className="h-5 w-12 rounded-md bg-foreground/[0.07]" />
          <span className="h-2.5 rounded-full bg-foreground/[0.07]" style={{ width: `${w * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

export function MemorySection({ view, locked, hideActions }: { view: AiSettingsView; locked: boolean; hideActions: boolean }) {
  const t = useT();
  const f = useFormat();
  const [items, setItems] = useState<MemoryView[]>(view.memory.items);
  const [seen, setSeen] = useState(view.memory.items);
  const [kind, setKind] = useState<MemoryKindId>("fact");
  const [text, setText] = useState("");
  const [addState, setAddState] = useState<SavedState>(IDLE);
  const [rowError, setRowError] = useState<{ id: string; state: SavedState } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [learning, setLearning, lState] = useSaved(view.settings.learning, (v, key) => toggleLearningAction({ key, learning: v }));
  const [share, setShare, sState] = useSaved(view.settings.sharePatterns, (v, key) => toggleShareAction({ key, sharePatterns: v }));
  if (seen !== view.memory.items) {
    setSeen(view.memory.items);
    setItems(view.memory.items);
  }
  const active = items.length;
  const full = active >= view.memory.max;

  const add = (key = newKey()) => {
    const body = text.replace(/\s+/g, " ").trim();
    if (body.length < 2) return input.current?.focus();
    setAddState({ pending: true, error: null, retry: null });
    void addMemoryAction({ key, item: { kind, text: body, locale: null } })
      .then((r) => {
        if (r.ok) {
          setItems((xs) => [{ id: r.data.id, kind, text: body, locale: null, source: "explicit", pinned: false, screened: false, at: new Date().toISOString() }, ...xs]);
          setText("");
          setAddState(IDLE);
          toast(t("ai.settings.memory.added"));
        } else setAddState({ pending: false, error: r.message ? t(r.message) : t("ai.settings.error"), retry: () => add(key) });
      })
      .catch(() => setAddState({ pending: false, error: t("ai.settings.error"), retry: () => add(key) }));
  };

  const remove = (m: MemoryView, key = newKey()) => {
    const before = items;
    setItems((xs) => xs.filter((x) => x.id !== m.id));
    setRowError(null);
    void deleteMemoryAction({ key, id: m.id })
      .then((r) => {
        if (r.ok) toast(t("ai.settings.memory.deleted"));
        else {
          setItems(before);
          setRowError({ id: m.id, state: { pending: false, error: r.message ? t(r.message) : t("ai.settings.error"), retry: () => remove(m, key) } });
        }
      })
      .catch(() => {
        setItems(before);
        setRowError({ id: m.id, state: { pending: false, error: t("ai.settings.error"), retry: () => remove(m, key) } });
      });
  };

  const pin = (m: MemoryView, key = newKey()) => {
    const next = !m.pinned;
    const flip = (on: boolean) => setItems((xs) => [...xs.map((x) => (x.id === m.id ? { ...x, pinned: on } : x))].sort((a, b) => Number(b.pinned) - Number(a.pinned)));
    flip(next);
    setRowError(null);
    toast(t("ai.settings.saved"), { id: `ai-pin-${key}`, duration: 5_000, action: { label: t("ai.settings.undo"), onClick: () => pin({ ...m, pinned: next }) } });
    void pinMemoryAction({ key, id: m.id, pinned: next })
      .then((r) => {
        if (!r.ok) {
          toast.dismiss(`ai-pin-${key}`);
          setRowError({ id: m.id, state: { pending: false, error: r.message ? t(r.message) : t("ai.settings.error"), retry: () => pin(m, key) } });
        }
      })
      .catch(() => {
        toast.dismiss(`ai-pin-${key}`);
        setRowError({ id: m.id, state: { pending: false, error: t("ai.settings.error"), retry: () => pin(m, key) } });
      });
  };

  const addForm = !hideActions && !locked && (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <label className="sr-only" htmlFor="ai-memory-kind">
          {t("ai.settings.memory.kind_label")}
        </label>
        <select
          id="ai-memory-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as MemoryKindId)}
          disabled={full}
          className="h-11 rounded-xl bg-background px-3 text-[0.875rem] ring-1 ring-input focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:h-9"
        >
          {MEMORY_KIND_IDS.map((k) => (
            <option key={k} value={k}>
              {t(`ai.settings.memory.kind.${k}`)}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="ai-memory-text">
          {t("ai.settings.memory.add_label")}
        </label>
        <input
          id="ai-memory-text"
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          disabled={full}
          placeholder={t("ai.settings.memory.add_placeholder")}
          className="h-11 min-w-0 rounded-xl bg-background px-3 text-[0.875rem] ring-1 ring-input placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:h-9"
        />
        <Button type="submit" className="h-11 px-4 sm:h-9" disabled={full || addState.pending}>
          <PlusIcon aria-hidden="true" className="size-4" />
          {t("ai.settings.memory.add")}
        </Button>
      </div>
      <SaveError state={full ? { pending: false, error: t("ai.settings.memory.full"), retry: null } : addState} />
    </form>
  );

  return (
    <SettingsSection
      id="ai-memory"
      title={t("ai.settings.memory.title")}
      description={t("ai.settings.memory.lede")}
      aside={active > 0 ? <span className="text-[0.75rem] text-muted-foreground tabular-nums">{t("ai.settings.memory.count", { n: active, max: view.memory.max })}</span> : undefined}
    >
      {active === 0 ? (
        <div className="relative grid gap-4">
          <GhostRows />
          <div className="grid gap-1">
            <p className="text-[0.875rem] font-medium text-pretty">{t("ai.settings.memory.empty")}</p>
            <p className="text-[0.8125rem] text-muted-foreground">{t("ai.settings.memory.empty_teach", { max: view.memory.max })}</p>
          </div>
          {addForm}
        </div>
      ) : (
        <>
          {addForm}
          <ul className="grid gap-px overflow-hidden rounded-xl ring-1 ring-foreground/[0.06]">
            {items.map((m) => (
              <li key={m.id} className={cn("grid gap-1 bg-foreground/[0.02] px-3.5 py-3", m.screened && "bg-foreground/[0.04]")}>
                <div className="flex items-start gap-3">
                  <KindChip kind={m.kind} />
                  <div className="grid min-w-0 flex-1 gap-1">
                    <p className="text-[0.875rem] leading-relaxed text-pretty break-words">{m.text}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-[0.75rem] text-muted-foreground">
                      <span>{t(`ai.settings.memory.source.${m.source}`)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{f.when(m.at)}</span>
                      {m.pinned && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 text-foreground/75">
                            <PinIcon aria-hidden="true" className="size-3" />
                            {t("ai.settings.memory.pinned")}
                          </span>
                        </>
                      )}
                      {m.screened && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{t("ai.settings.memory.screened")}</span>
                        </>
                      )}
                    </p>
                  </div>
                  {!hideActions && !locked && (
                    <div className="-me-1.5 flex shrink-0 items-center">
                      <Button variant="ghost" size="icon" className="size-11 text-muted-foreground sm:size-8" aria-label={t(m.pinned ? "ai.settings.memory.unpin" : "ai.settings.memory.pin")} onClick={() => pin(m)}>
                        {m.pinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="size-11 text-muted-foreground hover:text-destructive sm:size-8" aria-label={t("ai.settings.memory.delete")} onClick={() => remove(m)}>
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
                {rowError?.id === m.id && <SaveError state={rowError.state} />}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="grid gap-3 border-t border-foreground/[0.06] pt-4">
        <SwitchRow label={t("ai.settings.learning")} body={t("ai.settings.learning_body")} checked={learning} onChange={setLearning} disabled={locked} state={lState} />
        <SwitchRow label={t("ai.settings.share_label")} body={t("ai.settings.share_body")} checked={share} onChange={setShare} disabled={locked} state={sState} />
      </div>
    </SettingsSection>
  );
}

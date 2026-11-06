"use client";
/**
 * The store profile's Notes tab (platform.md PLA-§7.12, §13.6; PD56): staff-only notes on the store (a store never sees
 * them, analysts never see them). The composer takes markdown-lite (≤ 4,000 characters, a live preview), a kind (note
 * · decision · warning), a pin, and `@name` mentions with an autocomplete over the staff (the picked person is
 * notified, `staff.mention`). The list shows pinned notes first, then the newest, each with its author, role, time and
 * edited marker; the author may edit within 24 h; the author or a super_admin may delete (soft); pinning offers Undo
 * for 10 s.
 *
 *   <NotesTab storeId={id} notes={await listNotes(ctx, { storeId: id })} staff={[…]} />
 */
import { PinIcon, PinOffIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { addNoteAction, deleteNoteAction, editNoteAction, pinNoteAction } from "@/app/admin/(console)/stores/[id]/actions";
import { useT } from "@/lib/i18n/admin/client";
import { renderMarkdownLite } from "@/lib/platform/markdown-lite";
import type { NoteKind, NoteView } from "@/lib/platform/notes";
import { cn } from "@/lib/utils";
import { Ago } from "../ago";
import { newOpId } from "../op";
import { QuietEmpty } from "../panel";
import { button } from "../queue/decision-dialogs";

const NOTE_MAX = 4_000;
const KINDS: NoteKind[] = ["note", "decision", "warning"];
const KIND_TONE: Record<NoteKind, string> = {
  note: "bg-secondary text-muted-foreground",
  decision: "bg-[color-mix(in_oklch,var(--brand)_10%,transparent)] text-[var(--c-brand-ink)]",
  warning: "bg-[var(--c-warn-soft)] text-foreground",
};
const md = "text-[13px] leading-[1.55] [&_a]:text-[var(--c-brand-ink)] [&_a]:underline [&_code]:rounded-[4px] [&_code]:bg-secondary [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12px] [&_p]:my-0 [&_p+p]:mt-2 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:ps-5";

/** The "@word" the caret is in, if any. */
function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)@([\p{L}\p{N}_.-]{0,30})$/u.exec(before);
  return m ? { start: caret - m[2]!.length - 1, query: m[2]!.toLowerCase() } : null;
}

export function NotesTab({ storeId, notes, staff }: { storeId: string; notes: NoteView[]; staff: { id: string; name: string }[] }) {
  const t = useT();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <section aria-label={t("console.notes_tab.list")} className="grid gap-2 lg:order-first">
        {notes.length === 0 ? (
          <div className="rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]">
            <QuietEmpty text={t("console.notes_tab.empty")} note={t("console.notes_tab.empty_note")} />
          </div>
        ) : (
          notes.map((n) => <NoteItem key={n.id} note={n} />)
        )}
      </section>
      <Composer storeId={storeId} staff={staff} />
    </div>
  );
}

function Composer({ storeId, staff }: { storeId: string; staff: { id: string; name: string }[] }) {
  const t = useT();
  const router = useRouter();
  const ids = useId();
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<NoteKind>("note");
  const [pinned, setPinned] = useState(false);
  const [mentions, setMentions] = useState<{ id: string; name: string }[]>([]);
  const [opId, setOpId] = useState(newOpId);
  const [preview, setPreview] = useState(false);
  const [pending, start] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const matches = useMemo(() => (mention ? staff.filter((s) => s.name.toLowerCase().includes(mention.query)).slice(0, 6) : []), [mention, staff]);
  const over = body.length > NOTE_MAX;

  const pick = (s: { id: string; name: string }) => {
    if (!mention || !box.current) return;
    const caret = box.current.selectionStart;
    const next = `${body.slice(0, mention.start)}@${s.name} ${body.slice(caret)}`;
    setBody(next);
    setMentions((m) => (m.some((x) => x.id === s.id) ? m : [...m, s]));
    setMention(null);
    requestAnimationFrame(() => {
      const at = mention.start + s.name.length + 2;
      box.current?.setSelectionRange(at, at);
      box.current?.focus();
    });
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && matches.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => (a + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => (a - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(matches[active]!);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  const submit = () => {
    if (!body.trim() || over) return;
    const named = mentions.filter((m) => body.toLowerCase().includes(`@${m.name.toLowerCase()}`)).map((m) => m.id);
    start(async () => {
      const r = await addNoteAction({ storeId, body: body.trim(), kind, pinned, mentions: named, opId });
      if (r.ok) {
        setBody("");
        setMentions([]);
        setPinned(false);
        setKind("note");
        setPreview(false);
        setOpId(newOpId());
        toast.success(t("console.notes_tab.added"));
        router.refresh();
      } else toast.error(r.message ? t(r.message) : t("console.notes_tab.failed"));
    });
  };

  return (
    <section aria-label={t("console.notes_tab.compose")} className="grid gap-3 rounded-[var(--r-card)] bg-card p-4 shadow-[inset_0_0_0_1px_var(--c-hairline)] lg:sticky lg:top-20">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold">{t("console.notes_tab.compose")}</h2>
        <button type="button" aria-pressed={preview} onClick={() => setPreview((p) => !p)} className="text-[12px] font-medium text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
          {preview ? t("console.notes_tab.write") : t("console.notes_tab.preview")}
        </button>
      </div>
      <div className="relative grid gap-1.5">
        <label htmlFor={`${ids}-b`} className="sr-only">
          {t("console.notes_tab.body")}
        </label>
        {preview ? (
          <div className={cn(md, "min-h-[132px] rounded-[var(--r-control)] bg-[color-mix(in_oklch,var(--muted)_55%,transparent)] px-3 py-2")}>{body.trim() ? renderMarkdownLite(body) : <span className="text-muted-foreground">{t("console.notes_tab.preview_empty")}</span>}</div>
        ) : (
          <textarea
            id={`${ids}-b`}
            ref={box}
            rows={6}
            value={body}
            role="combobox"
            aria-expanded={!!mention && matches.length > 0}
            aria-controls={`${ids}-m`}
            aria-autocomplete="list"
            aria-activedescendant={mention && matches[active] ? `${ids}-m-${matches[active]!.id}` : undefined}
            onChange={(e) => {
              setBody(e.target.value);
              const m = mentionAt(e.target.value, e.target.selectionStart);
              setMention(m);
              setActive(0);
            }}
            onKeyDown={onKey}
            onBlur={() => setTimeout(() => setMention(null), 120)}
            aria-invalid={over || undefined}
            className="w-full resize-y rounded-[var(--r-control)] bg-background px-3 py-2 text-[13px] leading-[1.5] shadow-[inset_0_0_0_1px_var(--input)] outline-none transition-shadow duration-[var(--dur-1)] focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)] aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--c-danger-ink)]"
          />
        )}
        {mention && matches.length > 0 && !preview && (
          <ul id={`${ids}-m`} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 grid overflow-hidden rounded-[var(--r-control)] bg-popover py-1 text-[13px] shadow-[0_12px_32px_-12px_oklch(0.2_0.01_230/0.35)] ring-1 ring-[var(--c-hairline)]">
            {matches.map((s, i) => (
              <li
                key={s.id}
                id={`${ids}-m-${s.id}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                className={cn("cursor-pointer px-3 py-1.5", i === active && "bg-accent")}
              >
                @{s.name}
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-3 text-[11.5px] text-muted-foreground">
          <span>{t("console.notes_tab.hint")}</span>
          <span className={cn("num shrink-0 whitespace-nowrap", over && "font-medium text-[var(--c-danger-ink)]")}>
            {body.length} / {NOTE_MAX}
          </span>
        </div>
      </div>
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">{t("console.notes_tab.kind")}</legend>
        <div className="inline-flex rounded-[var(--r-control)] bg-secondary p-0.5">
          {KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn("h-7 rounded-[calc(var(--r-control)-2px)] px-2.5 text-[12px] font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:h-10", kind === k && "bg-card text-foreground shadow-[inset_0_0_0_1px_var(--c-hairline)]")}>
              {t(`console.notes_tab.kind.${k}`)}
            </button>
          ))}
        </div>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px]">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="size-3.5 accent-[var(--brand)]" />
          {t("console.notes_tab.pin")}
        </label>
        <span className="flex-1" />
        <button type="button" disabled={pending || !body.trim() || over} onClick={submit} className={cn(button.base, button.primary)}>
          {t("console.notes_tab.add")}
        </button>
      </fieldset>
    </section>
  );
}

function NoteItem({ note }: { note: NoteView }) {
  const t = useT();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const [pending, start] = useTransition();

  const pin = (pinned: boolean, undo = true) =>
    start(async () => {
      const r = await pinNoteAction({ id: note.id, pinned });
      if (!r.ok) return void toast.error(t("console.notes_tab.failed"));
      router.refresh();
      if (undo) toast.success(t(pinned ? "console.notes_tab.pinned" : "console.notes_tab.unpinned"), { duration: 10_000, action: { label: t("console.notes_tab.undo"), onClick: () => pin(!pinned, false) } });
    });

  const save = () =>
    start(async () => {
      const mentions = note.mentions.filter((m) => m.name && body.toLowerCase().includes(`@${m.name.toLowerCase()}`)).map((m) => m.id);
      const r = await editNoteAction({ id: note.id, body: body.trim(), mentions, opId: newOpId() });
      if (r.ok) {
        setEditing(false);
        router.refresh();
      } else toast.error(r.message ? t(r.message) : t("console.notes_tab.failed"));
    });

  const remove = () =>
    start(async () => {
      const r = await deleteNoteAction({ id: note.id, opId: newOpId() });
      if (r.ok) {
        toast.success(t("console.notes_tab.deleted"));
        router.refresh();
      } else toast.error(r.message ? t(r.message) : t("console.notes_tab.failed"));
    });

  return (
    <article className={cn("grid gap-2 rounded-[var(--r-card)] bg-card px-4 py-3 shadow-[inset_0_0_0_1px_var(--c-hairline)]", note.pinned && "shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--brand)_35%,transparent)]")}>
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
        {note.pinned && <PinIcon aria-label={t("console.notes_tab.pinned_label")} className="size-3.5 text-[var(--c-brand-ink)]" />}
        <span className="font-medium text-foreground">{note.author.name ?? t("console.feed.actor.staff")}</span>
        {note.author.role && <span className="text-muted-foreground">{t(`console.role.${note.author.role}`)}</span>}
        <span className={cn("inline-flex h-5 items-center rounded-[var(--r-chip)] px-1.5 text-[11px] font-medium", KIND_TONE[note.kind])}>{t(`console.notes_tab.kind.${note.kind}`)}</span>
        <span className="flex-1" />
        <Ago iso={note.createdAt} className="text-muted-foreground" />
        {note.editedAt && <span className="text-muted-foreground">· {t("console.notes_tab.edited")}</span>}
      </header>
      {editing ? (
        <div className="grid gap-2">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="w-full resize-y rounded-[var(--r-control)] bg-background px-3 py-2 text-[13px] leading-[1.5] shadow-[inset_0_0_0_1px_var(--input)] outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)]" aria-label={t("console.notes_tab.body")} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => (setEditing(false), setBody(note.body))} className={cn(button.base, button.ghost, "h-7 px-2.5 text-[12px]")}>
              {t("console.dialog.cancel")}
            </button>
            <button type="button" disabled={pending || !body.trim() || body.length > NOTE_MAX} onClick={save} className={cn(button.base, button.primary, "h-7 px-2.5 text-[12px]")}>
              {t("console.notes_tab.save")}
            </button>
          </div>
        </div>
      ) : (
        <div className={md}>{renderMarkdownLite(note.body)}</div>
      )}
      {!editing && (
        <footer className="flex flex-wrap items-center gap-1">
          {note.mentions.length > 0 && <span className="me-auto text-[11.5px] text-muted-foreground">{t("console.notes_tab.mentions", { names: note.mentions.map((m) => m.name ?? "?").join(", ") })}</span>}
          <span className="flex-1" />
          <button type="button" disabled={pending} onClick={() => pin(!note.pinned)} className={cn(button.base, button.ghost, "h-7 px-2 text-[12px]")}>
            {note.pinned ? <PinOffIcon aria-hidden="true" className="size-3.5" /> : <PinIcon aria-hidden="true" className="size-3.5" />}
            {note.pinned ? t("console.notes_tab.unpin") : t("console.notes_tab.pin_action")}
          </button>
          {note.canEdit && (
            <button type="button" onClick={() => setEditing(true)} className={cn(button.base, button.ghost, "h-7 px-2 text-[12px]")}>
              {t("console.notes_tab.edit")}
            </button>
          )}
          {note.canDelete && (
            <button type="button" disabled={pending} onClick={remove} className={cn(button.base, button.ghost, "h-7 px-2 text-[12px] hover:text-[var(--c-danger-ink)]")}>
              <Trash2Icon aria-hidden="true" className="size-3.5" />
              {t("console.notes_tab.delete")}
            </button>
          )}
        </footer>
      )}
    </article>
  );
}

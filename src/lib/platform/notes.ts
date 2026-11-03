import "server-only";
/**
 * Staff notes on a store or a person (platform.md PLA-§7.12, §11.2 Notes tab; the composer of the queue's detail pane):
 *
 *   const list = await listNotes(ctx, { storeId });                                   // pinned first, then newest
 *   const { id } = await addNote(ctx, { storeId, body, kind: "decision", pinned, mentions: [staffId] });
 *   await editNote(ctx, { id, body });          // the author, within 24 h
 *   await deleteNote(ctx, { id });              // soft (`deleted_at`); the author or a super_admin
 *   await pinNote(ctx, { id, pinned: true });
 *
 * `stores.notes` for every call; analysts never see notes (the permission matrix leaves them out, and the functions
 * refuse the role besides). A store never sees notes. The body is markdown-lite (PLA-§13.6, rendered as React
 * elements, never HTML), at most 4,000 characters; a mention is a staff id from the composer's autocomplete whose
 * name the body names after "@" (at most 20), stored in `mentions` and sent `staff.mention` (each person once per
 * note). Audit `platform.note.added` · `.edited` · `.deleted` · `.pinned` (ids and kinds only, never the body).
 *
 * A store note is platform bookkeeping on the store's row set: it is written through the system seam of that store
 * (D71: a platform scope never writes); a person's note has no store and is one annotated statement.
 */
import { z } from "zod";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { auditFrom } from "@/lib/audit";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { platformNotes, stores, users } from "@/lib/db/schema";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
import type { PlatformCtx, StoreScope, WriteScope } from "@/lib/tenancy/types";
import { recordPlatformError } from "./log";
import { notify } from "./notify";
import { platformScope } from "./seam";

export const NOTE_MAX = 4_000;
export const MENTIONS_MAX = 20;
export const EDIT_WINDOW_MS = 24 * 3_600_000;
const NOTES_MAX = 200;
const ID_RE = /^[0-9A-Z]{26}$/;
export const NOTE_KINDS = ["note", "decision", "warning"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

/** A note row is platform bookkeeping: its writes go through the system seam of its store. */
const noteScope = (storeId: string): WriteScope => systemScope(systemCtx("platform.notes"), storeId);

function requireNotes(ctx: PlatformCtx): void {
  if (!ctx.can("stores.notes") || ctx.role === "analyst") throw new AuthRefusal("forbidden");
}

const id26 = z.string().regex(ID_RE);
const body = z
  .string()
  .transform((s) => s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim())
  .pipe(z.string().min(1).max(NOTE_MAX));

export const AddNoteInput = z
  .object({
    storeId: id26.optional(),
    userId: id26.optional(),
    body,
    kind: z.enum(NOTE_KINDS).default("note"),
    pinned: z.boolean().default(false),
    mentions: z.array(id26).max(MENTIONS_MAX).default([]),
  })
  .refine((v) => (v.storeId ? 1 : 0) + (v.userId ? 1 : 0) === 1, { message: "one subject", path: ["storeId"] });
export const EditNoteInput = z.object({ id: id26, body, mentions: z.array(id26).max(MENTIONS_MAX).default([]) });
export const NoteIdInput = z.object({ id: id26 });
export const PinNoteInput = z.object({ id: id26, pinned: z.boolean() });

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw new FieldsError({ [String(r.error.issues[0]?.path[0] ?? "body")]: "console.notes.invalid" });
  return r.data;
}

export interface NoteView {
  id: string;
  storeId: string | null;
  userId: string | null;
  kind: NoteKind;
  /** markdown-lite source (rendered with `renderMarkdownLite`) */
  body: string;
  pinned: boolean;
  author: { id: string; name: string | null; role: string | null };
  mentions: { id: string; name: string | null }[];
  createdAt: string;
  editedAt: string | null;
  canEdit: boolean;
  canDelete: boolean;
}

async function staffById(ids: readonly string[]): Promise<Map<string, { name: string; role: string }>> {
  const list = [...new Set(ids)].filter((id) => ID_RE.test(id));
  if (!list.length) return new Map();
  const rows = await db.select({ id: users.id, name: users.name, role: users.platformRole }).from(users).where(inArray(users.id, list));
  return new Map(rows.map((r) => [r.id, { name: r.name, role: r.role }]));
}

const noteColumns = {
  id: platformNotes.id,
  storeId: platformNotes.storeId,
  userId: platformNotes.userId,
  kind: platformNotes.kind,
  body: platformNotes.body,
  pinned: platformNotes.pinned,
  authorId: platformNotes.authorId,
  mentions: platformNotes.mentions,
  createdAt: platformNotes.createdAt,
  editedAt: platformNotes.editedAt,
};

/** One store's notes (pn_store_idx), through the console's read scope. */
async function storeNotes(scope: StoreScope, columns: typeof noteColumns) {
  return db
    .select(columns)
    .from(platformNotes)
    .where(whereStore(platformNotes, scope, isNull(platformNotes.deletedAt)))
    .orderBy(desc(platformNotes.pinned), desc(platformNotes.createdAt))
    .limit(NOTES_MAX);
}

/** PLA-§7.12 (`stores.notes`): one subject's notes, pinned first, then newest. */
export async function listNotes(ctx: PlatformCtx, subject: { storeId?: string; userId?: string }, now: Date = new Date()): Promise<NoteView[]> {
  requireNotes(ctx);
  const columns = noteColumns;
  let rows;
  if (subject.storeId && ID_RE.test(subject.storeId)) {
    rows = await storeNotes(platformScope(ctx, subject.storeId), columns);
  } else if (subject.userId && ID_RE.test(subject.userId)) {
    // tenancy: platform notes about one person (pn_user_idx): staff text, never shown to a store
    rows = await db
      .select(columns)
      .from(platformNotes)
      .where(and(eq(platformNotes.userId, subject.userId), isNull(platformNotes.deletedAt)))
      .orderBy(desc(platformNotes.pinned), desc(platformNotes.createdAt))
      .limit(NOTES_MAX);
  } else return [];
  const people = await staffById(rows.flatMap((r) => [r.authorId, ...(r.mentions ?? [])]));
  return rows.map((r) => ({
    id: r.id,
    storeId: r.storeId,
    userId: r.userId,
    kind: r.kind,
    body: r.body,
    pinned: r.pinned,
    author: { id: r.authorId, name: people.get(r.authorId)?.name ?? null, role: people.get(r.authorId)?.role ?? null },
    mentions: (r.mentions ?? []).map((id) => ({ id, name: people.get(id)?.name ?? null })),
    createdAt: r.createdAt.toISOString(),
    editedAt: r.editedAt?.toISOString() ?? null,
    canEdit: r.authorId === ctx.user.id && now.getTime() - r.createdAt.getTime() < EDIT_WINDOW_MS,
    canDelete: r.authorId === ctx.user.id || ctx.role === "super_admin",
  }));
}

/** The mentioned staff the body names after "@" (first name or full name), at most 20, never the author. */
async function resolveMentions(ctx: PlatformCtx, text: string, ids: readonly string[]): Promise<{ id: string; name: string }[]> {
  if (!ids.length) return [];
  const people = await db
    .select({ id: users.id, name: users.name, role: users.platformRole, disabled: users.disabled })
    .from(users)
    .where(and(inArray(users.id, [...new Set(ids)]), sql`${users.platformRole} <> 'none'`));
  const lower = text.toLowerCase();
  return people
    .filter((p) => !p.disabled && p.id !== ctx.user.id && (lower.includes(`@${p.name.toLowerCase()}`) || lower.includes(`@${(p.name.split(/\s+/)[0] ?? "").toLowerCase()}`)))
    .slice(0, MENTIONS_MAX)
    .map((p) => ({ id: p.id, name: p.name }));
}

async function subjectLabel(storeId: string | null, userId: string | null): Promise<string> {
  if (storeId) {
    const [s] = await db.select({ handle: stores.handle, name: stores.name }).from(stores).where(eq(stores.id, storeId)).limit(1);
    return (s?.handle ? `@${s.handle}` : (s?.name ?? "store")).slice(0, 60);
  }
  const [u] = userId ? await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1) : [];
  return (u?.name ?? "person").slice(0, 60) || "person";
}

async function sendMentions(ctx: PlatformCtx, noteId: string, storeId: string | null, userId: string | null, people: readonly { id: string }[]): Promise<void> {
  if (!people.length) return;
  try {
    const label = await subjectLabel(storeId, userId);
    for (const p of people) {
      await notify(
        { audience: "user", userId: p.id, storeId: null },
        "staff.mention",
        { store: label, by: ctx.user.id, ...(storeId ? { storeId } : {}) },
        { dedupeKey: `mention:${noteId}:${p.id}`, ...(userId ? { link: `/admin/users/${userId}/notes` } : {}) },
      );
    }
  } catch (err) {
    recordPlatformError("notes mention", err, storeId ? { storeId } : {});
  }
}

/** PLA-§7.12 (`stores.notes`): a note on a store or a person. */
export async function addNote(ctx: PlatformCtx, input: unknown): Promise<{ id: string }> {
  requireNotes(ctx);
  const v = parse(AddNoteInput, input);
  if (v.storeId) {
    const [s] = await db.select({ id: stores.id }).from(stores).where(eq(stores.id, v.storeId)).limit(1);
    if (!s) throw new AuthRefusal("not_found");
  } else {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, v.userId!)).limit(1);
    if (!u) throw new AuthRefusal("not_found");
  }
  const mentions = await resolveMentions(ctx, v.body, v.mentions);
  const id = newId();
  const row = { id, userId: v.userId ?? null, authorId: ctx.user.id, body: v.body, pinned: v.pinned, kind: v.kind, mentions: mentions.map((m) => m.id) };
  if (v.storeId) await insertStoreNote(noteScope(v.storeId), row);
  else {
    // tenancy: platform a note about a person has no store (store_id NULL, pn_user_idx)
    await db.insert(platformNotes).values({ ...row, storeId: null });
  }
  await auditFrom(ctx, "platform.note.added", { storeId: v.storeId ?? null, target: id, meta: { kind: v.kind, pinned: v.pinned, mentions: mentions.length, ...(v.userId ? { userId: v.userId } : {}) } });
  await sendMentions(ctx, id, v.storeId ?? null, v.userId ?? null, mentions);
  return { id };
}

type NoteRow = { id: string; storeId: string | null; userId: string | null; authorId: string; createdAt: Date; deletedAt: Date | null; mentions: string[] | null; pinned: boolean };

/** A note by id (any subject; the store comes from the row). */
async function noteById(id: string): Promise<NoteRow | null> {
  // tenancy: platform a note by its id (the store comes from the row; the caller checks the author and the role)
  const [row] = await db
    .select({ id: platformNotes.id, storeId: platformNotes.storeId, userId: platformNotes.userId, authorId: platformNotes.authorId, createdAt: platformNotes.createdAt, deletedAt: platformNotes.deletedAt, mentions: platformNotes.mentions, pinned: platformNotes.pinned })
    .from(platformNotes)
    .where(eq(platformNotes.id, id))
    .limit(1);
  return row && !row.deletedAt ? row : null;
}

type NoteRowInsert = Omit<typeof platformNotes.$inferInsert, "storeId">;
type NotePatch = Partial<Omit<typeof platformNotes.$inferInsert, "id" | "storeId" | "userId" | "authorId" | "createdAt">>;

async function insertStoreNote(scope: WriteScope, row: NoteRowInsert): Promise<void> {
  await db.insert(platformNotes).values(storeValues(scope, row));
}

async function updateStoreNote(scope: WriteScope, id: string, set: NotePatch): Promise<void> {
  await db.update(platformNotes).set(set).where(whereStore(platformNotes, scope, eq(platformNotes.id, id)));
}

/** Updates one note on its own subject: through its store's system seam, or the store-less statement. */
async function updateNote(row: NoteRow, set: NotePatch): Promise<void> {
  if (row.storeId) {
    await updateStoreNote(noteScope(row.storeId), row.id, set);
    return;
  }
  // tenancy: platform a person's note has no store (store_id NULL); one row by id
  await db
    .update(platformNotes)
    .set(set)
    .where(and(eq(platformNotes.id, row.id), isNull(platformNotes.storeId)));
}

/** The author, within 24 h of writing it. */
export async function editNote(ctx: PlatformCtx, input: unknown, now: Date = new Date()): Promise<void> {
  requireNotes(ctx);
  const v = parse(EditNoteInput, input);
  const row = await noteById(v.id);
  if (!row) throw new AuthRefusal("not_found");
  if (row.authorId !== ctx.user.id) throw new AuthRefusal("forbidden", "console.notes.not_author");
  if (now.getTime() - row.createdAt.getTime() >= EDIT_WINDOW_MS) throw new AuthRefusal("forbidden", "console.notes.edit_window");
  const mentions = await resolveMentions(ctx, v.body, v.mentions);
  const before = new Set(row.mentions ?? []);
  await updateNote(row, { body: v.body, editedAt: now, mentions: mentions.map((m) => m.id) });
  await auditFrom(ctx, "platform.note.edited", { storeId: row.storeId, target: row.id, meta: { mentions: mentions.length } });
  await sendMentions(ctx, row.id, row.storeId, row.userId, mentions.filter((m) => !before.has(m.id)));
}

/** Soft delete (the audit keeps the event): the author or a super_admin. */
export async function deleteNote(ctx: PlatformCtx, input: unknown, now: Date = new Date()): Promise<void> {
  requireNotes(ctx);
  const v = parse(NoteIdInput, input);
  const row = await noteById(v.id);
  if (!row) throw new AuthRefusal("not_found");
  if (row.authorId !== ctx.user.id && ctx.role !== "super_admin") throw new AuthRefusal("forbidden", "console.notes.not_author");
  await updateNote(row, { deletedAt: now, pinned: false });
  await auditFrom(ctx, "platform.note.deleted", { storeId: row.storeId, target: row.id, meta: { by: row.authorId === ctx.user.id ? "author" : "super_admin" } });
}

/** Pin or unpin (any staff member with `stores.notes`; reversible, the console offers Undo). */
export async function pinNote(ctx: PlatformCtx, input: unknown): Promise<{ changed: boolean }> {
  requireNotes(ctx);
  const v = parse(PinNoteInput, input);
  const row = await noteById(v.id);
  if (!row) throw new AuthRefusal("not_found");
  if (row.pinned === v.pinned) return { changed: false };
  await updateNote(row, { pinned: v.pinned });
  await auditFrom(ctx, "platform.note.pinned", { storeId: row.storeId, target: row.id, meta: { pinned: v.pinned } });
  return { changed: true };
}

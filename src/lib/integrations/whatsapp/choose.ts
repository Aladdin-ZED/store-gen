/**
 * The template repository's rules, pure (P5 INTEGRATIONS; operations.md OPE-§2.5, §7.4, §22.2, OPE-§L "Templates",
 * OD24; AI-15): which stored row an agent gets, and what a save accepts. ./templates.server.ts applies them to the
 * `message_templates` rows of one store; the offline self test proves them without a database.
 *
 * Resolution (OPE-§2.5): the active row of (channel, kind, locale) for the order's page, else the active row for every
 * page, else the built-in. Only `active` rows are ever chosen: an AI draft (`status: "draft"`, `source: "ai"`) waits
 * in the editor's Suggested lane and an agent never sees it (AI-15 acceptance 3); an archived row is history.
 */
import { z } from "zod";
import { parseTemplate, TEMPLATE_SRC_MAX, type TemplateError } from "../template-lang";
import { isWaKind, TEMPLATE_LOCALES } from "./builtins";

/** The channels this repository serves; `call_script` rows are P4's (OPE-§7.2) and only count toward the cap. */
export const TEMPLATE_CHANNELS = ["whatsapp", "telegram"] as const;
export type TemplateChannel = (typeof TEMPLATE_CHANNELS)[number];

export const TEMPLATE_NAME_MAX = 80;
export const TEMPLATE_BODY_MAX = TEMPLATE_SRC_MAX;
/** rows per store, every channel counted (call scripts, drafts and archived rows included) */
export const TEMPLATES_PER_STORE = 100;

export interface TemplateRowLike {
  id: string;
  pageId: string | null;
  status: "draft" | "active" | "archived";
  source: "user" | "ai";
  position: number;
  updatedAt: Date;
}

const newestFirst = (a: TemplateRowLike, b: TemplateRowLike) => a.position - b.position || b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id);

/**
 * The row an agent gets among the rows of one (channel, kind, locale): the page's active row, else the store's active
 * row for every page; null → the built-in. Ties: the lowest `position`, then the newest.
 */
export function chooseTemplate<R extends TemplateRowLike>(rows: readonly R[], pageId: string | null | undefined): { row: R; source: "page" | "store" } | null {
  const active = rows.filter((r) => r.status === "active");
  const page = pageId ? active.filter((r) => r.pageId === pageId).sort(newestFirst)[0] : undefined;
  if (page) return { row: page, source: "page" };
  const store = active.filter((r) => r.pageId === null).sort(newestFirst)[0];
  return store ? { row: store, source: "store" } : null;
}

/** A kind: one of OPE-§22.2's for WhatsApp; Telegram's message kinds (OPE-§21.2) are free slugs. */
const Kind = z.string().regex(/^[a-z][a-z_]{0,39}$/);

export const TemplateInput = z
  .object({
    channel: z.enum(TEMPLATE_CHANNELS),
    kind: Kind,
    locale: z.enum(TEMPLATE_LOCALES),
    /** null = every page */
    pageId: z
      .string()
      .regex(/^[0-9A-Za-z]{26}$/)
      .nullable()
      .default(null),
    name: z.string().trim().min(1).max(TEMPLATE_NAME_MAX),
    body: z.string().max(TEMPLATE_BODY_MAX * 2),
    /** a quick reply (`custom`) to update in place; absent = a new quick reply (the other kinds are one slot each) */
    id: z
      .string()
      .regex(/^[0-9A-Za-z]{26}$/)
      .optional(),
  })
  .refine((t) => t.channel !== "whatsapp" || isWaKind(t.kind), { path: ["kind"], error: "Unknown WhatsApp template kind." });
export type TemplateInput = z.output<typeof TemplateInput>;

export type TemplateInputError = "invalid" | TemplateError;

/**
 * What a save accepts: the shape above, a non-empty body that parses (`parseTemplate`: known variables, balanced
 * braces and blocks) within 1,000 characters. `at` points into the body for the editor's caret.
 */
export function checkTemplateInput(raw: unknown): { ok: true; value: TemplateInput } | { ok: false; error: TemplateInputError; field: "channel" | "kind" | "locale" | "pageId" | "name" | "body"; at?: number } {
  const parsed = TemplateInput.safeParse(raw);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { ok: false, error: "invalid", field: field === "channel" || field === "kind" || field === "locale" || field === "pageId" || field === "name" ? field : "body" };
  }
  const body = parsed.data.body;
  if (!body.trim()) return { ok: false, error: "invalid", field: "body" };
  const p = parseTemplate(body, { max: TEMPLATE_BODY_MAX });
  if (!p.ok) return { ok: false, error: p.error, field: "body", at: p.at };
  return { ok: true, value: parsed.data };
}

/**
 * The inputs of P2's tenant server actions (P2 SHELL; platform.md PLA-§M.1, §L, §22.2, §22.7, §22.9-§22.11, §22.15;
 * docs/STORE-SAAS.md §E.2, §E.3 rule 4). Pure and isomorphic: the actions parse with these schemas, the screens use the
 * same caps, and `test:shell` proves the rules below without a database.
 *
 * - No store action input names a store (§E.3 rule 4): the store is the signed request path's (D2). Every object is
 *   `strict()`, so an extra `storeId` is refused rather than ignored. The one store id an input carries is
 *   `setLastStoreAction`'s picker hint, a `userAction` that checks it against the caller's own memberships.
 * - Money is integer minor units (cents); a compare-at price exists only when the owner typed one above the price
 *   (PD23: never a suggested price, never a "was" price below the real one).
 * - Phones are E.164 (`+2126…`); spaces, dashes, dots and brackets typed around the digits are dropped first.
 * - Free text is plain text: control characters dropped, runs of spaces folded, then capped (PLA-§L). A link the owner
 *   gives the review stays a string; nothing renders it as a link.
 * - A refused field answers `invalid` with one item per field and a catalog key as its message (`parseInput`), never a
 *   raw zod sentence.
 */
import { z } from "zod";
import { FieldsError } from "@/lib/auth/errors";
import type { MessageKey } from "@/lib/i18n/admin";
import { Archetype, ProductCategory } from "@/lib/page/schema";
import { ENTITLEMENTS, type EntitlementKey } from "@/lib/tenancy/entitlement-keys";
import { STORE_MODES } from "@/lib/tenancy/mode";

/* ------------------------------------------------------------------ */
/* caps (PLA-§L)                                                       */
/* ------------------------------------------------------------------ */

/** "What you sell" and the link of the review's business context. */
export const REVIEW_FIELD_MAX = 200;
/** The seller's answer to a staff question, and the one appeal. */
export const REVIEW_TEXT_MAX = 500;
/** A seller's private preview link lives 72 h (PLA-§22.7, core §E.2). */
export const PREVIEW_LINK_TTL_SEC = 72 * 3600;
/** At most this many active seller preview links per store (older ones are revoked first). */
export const PREVIEW_LINKS_ACTIVE_MAX = 10;
/** "Mark all read" and a selection mark at most this many rows per call (PLA-§18.1). */
export const MARK_READ_MAX = 200;
/** A Store Health issue is snoozed for exactly 7 days (PLA-§L). */
export const SNOOZE_DAYS = 7;
/** The legal documents one re-acceptance covers. */
export const LEGAL_DOCS_MAX = 10;
/** A store request's message to staff. */
export const REQUEST_MESSAGE_MAX = 500;
/** Onboarding: the product name, the one fact (OnboardingSchema's caps) and the photos. */
export const PRODUCT_NAME_MAX = 120;
export const FACT_MAX = 160;
export const ONBOARDING_PHOTOS_MAX = 5;
/** The largest price the onboarding takes: 1,000,000.00 in minor units (OnboardingSchema's bound). */
export const PRICE_MINOR_MAX = 100_000_000;
/** The store name (PLA-§22.10.1) and the legal name (the `store` key's). */
export const STORE_NAME_MAX = 120;
export const LEGAL_NAME_MAX = 160;

/* ------------------------------------------------------------------ */
/* field types                                                         */
/* ------------------------------------------------------------------ */

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** One line of plain text: control characters and line breaks dropped, spaces folded, trimmed. Pure. */
export function cleanLine(s: string): string {
  return s.replace(CONTROL, "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
}

/** A paragraph of plain text: line breaks kept (at most two in a row), other control characters dropped. Pure. */
export function cleanText(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A capped line; `min` 1 makes it required. The raw input may carry up to 4× the cap in spaces before cleaning. */
const line = (max: number, opts: { min?: number; tooLong?: MessageKey; empty?: MessageKey } = {}) =>
  z
    .string()
    .max(max * 4, { error: opts.tooLong ?? "error.invalid" })
    .transform(cleanLine)
    .pipe(
      z
        .string()
        .min(opts.min ?? 0, { error: opts.empty ?? "error.invalid" })
        .max(max, { error: opts.tooLong ?? "error.invalid" }),
    );

/** A capped paragraph (the answer, the appeal, a request message). */
const text = (max: number, opts: { min?: number; tooLong?: MessageKey; empty?: MessageKey } = {}) =>
  z
    .string()
    .max(max * 4, { error: opts.tooLong ?? "error.invalid" })
    .transform(cleanText)
    .pipe(
      z
        .string()
        .min(opts.min ?? 0, { error: opts.empty ?? "error.invalid" })
        .max(max, { error: opts.tooLong ?? "error.invalid" }),
    );

/** An optional line: absent, null or blank all mean "not given" (null). */
const optionalLine = (max: number, tooLong?: MessageKey) =>
  z
    .union([line(max, { tooLong }), z.null()])
    .optional()
    .transform((v) => (v ? v : null));

/** A field the form may leave out: absent stays `undefined` (untouched), blank or null is `null` (cleared). */
const clearableLine = (max: number) =>
  z
    .union([line(max), z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? v : null));

/** A ULID (`newId()`): pages, preview links, requests, legal documents, store ids. */
export const Id26 = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, { error: "error.invalid" });

/** The client's operation id of a step-up action: the re-run after the step-up sheet carries the same one. */
export const OpId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, { error: "error.invalid" });

/** E.164 (`+2126…`, 8 to 15 digits after the +), with the separators people type dropped first. */
export const E164 = z
  .string()
  .max(40, { error: "shell.field.e164" })
  .transform((v) => v.replace(/[\s(). -]/g, ""))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, { error: "shell.field.e164" }));

/** A media asset id of the store's library (the store check is `assertOwned`'s). */
const AssetId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, { error: "error.invalid" });

/** A Store Health issue id, "<track>:<rule>" (src/lib/health/types.ts). */
export const IssueId = z.string().regex(/^[a-z][a-z0-9_]{0,23}:[a-z0-9_]{1,64}$/, { error: "error.invalid" });

/** An IANA time zone this runtime knows ("Africa/Casablanca"). */
export const TimeZone = z
  .string()
  .max(40)
  .regex(/^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){0,2}$/, { error: "error.invalid" })
  .refine(isTimeZone, { error: "error.invalid" });

/** Pure: does `Intl` know this zone? */
export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Minor units: a whole number of cents, never a float (19.9 is refused, 1990 taken). */
const Minor = (min: number, key: MessageKey) =>
  z
    .number({ error: key })
    .int({ error: key })
    .min(min, { error: key })
    .max(PRICE_MINOR_MAX, { error: key });

const ENTITLEMENT_KEYS = Object.keys(ENTITLEMENTS) as [EntitlementKey, ...EntitlementKey[]];

/* ------------------------------------------------------------------ */
/* src/app/app/actions.ts (userAction)                                 */
/* ------------------------------------------------------------------ */

/** `setLastStoreAction(storeId)`: the picker hint, checked against the caller's own memberships. */
export const LastStoreInput = Id26;

/** `acceptLegalAction({ documentIds })`: the documents of the re-acceptance sheet (PLA-§22.15). */
export const AcceptLegalInput = z.object({ documentIds: z.array(Id26).min(1).max(LEGAL_DOCS_MAX) }).strict();

/* ------------------------------------------------------------------ */
/* review-actions.ts (PLA-§22.7, §3.5, §L)                             */
/* ------------------------------------------------------------------ */

/** "Submit for review": the optional business context (what you sell, a link kept as plain text, a WhatsApp number). */
export const SubmitReviewInput = z
  .object({
    sells: optionalLine(REVIEW_FIELD_MAX, "shell.review.context_hint"),
    link: optionalLine(REVIEW_FIELD_MAX, "shell.review.context_hint"),
    whatsapp: z
      .union([E164, z.literal(""), z.null()])
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .strict();

/** The seller's answer to the staff question (≤ 500). */
export const AnswerQuestionInput = z.object({ answer: text(REVIEW_TEXT_MAX, { min: 1, tooLong: "shell.review.answer_hint", empty: "error.invalid" }) }).strict();

/** The one appeal of a rejection (≤ 500). */
export const AppealInput = z.object({ message: text(REVIEW_TEXT_MAX, { min: 1, tooLong: "shell.review.answer_hint", empty: "error.invalid" }) }).strict();

/** "Share a private preview" of one page; "Revoke" one link. */
export const MintPreviewInput = z.object({ pageId: Id26 }).strict();
export const RevokePreviewInput = z.object({ tokenId: Id26 }).strict();

/* ------------------------------------------------------------------ */
/* health-actions.ts, notifications/actions.ts                         */
/* ------------------------------------------------------------------ */

export const SnoozeIssueInput = z.object({ issueId: IssueId }).strict();

/** "Mark all read", or the rows shown (≤ 200 positive ids). */
export const MarkReadInput = z.union([z.literal("all"), z.array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)).min(1).max(MARK_READ_MAX)]);

/* ------------------------------------------------------------------ */
/* welcome/actions.ts (PLA-§22.2)                                      */
/* ------------------------------------------------------------------ */

/**
 * The details step: the category tap (required, PD23), the product name, the typed price and, only when typed and
 * higher, the price before; one fact; the photos already uploaded to the store's library.
 */
export const OnboardingDetailsInput = z
  .object({
    category: ProductCategory,
    productName: line(PRODUCT_NAME_MAX, { min: 1, empty: "onboarding.name_required", tooLong: "error.invalid" }),
    priceMinor: Minor(1, "onboarding.price_required"),
    compareAtMinor: z
      .union([Minor(1, "onboarding.compare_invalid"), z.null()])
      .optional()
      .transform((v) => v ?? null),
    fact: optionalLine(FACT_MAX),
    assetIds: z.array(AssetId).max(ONBOARDING_PHOTOS_MAX, { error: "onboarding.photos.too_many" }).default([]),
  })
  .strict()
  .refine((v) => v.compareAtMinor === null || v.compareAtMinor > v.priceMinor, { error: "onboarding.compare_invalid", path: ["compareAtMinor"] });

/**
 * "Use this design": the reveal's directions as the browser built them (the generator is pure and runs there) and the
 * chosen one's key. The server checks every document, the typed price in it and the photos (welcome/actions.ts).
 */
export const UseDirectionInput = z
  .object({
    directionKey: Archetype,
    directions: z
      .array(z.object({ id: Archetype, label: line(40, { min: 1 }), doc: z.unknown() }).strict())
      .min(1)
      .max(3),
  })
  .strict()
  .refine((v) => v.directions.some((d) => d.id === v.directionKey), { error: "error.invalid", path: ["directionKey"] })
  .refine((v) => new Set(v.directions.map((d) => d.id)).size === v.directions.length, { error: "error.invalid", path: ["directions"] });

/** When the browser painted the reveal (clamped to the server's clock). */
export const ReportRevealInput = z.object({ paintedAt: z.iso.datetime({ offset: true }) }).strict();

/** The contact step: a WhatsApp number, or "use my number" (the signup phone). */
export const OnboardingContactInput = z.union([z.object({ whatsapp: E164 }).strict(), z.object({ useSignupPhone: z.literal(true) }).strict()]);

/* ------------------------------------------------------------------ */
/* settings (PLA-§22.10, §22.11)                                       */
/* ------------------------------------------------------------------ */

/**
 * Settings → General: the store's name, default language, category and time zone, and the legal name. A field left out
 * is left as it is (the page sends every field; a section of it may send fewer).
 */
export const GeneralInput = z
  .object({
    name: line(STORE_NAME_MAX, { min: 1, empty: "error.invalid" }).optional(),
    legalName: clearableLine(LEGAL_NAME_MAX),
    defaultLocale: z.enum(["ar", "fr", "en"]).optional(),
    category: z.union([ProductCategory, z.null()]).optional(),
    timezone: TimeZone.optional(),
  })
  .strict();

/** Settings → General → Mode (`store.mode`); "keep the sales pages on" is the plan's tick (core §A.2). */
export const StoreModeInput = z.object({ mode: z.enum(STORE_MODES), keepSalesPages: z.boolean().default(true) }).strict();

/** Settings → Address → Rename (the format, reserved and brand checks are `handleProblem`'s). */
export const RenameHandleInput = z.object({ handle: z.string().max(64).transform((v) => v.trim().toLowerCase()) }).strict();

/** Settings → Security → "Require two-step codes for every member". */
export const Require2faInput = z.object({ on: z.boolean() }).strict();

const requestMessage = z
  .union([text(REQUEST_MESSAGE_MAX), z.null()])
  .optional()
  .transform((v) => (v ? v : null));
const Count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** Settings → Plan, the limit sheet, the mode cards, the restricted banner: one request to staff (PLA-§3.7). R3's `domain` is not taken. */
export const StoreRequestInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("plan_change"), planId: z.string().regex(/^[a-z0-9_-]{1,32}$/, { error: "error.invalid" }), message: requestMessage }).strict(),
  z
    .object({
      kind: z.literal("limit_raise"),
      key: z.enum(ENTITLEMENT_KEYS),
      used: Count,
      limit: z.union([Count, z.null()]),
      asked: z.union([Count, z.null()]).optional().transform((v) => v ?? null),
      message: requestMessage,
    })
    .strict(),
  z.object({ kind: z.literal("mode_change"), mode: z.enum(["store", "both"]), message: requestMessage }).strict(),
  z.object({ kind: z.literal("go_live"), message: requestMessage }).strict(),
]);

export const WithdrawRequestInput = z.object({ requestId: Id26 }).strict();

/** Danger zone → Export (`store.export` ↑): the step-up sheet re-runs it with the same operation id. */
export const StoreExportInput = z.object({ opId: OpId.optional() }).strict();

/** Danger zone → Close (`store.close` ↑): the typed handle, and the operation id of the re-run. */
export const CloseStoreInput = z.object({ confirm: z.string().max(64), opId: OpId.optional() }).strict();

/* ------------------------------------------------------------------ */
/* the registry and the parser                                         */
/* ------------------------------------------------------------------ */

/** Every object input of a P2 store action by "<file>#<action>" (the selftest proves none takes a store id). */
export const STORE_ACTION_INPUTS = {
  "review-actions#submitForReviewAction": SubmitReviewInput,
  "review-actions#answerReviewQuestionAction": AnswerQuestionInput,
  "review-actions#submitAppealAction": AppealInput,
  "review-actions#mintPreviewLinkAction": MintPreviewInput,
  "review-actions#revokePreviewLinkAction": RevokePreviewInput,
  "health-actions#snoozeHealthIssueAction": SnoozeIssueInput,
  "health-actions#unsnoozeHealthIssueAction": SnoozeIssueInput,
  "notifications#markNotificationsReadAction": MarkReadInput,
  "welcome#saveOnboardingDetailsAction": OnboardingDetailsInput,
  "welcome#useDirectionAction": UseDirectionInput,
  "welcome#reportRevealAction": ReportRevealInput,
  "welcome#saveOnboardingContactAction": OnboardingContactInput,
  "settings/general#saveGeneralAction": GeneralInput,
  "settings/general#setStoreModeAction": StoreModeInput,
  "settings/address#renameHandleAction": RenameHandleInput,
  "settings/security#setRequireMember2faAction": Require2faInput,
  "settings/plan#createStoreRequestAction": StoreRequestInput,
  "settings/plan#withdrawStoreRequestAction": WithdrawRequestInput,
  "settings/danger#requestStoreExportAction": StoreExportInput,
  "settings/danger#closeOwnStoreAction": CloseStoreInput,
} as const satisfies Record<string, z.ZodType>;

/** The user actions' inputs (no store; `LastStoreInput` is the picker hint, never a store write). */
export const USER_ACTION_INPUTS = { "app#setLastStoreAction": LastStoreInput, "app#acceptLegalAction": AcceptLegalInput } as const satisfies Record<string, z.ZodType>;

const KEY_RE = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/;

/**
 * Parses an action input; a refusal throws `FieldsError` (the wrappers answer `invalid` with one item per field), each
 * field's message the first catalog key its schema names, else `error.invalid`. Never a zod sentence. Pure.
 */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const fields: Record<string, MessageKey> = {};
  for (const issue of r.error.issues) {
    const field = typeof issue.path[0] === "string" ? issue.path[0] : "form";
    if (!(field in fields)) fields[field] = KEY_RE.test(issue.message) ? (issue.message as MessageKey) : "error.invalid";
  }
  if (!Object.keys(fields).length) fields.form = "error.invalid";
  throw new FieldsError(fields);
}

/** The typed confirmation of a close: the store's handle, as shown (case and spaces around it ignored). Pure. */
export function handleTyped(typed: string, handle: string): boolean {
  return typed.trim().toLowerCase() === handle.toLowerCase();
}

/** PD23: the typed price, and the price before only when typed and higher (minor units). Pure. */
export function typedPrices(draft: { priceMinor: number | null; compareAtMinor: number | null }): { price: number; compareAt: number | null } | null {
  if (draft.priceMinor === null || !Number.isSafeInteger(draft.priceMinor) || draft.priceMinor < 1) return null;
  const compareAt = draft.compareAtMinor !== null && Number.isSafeInteger(draft.compareAtMinor) && draft.compareAtMinor > draft.priceMinor ? draft.compareAtMinor : null;
  return { price: draft.priceMinor, compareAt };
}

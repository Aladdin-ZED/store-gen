"use server";
/**
 * The onboarding wow flow's actions (P2 SHELL; platform.md PLA-§22.2 table, PD23, PD59, PD60, PD70; docs/STORE-SAAS.md
 * §A.2, D59). Every body is `return storeAction(…)` (lint L9); the store is the signed request path's (D2). The
 * `onboarding` store setting (PLA-§2.4) keeps the step and the draft, so a closed tab resumes where it was.
 *
 *   saveOnboardingDetailsAction   pages.write            the draft (category tap, name, the typed price in minor units,
 *                                                        the price before only when typed and higher, one fact, the
 *                                                        store's own photos); step reveal
 *   useDirectionAction            pages.write + ai.use   the chosen direction becomes the draft page: T4's
 *                                                        createPageFromDirections with the typed price only, then the
 *                                                        typed fact as the page's attested fact (P3's recordFacts);
 *                                                        never publishes; step contact
 *   reportRevealAction            store.read + owner     when the reveal painted, clamped to the server's clock, once
 *   saveOnboardingContactAction   settings.write         the store's WhatsApp (`store` key); step done
 *   skipOnboardingAction          store.read + owner     step skipped
 *
 * Honesty (PD23, owner rule 4): the page is created only from a typed price; every item of every direction must carry
 * exactly that price, and the price before only when the owner typed one above it, or the call is refused (the reveal
 * is generated again from the saved draft). Nothing here invents a stock, a rating, a review or a delivery promise.
 *
 * The store name is brand-checked when the page is created (PD70: the name the owner typed at sign-up or on
 * `/app/new` is checked before the first page carries it). A `store`-mode shop (seeded; R1 sells `landing` only, PD30)
 * gets "Also use sales pages" switched on before its first landing page exists, audited
 * `store.landing_settings.updated` with reason `onboarding`, so the draft is never hidden behind the store's 404
 * (core §A.2 rev 3). `store` and `both` need the category (`category_required`); the store row's category is written by
 * the core's store-row writer once it takes one (CCR r1-p2-4 §1), until then the draft's tap stands in.
 */
import { countStoreAssets } from "@/lib/admin-data/assets";
import { storeRowFacts } from "@/lib/admin-data/dashboard";
import { createPageFromDirections, slugify } from "@/lib/admin-data/pages";
import { revalidateStore } from "@/lib/admin-data/shell";
import { settingsActor } from "@/lib/admin-data/store-audit";
import { auditFrom } from "@/lib/audit";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { getOwnProfile } from "@/lib/auth/profile";
import { recordFacts } from "@/lib/landing/honesty/facts.server";
import { toCents } from "@/lib/page/money";
import type { PageDoc } from "@/lib/page/schema";
import { validateDoc } from "@/lib/page/validate";
import { getStoreSetting, updateStoreSetting } from "@/lib/settings";
import type { OnboardingSetting } from "@/lib/settings/keys/onboarding";
import { assertOwned } from "@/lib/tenancy/owned";
import { memberWriteScope, storeAction } from "@/lib/tenancy/seam";
import type { ActionResult, StoreCtx, WriteCtx } from "@/lib/tenancy/types";
import { collectAssetIds } from "@/landing/context";
import { brandGuard, guardReadKeyWrite, ownerOnly } from "@/components/admin/shell/action-guards";
import {
  E164,
  OnboardingContactInput,
  OnboardingDetailsInput,
  parseInput,
  ReportRevealInput,
  typedPrices,
  UseDirectionInput,
} from "@/components/admin/shell/action-inputs";

/** A generated document is ~30-60 KB of JSON (generate/actions.ts's cap). */
const MAX_DOC_CHARS = 400_000;
/** `revealMs` above an hour is not a first-run reveal (OnboardingSchema's bound): the time is kept, the duration not. */
const REVEAL_MS_MAX = 3_600_000;

type Step = OnboardingSetting["step"];
const BEFORE_REVEAL: ReadonlySet<Step> = new Set<Step>(["photos", "details"]);
const FINISHED: ReadonlySet<Step> = new Set<Step>(["done", "skipped"]);

/** The page address: the product name when it has Latin letters, else the category (generate/actions.ts's rule). */
const slugBase = (name: string, category: string) => (slugify(name) !== "page" ? name : category);

const onboardingOf = (ctx: StoreCtx) => getStoreSetting(ctx.scope, "onboarding", { fresh: true });

/** The welcome step's screens after a write (the step page itself and the dashboard that redirects to it). */
const refresh = (ctx: StoreCtx) => revalidateStore(ctx.store.handle, "/welcome", "");

export async function saveOnboardingDetailsAction(input: unknown): Promise<ActionResult<{ step: Step; draft: OnboardingSetting["draft"] }>> {
  return storeAction("pages.write", async (ctx) => {
    const v = parseInput(OnboardingDetailsInput, input);
    // the photos are the store's own (another store's asset id answers like a missing one, §E.3 rule 5)
    await assertOwned(ctx.scope, "asset", v.assetIds);
    const current = await onboardingOf(ctx);
    const saved = await updateStoreSetting(
      ctx.scope,
      "onboarding",
      {
        startedAt: current.startedAt ?? new Date().toISOString(),
        step: BEFORE_REVEAL.has(current.step) ? "reveal" : current.step,
        draft: { category: v.category, productName: v.productName, priceMinor: v.priceMinor, compareAtMinor: v.compareAtMinor, fact: v.fact, assetIds: [...new Set(v.assetIds)] },
      },
      settingsActor(ctx.actor),
    );
    refresh(ctx);
    return { step: saved.step, draft: saved.draft };
  });
}

/**
 * The directions as the browser built them, each validated (and repaired) like the generator's own save path, with
 * exactly the typed price: every item at the typed price, the price before only when typed and higher. A document
 * that says anything else is refused before anything is written.
 */
function checkedDirections(directions: readonly { id: string; label: string; doc: unknown }[], prices: { price: number; compareAt: number | null }): { id: string; label: string; doc: PageDoc }[] {
  const out: { id: string; label: string; doc: PageDoc }[] = [];
  for (const d of directions) {
    if (JSON.stringify(d.doc ?? null).length > MAX_DOC_CHARS) throw new FieldsError({ directions: "error.invalid" });
    const { doc } = validateDoc(d.doc);
    if (!doc || doc.theme.archetype !== d.id) throw new FieldsError({ directions: "error.invalid" });
    const priced = doc.items.every((it) => toCents(it.price) === prices.price && (prices.compareAt === null ? it.compareAt === undefined : it.compareAt !== undefined && toCents(it.compareAt) === prices.compareAt));
    if (!priced) throw new FieldsError({ directions: "onboarding.price_changed" });
    out.push({ id: d.id, label: d.label, doc });
  }
  return out;
}

export async function useDirectionAction(input: unknown): Promise<ActionResult<{ pageId: string; saved: "onboarding.reveal.saved" | "onboarding.reveal.saved_sales_page" }>> {
  return storeAction(["pages.write", "ai.use"], async (ctx) => {
    const v = parseInput(UseDirectionInput, input);
    const onboarding = await onboardingOf(ctx);
    const salesPage = ctx.store.mode === "store";
    const saved = salesPage ? ("onboarding.reveal.saved_sales_page" as const) : ("onboarding.reveal.saved" as const);
    // "Use this design" twice (a double tap, a second tab): the first page stands, no second draft
    if (onboarding.pageId) return { pageId: onboarding.pageId, saved };

    const { draft } = onboarding;
    if (!draft.productName) throw new FieldsError({ productName: "onboarding.name_required" });
    const prices = typedPrices(draft);
    if (!prices) throw new FieldsError({ priceMinor: "onboarding.price_required" });
    if (ctx.store.mode !== "landing" && !((await storeRowFacts(ctx.scope)).category ?? draft.category)) throw new AuthRefusal("category_required", "error.category_required");

    const docs = checkedDirections(v.directions, prices);
    const ids = [...new Set(docs.flatMap((d) => collectAssetIds(d.doc)))];
    if (ids.length && (await countStoreAssets(ctx.scope, ids)) < ids.length) throw new FieldsError({ directions: "onboarding.photos.missing" });
    await brandGuard(ctx, [["store_name", ctx.store.name]]);

    const actor = settingsActor(ctx.actor);
    // core §A.2 rev 3: a store-mode shop's first landing page is never hidden behind its 404 (set before the page exists)
    if (salesPage && !(await getStoreSetting(ctx.scope, "landing")).inStoreMode) {
      await updateStoreSetting(ctx.scope, "landing", { inStoreMode: true }, actor);
      await auditFrom(ctx, "store.landing_settings.updated", { target: "landing", meta: { inStoreMode: true, reason: "onboarding" } });
    }
    const chosen = docs.findIndex((d) => d.id === v.directionKey);
    const page = docs[chosen]!;
    const created = await createPageFromDirections(
      ctx.scope,
      { name: draft.productName, slugBase: slugBase(draft.productName, page.doc.product.category), chosen, directions: docs.map((d) => ({ label: d.label, doc: d.doc })) },
      ctx.actor,
    );
    // the gate judges the facts the owner gave (§M.1 rule 2): the one fact typed in Details
    await recordFacts(ctx.scope, created.id, draft.fact ? [draft.fact] : [], ctx.actor);
    await updateStoreSetting(ctx.scope, "onboarding", { pageId: created.id, firstKind: "landing", step: "contact" }, actor);
    revalidateStore(ctx.store.handle, "/pages", "/history", "/welcome", "");
    return { pageId: created.id, saved };
  });
}

export async function reportRevealAction(input: unknown): Promise<ActionResult<{ revealedAt: string; revealMs: number | null }>> {
  return storeAction("store.read", async (ctx) => {
    await guardReadKeyWrite(ctx, "reportRevealAction");
    ownerOnly(ctx);
    const { paintedAt } = parseInput(ReportRevealInput, input);
    const current = await onboardingOf(ctx);
    if (current.revealedAt) return { revealedAt: current.revealedAt, revealMs: current.revealMs };
    // the browser's clock is a hint: never later than now, never before the store existed
    const { createdAt } = await storeRowFacts(ctx.scope);
    const at = Math.max(createdAt.getTime(), Math.min(Date.parse(paintedAt), Date.now()));
    const ms = at - createdAt.getTime();
    const revealedAt = new Date(at).toISOString();
    const revealMs = ms <= REVEAL_MS_MAX ? ms : null;
    // once: under the row lock, a second report (another tab) keeps the first
    const saved = await updateStoreSetting(memberWriteScope(ctx), "onboarding", (cur) => (cur.revealedAt ? {} : { revealedAt, revealMs }), settingsActor(ctx.actor));
    return { revealedAt: saved.revealedAt ?? revealedAt, revealMs: saved.revealMs };
  });
}

/** The signup phone ("Use my number"): the account's own E.164 number, else the field asks for one. */
async function signupPhone(ctx: WriteCtx): Promise<string> {
  const { phone } = await getOwnProfile({ user: ctx.user, actor: ctx.actor });
  const parsed = E164.safeParse(phone ?? "");
  if (!parsed.success) throw new FieldsError({ whatsapp: "shell.field.e164" });
  return parsed.data;
}

export async function saveOnboardingContactAction(input: unknown): Promise<ActionResult<{ step: Step }>> {
  return storeAction("settings.write", async (ctx) => {
    const v = parseInput(OnboardingContactInput, input);
    const whatsapp = "whatsapp" in v ? v.whatsapp : await signupPhone(ctx);
    const actor = settingsActor(ctx.actor);
    // the store's contacts (`store` key, core): the pages' WhatsApp button and the order confirmations read it
    await updateStoreSetting(ctx.scope, "store", { whatsapp }, actor);
    const current = await onboardingOf(ctx);
    if (!FINISHED.has(current.step)) {
      await updateStoreSetting(ctx.scope, "onboarding", { step: "done", completedAt: new Date().toISOString() }, actor);
      await auditFrom(ctx, "store.onboarding.completed", { target: ctx.store.id, meta: { pageId: current.pageId, revealMs: current.revealMs } });
    }
    refresh(ctx);
    return { step: FINISHED.has(current.step) ? current.step : "done" };
  });
}

export async function skipOnboardingAction(): Promise<ActionResult<{ step: Step }>> {
  return storeAction("store.read", async (ctx) => {
    await guardReadKeyWrite(ctx, "skipOnboardingAction");
    ownerOnly(ctx);
    const current = await onboardingOf(ctx);
    if (FINISHED.has(current.step)) return { step: current.step };
    await updateStoreSetting(memberWriteScope(ctx), "onboarding", { step: "skipped" }, settingsActor(ctx.actor));
    await auditFrom(ctx, "store.onboarding.skipped", { target: ctx.store.id, meta: { from: current.step } });
    refresh(ctx);
    return { step: "skipped" };
  });
}

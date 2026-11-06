/**
 * Two-store attack cases of the platform track (P1 CONSOLE, platform.md PLA-§O.3 cases 1-20, the shell's included).
 * Extension file (docs/STORE-SAAS.md §F.1, §J.2, §K.3; DES-R13), loaded by scripts/qa/tenancy-check.ts
 * (`test:tenancy`). Case files import only types from the harness; the modules under test load inside `run`.
 *
 * Step 3 (the health engine): the read half of cases 8 and 9 on the snapshot API. Step 4: the tenant-callable review
 * and request functions of src/lib/platform/requests.ts. Step 5: legal re-acceptance. Step 7: the console actions and
 * route handlers (cases 2, 3, 4, 7, 8, 11, 17, 20 run now), the public report action (17), and the cases that need
 * another track's code: those load their module through a computed dynamic import and are listed "requires P2 / P3 /
 * P4" while it is absent, so they compile now and run at the merge gate and the R1 integration. Step 9: the queue's
 * pane read and the store form's live handle check (roles, hostile input, read only).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { StoreCtx } from "@/lib/tenancy/types";
import type { Outcome, RouteFile, TenancyCase, TenancyKit, Who } from "../tenancy-check";

/** A member's store context as `storeAction` builds it (the review functions take a ctx, not a session). */
async function memberCtx(k: TenancyKit, key: "A" | "B", role: "owner" | "viewer" = "owner", kind: "member" | "impersonation" = "member"): Promise<StoreCtx> {
  const { can } = await import("@/lib/auth/permissions");
  const userId = k.fx[key].members[role];
  return {
    user: { id: userId, email: `${role}@store-${key.toLowerCase()}.test`, name: role, totpEnabled: false, sessionId: `sess-${userId}`, platformRole: "none", locale: null, lastStoreId: k.fx[key].id },
    store: k.fx.rows[key],
    membership: { role, status: "active", ...(kind === "impersonation" ? { synthetic: "impersonation" } : {}) },
    scope: k.scope(key, kind),
    actor: { kind: kind === "impersonation" ? "impersonation" : "user", userId, impersonatorId: kind === "impersonation" ? k.fx.staff.id : null, ip: null },
    impersonation: kind === "impersonation" ? { id: "01JIMP00000000000000000001", storeId: k.fx[key].id, staffUserId: k.fx.staff.id, mode: "read", reason: "bug", expiresAt: new Date(Date.now() + 600_000) } : null,
    stepUpUntil: null,
    can: (p) => can(role, p),
  } as StoreCtx;
}

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (err: { code?: unknown }) => (typeof err?.code === "string" ? err.code : "threw"),
  );

/* ------------------------------------------------------------------ */
/* step 7 helpers                                                      */
/* ------------------------------------------------------------------ */

type StaffRole = "super_admin" | "admin" | "support" | "analyst";
type Result = { ok: boolean; error?: string; message?: string; data?: unknown };

/** One staff account per role (TOTP on, member of nothing), made once per run. */
const staffIds = new Map<StaffRole, string>();
async function staffUser(k: TenancyKit, role: StaffRole): Promise<string> {
  if (role === "super_admin") return k.fx.staff.id;
  const known = staffIds.get(role);
  if (known) return known;
  const { db } = await import("@/lib/db/client");
  const { users } = await import("@/lib/db/schema");
  const { newId } = await import("@/lib/db/ids");
  const id = newId();
  await db.insert(users).values({ id, email: `${role}.${id.slice(-6).toLowerCase()}@staff.test`, name: `Staff ${role}`, passwordHash: "tenancy-check:no-password", platformRole: role, totpEnabled: true });
  staffIds.set(role, id);
  return id;
}

/** A signed-in user who stepped up just now (or not, `stepUp: false`). */
const as = (userId: string, stepUp = true): Who => (stepUp ? { userId, stepUpAt: new Date() } : { userId });

/** The action's own answer: "ok", the ActionResult's error code, or "threw:<message>" when the call itself threw. */
function answer(o: Outcome<unknown>): string {
  if (!o.ok) return `threw:${o.error instanceof Error ? o.error.message.slice(0, 80) : String(o.error)}`;
  const r = o.value as Result;
  return r && typeof r === "object" && "ok" in r ? (r.ok ? "ok" : String(r.error)) : "ok";
}

/** A refusal before any body ran: the seam's neutral `not_found` (no platform role) or `forbidden` (the matrix). */
const refused = (code: string) => code === "not_found" || code === "forbidden";

/** Every "use server" file under src/app/admin/(console) and its exported actions, from the tree (CCR X-1). */
function consoleActionFiles(): { file: string; names: string[] }[] {
  const root = path.join(process.cwd(), "src", "app", "admin", "(console)");
  const out: { file: string; names: string[] }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name)) {
        const src = readFileSync(full, "utf8");
        if (!/^\s*(?:\/\/[^\n]*\n|\s)*["']use server["']/.test(src)) continue;
        const names = [...src.matchAll(/^export\s+async\s+function\s+([A-Za-z0-9_]+)/gm)].map((m) => m[1]!);
        out.push({ file: path.relative(process.cwd(), full).split(path.sep).join("/"), names });
      }
    }
  };
  walk(root);
  return out;
}

/** `src/app/x/y.ts` → the `@/app/x/y` specifier (a computed import: absent modules are listed, never a compile error). */
const specOf = (file: string) => `@/${file.replace(/^src\//, "").replace(/\.tsx?$/, "")}`;

async function optionalModule<T>(file: string): Promise<T | null> {
  try {
    statSync(path.join(process.cwd(), file));
  } catch {
    return null;
  }
  const spec = specOf(file);
  return (await import(spec)) as T;
}

type ActionModule = Record<string, (...args: unknown[]) => Promise<unknown>>;

/** A route file of the tree as the harness's `callRoute` takes it. */
function routeOf(file: string, template: string): RouteFile {
  return { file, template, methods: ["GET"] };
}

/** Row counts of every table with a store_id for one store, except the platform's own bookkeeping (notes, audit, notifications). */
async function tenantRows(storeId: string): Promise<Record<string, number>> {
  const { pool } = await import("@/lib/db/client");
  const SKIP = new Set(["platform_notes", "audit_log", "notifications", "store_health", "impersonation_sessions", "platform_usage"]);
  const [tables] = (await pool().query("SELECT TABLE_NAME AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'store_id' ORDER BY TABLE_NAME")) as unknown as [{ t: string }[]];
  const out: Record<string, number> = {};
  for (const { t } of tables) {
    if (SKIP.has(t)) continue;
    const [[row]] = (await pool().query(`SELECT COUNT(*) AS n FROM \`${t}\` WHERE store_id = ?`, [storeId])) as unknown as [[{ n: number }]];
    out[t] = Number(row?.n ?? 0);
  }
  return out;
}

/** A hostile argument naming A's records for any console action (the seam refuses before any field is read). */
function hostileInput(k: TenancyKit): Record<string, unknown> {
  const A = k.fx.A;
  return {
    storeId: A.id,
    storeIds: [A.id],
    reviewId: A.id,
    reviewIds: [A.id],
    userId: A.members.owner,
    id: A.page.live,
    ids: [A.page.live],
    orderId: A.order.main,
    requestId: A.id,
    inviteId: A.id,
    planId: "starter",
    key: "signups_enabled",
    value: false,
    to: "suspended",
    reason: "other",
    note: "attack",
    text: "attack",
    body: "attack",
    phone: A.customer.phone,
    typedHandle: A.handle,
    typedEmail: "owner@example.test",
    section: "brand",
    patch: { name: "Attack" },
    opId: "attack-op-0001",
  };
}

/* ------------------------------------------------------------------ */
/* the cases                                                           */
/* ------------------------------------------------------------------ */

export const cases: TenancyCase[] = [
  {
    name: "store_health: each store reads its own snapshot; tenants never get the console flags (PLA-§O.3 cases 8-9, read half)",
    async run(k) {
      const { computeStoreHealth } = await import("@/lib/health/run");
      const { getStoreHealth, markHealthDirty } = await import("@/lib/platform/health-snapshot");
      const { systemCtx } = await import("@/lib/jobs/scope");
      const job = systemCtx("platform.health");
      const a = await computeStoreHealth(job, k.fx.rows.A);
      const b = await computeStoreHealth(job, k.fx.rows.B);
      const before = await k.snapshotA();

      const fromB = await getStoreHealth(k.scope("B"));
      k.check("store_health: B's member reads B's own computed row", fromB !== null && fromB.score === b.score, fromB && { score: fromB.score, want: b.score });
      k.check("store_health: … without the console flags", fromB !== null && !("flags" in fromB));
      k.check("store_health: … with nothing of A", k.leaks(fromB).length === 0, k.leaks(fromB));
      const viewing = await getStoreHealth(k.scope("A", "impersonation"));
      k.check("store_health: staff viewing A read what A's members read (no flags)", viewing !== null && viewing.score === a.score && !("flags" in viewing));
      const staff = await getStoreHealth(k.scope("A", "platform"));
      k.check("store_health: the platform scope reads A's flags", staff !== null && Array.isArray(staff.flags));
      k.check("store_health: no customer data or secret inside A's own snapshot (case 8)", k.leaks(staff, { only: ["customer", "secret"] }).length === 0, k.leaks(staff, { only: ["customer", "secret"] }));
      await markHealthDirty(k.fx.B.id);
      await markHealthDirty(k.fx.ghostHandle);
      k.check("store_health: B's dirty mark (and a malformed id) leave A's rows unchanged", (await k.snapshotA()) === before);
    },
  },
  {
    name: "store requests and the review card: a member reaches only their own store's rows (PLA-§3.7, step 4)",
    async run(k) {
      const requests = await import("@/lib/platform/requests");
      const ownerA = await memberCtx(k, "A");
      const ownerB = await memberCtx(k, "B");
      const aRequest = await requests.createStoreRequest(ownerA, { kind: "go_live", message: null });
      const aId = "id" in aRequest ? aRequest.id : "";
      k.check("requests: A's owner files a request in A", aId.length === 26);
      const before = await k.snapshotA();

      k.check("requests: B's owner can't withdraw A's request (not_found)", (await codeOf(requests.withdrawStoreRequest(ownerB, aId))) === "not_found");
      k.check("requests: a ghost id is not_found too", (await codeOf(requests.withdrawStoreRequest(ownerB, "01JZZZZZZZZZZZZZZZZZZZZZZZ"))) === "not_found");
      const bRequest = await requests.createStoreRequest(ownerB, { kind: "go_live", message: null });
      k.check("requests: B's own request of the same kind is B's (one open per kind per store, not per platform)", "id" in bRequest);
      const listed = await requests.listStoreRequests(ownerB.scope);
      k.check("requests: B lists only its own rows", listed.length >= 1 && !listed.some((r) => r.id === aId) && k.leaks(listed).length === 0, k.leaks(listed));
      const card = await requests.getReviewCard(ownerB.scope);
      k.check("review card: B's card carries nothing of A", k.leaks(card).length === 0, k.leaks(card));
      k.check("review card: B's answer finds no question of A (not_found)", (await codeOf(requests.answerReviewQuestion(ownerB, "an answer"))) === "not_found");
      k.check("review card: B can't appeal (B isn't rejected, A's rows untouched)", (await codeOf(requests.submitAppeal(ownerB, "an appeal"))) === "forbidden");
      k.check("review card: B's viewer can't file a request (billing.manage)", (await codeOf(requests.createStoreRequest(await memberCtx(k, "B", "viewer"), { kind: "plan_change", planId: "pro", message: null }))) === "forbidden");
      const viewingA = await memberCtx(k, "A", "owner", "impersonation");
      k.check("requests: a read-only view of A writes nothing (impersonation_read_only)", (await codeOf(requests.createStoreRequest(viewingA, { kind: "plan_change", planId: "pro", message: null }))) === "impersonation_read_only");
      k.check("requests: A's rows are unchanged by every call of B and of the view", (await k.snapshotA()) === before);
    },
  },
  {
    name: "legal re-acceptance: a person records only their own acceptance of a document they are asked for (PLA-§13.4, §22.15, step 5)",
    async run(k) {
      const legal = await import("@/lib/platform/legal");
      const { db } = await import("@/lib/db/client");
      const { legalAcceptances, legalDocuments } = await import("@/lib/db/schema");
      const { newId } = await import("@/lib/db/ids");
      const { and, eq, inArray } = await import("drizzle-orm");
      const ownerA = await memberCtx(k, "A");
      const ownerB = await memberCtx(k, "B");
      // a published AUP asking everyone to accept again, in every locale the fixtures read (retired at the end)
      const docs = (["ar", "fr", "en"] as const).map((locale) => ({ id: newId(), locale }));
      await db.insert(legalDocuments).values(docs.map((d) => ({ id: d.id, kind: "aup" as const, locale: d.locale, version: 9_000, title: "AUP", body: "Rules.", summary: "Changed.", status: "published" as const, needsLegalReview: false, requiresReacceptance: true, effectiveAt: new Date(Date.now() - 60_000), publishedAt: new Date() })));
      const ids = docs.map((d) => d.id);
      try {
        const before = await k.snapshotA();
        const askedB = await legal.pendingReacceptance(ownerB.user.id);
        const askedId = askedB?.docs[0]?.id ?? "";
        k.check("legal: B's owner is asked for the published AUP", ids.includes(askedId), askedB);
        k.check("legal: a document B's owner isn't asked for → conflict", (await codeOf(legal.recordReacceptance(ownerB, [newId()], { ipHash: null, uaLabel: "Chrome" }))) === "conflict");
        k.check("legal: a malformed id → invalid", (await codeOf(legal.recordReacceptance(ownerB, ["../" + askedId], { ipHash: null, uaLabel: "Chrome" }))) === "invalid");
        await legal.recordReacceptance(ownerB, [askedId], { ipHash: "f".repeat(64), uaLabel: "Chrome on Android" });
        const rowsB = await db.select().from(legalAcceptances).where(inArray(legalAcceptances.documentId, ids));
        k.check("legal: one row, B's owner's, outside any store (never A's)", rowsB.length === 1 && rowsB[0]!.userId === ownerB.user.id && rowsB[0]!.storeId === null, rowsB);
        k.check("legal: B's owner isn't asked again; A's owner still is (per person)", (await legal.pendingReacceptance(ownerB.user.id)) === null && ids.includes((await legal.pendingReacceptance(ownerA.user.id))?.docs[0]?.id ?? ""));
        k.check("legal: recording it twice → conflict (no longer asked)", (await codeOf(legal.recordReacceptance(ownerB, [askedId], { ipHash: null, uaLabel: "Chrome" }))) === "conflict");
        k.check("legal: A's rows are unchanged by B's acceptance", (await k.snapshotA()) === before);
      } finally {
        await db.update(legalDocuments).set({ status: "retired" }).where(and(inArray(legalDocuments.id, ids), eq(legalDocuments.status, "published")));
      }
    },
  },

  /* ---------------- step 7: the console actions and routes ---------------- */

  {
    name: "PLA-§O.3 case 4: a tenant owner calling every exported console action → not_found / forbidden, nothing written",
    async run(k) {
      const files = consoleActionFiles();
      k.check("case 4: the console action files are derived from the tree (queue, stores, users, settings, security …)", files.length >= 11, files.map((f) => f.file));
      const before = await k.snapshotA();
      const ownerA = as(k.fx.A.members.owner);
      const input = hostileInput(k);
      let calls = 0;
      for (const { file, names } of files) {
        const mod = (await import(specOf(file))) as ActionModule;
        for (const name of names) {
          const fn = mod[name];
          if (typeof fn !== "function") {
            k.check(`case 4: ${file}#${name} is exported`, false);
            continue;
          }
          for (const path of ["/admin", `/app/${k.fx.A.handle}`]) {
            const o = await k.call(ownerA, path, () => fn(input));
            calls++;
            k.check(`case 4: ${file}#${name} from A's owner on ${path} → refused`, refused(answer(o)), answer(o));
          }
        }
      }
      k.check("case 4: every console action was called", calls >= 100, calls);
      k.check("case 4: A's rows are unchanged by every refused console call", (await k.snapshotA()) === before);
    },
  },
  {
    name: "PLA-§O.3 cases 2, 3, 11: analyst, support and tenant refusals of the notes, reveal, lookup, lifecycle and view-as actions",
    async run(k) {
      const storeActions = (await import(specOf("src/app/admin/(console)/stores/[id]/actions.ts"))) as ActionModule;
      const orderActions = (await import(specOf("src/app/admin/(console)/orders/actions.ts"))) as ActionModule;
      const analyst = as(await staffUser(k, "analyst"));
      const support = as(await staffUser(k, "support"));
      const A = k.fx.A;
      const before = await k.snapshotA();
      const run = (who: Who, fn: string, input: unknown, mod: ActionModule = storeActions) => k.call(who, "/admin", () => mod[fn]!(input)).then(answer);

      // case 2: analyst
      k.check("case 2: analyst · addNoteAction → forbidden", (await run(analyst, "addNoteAction", { storeId: A.id, body: "a note" })) === "forbidden");
      k.check("case 2: analyst · revealOrderPiiAction → forbidden", (await run(analyst, "revealOrderPiiAction", { storeId: A.id, orderId: A.order.main, reason: "ticket" })) === "forbidden");
      k.check("case 2: analyst · lookupPhoneAction → forbidden", (await run(analyst, "lookupPhoneAction", { phone: A.customer.phone }, orderActions)) === "forbidden");
      // step 11: a note on a person is a notes write too (stores.notes; never an analyst)
      const userActions = (await import(specOf("src/app/admin/(console)/users/actions.ts"))) as ActionModule;
      k.check("case 2: analyst · addUserNoteAction → forbidden", (await run(analyst, "addUserNoteAction", { userId: A.members.owner, body: "a note" }, userActions)) === "forbidden");
      k.check("case 2: analyst · banUserAction → forbidden", (await run(analyst, "banUserAction", { userId: A.members.owner, reason: "spam reports" }, userActions)) === "forbidden");
      // case 3: support
      const noTicket = await run(support, "startImpersonationAction", { storeId: A.id, reason: "ticket" });
      k.check("case 3: support · startImpersonationAction without ticketRef → refused (invalid)", noTicket === "invalid", noTicket);
      for (const fn of ["restrictStoreAction", "suspendStoreAction", "closeStoreAction", "scheduleDeletionAction", "requestPurgeAction", "setSuspendNoticeAction"]) {
        k.check(`case 3: support · ${fn} → forbidden`, (await run(support, fn, { storeId: A.id, reason: "other", note: "x", expectedFrom: "active", typedHandle: A.handle })) === "forbidden");
      }
      // case 11: the lifecycle preview and actions from a tenant owner and an analyst
      const ownerA = as(A.members.owner);
      for (const fn of ["lifecyclePreviewAction", "restrictStoreAction", "suspendStoreAction", "restoreStoreAction", "closeStoreAction", "reopenStoreAction", "scheduleDeletionAction", "cancelDeletionAction"]) {
        const input = { storeId: A.id, to: "suspended", reason: "other", note: "x", expectedFrom: "active", typedHandle: A.handle };
        k.check(`case 11: A's owner · ${fn} → not_found / forbidden`, refused(await run(ownerA, fn, input)));
        if (fn !== "lifecyclePreviewAction") k.check(`case 11: analyst · ${fn} → forbidden`, (await run(analyst, fn, input)) === "forbidden");
      }
      k.check("case 11: analyst · lifecyclePreviewAction is a read (console.read): answers, writes nothing", (await run(analyst, "lifecyclePreviewAction", { storeId: A.id, to: "suspended" })) === "ok");
      // step 10: the pages strip's Preview mints a staff link only for a page of the store it names
      k.check("step 10: A's owner · pagePreviewAction → refused", refused(await run(ownerA, "pagePreviewAction", { storeId: A.id, pageId: A.page.live })));
      k.check("step 10: staff · pagePreviewAction with B's id and A's page → not_found", (await run(analyst, "pagePreviewAction", { storeId: k.fx.B.id, pageId: A.page.live })) === "not_found");
      k.check("step 10: staff · pagePreviewAction with a malformed page id → not_found", (await run(analyst, "pagePreviewAction", { storeId: A.id, pageId: "../x" })) === "not_found");
      k.check("cases 2, 3, 11: A's rows are unchanged", (await k.snapshotA()) === before);
    },
  },
  {
    name: "PLA-§10.2 / §O.2 case 12: the impersonation note is the viewing staff member's, on the viewed store only",
    async run(k) {
      const storeActions = (await import(specOf("src/app/admin/(console)/stores/[id]/actions.ts"))) as ActionModule;
      const { db } = await import("@/lib/db/client");
      const { platformNotes } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");
      const A = k.fx.A;
      const admin = await staffUser(k, "admin");
      const note = { storeId: A.id, text: "Checked the order list with the owner" };
      k.check("note: A's owner (a tenant session) → refused by the seam", refused(answer(await k.call(as(A.members.owner), `/app/${A.handle}`, () => storeActions.addImpersonationNoteAction!(note)))));
      k.check("note: staff not viewing any store → not_found", answer(await k.call(as(admin), "/admin", () => storeActions.addImpersonationNoteAction!(note))) === "not_found");
      const started = await k.call(as(admin), "/admin", () => storeActions.startImpersonationAction!({ storeId: A.id, reason: "onboarding" }));
      k.check("view-as: an admin starts a read-only view of A (→ the /app/<h> URL)", answer(started) === "ok" && String((started.value as Result).data && ((started.value as Result).data as { url: string }).url).includes(A.handle), answer(started));
      k.check("note: the viewing staff member posting for B → not_found", answer(await k.call(as(admin), `/app/${A.handle}`, () => storeActions.addImpersonationNoteAction!({ storeId: k.fx.B.id, text: "wrong store" }))) === "not_found");
      const before = await tenantRows(A.id);
      const notesBefore = (await db.select({ id: platformNotes.id }).from(platformNotes).where(eq(platformNotes.storeId, A.id))).length;
      const wrote = await k.call(as(admin), `/app/${A.handle}`, () => storeActions.addImpersonationNoteAction!(note));
      const rows = await db.select({ id: platformNotes.id, authorId: platformNotes.authorId, kind: platformNotes.kind }).from(platformNotes).where(eq(platformNotes.storeId, A.id));
      k.check("note: the viewing staff member writes one platform_notes row of kind note, theirs", answer(wrote) === "ok" && rows.length === notesBefore + 1 && rows.some((r) => r.authorId === admin && r.kind === "note"), { answer: answer(wrote), rows: rows.length, notesBefore });
      const after = await tenantRows(A.id);
      k.check("note: no tenant table of A changed (row counts of every store table but the platform's own bookkeeping)", JSON.stringify(after) === JSON.stringify(before), { before, after });
      const ended = await k.call(as(admin), "/admin", () => storeActions.endImpersonationAction!());
      const to = ended.ok ? "" : String((ended.error as { digest?: string })?.digest ?? "");
      k.check("view-as: End redirects to the store's Activity tab", to.includes(`/admin/stores/${A.id}/activity`), to.slice(0, 120));
      k.check("note: after the end, a note → not_found", answer(await k.call(as(admin), `/app/${A.handle}`, () => storeActions.addImpersonationNoteAction!(note))) === "not_found");
    },
  },
  {
    name: "PLA-§O.3 case 7: the console media proxy, export and backup downloads refuse tampered, foreign and un-stepped-up links",
    async run(k) {
      const { exportPartSignature, EXPORT_LINK_TTL_MS } = await import("@/lib/platform/exports");
      const A = k.fx.A;
      const B = k.fx.B;
      const root = k.fx.staff.id;
      const other = await staffUser(k, "admin");
      const exportsRoute = routeOf("src/app/api/admin/stores/[id]/exports/[jobId]/[part]/route.ts", "/api/admin/stores/[id]/exports/[jobId]/[part]");
      const media = routeOf("src/app/api/admin/stores/[id]/media/[key]/route.ts", "/api/admin/stores/[id]/media/[key]");
      const backups = routeOf("src/app/api/admin/backups/[day]/route.ts", "/api/admin/backups/[day]");
      const status = (o: Outcome<{ status: number; body: string }>) => (o.ok ? o.value!.status : 500);
      const bodyOf = (o: Outcome<{ status: number; body: string }>) => (o.ok ? o.value!.body : String(o.error));
      const jobId = A.export.length === 26 ? A.export : "01JEXPORT0000000000000000A";
      const params = { id: A.id, jobId, part: "1" };
      const exp = String(Date.now() + EXPORT_LINK_TTL_MS - 60_000);
      const good = exportPartSignature(A.id, jobId, "1", Number(exp), root);
      const before = await k.snapshotA();

      const noStep = await k.callRoute(as(root, false), exportsRoute, "GET", params, { query: { e: exp, t: good } });
      k.check("export download: no fresh step-up → 403 step_up", status(noStep) === 403 && bodyOf(noStep).includes("step_up"), { status: status(noStep), body: bodyOf(noStep).slice(0, 120) });
      const tampered = await k.callRoute(as(root), exportsRoute, "GET", params, { query: { e: exp, t: good.replace(/^./, good[0] === "a" ? "b" : "a") } });
      k.check("export download: a tampered signature → the neutral 404", status(tampered) === 404, status(tampered));
      const foreign = await k.callRoute(as(root), exportsRoute, "GET", params, { query: { e: exp, t: exportPartSignature(A.id, jobId, "1", Number(exp), other) } });
      k.check("export download: another staff member's signature → 404", status(foreign) === 404, status(foreign));
      const otherStore = await k.callRoute(as(root), exportsRoute, "GET", { ...params, id: B.id }, { query: { e: exp, t: good } });
      k.check("export download: A's signature on B's path → 404", status(otherStore) === 404, status(otherStore));
      const tenant = await k.callRoute(as(A.members.owner), exportsRoute, "GET", params, { query: { e: exp, t: good } });
      k.check("export download: A's owner (a tenant session) → the neutral 404", status(tenant) === 404, status(tenant));

      const mediaKeyA = k.fx.canaries.ids.find((id) => id.startsWith(A.asset.photo) && id !== A.asset.photo) ?? `${A.asset.photo}.webp`;
      const onB = await k.callRoute(as(root), media, "GET", { id: B.id, key: mediaKeyA }, {});
      k.check("console media: A's key under B's id → 404", status(onB) === 404, status(onB));
      const ghost = await k.callRoute(as(root), media, "GET", { id: A.id, key: "01JZZZZZZZZZZZZZZZZZZZZZZZ.webp" }, {});
      k.check("console media: an unknown key → 404", status(ghost) === 404, status(ghost));
      const tenantMedia = await k.callRoute(as(A.members.owner), media, "GET", { id: A.id, key: mediaKeyA }, {});
      k.check("console media: A's owner → the neutral 404 (staff only)", status(tenantMedia) === 404, status(tenantMedia));

      const backupNoStep = await k.callRoute(as(root, false), backups, "GET", { day: "2026-10-27" }, {});
      k.check("backup download: no fresh step-up → 403 step_up", status(backupNoStep) === 403 && bodyOf(backupNoStep).includes("step_up"), status(backupNoStep));
      const support = await k.callRoute(as(await staffUser(k, "support")), backups, "GET", { day: "2026-10-27" }, {});
      k.check("backup download: support (no backups.manage) → refused", [403, 404].includes(status(support)), status(support));
      const unknownDay = await k.callRoute(as(root), backups, "GET", { day: "1999-01-01" }, {});
      k.check("backup download: a day without a backup → 404", status(unknownDay) === 404, status(unknownDay));
      k.check("case 7: A's rows are unchanged", (await k.snapshotA()) === before);
    },
  },
  {
    name: "PLA-§M.2: the console read routes (pulse ETag, search, CSVs) answer staff only, private, with nothing of a customer",
    async run(k) {
      const A = k.fx.A;
      const root = k.fx.staff.id;
      const analyst = await staffUser(k, "analyst");
      const pulse = routeOf("src/app/api/admin/pulse/route.ts", "/api/admin/pulse");
      const search = routeOf("src/app/api/admin/search/route.ts", "/api/admin/search");
      const storesCsv = routeOf("src/app/api/admin/stores.csv/route.ts", "/api/admin/stores.csv");
      const auditCsv = routeOf("src/app/api/admin/audit.csv/route.ts", "/api/admin/audit.csv");
      const status = (o: Outcome<{ status: number; body: string }>) => (o.ok ? o.value!.status : 500);
      const bodyOf = (o: Outcome<{ status: number; body: string }>) => (o.ok ? o.value!.body : String(o.error));

      const first = await k.callRoute(as(root), pulse, "GET", {}, {});
      k.check("pulse: staff → 200 with the ConsolePulse v 1", status(first) === 200 && bodyOf(first).includes('"v":1'), bodyOf(first).slice(0, 120));
      const tenantPulse = await k.callRoute(as(A.members.owner), pulse, "GET", {}, {});
      k.check("pulse: A's owner → the neutral 404", status(tenantPulse) === 404, status(tenantPulse));
      const { consolePulse } = await import("@/lib/platform/pulse");
      const { pulseEtag } = await import("@/lib/platform/pulse-rules");
      const etag = await k.call(as(root), "/admin", async () => {
        const { requirePlatform } = await import("@/lib/platform/seam");
        return pulseEtag(await consolePulse(await requirePlatform({ permission: "console.read", throwOnFail: true })));
      });
      const again = await k.callRoute(as(root), pulse, "GET", {}, {}, { headers: { "if-none-match": String(etag.value) } });
      k.check("pulse: the same body's ETag → 304", status(again) === 304, status(again));

      for (const who of [root, analyst]) {
        const found = await k.callRoute(as(who), search, "GET", {}, { query: { q: A.customer.name } });
        const leaked = k.leaks(bodyOf(found), { only: ["customer"], sent: A.customer.name });
        k.check(`search: ${who === root ? "super_admin" : "analyst"} searching a customer canary → 200, no customer canary in the JSON`, status(found) === 200 && leaked.length === 0, { status: status(found), leaked });
      }
      const tenantSearch = await k.callRoute(as(A.members.owner), search, "GET", {}, { query: { q: A.handle } });
      k.check("search: A's owner → the neutral 404", status(tenantSearch) === 404, status(tenantSearch));

      const csv = await k.callRoute(as(root), storesCsv, "GET", {}, {});
      k.check("stores.csv: admin rank → 200 text/csv, A listed, no customer canary, no seller e-mail", status(csv) === 200 && bodyOf(csv).includes(A.handle) && k.leaks(bodyOf(csv), { only: ["customer"] }).length === 0 && !/@/.test(bodyOf(csv)), { status: status(csv), leaked: k.leaks(bodyOf(csv), { only: ["customer"] }) });
      const analystCsv = await k.callRoute(as(analyst), storesCsv, "GET", {}, {});
      k.check("stores.csv: an analyst → 404 (admin rank only)", status(analystCsv) === 404, status(analystCsv));
      const audit = await k.callRoute(as(root), auditCsv, "GET", {}, {});
      k.check("audit.csv: super_admin → 200, no customer or secret canary", status(audit) === 200 && k.leaks(bodyOf(audit), { only: ["customer", "secret"] }).length === 0, { status: status(audit), leaked: k.leaks(bodyOf(audit), { only: ["customer", "secret"] }) });
      k.check("audit.csv: an analyst → refused", [403, 404].includes(status(await k.callRoute(as(analyst), auditCsv, "GET", {}, {}))));
    },
  },
  {
    name: "PLA-§4.5: a console write runs once per operation id; a repeat answers the first result",
    async run(k) {
      const storeActions = (await import(specOf("src/app/admin/(console)/stores/[id]/actions.ts"))) as ActionModule;
      const { db } = await import("@/lib/db/client");
      const { platformNotes } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");
      const admin = as(await staffUser(k, "admin"));
      const B = k.fx.B;
      const input = { storeId: B.id, body: "One decision, sent twice", opId: `op-${Date.now().toString(36)}-dup` };
      const count = async () => (await db.select({ id: platformNotes.id }).from(platformNotes).where(eq(platformNotes.storeId, B.id))).length;
      const before = await count();
      const one = await k.call(admin, "/admin", () => storeActions.addNoteAction!(input));
      const two = await k.call(admin, "/admin", () => storeActions.addNoteAction!(input));
      k.check("opId: the first send writes one note", answer(one) === "ok" && (await count()) === before + 1, answer(one));
      k.check("opId: the repeat answers the same result and writes nothing", answer(two) === "ok" && JSON.stringify(two.value) === JSON.stringify(one.value) && (await count()) === before + 1);
      const bad = await k.call(admin, "/admin", () => storeActions.addNoteAction!({ ...input, opId: "../x" }));
      k.check("opId: a malformed id → invalid", answer(bad) === "invalid", answer(bad));
      const failed = await k.call(admin, "/admin", () => storeActions.addNoteAction!({ storeId: B.id, body: "", opId: "op-retry-after-fix" }));
      const fixed = await k.call(admin, "/admin", () => storeActions.addNoteAction!({ storeId: B.id, body: "Fixed", opId: "op-retry-after-fix" }));
      k.check("opId: a refused first run gives the id back (the corrected sheet's resend writes)", answer(failed) === "invalid" && answer(fixed) === "ok", { failed: answer(failed), fixed: answer(fixed) });
    },
  },
  {
    name: "PLA-§O.3 case 8: health, notifications, review signals and job summaries written by the platform carry no customer canary",
    async run(k) {
      const { computeStoreHealth } = await import("@/lib/health/run");
      const { systemCtx } = await import("@/lib/jobs/scope");
      const { db } = await import("@/lib/db/client");
      const S = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");
      await computeStoreHealth(systemCtx("platform.health"), k.fx.rows.A);
      const health = await db.select().from(S.storeHealth).where(eq(S.storeHealth.storeId, k.fx.A.id));
      k.check("case 8: store_health (issues, evidence, text vars) carries no customer canary", k.leaks(health, { only: ["customer"] }).length === 0, k.leaks(health, { only: ["customer"] }));
      const notes = await db.select({ vars: S.notifications.vars, kind: S.notifications.kind }).from(S.notifications).limit(2_000);
      k.check("case 8: notifications.vars carry no customer canary", k.leaks(notes, { only: ["customer"] }).length === 0, k.leaks(notes, { only: ["customer"] }));
      const reviews = await db.select({ signals: S.signupReviews.signals }).from(S.signupReviews).limit(2_000);
      k.check("case 8: signup_reviews.signals carry no customer canary", k.leaks(reviews, { only: ["customer"] }).length === 0, k.leaks(reviews, { only: ["customer"] }));
      const jobs = await db.select({ summary: S.jobRuns.summary }).from(S.jobRuns).limit(2_000);
      k.check("case 8: job_runs.summary carries no customer canary", k.leaks(jobs, { only: ["customer"] }).length === 0, k.leaks(jobs, { only: ["customer"] }));
    },
  },
  {
    name: "PLA-§O.3 case 17: the public report answers the same thanks for any handle and keeps its details to abuse_reports",
    async run(k) {
      const mod = (await import(specOf("src/app/(public)/report/[handle]/actions.ts"))) as ActionModule;
      const { db } = await import("@/lib/db/client");
      const S = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");
      const A = k.fx.A;
      const anon: Who = { anonymous: true };
      const reports = async () => (await db.select({ id: S.abuseReports.id }).from(S.abuseReports)).length;
      const before = await reports();
      const ghost = await k.call(anon, `/report/${k.fx.ghostHandle}`, () => mod.reportStoreAction!({ handle: k.fx.ghostHandle, reason: "scam", details: "never delivered" }));
      k.check("case 17: an unknown handle → report.thanks, no row", answer(ghost) === "ok" && ((ghost.value as Result).data as { message?: string })?.message === "report.thanks" && (await reports()) === before, answer(ghost));
      const canary = A.customer.name;
      const real = await k.call(anon, `/report/${A.handle}`, () => mod.reportStoreAction!({ handle: A.handle, reason: "scam", details: `The seller sent ${canary} a fake parcel`, pagePath: "/argan?utm=x" }));
      const rows = await db.select().from(S.abuseReports).where(eq(S.abuseReports.storeId, A.id));
      k.check("case 17: a report on A → the same thanks, one row of A with the page path's query stripped", answer(real) === "ok" && rows.length === 1 && rows[0]!.pageUrl === "/argan", { answer: answer(real), rows: rows.map((r) => ({ path: r.pageUrl })) });
      k.check("case 17: the details stay in abuse_reports.details", rows[0]?.details?.includes(canary) === true);
      const notes = await db.select({ vars: S.notifications.vars }).from(S.notifications);
      const audits = await db.select({ meta: S.auditLog.meta }).from(S.auditLog);
      const health = await db.select().from(S.storeHealth).where(eq(S.storeHealth.storeId, A.id));
      k.check("case 17: no notification, audit meta or health row carries the details' canary", ![notes, audits, health].some((v) => JSON.stringify(v).includes(canary)));
      const invalid = await k.call(anon, `/report/${A.handle}`, () => mod.reportStoreAction!({ handle: A.handle, reason: "nope" }));
      k.check("case 17: an unknown reason → invalid, no row", answer(invalid) === "invalid" && (await db.select({ id: S.abuseReports.id }).from(S.abuseReports).where(eq(S.abuseReports.storeId, A.id))).length === 1, answer(invalid));
      const foreign = await k.call(anon, `/report/${A.handle}`, () => mod.reportStoreAction!({ handle: A.handle, reason: "scam" }), { headers: new Headers({ host: "localhost:3000", origin: "https://evil.example", "sec-fetch-site": "cross-site" }) });
      k.check("case 17: a cross-site post → refused", answer(foreign) === "forbidden", answer(foreign));
      k.notApplicable("case 17: a member of store A cannot read abuse_reports through any tenant route", "requires P2's tenant routes (no R1 tenant route reads abuse_reports; the harness's route suite covers the tree at the merge)");
    },
  },
  {
    name: "PLA-§O.3 case 20 (console half): deleteUserAction from a tenant; notification links never leave the platform",
    async run(k) {
      const users = (await import(specOf("src/app/admin/(console)/users/actions.ts"))) as ActionModule;
      const { notify } = await import("@/lib/platform/notify");
      const { db } = await import("@/lib/db/client");
      const S = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");
      const A = k.fx.A;
      const del = await k.call(as(A.members.owner), `/app/${A.handle}`, () => users.deleteUserAction!({ userId: A.members.viewer, reason: "attack", typedEmail: "x@example.test" }));
      k.check("case 20: deleteUserAction from A's owner → not_found", answer(del) === "not_found", answer(del));
      const typed = await k.call(as(k.fx.staff.id), "/admin", () => users.deleteUserAction!({ userId: k.fx.outsider, reason: "asked to be forgotten", typedEmail: "someone.else@example.test" }));
      k.check("case 20: deleteUserAction with the wrong typed e-mail → invalid, nothing changed", answer(typed) === "invalid" && (await db.select({ disabled: S.users.disabled }).from(S.users).where(eq(S.users.id, k.fx.outsider)))[0]?.disabled === false, answer(typed));
      for (const link of ["https://evil.example/x", "//evil.example"]) {
        const key = `tenancy-link-${link.length}`;
        await notify({ audience: "store_role", storeId: k.fx.B.id, roles: ["owner"] }, "plan.changed", { plan: "Pro" }, { link, dedupeKey: key });
        const [row] = await db.select({ link: S.notifications.link }).from(S.notifications).where(eq(S.notifications.dedupeKey, key)).limit(1);
        k.check(`case 20: a notification with link ${link} is stored with link NULL`, row !== undefined && row.link === null, row);
      }
      k.notApplicable("case 20: deleteMyAccountAction under impersonation; stepUpWithPasswordAction across sessions", "requires P2's account danger page (T2's functions are reached through it at the R1 integration)");
    },
  },

  {
    name: "step 9: the queue pane read and the store form's handle check answer only the roles they name, and read only",
    async run(k) {
      const queue = (await import(specOf("src/app/admin/(console)/queue/actions.ts"))) as ActionModule;
      const create = (await import(specOf("src/app/admin/(console)/stores/new/actions.ts"))) as ActionModule;
      const A = k.fx.A;
      const before = await k.snapshotA();
      const admin = as(await staffUser(k, "admin"));
      const analyst = as(await staffUser(k, "analyst"));
      const superAdmin = as(k.fx.staff.id);
      const handle = (who: Who, h: unknown) => k.call(who, "/admin", () => create.checkStoreHandleAction!({ handle: h }));
      for (const [label, who] of [["admin", admin], ["analyst", analyst], ["A's owner", as(A.members.owner)]] as const) {
        k.check(`step 9: checkStoreHandleAction by ${label} → refused (stores.create is the super admin's)`, refused(answer(await handle(who, A.handle))));
      }
      const taken = await handle(superAdmin, A.handle);
      const state = taken.ok ? ((taken.value as Result).data as { state?: string } | undefined)?.state : undefined;
      k.check("step 9: checkStoreHandleAction by the super admin names A's handle taken", answer(taken) === "ok" && state === "taken", { answer: answer(taken), state });
      const odd = await handle(superAdmin, { $ne: 1 });
      const oddState = odd.ok ? ((odd.value as Result).data as { state?: string } | undefined)?.state : undefined;
      k.check("step 9: checkStoreHandleAction with a non-string → the format answer, nothing else", answer(odd) === "ok" && oddState === "format", { answer: answer(odd), oddState });
      const pane = (who: Who, id: unknown) => k.call(who, "/admin", () => queue.loadReviewPaneAction!({ reviewId: id })).then(answer);
      k.check("step 9: loadReviewPaneAction from A's owner → refused", refused(await pane(as(A.members.owner), A.id)));
      k.check("step 9: loadReviewPaneAction with A's store id (not a review id) → not_found", (await pane(analyst, A.id)) === "not_found");
      k.check("step 9: loadReviewPaneAction with a malformed id → not_found", (await pane(admin, "../../x")) === "not_found");
      k.check("step 9: A's rows are unchanged by every read", (await k.snapshotA()) === before);
    },
  },

  /* ---------------- cases that need another track's code (run at the merge gate) ---------------- */

  {
    name: "PLA-§O.3 cases 5, 9, 19: the shell's store actions on another store's path (P2)",
    async run(k) {
      const A = k.fx.A;
      const ownerB = as(k.fx.B.members.owner);
      const review = await optionalModule<ActionModule>("src/app/app/[store]/review-actions.ts");
      const plan = await optionalModule<ActionModule>("src/app/app/[store]/settings/plan/actions.ts");
      const health = await optionalModule<ActionModule>("src/app/app/[store]/health-actions.ts");
      const before = await k.snapshotA();
      if (!review || !plan) k.notApplicable("case 5: createStoreRequestAction, submitForReviewAction, answerReviewQuestionAction, submitAppealAction from B on A's path", "requires P2 (review-actions.ts, settings/plan/actions.ts)");
      else {
        const onA = (fn: () => Promise<unknown>, p: string) => k.call(ownerB, `/app/${A.handle}${p}`, fn).then(answer);
        k.check("case 5: createStoreRequestAction from B on A's path → not_found", (await onA(() => plan.createStoreRequestAction!({ kind: "go_live", message: null }), "/settings/plan")) === "not_found");
        for (const fn of ["submitForReviewAction", "answerReviewQuestionAction", "submitAppealAction"]) {
          k.check(`case 5: ${fn} from B on A's path → not_found`, (await onA(() => review[fn]!({ text: "x", answer: "x", appeal: "x" }), "")) === "not_found");
        }
        k.check("case 5: an appeal of a store that is not rejected → refused", (await k.call(ownerB, `/app/${k.fx.B.handle}`, () => review.submitAppealAction!({ text: "please" })).then(answer)) !== "ok");
        for (const fn of ["mintPreviewLinkAction", "revokePreviewLinkAction"]) {
          if (typeof review[fn] !== "function") continue;
          k.check(`case 19: ${fn} with A's ids on B's path → not_found`, (await k.call(ownerB, `/app/${k.fx.B.handle}`, () => review[fn]!({ pageId: A.page.live, tokenId: A.page.live })).then(answer)) === "not_found");
        }
      }
      if (!health) k.notApplicable("case 9: snoozeHealthIssueAction / recomputeHealthAction across stores and the 6/h bucket", "requires P2 (health-actions.ts)");
      else {
        k.check("case 9: snoozeHealthIssueAction from B on A's path → not_found", (await k.call(ownerB, `/app/${A.handle}`, () => health.snoozeHealthIssueAction!({ issueId: "x" })).then(answer)) === "not_found");
        k.check("case 9: A's agent snoozing → forbidden", (await k.call(as(A.members.agent), `/app/${A.handle}`, () => health.snoozeHealthIssueAction!({ issueId: "x" })).then(answer)) === "forbidden");
        const answers: string[] = [];
        for (let i = 0; i < 7; i++) answers.push(await k.call(as(k.fx.B.members.owner), `/app/${k.fx.B.handle}`, () => health.recomputeHealthAction!()).then(answer));
        k.check("case 9: the 7th recompute in an hour → rate_limited", answers[6] === "rate_limited" && answers.slice(0, 6).every((a) => a === "ok"), answers);
      }
      k.check("cases 5, 9, 19: A's rows are unchanged", (await k.snapshotA()) === before);
    },
  },
  {
    name: "PLA-§O.3 cases 6, 10: the store pulse and search routes (P2)",
    async run(k) {
      const A = k.fx.A;
      const pulseFile = "src/app/api/app/[store]/pulse/route.ts";
      const searchFile = "src/app/api/app/[store]/search/route.ts";
      const present = await Promise.all([optionalModule(pulseFile), optionalModule(searchFile)]);
      if (!present[0] || !present[1]) {
        k.notApplicable("cases 6, 10: GET /api/app/<A>/pulse and /search with B's session; the impersonating staff member's pulse", "requires P2 (the store pulse and search routes)");
        return;
      }
      const pulse = routeOf(pulseFile, "/api/app/[store]/pulse");
      const search = routeOf(searchFile, "/api/app/[store]/search");
      const status = (o: Outcome<{ status: number; body: string }>) => (o.ok ? o.value!.status : 500);
      k.check("case 6/10: A's pulse with B's session → the neutral 404", status(await k.callRoute(as(k.fx.B.members.owner), pulse, "GET", { store: A.handle }, {})) === 404);
      k.check("case 6: A's search with B's session → the neutral 404", status(await k.callRoute(as(k.fx.B.members.owner), search, "GET", { store: A.handle }, { query: { q: A.order.main } })) === 404);
      const fromB = await k.callRoute(as(k.fx.B.members.owner), search, "GET", { store: k.fx.B.handle }, { query: { q: A.order.main } });
      k.check("case 6: A's order id searched from B → no result of A", k.leaks(fromB.ok ? fromB.value!.body : "").length === 0);
    },
  },
  {
    name: "PLA-§O.3 cases 1, 12, 15, 16, 18: page payloads under staff and impersonation (P1 pages, P2, P3, P4)",
    async run(k) {
      const consolePages = (() => {
        try {
          const dir = path.join(process.cwd(), "src", "app", "admin", "(console)");
          const out: string[] = [];
          const walk = (d: string) => {
            for (const n of readdirSync(d)) {
              const f = path.join(d, n);
              if (statSync(f).isDirectory()) walk(f);
              else if (n === "page.tsx") out.push(f);
            }
          };
          walk(dir);
          return out;
        } catch {
          return [];
        }
      })();
      if (!consolePages.length) k.notApplicable("case 1: the console routes' HTML and RSC payload for support and analyst", "requires the console pages (P1 steps 8-12)");
      else k.notApplicable("case 1: the console routes' HTML and RSC payload for support and analyst", "the console pages render through the console layout; the payload scan runs in qa:console-e2e (P1 step 13) and at the merge");
      k.notApplicable("case 12: the address card's test-order slot and P3's mintTestLink", "requires P3 (mintTestLink) and P2 (AddressCard)");
      k.notApplicable("case 15: tenant routes under an impersonating session carry no customer canary", "requires P4 (maskIfImpersonation at the repositories) and P2 (the tenant pages)");
      k.notApplicable("case 16: settings/audit of A with B's session; the impersonation row names the staff member", "requires P2 (settings/audit page)");
      k.notApplicable("case 18: the __Host-sgl locale cookie and updateProfileAction", "requires P2 (the (public) layout and the account profile action)");
      k.notApplicable("cases 13, 14: 60 approval signups past the daily cap; the shared pending-media budget on upload", "requires T2's signup at the R1 integration and P8's upload accounting (the console's meters are platform-check case 13)");
    },
  },
];

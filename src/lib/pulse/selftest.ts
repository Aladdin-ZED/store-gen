/**
 * The pulse's pure self-test (platform.md PLA-§O.1 `test:pulse`; docs/STORE-SAAS.md §I.4, D57; SF-06):
 *   npm run test:pulse        (tsx src/lib/pulse/selftest.ts; offline, no DB, a fake clock and a fake channel)
 *
 * The `StorePulse` shape; the ETag stable on identical payloads, changed by any field and blind to `at`; the
 * contributor budget (a 60 ms contributor dropped, its keys omitted) and failure isolation; per-user parts never
 * cached across users (two viewers, two bodies); the poller election (one leader, re-election after 40 s of silence,
 * solo polling without a channel, pause while hidden and an immediate poll on return); `since` clamping.
 * Step p2-04 (the route's pure path): the 304 branch and its headers, the per-user split as the route builds it, the
 * viewer's own impersonation, the reader's role, the tenants' kill switches, and the shell contributor on fake sources
 * (role filter, per-store cache, the unread cap). Exits 1 on any failure.
 */
import {
  buildPulse,
  canonicalJson,
  clampSince,
  composePulse,
  etagMatches,
  impersonationOf,
  pulseAnswer,
  pulseEtag,
  pulseHeaders,
  readerRoleOf,
  runContributors,
  STORE_PART_KEY,
  TENANT_KILLS,
  tenantKills,
  type PulseStorePart,
  type PulseUserPart,
} from "@/app/api/app/[store]/pulse/compose";
import {
  createPulseElection,
  stopPulsePollers,
  type PollResult,
  type PulseChannel,
  type PulseClock,
  type PulseElection,
  type PulseMessage,
} from "@/components/admin/shell/pulse-election";
import { KILL_SWITCHES } from "@/lib/flags/registry";
import type { StoreScope } from "@/lib/tenancy/types";
import { shellContributor, shellUnreadReader, type ShellPulseSources } from "./contributors/shell";
import { PULSE_CONTRIBUTORS } from "./registry";
import type { PulseContributor, StorePulse } from "./types";

let failures = 0;
let passed = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) passed++;
  else {
    failures++;
    console.error(`FAIL ${name}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`);
  }
}

const scopeOf = (storeId: string) => ({ storeId, kind: "member" }) as unknown as StoreScope;
const scopeOf2 = (storeId: string, kind: StoreScope["kind"]) => ({ storeId, kind }) as unknown as StoreScope;
const SCOPE = scopeOf("s-atlas");
const OWNER = { userId: "u-owner", role: "owner" };
const AGENT = { userId: "u-agent", role: "agent" };
const NOW = new Date("2026-10-28T10:00:00.000Z");

const STORE_PART: PulseStorePart = {
  build: "abc1234",
  store: { status: "active", statusReason: null, review: "approved" },
  kill: [],
  health: { score: 82, attention: 0, computedAt: "2026-10-28T09:58:00.000Z" },
};
const USER_PART: PulseUserPart = { unread: 3, impersonation: null, reaccept: false, jobs: { running: 0, done: [] } };

async function main() {
  /* ---- the StorePulse shape ---- */
  const body = composePulse(STORE_PART, USER_PART, { newOrders: 2 }, NOW);
  const KEYS = ["at", "build", "counts", "health", "impersonation", "jobs", "kill", "reaccept", "store", "unread", "v"];
  check("the body has exactly the frozen keys", Object.keys(body).sort().join() === KEYS.join(), Object.keys(body));
  check("v is 1 and at is the compose time", body.v === 1 && body.at === NOW.toISOString());
  check("store has status, statusReason, review", Object.keys(body.store).sort().join() === "review,status,statusReason");
  check("health has score, attention, computedAt", body.health !== null && Object.keys(body.health).sort().join() === "attention,computedAt,score");
  check("jobs has running and done", Object.keys(body.jobs).sort().join() === "done,running");
  check("counts carry the contributors' keys", body.counts.newOrders === 2);
  check("a null health stays null (computing, never a made-up score)", composePulse({ ...STORE_PART, health: null }, USER_PART, {}, NOW).health === null);
  check("composing never mutates the cached store part", composePulse(STORE_PART, USER_PART, {}, NOW).store !== STORE_PART.store);
  check("the body is JSON-safe", JSON.stringify(JSON.parse(JSON.stringify(body))) === JSON.stringify(body));

  /* ---- ETag ---- */
  const etag = pulseEtag(body);
  check("the ETag is a quoted strong tag", /^"[A-Za-z0-9_-]{43}"$/.test(etag), etag);
  check("identical payloads, identical ETag", pulseEtag(composePulse(STORE_PART, USER_PART, { newOrders: 2 }, NOW)) === etag);
  check("`at` is not hashed (a new compose of the same data gets a 304)", pulseEtag(composePulse(STORE_PART, USER_PART, { newOrders: 2 }, new Date(NOW.getTime() + 15_000))) === etag);
  check("key order does not change the ETag", pulseEtag({ ...body, counts: { b: 1, a: 2 } }) === pulseEtag({ ...body, counts: { a: 2, b: 1 } }));
  check("kill order does not change the ETag", pulseEtag(composePulse({ ...STORE_PART, kill: ["uploads_enabled", "capi_enabled"] }, USER_PART, {}, NOW)) === pulseEtag(composePulse({ ...STORE_PART, kill: ["capi_enabled", "uploads_enabled"] }, USER_PART, {}, NOW)));
  const variants: [string, StorePulse][] = [
    ["build", { ...body, build: "def5678" }],
    ["unread", { ...body, unread: 4 }],
    ["store.status", { ...body, store: { ...body.store, status: "restricted" } }],
    ["store.statusReason", { ...body, store: { ...body.store, statusReason: "chargebacks" } }],
    ["store.review", { ...body, store: { ...body.store, review: "needs_info" } }],
    ["kill", { ...body, kill: ["uploads_enabled"] }],
    ["impersonation", { ...body, impersonation: { endsAt: "2026-10-28T10:30:00.000Z" } }],
    ["reaccept", { ...body, reaccept: true }],
    ["health.score", { ...body, health: { ...body.health!, score: 83 } }],
    ["health.attention", { ...body, health: { ...body.health!, attention: 1 } }],
    ["health.computedAt", { ...body, health: { ...body.health!, computedAt: "2026-10-28T09:59:00.000Z" } }],
    ["health null", { ...body, health: null }],
    ["jobs.running", { ...body, jobs: { running: 1, done: [] } }],
    ["jobs.done", { ...body, jobs: { running: 0, done: ["j1"] } }],
    ["counts value", { ...body, counts: { newOrders: 3 } }],
    ["counts key", { ...body, counts: { newOrders: 2, leadsDue: 0 } }],
  ];
  for (const [field, v] of variants) check(`a change of ${field} changes the ETag`, pulseEtag(v) !== etag);
  check("If-None-Match: exact, weak, in a list, and *", etagMatches(etag, etag) && etagMatches(`W/${etag}`, etag) && etagMatches(`"x", ${etag}`, etag) && etagMatches("*", etag));
  check("If-None-Match: absent or another tag does not match", !etagMatches(null, etag) && !etagMatches('"other"', etag) && !etagMatches("", etag));
  check("canonical JSON sorts keys at every depth", canonicalJson({ b: { d: 1, c: 2 }, a: [3, { f: 1, e: 2 }] }) === '{"a":[3,{"e":2,"f":1}],"b":{"c":2,"d":1}}');

  /* ---- contributors: budget and failure isolation ---- */
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const fast: PulseContributor = { id: "fast", contribute: async () => ({ newOrders: 2, queueNow: 5 }) };
  let slowDone = false;
  const slow: PulseContributor = {
    id: "slow",
    contribute: async () => {
      await wait(60);
      slowDone = true;
      return { leadsDue: 4 };
    },
  };
  const throws: PulseContributor = {
    id: "throws",
    contribute: async () => {
      throw new Error("db down");
    },
  };
  const throwsSync: PulseContributor = {
    id: "sync",
    contribute: () => {
      throw new Error("sync");
    },
  };
  const junk: PulseContributor = { id: "junk", contribute: async () => ({ ok: 1, neg: -1, frac: 1.5, nan: Number.NaN, str: "7" as unknown as number }) };
  const dup: PulseContributor = { id: "dup", contribute: async () => ({ newOrders: 99, dupOnly: 1 }) };
  const run = await runContributors([fast, slow, throws, throwsSync, junk, dup], SCOPE, OWNER, 50);
  const answeredBeforeSlow = !slowDone;
  check("the 60 ms contributor is dropped with its keys omitted", !("leadsDue" in run.counts) && run.failures.some((f) => f.id === "slow" && f.reason === "timeout"), run);
  check("the run answers at the budget, before the slow contributor finishes", answeredBeforeSlow);
  check("a throwing contributor is isolated", run.failures.some((f) => f.id === "throws" && f.reason === "error") && run.counts.newOrders === 2 && run.counts.queueNow === 5);
  check("a synchronous throw is one failure too", run.failures.some((f) => f.id === "sync" && f.reason === "error"));
  check("only non-negative integer counts are kept (never coerced)", run.counts.ok === 1 && !("neg" in run.counts) && !("frac" in run.counts) && !("nan" in run.counts) && !("str" in run.counts));
  check("the first contributor keeps a repeated key", run.counts.newOrders === 2 && run.counts.dupOnly === 1);
  check("failures name only the failed contributors", run.failures.map((f) => f.id).sort().join() === "slow,sync,throws");
  check("the registered contributors have unique ids and a contribute function", new Set(PULSE_CONTRIBUTORS.map((c) => c.id)).size === PULSE_CONTRIBUTORS.length && PULSE_CONTRIBUTORS.every((c) => typeof c.contribute === "function"));
  // the shell's own reads the database (its readers are wired by the server loader, not here); the others are P0 stubs
  const stubs = PULSE_CONTRIBUTORS.filter((c) => c.id !== "shell");
  const registered = await runContributors(stubs, SCOPE, OWNER);
  check("the stub contributors answer within budget and give no key", registered.failures.length === 0 && Object.keys(registered.counts).length === 0, registered);
  const offline = await runContributors(PULSE_CONTRIBUTORS, SCOPE, OWNER);
  check("offline, the shell contributor's failure is its own (no other key lost, no throw)", offline.failures.every((f) => f.id === "shell") && !("membersPendingInvites" in offline.counts), offline.failures);

  /* ---- per-user parts are never cached across users ---- */
  const cacheStore = new Map<string, PulseStorePart>();
  let storeLoads = 0;
  const cache = {
    async getOrLoad(storeId: string, key: string, load: () => Promise<PulseStorePart>) {
      const k = `${storeId}\u0000${key}`;
      const hit = cacheStore.get(k);
      if (hit) return hit;
      const v = await load();
      cacheStore.set(k, v);
      return v;
    },
  };
  const perUser: Record<string, PulseUserPart> = {
    [OWNER.userId]: { unread: 7, impersonation: null, reaccept: true, jobs: { running: 1, done: ["j-owner"] } },
    [AGENT.userId]: { unread: 0, impersonation: null, reaccept: false, jobs: { running: 0, done: [] } },
  };
  const counter: PulseContributor = { id: "per-user", contribute: async (_s, v) => ({ dueCallbacks: v.userId === OWNER.userId ? 4 : 1 }) };
  const answer = (viewer: { userId: string; role: string }) =>
    buildPulse({
      scope: SCOPE,
      viewer,
      cache,
      loadStorePart: async () => {
        storeLoads++;
        return STORE_PART;
      },
      loadUserPart: async () => perUser[viewer.userId]!,
      contributors: [counter],
      now: NOW,
    });
  const a = await answer(OWNER);
  const b = await answer(AGENT);
  check("the store part is loaded once for both viewers", storeLoads === 1, storeLoads);
  check("two viewers get two bodies", a.etag !== b.etag && JSON.stringify(a.body) !== JSON.stringify(b.body));
  check("each viewer gets their own unread, reaccept and jobs", a.body.unread === 7 && b.body.unread === 0 && a.body.reaccept && !b.body.reaccept && a.body.jobs.done[0] === "j-owner" && b.body.jobs.done.length === 0);
  check("contributor counts are per viewer", a.body.counts.dueCallbacks === 4 && b.body.counts.dueCallbacks === 1);
  const a2 = await answer(OWNER);
  check("the owner's second poll repeats the owner's ETag", a2.etag === a.etag);
  check("the cache never holds a per-user field", [...cacheStore.values()].every((v) => !("unread" in v) && !("jobs" in v) && !("reaccept" in v) && !("impersonation" in v)));

  /* ---- since clamping ---- */
  const back = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
  check("since within the window is kept", clampSince(back(60_000), NOW).toISOString() === back(60_000));
  check("since older than 10 min is clamped to now − 10 min", clampSince(back(3_600_000), NOW).toISOString() === back(600_000));
  check("since in the future is clamped to now", clampSince(new Date(NOW.getTime() + 60_000).toISOString(), NOW).toISOString() === NOW.toISOString());
  check("absent since gives now − 30 s", clampSince(null, NOW).toISOString() === back(30_000) && clampSince(undefined, NOW).toISOString() === back(30_000));
  check("invalid since gives now − 30 s", ["", "yesterday", "2026-13-45", "x".repeat(200)].every((r) => clampSince(r, NOW).toISOString() === back(30_000)));

  await routeChecks();
  await shellContributorChecks();
  await electionChecks();

  console.log(`test:pulse ${failures === 0 ? "ok" : "FAILED"}: ${passed} passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
}

/* ---------------------------------------------------------------- the route's pure path */

async function routeChecks(): Promise<void> {
  const body = composePulse(STORE_PART, USER_PART, { newOrders: 2 }, NOW);
  const etag = pulseEtag(body);
  const fresh = pulseAnswer({ body, etag }, null);
  check("no If-None-Match: 200 with the body and its ETag", fresh.status === 200 && fresh.body === body && fresh.etag === etag);
  const same = pulseAnswer({ body, etag }, etag);
  check("If-None-Match naming the ETag: 304 without a body", same.status === 304 && same.body === null && same.etag === etag);
  check("a weak or listed tag also gets the 304", pulseAnswer({ body, etag }, `"old", W/${etag}`).status === 304);
  check("another tag gets the 200", pulseAnswer({ body, etag }, '"old"').status === 200);
  // the poller sends back the ETag of its last 200: the next poll of unchanged data is a 304, even with a new `at`
  const later = composePulse(STORE_PART, USER_PART, { newOrders: 2 }, new Date(NOW.getTime() + 15_000));
  check("an unchanged pulse 15 s later answers 304 to the last ETag", pulseAnswer({ body: later, etag: pulseEtag(later) }, fresh.etag).status === 304);
  const moved = composePulse(STORE_PART, USER_PART, { newOrders: 3 }, new Date(NOW.getTime() + 15_000));
  check("a changed count answers 200 to the last ETag", pulseAnswer({ body: moved, etag: pulseEtag(moved) }, fresh.etag).status === 200);
  const h = pulseHeaders(etag);
  check("both answers are private, no-store and carry the ETag", h["Cache-Control"] === "private, no-store" && h.ETag === etag && Object.keys(h).sort().join() === "Cache-Control,ETag");

  // the per-user split, as the route builds it: one cached store part, the user part per viewer
  const parts = new Map<string, PulseStorePart>();
  let loads = 0;
  const cache = {
    async getOrLoad(storeId: string, key: string, load: () => Promise<PulseStorePart>) {
      check("the store part is cached under the store and the M.5 key", key === STORE_PART_KEY && storeId === SCOPE.storeId, { storeId, key });
      const hit = parts.get(`${storeId}:${key}`);
      if (hit) return hit;
      loads++;
      const v = await load();
      parts.set(`${storeId}:${key}`, v);
      return v;
    },
  };
  const viewerBody = (userId: string, unread: number) =>
    buildPulse({
      scope: SCOPE,
      viewer: { userId, role: "owner" },
      cache,
      loadStorePart: async () => STORE_PART,
      loadUserPart: async () => ({ ...USER_PART, unread }),
      contributors: [],
      now: NOW,
    });
  const u1 = await viewerBody("u-1", 5);
  const u2 = await viewerBody("u-2", 0);
  check("two viewers share one store-part load and get their own unread", loads === 1 && u1.body.unread === 5 && u2.body.unread === 0 && u1.etag !== u2.etag);
  check("one viewer's ETag never answers 304 to another's", pulseAnswer(u2, u1.etag).status === 200);

  // impersonation: the countdown is the viewer's own session, never another staff member's or another store's
  const info = { staffUserId: "u-staff", storeId: "s-atlas", expiresAt: new Date("2026-10-28T10:30:00.000Z") };
  check("the impersonating staff member gets endsAt", impersonationOf({ userId: "u-staff", storeId: "s-atlas" }, info)?.endsAt === "2026-10-28T10:30:00.000Z");
  check("a member of the store gets null", impersonationOf({ userId: "u-owner", storeId: "s-atlas" }, info) === null);
  check("the same staff member on another store gets null", impersonationOf({ userId: "u-staff", storeId: "s-berber" }, info) === null);
  check("no impersonation, null", impersonationOf({ userId: "u-staff", storeId: "s-atlas" }, null) === null);
  check("a member reads by their role; staff viewing a store read only their own rows", readerRoleOf({ role: "manager" }) === "manager" && readerRoleOf({ role: "viewer", synthetic: "impersonation" }) === null);

  // kill switches: the tenants' set (sign-ups affect no existing store)
  check("every kill switch but sign-ups is a tenant's", [...TENANT_KILLS].sort().join() === KILL_SWITCHES.filter((k) => k !== "signups_enabled").sort().join());
  check("tenantKills keeps the tenant switches only", tenantKills(["signups_enabled", "uploads_enabled", "platform_read_only"]).join() === "uploads_enabled,platform_read_only");
  check("no tripped switch, none shown", tenantKills([]).length === 0);
}

/* ---------------------------------------------------------------- the shell's contributor (fake sources) */

async function shellContributorChecks(): Promise<void> {
  let inviteLoads = 0;
  const unreadCalls: string[] = [];
  const sources = (over: Partial<ShellPulseSources> = {}): ShellPulseSources => ({
    async pendingInvites(scope) {
      inviteLoads++;
      return scope.storeId === "s-atlas" ? 3 : 1;
    },
    async unread(scope, viewer, inStore) {
      unreadCalls.push(`${scope.storeId}:${viewer.userId}:${inStore ? "store" : "account"}`);
      if (!inStore) return 2; // account-wide rows (a password change, …)
      return viewer.userId === OWNER.userId ? 9 : 2;
    },
    ...over,
  });
  const shell = shellContributor(sources(), { cacheName: "selftest-shell-pulse-1" });
  const owner = await shell.contribute(SCOPE, OWNER);
  check("the owner sees the open invites and the store's unread without the account rows", owner.membersPendingInvites === 3 && owner.notificationsUnreadStore === 7, owner);
  const agent = await shell.contribute(SCOPE, AGENT);
  check("an agent (no members.read) gets no invite key at all, never a 0", !("membersPendingInvites" in agent) && agent.notificationsUnreadStore === 0, agent);
  const manager = await shell.contribute(SCOPE, { userId: "u-manager", role: "manager" });
  check("a manager sees the invites from the store's cached count", manager.membersPendingInvites === 3 && inviteLoads === 1, { manager, inviteLoads });
  const other = await shell.contribute(scopeOf("s-berber"), OWNER);
  check("another store gets its own count (the cache is per store)", other.membersPendingInvites === 1 && inviteLoads === 2, { other, inviteLoads });
  check("the unread counts are read per viewer (P1's per-reader cache), never shared", unreadCalls.filter((c) => c.endsWith(":store")).length === 4, unreadCalls);
  const unknownRole = await shell.contribute(SCOPE, { userId: "u-x", role: "not-a-role" });
  check("an unknown role sees no invites", !("membersPendingInvites" in unknownRole));

  const capped = shellContributor(sources({ unread: async (_s, _v, inStore) => (inStore ? 100 : 3) }), { cacheName: "selftest-shell-pulse-2" });
  check("at P1's cap the store count says the cap (never cap minus the account rows)", (await capped.contribute(SCOPE, OWNER)).notificationsUnreadStore === 100);
  const inStore = shellUnreadReader(SCOPE, OWNER, true);
  const account = shellUnreadReader(SCOPE, OWNER, false);
  check("the store reader reads the store by role; the account reader no store and no role", inStore.storeId === SCOPE.storeId && inStore.role === "owner" && account.storeId === null && account.role === null && account.platformRole === "none");
  check("under impersonation the store reader has no role (rows addressed to the viewer only)", shellUnreadReader(scopeOf2("s-atlas", "impersonation"), OWNER, true).role === null);
  check("an unknown role reads with no role", shellUnreadReader(SCOPE, { userId: "u", role: "nope" }, true).role === null);
  const failing = shellContributor(sources({ pendingInvites: async () => Promise.reject(new Error("db down")) }), { cacheName: "selftest-shell-pulse-3" });
  const run = await runContributors([failing], SCOPE, OWNER);
  check("a failing read omits the shell's keys (runContributors records it)", run.failures[0]?.id === "shell" && Object.keys(run.counts).length === 0, run);
}

/* ---------------------------------------------------------------- the election, on fake time */

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

class FakeClock implements PulseClock {
  t = 0;
  private seq = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();
  now = () => this.t;
  setTimeout = (fn: () => void, ms: number) => {
    const id = ++this.seq;
    this.timers.set(id, { at: this.t + ms, fn });
    return id;
  };
  clearTimeout = (h: unknown) => {
    this.timers.delete(h as number);
  };
  async advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      await flush();
      let next: [number, { at: number; fn: () => void }] | null = null;
      for (const entry of this.timers) if (entry[1].at <= end && (!next || entry[1].at < next[1].at)) next = entry;
      if (!next) break;
      this.timers.delete(next[0]);
      this.t = next[1].at;
      next[1].fn();
    }
    this.t = end;
    await flush();
  }
}

/** An in-memory BroadcastChannel: async delivery to every other open endpoint; `mute` drops a tab's messages (a crash). */
class FakeBus {
  private listeners = new Map<number, (m: PulseMessage) => void>();
  private seq = 0;
  muted = new Set<string>();
  last: { at: number; from: string } | null = null;
  constructor(private clock: FakeClock) {}
  channel(): PulseChannel {
    const me = ++this.seq;
    let open = true;
    return {
      post: (msg) => {
        if (!open || this.muted.has(msg.from)) return;
        this.last = { at: this.clock.t, from: msg.from };
        const copy = JSON.parse(JSON.stringify(msg)) as PulseMessage; // structured clone
        for (const [id, fn] of this.listeners) if (id !== me) queueMicrotask(() => fn(copy));
      },
      listen: (fn) => {
        this.listeners.set(me, fn);
        return () => this.listeners.delete(me);
      },
      close: () => {
        open = false;
        this.listeners.delete(me);
      },
    };
  }
}

function pulseAt(at: string, unread: number): StorePulse {
  return composePulse(STORE_PART, { ...USER_PART, unread }, {}, new Date(at));
}

/** A fake server: 200 with the current body when the client's ETag differs, else 304. */
function fakeServer() {
  let current = pulseAt("2026-10-28T10:00:00.000Z", 1);
  const polls: Record<string, number> = {};
  const sinces: (string | null)[] = [];
  return {
    polls,
    sinces,
    set(unread: number) {
      current = pulseAt("2026-10-28T10:00:00.000Z", unread);
    },
    pollFor(tab: string) {
      polls[tab] = 0;
      return async (req: { since: string | null; etag: string | null }): Promise<PollResult> => {
        polls[tab]!++;
        sinces.push(req.since);
        const etag = pulseEtag(current);
        return req.etag === etag ? { status: 304 } : { status: 200, body: current, etag };
      };
    },
  };
}

async function electionChecks() {
  const clock = new FakeClock();
  const bus = new FakeBus(clock);
  const server = fakeServer();
  const seen: Record<string, number> = {};
  const tab = (id: string, channel: PulseChannel | null, storeId = "s-atlas") => {
    seen[id] = 0;
    return createPulseElection({
      storeId,
      id,
      channel,
      clock,
      poll: server.pollFor(id),
      onBody: () => {
        seen[id]!++;
      },
    });
  };

  /* three tabs of one store: one leader */
  const a = tab("a", bus.channel());
  const b = tab("b", bus.channel());
  const c = tab("c", bus.channel());
  for (const e of [a, b, c]) e.start();
  await clock.advance(1_000);
  const roles = () => [a, b, c].map((e) => e.role()).join();
  check("three tabs elect exactly one leader", [a, b, c].filter((e) => e.role() === "leader").length === 1 && roles() === "leader,follower,follower", roles());
  check("only the leader polled", server.polls.a! >= 1 && server.polls.b === 0 && server.polls.c === 0, server.polls);
  check("the followers received the leader's body", seen.b === 1 && seen.c === 1, seen);
  await clock.advance(60_000);
  check("the leader polls every 15 s while visible", server.polls.a! >= 4 && server.polls.a! <= 6, server.polls);
  check("followers never poll while a leader speaks", server.polls.b === 0 && server.polls.c === 0);
  check("an unchanged body (304) is not delivered again", seen.a === 1 && seen.b === 1, seen);
  check("the poll sends since = the last body's at", server.sinces.slice(1).every((s) => s === "2026-10-28T10:00:00.000Z"), server.sinces.slice(0, 3));
  server.set(2);
  await clock.advance(15_000);
  check("a new body reaches every tab", seen.a === 2 && seen.b === 2 && seen.c === 2, seen);

  /* the leader goes silent (a crashed tab): re-election after 40 s */
  bus.muted.add("a");
  const lastHeard = bus.last!.at;
  await clock.advance(lastHeard + 39_000 - clock.t);
  check("no re-election before 40 s of silence", b.role() === "follower" && c.role() === "follower", roles());
  await clock.advance(lastHeard + 41_000 - clock.t);
  check("after 40 s of silence one follower elects itself", [b, c].filter((e) => e.role() === "leader").length === 1, roles());
  check("the new leader polls at once", server.polls.b! + server.polls.c! >= 1, server.polls);
  a.stop();
  bus.muted.clear();

  /* a hidden leader hands over at once */
  const leader = b.role() === "leader" ? b : c;
  const other = leader === b ? c : b;
  leader.setVisible(false);
  await clock.advance(10);
  check("a leader that is hidden steps down and a visible tab takes over at once", leader.role() === "follower" && other.role() === "leader", roles());
  const beforeHidden = server.polls[leader.id]!;
  await clock.advance(60_000);
  check("a hidden tab never polls", server.polls[leader.id] === beforeHidden);
  for (const e of [b, c]) e.stop();
  check("stopped tabs report stopped", b.role() === "stopped" && c.role() === "stopped");

  /* no BroadcastChannel: every tab polls on its own */
  const s1 = tab("s1", null);
  const s2 = tab("s2", null);
  s1.start();
  s2.start();
  await clock.advance(10);
  check("without a channel both tabs are solo and poll at once", s1.role() === "solo" && s2.role() === "solo" && server.polls.s1 === 1 && server.polls.s2 === 1, server.polls);
  await clock.advance(30_000);
  check("solo tabs keep polling independently", server.polls.s1 === 3 && server.polls.s2 === 3, server.polls);

  /* hidden pauses, visible resumes with an immediate poll */
  s1.setVisible(false);
  await clock.advance(60_000);
  check("polling pauses while hidden", server.polls.s1 === 3, server.polls);
  s1.setVisible(true);
  await clock.advance(1);
  check("polling resumes with an immediate poll", server.polls.s1 === 4, server.polls);

  /* a store switch stops the store's pollers, not another store's */
  const other1 = tab("o1", null, "s-other");
  other1.start();
  const stopped = stopPulsePollers("s-atlas");
  check("stopPulsePollers stops this store's pollers", stopped === 2 && s1.role() === "stopped" && s2.role() === "stopped", stopped);
  check("another store's poller keeps running", other1.role() === "solo");
  other1.stop();

  /* a hidden new tab does not poll; it waits as a follower */
  const bus2 = new FakeBus(clock);
  const h = createPulseElection({ storeId: "s-x", id: "h", channel: bus2.channel(), clock, poll: server.pollFor("h"), onBody: () => undefined, visible: false });
  h.start();
  await clock.advance(100_000);
  check("a hidden tab alone never polls", server.polls.h === 0 && h.role() === "follower", { role: h.role(), polls: server.polls.h });
  h.setVisible(true);
  await clock.advance(1_000);
  check("it takes the lead when it becomes visible and nobody answers", h.role() === "leader" && server.polls.h === 1, { role: h.role(), polls: server.polls.h });
  h.stop();
  const live: PulseElection[] = [];
  check("no poller is left registered", stopPulsePollers() === live.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

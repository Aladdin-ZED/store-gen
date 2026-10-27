/**
 * Server-action replay (docs/STORE-SAAS.md §F.1 `qa:action-replay`; TENANCY-MAP §10.2 item 3): store A's owner works
 * through every exported server action of the dashboard, and every request A sends is replayed by the members of
 * store B, by a member of both stores, by an outsider, by platform staff and by staff viewing B (impersonation), to
 * A's path and to B's own path with A's ids, before and after A's own call. Every replay must answer what a missing
 * id (or an unknown handle) answers, carry no canary of A and leave A's rows byte-identical; A's own call with the same
 * body must work (so the replayed bodies were live).
 *
 *   npx tsx scripts/qa/action-replay.ts [--db cod_test_action_replay] [--verbose] [--keep]
 *
 * The action list is derived from the tree (every export of every "use server" file, SEC-9): an action without a
 * recorded body fails the run. The bodies are the cases of scripts/qa/tenancy-check.ts (`ACTION_CASES`, the same
 * throwaway database, fixtures and request stores; see that file's header).
 *
 * In process: an action is called as its module exports it (what a `Next-Action` POST resolves to), with the request
 * identity of the replaying session (§E.4) and the dashboard path the browser would post from. The HTTP transport
 * (recording the `Next-Action` ids in a browser, replaying them against `next start` on 3451+) belongs to the R1.0
 * integration in main, where a production build runs; this script then still holds the bodies and the verdicts.
 *
 * Origin cases (rev 5, CRIT2-11; ENGC-16, SEC-11): a write posted with `Origin: null`, with no Origin at all, and from
 * another host is refused (`forbidden`), the same-origin one works (T2's hardened `storeAction`, `assertActionOrigin`
 * first: the suite also checks that src/lib/tenancy/seam.ts calls it).
 *
 * All real code since the R1.0 merge: a call that ends in a typed stub fails its check (it used to be pending).
 *
 * Exit code 1 when a check fails.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ACTION_CASES,
  NOT_STORE_ACTIONS,
  PLATFORM,
  ROOT,
  actionFn,
  answerOf,
  armed,
  attackers,
  call,
  check,
  deriveServerActions,
  dropDatabase,
  ghostify,
  impersonate,
  leaks,
  network,
  ranReal,
  refusal,
  report,
  setup,
  snapshot,
  snapshotDiff,
  suite,
  text,
  unghost,
  type ActionCase,
  type Fixtures,
  type Kit,
  type Who,
} from "./tenancy-check";

const appPath = (handle: string, p: string) => `/app/${handle}${p}`;


/** Who replays: every attacker of tenancy-check (B's roles, the member of both, an outsider, staff) and staff viewing B. */
type Replayer = { label: string; who: Who; dual: boolean };
function replayers(fx: Fixtures, viewB: string | null): Replayer[] {
  return [
    // with a fresh step-up (§B.7): the strongest stolen session replays A's bodies
    ...attackers(fx).map((a) => ({ label: a.label, who: armed(a.userId), dual: a.userId === fx.dual })),
    ...(viewB ? [{ label: "staff viewing B (impersonation)", who: { sessionToken: viewB } as Who, dual: false }] : []),
  ];
}

/** Replay `args` as every replayer: to A's path (≡ an unknown handle) and to B's path with A's ids (≡ missing ids). */
async function replay(fx: Fixtures, c: ActionCase, args: unknown[], when: "before" | "after", viewB: string | null): Promise<void> {
  const fn = actionFn(c);
  const ghostArgs = ghostify(fx, args);
  const namesA = text(args) !== text(ghostArgs);
  for (const r of replayers(fx, viewB)) {
    const tag = `${c.id} · replayed ${when} A's call · ${r.label}`;
    if (!r.dual) {
      const onA = await call(r.who, appPath(fx.A.handle, c.path), () => fn(...structuredClone(args)));
      const onGhost = await call(r.who, appPath(fx.ghostHandle, c.path), () => fn(...structuredClone(args)));
      const la = `${tag} · A's path: not_found, as an unknown handle`;
      if (ranReal(la, onA, onGhost)) check(la, refusal(onA) === "not_found" && text(answerOf(onA)) === text(answerOf(onGhost)), { onA: answerOf(onA), onGhost: answerOf(onGhost) });
      const leakedA = leaks(fx, answerOf(onA), { sent: args });
      check(`${tag} · A's path: no canary of A`, leakedA.length === 0, leakedA);
    }
    if (!namesA) continue;
    const real = await call(r.who, appPath(fx.B.handle, c.path), () => fn(...structuredClone(args)));
    const ghost = await call(r.who, appPath(fx.B.handle, c.path), () => fn(...structuredClone(ghostArgs)));
    const label = `${tag} · B's path, A's ids`;
    if (ranReal(label, real, ghost)) check(`${label}: same answer as missing ids`, text(answerOf(real)) === text(unghost(fx, answerOf(ghost))), { real: answerOf(real), ghost: answerOf(ghost) });
    const leaked = leaks(fx, answerOf(real), { sent: args });
    check(`${label}: no canary of A`, leaked.length === 0, leaked);
  }
}

async function replaySuite(kit: Kit): Promise<void> {
  const { fx, fresh } = kit;
  suite("coverage");
  const derived = deriveServerActions();
  const recorded = new Set(ACTION_CASES.map((c) => c.id));
  for (const d of derived) {
    if (!d.storeScoped) continue;
    check(`${d.file}#${d.name} has a recorded body`, recorded.has(`${d.file}#${d.name}`));
  }
  check(`the non-store action files are the listed ones (${Object.keys(NOT_STORE_ACTIONS).length})`, derived.filter((d) => !d.storeScoped).every((d) => d.file in NOT_STORE_ACTIONS));

  suite("replay");
  // staff viewing B replays A's bodies too (T2's view-as seam, a real session row)
  const viewB = await impersonate(fx, fx.B);
  for (const c of ACTION_CASES) {
    // the body A's owner sends, replayed first (the records still exist), then A's own call, then the replay again
    const args = await c.victim(fx, fresh);
    const s0 = await snapshot(fx.A.id);
    await replay(fx, c, args, "before", viewB);
    const s1 = await snapshot(fx.A.id);
    check(`${c.id}: A's rows unchanged by the replays before A's call`, s1.hash === s0.hash, snapshotDiff(s0, s1));

    // a self action (leaving the store) is A's own member's call: a fresh member of A, never A's only owner
    const caller = c.self ? await fresh.member(fx.A, "viewer") : fx.A.members.owner;
    // A's member has just stepped up (the secret writes ask for it, §B.7)
    const live = await call(armed(caller), appPath(fx.A.handle, c.path), () => actionFn(c)(...structuredClone(args)));
    const liveLabel = `${c.id}: A's owner's own call works (the replayed body was live)`;
    if (ranReal(liveLabel, live)) check(liveLabel, refusal(live) === null, answerOf(live));
    // the replays never reached the network with A's secrets (a CAPI test event of B must use B's token, PIX-01)
    const tokens = fx.canaries.secret.filter((s) => s.startsWith("EAAT"));

    const s2 = await snapshot(fx.A.id);
    const netAfterLive = network.length;
    await replay(fx, c, args, "after", viewB);
    const s3 = await snapshot(fx.A.id);
    check(`${c.id}: A's rows unchanged by the replays after A's call`, s3.hash === s2.hash, snapshotDiff(s2, s3));
    const replayNet = network.slice(netAfterLive);
    check(`${c.id}: the replays sent nothing carrying A's tokens`, !replayNet.some((n) => tokens.some((t) => n.body.includes(t) || n.auth.includes(t) || n.url.includes(t))), replayNet.map((n) => n.url));
  }
}

/** `Origin: null`, no Origin, another site: refused before the body (T2's assertSameOrigin in storeAction). */
async function originSuite(kit: Kit): Promise<void> {
  const { fx, fresh } = kit;
  suite("origin");
  const seam = readFileSync(path.join(ROOT, "src", "lib", "tenancy", "seam.ts"), "utf8");
  // T2 names the check assertActionOrigin (the same-origin rule of §C.9, first in storeAction)
  const hardened = /export (async )?function storeAction[\s\S]*?assert(?:SameOrigin|ActionOrigin)\(/.test(seam);
  check("storeAction checks the request's origin first (assertActionOrigin, §E.2)", hardened);
  const samples = ACTION_CASES.filter((c) => ["setAssetAltAction", "updateOrderStatusAction", "saveDraft", "starVersionAction"].includes(c.name));
  for (const c of samples) {
    const args = await c.victim(fx, fresh);
    const cases: [string, Record<string, string>, boolean][] = [
      ["same origin", { host: new URL(PLATFORM).host, origin: PLATFORM, "sec-fetch-site": "same-origin" }, true],
      ["Origin: null", { host: new URL(PLATFORM).host, origin: "null" }, false],
      ["no Origin header", { host: new URL(PLATFORM).host }, false],
      ["another site's Origin", { host: new URL(PLATFORM).host, origin: "https://evil.example", "sec-fetch-site": "cross-site" }, false],
    ];
    for (const [label, headers, allowed] of cases) {
      // the same headers for the identity seam and for Next's headers(): whichever the hardened seam reads
      const r = await call({ userId: fx.A.members.owner }, appPath(fx.A.handle, c.path), () => actionFn(c)(...structuredClone(args)), { identityHeaders: headers, headers: new Headers(headers) });
      const name = `${c.id} · A's owner · ${label}: ${allowed ? "works" : "forbidden (never a 500)"}`;
      if (!ranReal(name, r)) continue;
      if (allowed) check(name, refusal(r) === null, answerOf(r));
      else check(name, refusal(r) === "forbidden", answerOf(r));
    }
  }
}

async function main(): Promise<void> {
  const started = Date.now();
  let failed = 1;
  try {
    const kit = await setup();
    await replaySuite(kit);
    await originSuite(kit);
    failed = 0;
  } catch (e) {
    check("the replay ran to the end", false, e instanceof Error ? e.stack : e);
  } finally {
    const left = await dropDatabase().catch((e) => [`cleanup failed: ${e instanceof Error ? e.message : String(e)}`]);
    const fails = report("qa:action-replay (server actions replayed with another store's session and ids)", [
      `${ACTION_CASES.length} recorded bodies; database dropped; cod_test_* left: ${left.length ? left.join(", ") : "none"}`,
      `${Math.round((Date.now() - started) / 1000)} s`,
    ]);
    process.exit(fails || failed ? 1 : 0);
  }
}

void main();

/**
 * The R1 acceptance scenario, the three-minute wow demo (`qa:wow-demo`; docs/STORE-SAAS.md §J.3, §K.2 exit criterion
 * 12; rethink-features §4). Maintainer-owned harness (§K.3). The steps are the tracks' extension files
 * `./wow-demo/steps/<track>.ts` (rev 2.1: `platform.ts` P1, `shell.ts` P2, `landing.ts` P3, `ops.ts` P4, `design.ts`
 * P6, `ai.ts` P7), each exporting `steps: DemoStep[]`; their import lines are written below at P0, so no track edits
 * this file, and `scripts/qa/registries-check.ts` proves none is left out. A step file imports only types from here.
 *
 *   npm run qa:wow-demo                          (exit 1 while a clock row of the table has no step)
 *   npx tsx scripts/qa/wow-demo.ts --list        (the merged plan in clock order; exit 1 only on an invalid step)
 *
 * The run (the R1 integration, then on the live site): the seller path on a 390 px viewport with 4G throttling, human
 * typing at 150 ms per character, every pass condition of the clock table asserted, total wall time ≤ 3:30, Cloud AI
 * off and the local model cache empty; run twice with the same photos in two stores (genome distance d ≥ 0.25);
 * every page passes the no-orange scan and the admin token check; the test order never reaches Sheets, CAPI or the
 * learning tables and revenue stays 0; a second agent pressing N does not get the same order, and the N press comes
 * from the demo store owner's (or an invited agent's) session with `ops.openOverrideUntil = now + 2 h` seeded.
 *
 * P0 freezes the step contract (`DemoStep`, `DemoCtx`, the clock rows) and validates the merged plan. The browser
 * runner (a production build on port 3451+, a `cod_test_*` database, the three Playwright sessions on msedge, HANDOFF
 * §3) is written at the R1 integration, when the steps it runs exist; until then a run lists the pending clock rows and
 * fails, so `gate:r1` cannot pass before the R1 tracks have merged.
 */
import type { Page } from "playwright";
import { steps as aiSteps } from "./wow-demo/steps/ai";
import { steps as designSteps } from "./wow-demo/steps/design";
import { steps as landingSteps } from "./wow-demo/steps/landing";
import { steps as opsSteps } from "./wow-demo/steps/ops";
import { steps as platformSteps } from "./wow-demo/steps/platform";
import { steps as shellSteps } from "./wow-demo/steps/shell";

/** The clock table of rethink-features §4 (the time at which each row's pass condition is asserted). */
export const DEMO_CLOCK = {
  "0:00": "signup from the invite link: account created, session set, no e-mail needed",
  "0:20": "the Landing pages mode card: stores.mode = landing, status pending",
  "0:25": "three photos dropped: thumbnails appear progressively, the cutout job starts in the background",
  "0:35": "store name and handle typed: handle valid, the address shown",
  "0:50": "the reveal: three directions, pairwise d ≥ 0.25, no orange, Design check green, one stage / specimen / dark direction for argan and parfum",
  "1:05": "details: price typed, delivery fee left empty: no fee line, the zones issue in health, never a gate item",
  "1:25": "publish asks for review; the console approves with A: store active, the seller notified within one pulse",
  "1:40": "publish ≤ 3 s; the address card shows the link, the QR, the WhatsApp share and Open a test order",
  "1:55": "the test order on the phone: LCP ≤ 2.5 s, submit ≤ 1 s, is_test = 1, excluded from CAPI and Sheets",
  "2:15": "Confirm on WhatsApp; the queue's N claims the order (10-min lease, phone masked, TEST chip); a second agent's N gets another order",
  "2:30": "call or WhatsApp template reveals the phone (phone_revealed event); 1 confirms the order",
  "2:50": "the Today brief and the health ring on the dashboard, the first-order milestone in the console; revenue KPIs unchanged by the test order",
  "3:00": "done: Telegram fired only if the store connected it (not required for a pass)",
} as const;
export type DemoClock = keyof typeof DEMO_CLOCK;

/** Rows a run may leave without a step: their condition is not required for a pass. */
const OPTIONAL_ROWS: readonly DemoClock[] = ["3:00"];

export type DemoTrack = "platform" | "shell" | "landing" | "ops" | "design" | "ai";

/** What the demo carries from step to step (ids the steps create and later steps read). */
export interface DemoState {
  storeId?: string;
  handle?: string;
  pageId?: string;
  orderId?: string;
  [key: string]: unknown;
}

/** What a step gets. The runner owns the build, the database, the browsers and the clock. */
export interface DemoCtx {
  /** 1 or 2: the second run repeats the path with the same photos in a second store (d ≥ 0.25 between them) */
  run: 1 | 2;
  /** the platform origin of the production build under test (port 3451+ locally, the live site after a deploy) */
  base: string;
  /** the seller's phone: 390 × 844, 4G throttling */
  seller: Page;
  /** the platform owner on the console (desktop) */
  console: Page;
  /** the demo store owner's (or an invited agent's) queue session, never the platform owner's (OPE Q.27n) */
  agent: Page;
  /** a second agent of the same store, for the two-session claim check */
  agent2: Page;
  /** the fixture photos of this run (argan and parfum among them) */
  photos: readonly string[];
  /** types like a person, 150 ms per character (the clock budget counts it) */
  typeHuman(page: Page, selector: string, text: string): Promise<void>;
  /** milliseconds since the demo's 0:00 */
  elapsedMs(): number;
  /** a read-only query on the demo's `cod_test_*` database */
  sql<T = Record<string, unknown>>(query: string, params?: readonly unknown[]): Promise<T[]>;
  /** one assertion of the step's pass condition; a failed one fails the run, the next step still runs */
  check(name: string, ok: boolean, detail?: unknown): void;
  state: DemoState;
}

export interface DemoStep {
  /** "<track>-<name>", unique: "landing-publish", "ops-claim" */
  id: string;
  track: DemoTrack;
  /** the clock-table row whose pass condition the step asserts */
  clock: DemoClock;
  /** the pass condition in the step's words (printed in the plan and the report) */
  condition: string;
  /** the row's p75 budget in ms, when it has one; the runner fails the step above it */
  budgetMs?: number;
  /** which runs execute the step (default both) */
  runs?: "first" | "both";
  run(ctx: DemoCtx): Promise<void>;
}

/** Every step file, in track order (P1, P2, P3, P4, P6, P7). */
const STEP_FILES: readonly (readonly [track: DemoTrack, steps: readonly DemoStep[]])[] = [
  ["platform", platformSteps],
  ["shell", shellSteps],
  ["landing", landingSteps],
  ["ops", opsSteps],
  ["design", designSteps],
  ["ai", aiSteps],
];

const CLOCK_ORDER = Object.keys(DEMO_CLOCK) as DemoClock[];

/** The merged plan in clock order (file order inside a row), and the problems that make it invalid. */
export function demoPlan(files: typeof STEP_FILES = STEP_FILES): { steps: DemoStep[]; problems: string[]; pending: DemoClock[] } {
  const problems: string[] = [];
  const seen = new Set<string>();
  const all = files.flatMap(([track, steps], fi) => steps.map((s, si) => ({ s, track, key: fi * 1000 + si })));
  for (const { s, track } of all) {
    if (!/^[a-z]+-[a-z0-9-]+$/.test(s.id)) problems.push(`${track}: step id "${s.id}" is not "<track>-<name>"`);
    if (s.track !== track) problems.push(`${s.id}: declared track "${s.track}" in ${track}.ts`);
    if (!(s.clock in DEMO_CLOCK)) problems.push(`${s.id}: clock "${s.clock}" is not a row of the table`);
    if (seen.has(s.id)) problems.push(`${s.id}: duplicate id`);
    seen.add(s.id);
    if (s.budgetMs !== undefined && !(Number.isInteger(s.budgetMs) && s.budgetMs > 0)) problems.push(`${s.id}: budgetMs must be a positive integer`);
  }
  const steps = all.sort((a, b) => CLOCK_ORDER.indexOf(a.s.clock) - CLOCK_ORDER.indexOf(b.s.clock) || a.key - b.key).map((x) => x.s);
  const pending = CLOCK_ORDER.filter((c) => !OPTIONAL_ROWS.includes(c) && !steps.some((s) => s.clock === c));
  return { steps, problems, pending };
}

function main(): void {
  const { steps, problems, pending } = demoPlan();
  console.log(`qa:wow-demo: ${steps.length} steps from ${STEP_FILES.length} files (${STEP_FILES.map(([t, s]) => `${t} ${s.length}`).join(" · ")})`);
  for (const c of CLOCK_ORDER) {
    const here = steps.filter((s) => s.clock === c);
    console.log(`  ${c.padStart(4)}  ${here.length ? here.map((s) => s.id).join(", ") : OPTIONAL_ROWS.includes(c) ? "(optional)" : "PENDING"}  · ${DEMO_CLOCK[c]}`);
  }
  for (const p of problems) console.log(`  ✗ ${p}`);
  if (problems.length) process.exit(1);
  if (process.argv.includes("--list")) return;
  if (pending.length) {
    console.log(`✗ ${pending.length} clock rows have no step yet (${pending.join(", ")}): the demo runs at the R1 integration, after the tracks merge`);
    process.exit(1);
  }
  throw new Error("not implemented: maintainer (the wow-demo browser runner, written at the R1 integration)");
}

if (require.main === module) main();

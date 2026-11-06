/**
 * test:admin-motion (core §I.6, D60, §J.1; DES-§16.6; PLA-§O.1, PLA-§22.18 row 4): "ease-out only, no bounce, nothing
 * slower than 400 ms" in the admin. Pure Node, no build, no server:
 *
 *   npm run test:admin-motion            (exit 1 on a violation, 2 when the lint itself is broken)
 *   npx tsx scripts/qa/admin-motion-check.ts --strict      (PENDING entries fail too: gate:r1)
 *
 * Rules (comments ignored, so "never a bounce" may stay documented):
 * - `spring`: `type: "spring"` (or a `SPRING` preset) and `bounce` in src/components/{admin,console}/**;
 * - `overshoot`: a cubic-bezier with y1 or y2 outside 0-1 (CSS, a Tailwind `ease-[cubic-bezier(…)]`, a motion `ease: [x1,
 *   y1, x2, y2]`) in the admin CSS and the admin, console, onboarding and auth code;
 * - `duration`: a transition or animation duration above 400 ms (Tailwind `duration-*`, CSS `transition` / `animation`,
 *   motion `duration:` in seconds, recharts `animationDuration`), anywhere in that scope outside src/components/builder/**;
 * - `hover-rotate`: rotation on hover (`hover:rotate-*`, `group-hover/x:rotate-*`), forbidden by DES-§16.6;
 * - `ui-spring`: the deleted `--ui-spring` token.
 * The regression fixtures are R1.0's two shell sites: app-sidebar.tsx:96 (the active pill's spring, stiffness 480) and
 * :146 (the generate icon's 500 ms overshoot rotate on hover).
 */
import { blankComments, lineAt, runLint, scan, type Fixture, type Hit, type PendingEntry } from "../../src/lib/admin-theme/lint";

const NAME = "test:admin-motion";
const MAX_MS = 400;

const SPRING_SCOPE = /^src\/components\/(admin|console)\//;
const BUILDER = /^src\/components\/builder\//;

/** Durations in a CSS value list: the first time of each comma part (the second is the delay). */
function cssDurations(value: string): number[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  const out: number[] = [];
  for (const p of parts) {
    const m = /(?:^|\s)(\d*\.?\d+)(ms|s)\b/.exec(p.replace(/\([^)]*\)/g, " "));
    if (m) out.push(Number(m[1]) * (m[2] === "s" ? 1000 : 1));
  }
  return out;
}

/** core §I.6: y1 or y2 outside 0-1 (an overshoot past the target, or an anticipation below the start). */
const bezierHit = (nums: number[]): boolean => nums.length === 4 && [nums[1]!, nums[3]!].some((y) => y < 0 || y > 1);

function judge(file: string, raw: string): Hit[] {
  const css = file.endsWith(".css");
  const src = blankComments(raw, css ? "css" : "ts");
  const hits: Hit[] = [];
  const add = (i: number, rule: string, detail: string) => hits.push({ file, line: lineAt(src, i), rule, detail });

  if (SPRING_SCOPE.test(file) && !css) {
    for (const m of src.matchAll(/\btype:\s*["'`]spring["'`]/g)) add(m.index, "spring", `${m[0]}: tween on --ease-out (cubic-bezier(.2,.8,.2,1)), ≤ 180 ms`);
    for (const m of src.matchAll(/\bbounce\b/gi)) add(m.index, "spring", `"${m[0]}": no bounce in the admin (D60)`);
  }
  for (const m of src.matchAll(/cubic-bezier\(([^)]*)\)/g)) {
    const nums = m[1]!.split(/[\s,_]+/).filter(Boolean).map(Number);
    if (bezierHit(nums)) add(m.index, "overshoot", `${m[0]} overshoots (y1 or y2 outside 0-1): use --ease-out`);
  }
  if (!css) {
    for (const m of src.matchAll(/\bease:\s*\[([-\d.\s,]+)\]/g)) {
      const nums = m[1]!.split(",").map((s) => Number(s.trim()));
      if (bezierHit(nums)) add(m.index, "overshoot", `ease [${m[1]}] overshoots: use [0.2, 0.8, 0.2, 1]`);
    }
    for (const m of src.matchAll(/(?:^|[\s"'`:])((?:[\w/[\]-]*:)*(?:group-)?hover(?:\/[\w-]+)?:(?:[\w-]+:)*-?rotate-[\w[\].-]+)/g)) {
      add(m.index, "hover-rotate", `${m[1]}: no rotation on hover (DES-§16.6)`);
    }
  }
  if (!BUILDER.test(file)) {
    const slow = (i: number, ms: number, what: string) => {
      if (ms > MAX_MS) add(i, "duration", `${what} = ${ms} ms > ${MAX_MS} ms`);
    };
    if (css) {
      for (const m of src.matchAll(/(?:^|[;{\s])((?:transition|animation)(?:-duration)?)\s*:\s*([^;}]+)/g)) {
        for (const ms of cssDurations(m[2]!)) slow(m.index, ms, m[1]!);
      }
    } else {
      for (const m of src.matchAll(/(?:^|[\s"'`:])(?:[\w/[\]-]*:)*duration-(\d+)(?![\w.])/g)) slow(m.index, Number(m[1]), `duration-${m[1]}`);
      for (const m of src.matchAll(/duration-\[(\d*\.?\d+)(ms|s)\]/g)) slow(m.index, Number(m[1]) * (m[2] === "s" ? 1000 : 1), m[0]);
      for (const m of src.matchAll(/\bduration:\s*(\d*\.?\d+)\b(?!\s*ms)/g)) slow(m.index, Math.round(Number(m[1]) * 1000), `motion duration ${m[1]} s`);
      for (const m of src.matchAll(/\banimationDuration(?:=\{|:\s*)(\d+)/g)) slow(m.index, Number(m[1]), "animationDuration");
      // a CSS string in TS (inline style / template): transition: x 500ms
      for (const m of src.matchAll(/\b(?:transition|animation)(?:Duration)?\s*:\s*["'`]([^"'`]+)["'`]/g)) {
        for (const ms of cssDurations(m[1]!)) slow(m.index, ms, "inline transition");
      }
    }
  }
  for (const m of src.matchAll(/--ui-spring\b/g)) add(m.index, "ui-spring", "--ui-spring was deleted (DES-R17)");
  return hits;
}

const FIXTURES: Fixture[] = [
  {
    name: "R1.0 app-sidebar.tsx:96 (the active pill)",
    file: "src/components/admin/shell/app-sidebar.tsx",
    src: `<motion.span layoutId="nav-active" transition={{ type: "spring", stiffness: 480, damping: 38 }} />`,
    expect: ["spring"],
  },
  {
    name: "R1.0 app-sidebar.tsx:146 (the generate icon)",
    file: "src/components/admin/shell/app-sidebar.tsx",
    src: `<span className="transition-transform duration-500 ease-[cubic-bezier(.34,1.36,.64,1)] group-hover/gen:rotate-12" />`,
    expect: ["overshoot", "duration", "hover-rotate"],
  },
  { name: "bounce option", file: "src/components/console/x.tsx", src: `animate(el, { x: 4 }, { bounce: 0.3 })`, expect: ["spring"] },
  { name: "CSS spring curve", file: "src/components/admin/styles/x.css", src: `:root{--ui-spring:cubic-bezier(0.34,1.36,0.64,1)}`, expect: ["overshoot", "ui-spring"] },
  { name: "anticipation curve", file: "src/app/app/x.tsx", src: `transition={{ ease: [0.6, -0.28, 0.74, 0.05] }}`, expect: ["overshoot"] },
  { name: "slow CSS entrance", file: "src/components/admin/styles/x.css", src: `.r{animation:rise 640ms var(--ease-out) backwards;transition:opacity 120ms,transform 450ms}`, expect: ["duration"] },
  { name: "slow motion tween", file: "src/components/admin/x.tsx", src: `transition={{ duration: 0.6, ease: EASE }}`, expect: ["duration"] },
  { name: "slow chart", file: "src/components/admin/dashboard/x.tsx", src: `<Area animationDuration={900} />`, expect: ["duration"] },
  { name: "slow arbitrary", file: "src/app/(public)/x.tsx", src: `<i className="md:duration-[0.6s]" />`, expect: ["duration"] },
  {
    name: "the R1 shell: tweens on --ease-out",
    file: "src/components/admin/shell/app-sidebar.tsx",
    src: `// a settle, never a bounce\n<motion.span transition={{ type: "tween", duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }} className="transition-colors duration-200 ease-[cubic-bezier(.2,.8,.2,1)] hover:scale-[1.06]" />`,
    expect: [],
  },
  { name: "CSS within budget, delays ignored", file: "src/components/admin/styles/x.css", src: `.r{animation:rise 240ms var(--ease-out) 900ms backwards;transition:transform var(--dur-2) cubic-bezier(0.22,1,0.36,1)}`, expect: [] },
  { name: "the builder canvas may be slower", file: "src/components/builder/x.tsx", src: `<i className="duration-700" />`, expect: [] },
  { name: "debounced is not bounce", file: "src/components/admin/x.tsx", src: `const debounced = useDebounce(v, 250); const rot = "rotate-90";`, expect: [] },
];

/* PENDING: files P2 does not own (CCR r1-p2-1, P0b P2-13). */
const UNOWNED = "maintainer (unowned in R1)";
const PENDING: PendingEntry[] = [
  { path: "src/components/admin/export/**", rule: "spring", owner: UNOWNED, ccr: "r1-p2-1 §1" },
  { path: "src/components/admin/export/**", rule: "duration", owner: UNOWNED, ccr: "r1-p2-1 §1" },
  { path: "src/components/admin/history/**", rule: "spring", owner: UNOWNED, ccr: "r1-p2-1 §1" },
  { path: "src/components/admin/history/**", rule: "duration", owner: UNOWNED, ccr: "r1-p2-1 §1" },
  { path: "src/components/admin/media/**", rule: "spring", owner: UNOWNED, ccr: "r1-p2-1 §1" },
  { path: "src/components/admin/media/**", rule: "duration", owner: UNOWNED, ccr: "r1-p2-1 §1" },
  { path: "src/components/admin/media/**", rule: "overshoot", owner: UNOWNED, ccr: "r1-p2-1 §1" },
  { path: "src/components/admin/settings/ai-settings.tsx", rule: "spring", owner: UNOWNED, ccr: "r1-p2-1 §1" },
  { path: "src/components/admin/settings/form-kit.tsx", rule: "spring", owner: UNOWNED, ccr: "r1-p2-1 §1" },
  { path: "src/components/admin/variants/options-field.tsx", rule: "spring", owner: UNOWNED, ccr: "r1-p2-1 §1" },
  { path: "src/components/admin/variants/options-field.tsx", rule: "duration", owner: UNOWNED, ccr: "r1-p2-1 §1" },
  { path: "src/components/admin/pages/page-card.tsx", rule: "duration", owner: "P3", ccr: "r1-p2-1 §3" },
  { path: "src/components/admin/orders/order-drawer.tsx", rule: "duration", owner: "P4", ccr: "r1-p2-1 §5" },
  { path: "src/components/generate/**", rule: "duration", owner: "P6", ccr: "r1-p2-1 §6" },
];

const ROOTS = [
  "src/app/globals.css",
  "src/components/admin",
  "src/components/console",
  "src/components/generate",
  "src/app/app",
  "src/app/admin",
  "src/app/(public)",
];

if (require.main === module) {
  runLint({ name: NAME, fixtures: FIXTURES, judge, files: () => scan(ROOTS, [".ts", ".tsx", ".css"]), pending: PENDING });
}

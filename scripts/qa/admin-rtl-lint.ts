/**
 * test:admin-rtl (core §I.5, §I.8 rule 7, §J.1; DES-§16.15, DES-R2; PLA-§O.1, PLA-§22.18 row 7): logical properties
 * only, and mirrored directional icons, so the R3 Arabic dashboard costs nothing extra. Pure Node, no build:
 *
 *   npm run test:admin-rtl               (exit 1 on a violation, 2 when the lint itself is broken)
 *   npx tsx scripts/qa/admin-rtl-lint.ts --strict          (PENDING entries fail too: gate:r1)
 *
 * Scanned: src/components/{admin,console,builder,generate}/** and src/app/{app,admin}/** (.ts, .tsx, .css), plus the
 * admin stylesheets (src/app/globals.css). Comments are ignored.
 * - `physical-class`: a Tailwind class token in any string with a physical side: the core §I.5 set (`ml- mr- pl- pr-
 *   left- right- text-left text-right`) and the DES-§16.15 additions (`rounded-l* rounded-r* rounded-tl/tr/bl/br*
 *   border-l* border-r*`, `scroll-m/p[lr]-`, `float-left/right`). Use ms- me- ps- pe- start- end- text-start text-end
 *   rounded-s* rounded-e* border-s* border-e*. A token under an `rtl:` / `ltr:` variant is a deliberate pair and passes.
 * - `physical-css`: CSS `margin-left|right`, `padding-left|right`, `border-left|right`, `left:`, `right:`,
 *   `text-align: left|right`, and the camelCase style keys `marginLeft …` in code.
 * - `dir-icon`: a directional icon of the mirrored allow-list (`MIRRORED`: chevrons, arrows, back / forward, undo /
 *   redo, indent) rendered without an RTL mirror class (`rtl:rotate-180`, `rtl:-scale-x-100`). Diagonal arrows (the
 *   external-link and trend glyphs), the symmetric swap and media controls are not mirrored (`NOT_MIRRORED`).
 * `EXCEPTIONS` lists the few physical cases that are right, each with its reason; `PENDING` the files P2 does not own.
 */
import { blankComments, lineAt, runLint, scan, type Fixture, type Hit, type PendingEntry } from "../../src/lib/admin-theme/lint";

const NAME = "test:admin-rtl";

/** Icons that point along the reading direction: they must flip in RTL (DES-§16.15). */
const MIRRORED =
  /^(?:Chevrons?(?:Left|Right)|Chevron(?:First|Last)|Arrow(?:Big)?(?:Left|Right)(?:Dash)?|Arrow(?:Left|Right)(?:To|From)Line|Corner(?:Up|Down)(?:Left|Right)|Move(?:Left|Right)|Circle(?:Arrow|Chevron)(?:Left|Right)|Square(?:Arrow|Chevron)(?:Left|Right)|Undo2?|Redo2?|UndoDot|RedoDot|Reply|ReplyAll|Forward|Indent(?:Increase|Decrease)?|Outdent|ListIndent(?:Increase|Decrease)|Step(?:Back|Forward))(?:Icon)?$/;
/**
 * Directional-looking glyphs that keep their drawing in RTL, with the reason (documentation; the rule only fires on
 * `MIRRORED`): ArrowUpRight / ArrowDownRight / ArrowUpLeft / ArrowDownLeft (external link, trend), ArrowLeftRight
 * (a symmetric swap), SkipBack / SkipForward / Rewind / FastForward (media controls; DES-§16.15 "never media
 * controls"), and time axes (time runs left to right).
 */
export const NOT_MIRRORED = ["ArrowUpRight", "ArrowDownRight", "ArrowUpLeft", "ArrowDownLeft", "ArrowLeftRight", "SkipBack", "SkipForward", "Rewind", "FastForward"];

const MIRROR_CLASS = /\brtl:(?:rotate-180|-scale-x-100|scale-x-\[-1\]|-scale-x-\[1\])/;

const PHYSICAL_PREFIX = /^-?(?:ml|mr|pl|pr|left|right|scroll-ml|scroll-mr|scroll-pl|scroll-pr)-/;
const PHYSICAL_WHOLE = /^-?(?:text-left|text-right|float-left|float-right|(?:rounded|border)-(?:l|r|tl|tr|bl|br)(?:-.*)?)$/;

/** The utility of a class token without its variants and important marks ("md:hover:!-ml-2" → "-ml-2"). */
function utilityOf(token: string): { utility: string; variants: string[] } {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of token) {
    if (ch === "[" || ch === "(") depth++;
    if (ch === "]" || ch === ")") depth--;
    if (ch === ":" && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  return { utility: cur.replace(/^!|!$/g, ""), variants: parts };
}

const STRING = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;

function judge(file: string, raw: string): Hit[] {
  const css = file.endsWith(".css");
  const src = blankComments(raw, css ? "css" : "ts");
  const hits: Hit[] = [];
  const add = (i: number, rule: string, detail: string) => hits.push({ file, line: lineAt(src, i), rule, detail });

  if (css) {
    for (const m of src.matchAll(/(?:^|[;{\s])((?:margin|padding|border)-(?:left|right)(?:-[\w-]+)?|left|right)\s*:/g)) {
      add(m.index, "physical-css", `${m[1]}: use the logical property (margin-inline-start, inset-inline-end …)`);
    }
    for (const m of src.matchAll(/text-align\s*:\s*(left|right)\b/g)) add(m.index, "physical-css", `text-align: ${m[1]}: use start / end`);
    return hits;
  }
  for (const m of src.matchAll(STRING)) {
    const body = m[1] ?? m[2] ?? m[3] ?? "";
    const base = m.index + 1;
    for (const t of body.matchAll(/[^\s"'`{}]+/g)) {
      const { utility, variants } = utilityOf(t[0]);
      if (variants.some((v) => v === "rtl" || v === "ltr")) continue;
      if (PHYSICAL_PREFIX.test(utility) || PHYSICAL_WHOLE.test(utility)) {
        add(base + t.index, "physical-class", `"${t[0]}": use the logical class (ms/me, ps/pe, start/end, text-start/end, rounded-s/e, border-s/e)`);
      }
    }
  }
  for (const m of src.matchAll(/\b(marginLeft|marginRight|paddingLeft|paddingRight|borderLeft\w*|borderRight\w*)\s*:/g)) {
    add(m.index, "physical-css", `style ${m[1]}: use marginInlineStart / paddingInlineEnd …`);
  }
  // JSX usages of mirrored icons: the opening tag must carry an rtl: mirror class
  for (const m of src.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)) {
    const name = m[1]!;
    if (!MIRRORED.test(name)) continue;
    let depth = 0;
    let end = m.index + m[0].length;
    for (; end < src.length && end < m.index + 600; end++) {
      const ch = src[end];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    if (!MIRROR_CLASS.test(src.slice(m.index, end))) add(m.index, "dir-icon", `<${name}> points along the reading direction: add rtl:rotate-180 (or rtl:-scale-x-100)`);
  }
  return hits;
}

const FIXTURES: Fixture[] = [
  { name: "core §I.5 classes", file: "src/components/admin/x.tsx", src: `<div className="ml-2 pr-4 md:left-0 text-right" />`, expect: ["physical-class"] },
  { name: "DES-§16.15 additions", file: "src/app/app/x.tsx", src: `cn("rounded-l-lg", open && "border-r-2 rounded-tr-md")`, expect: ["physical-class"] },
  { name: "negative and important", file: "src/components/console/x.tsx", src: `<i className="-mr-1 hover:!pl-3" />`, expect: ["physical-class"] },
  { name: "CSS physical properties", file: "src/components/admin/styles/x.css", src: `.a{margin-left:4px;padding-right:2px;left:0;text-align:right}`, expect: ["physical-css"] },
  { name: "style object", file: "src/components/admin/x.tsx", src: `<div style={{ paddingLeft: 8 }} />`, expect: ["physical-css"] },
  { name: "unmirrored chevron", file: "src/components/admin/x.tsx", src: `<ChevronRightIcon className="size-3.5 text-muted-foreground" />`, expect: ["dir-icon"] },
  { name: "unmirrored undo", file: "src/components/builder/x.tsx", src: `<Undo2 />`, expect: ["dir-icon"] },
  {
    name: "logical classes, pairs and mirrored icons",
    file: "src/components/admin/x.tsx",
    src: `<div className="ms-2 pe-4 start-0 end-1 text-start rounded-s-lg border-e rtl:mr-2 ltr:ml-2" dir="ltr">\n<ChevronRight className={cn("size-3.5 rtl:-scale-x-100", open && "rotate-90")} />\n<ArrowLeftIcon aria-hidden="true" className="size-3.5 rtl:rotate-180" />\n<ArrowUpRightIcon /> <ArrowLeftRightIcon />\n<Sheet side="left" /></div>`,
    expect: [],
  },
  { name: "clean component", file: "src/components/admin/x.tsx", src: `// ml-2 in a comment\n<div className="ms-2 pe-4 inset-x-0 text-end"><ArrowUpRightIcon /><ChevronLeftIcon className="rtl:rotate-180" /></div>`, expect: [] },
  { name: "logical CSS", file: "src/components/admin/styles/x.css", src: `.a{margin-inline-start:4px;inset-inline-end:0;text-align:start} /* left: 0 */`, expect: [] },
];

/**
 * The physical cases that are right, each with its reason (DES-§16.15 "allow-list file for the few physical cases").
 * Matched by file, rule and the offending text.
 */
interface Exception {
  path: string;
  rule: string;
  match: string;
  reason: string;
}
const EXCEPTIONS: Exception[] = [
  { path: "src/components/builder/panels/SeoPanel.tsx", rule: "physical-class", match: '"right-to-left."', reason: "help prose (the text direction), not a class" },
];

/* PENDING: files P2 does not own (CCR r1-p2-1, P0b P2-13). */
const UNOWNED = "maintainer (unowned in R1)";
const PENDING: PendingEntry[] = [
  { path: "src/components/admin/export/**", rule: "physical-class", owner: UNOWNED, ccr: "r1-p2-1 §1" },
  // the four corner brackets of the crop frame (focal-picker.tsx:355-358): logical classes, or an exception if the
  // owner keeps them physical (a symmetric set of four corners reads the same in RTL)
  { path: "src/components/admin/media/**", rule: "physical-class", owner: UNOWNED, ccr: "r1-p2-1 §1" },
  { path: "src/app/app/[store]/(editor)/pages/[id]/edit/page.tsx", rule: "dir-icon", owner: UNOWNED, ccr: "r1-p2-1 §1" },
  { path: "src/components/builder/**", rule: "physical-class", owner: "P6", ccr: "r1-p2-1 §6" },
  { path: "src/components/builder/**", rule: "dir-icon", owner: "P6", ccr: "r1-p2-1 §6" },
  { path: "src/components/generate/**", rule: "dir-icon", owner: "P6", ccr: "r1-p2-1 §6" },
];

const ROOTS = [
  "src/components/admin",
  "src/components/console",
  "src/components/builder",
  "src/components/generate",
  "src/app/app",
  "src/app/admin",
  "src/app/globals.css",
];

function judgeWithExceptions(file: string, src: string): Hit[] {
  return judge(file, src).filter((h) => !EXCEPTIONS.some((e) => e.path === file && e.rule === h.rule && h.detail.includes(e.match)));
}

if (require.main === module) {
  runLint({ name: NAME, fixtures: FIXTURES, judge: judgeWithExceptions, files: () => scan(ROOTS, [".ts", ".tsx", ".css"]), pending: PENDING });
}

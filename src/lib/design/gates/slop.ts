/**
 * The slop score S01-S26 (P6 DESIGN; design.md DES-§8.3, DS25, DS56; design-baseline §3.7). Pure and isomorphic: the
 * devices are read from the registry `features` (ghost word, ring, chips, dots, strips, equal cards, bento, glass), the
 * section data (kickers, captions, anchors) and the look (easing, numbering, reveals). `score ≥ platform_design.slop.fail`
 * (6, calibration.json `preFit.slopFail`) is the hard `S00` (`design:R8`); `≥ slop.repair` (3) triggers the repairs of
 * the wizard and remix. The baseline pages score 14-19 here; the corpus asserts a median ≤ 2 after generation.
 *
 * S26's pair rule ("never the same pair twice in a niche") reads the niche shares the novelty service answers at
 * generation (`planOpeners` / `dropDecor`); the gate counts the devices of the one page.
 */
import { toOklch } from "@/lib/theme/color";
import type { DesignGateItem, GateId, GateInput } from "./types";
import type { PageView, SecView } from "./view";

type Item = DesignGateItem;
/** S15: numbered or edition eyebrows */
export const NUMBERED_EYEBROW = /^\s*(\d{1,3}\b|n[o°º]\.?\s*\d|vol\.|edition|édition|chapitre|الإصدار|العدد|رقم)/i;
/** S26 rev 3: figure captions "FIG. 01" */
const FIG_CAPTION = /\bfig\.?\s*\d/i;
/** sections whose stage paints the single radial glow (S06: `.lp-orb` / `--lp-stage-glow`) */
const GLOW: ReadonlySet<string> = new Set(["hero:stage", "hero:spec", "cta:banner"]);
const MOCK_CHAT: ReadonlySet<string> = new Set(["faq:chat"]);
const MOCK_PHONE: ReadonlySet<string> = new Set(["video:phone"]);

const s = (id: GateId, points: number, msg: Item["msg"], extra: Partial<Item> = {}): Item => ({ id, level: "soft", penalty: points, msg, ...extra });

/** The kicker-like strings a section shows (its kicker, the hero's cover issue line). */
function eyebrowsOf(x: SecView): string[] {
  const out: string[] = [];
  if (x.kicker && x.kickerText) out.push(x.kickerText);
  if (x.type === "hero" && x.kickerText) out.push(x.kickerText);
  if (x.type === "hero" && x.variant === "editorial" && typeof x.data.issue === "string" && x.data.issue.trim()) out.push(x.data.issue);
  return out;
}

/** The S26 tell devices present on the page (rev 3: thirteen). */
export function tellDevices(v: PageView): string[] {
  const out = new Set<string>();
  for (const x of v.all) {
    const key = `${x.type}:${x.variant}`;
    if (x.f.ghostWord) out.add("ghost");
    if (eyebrowsOf(x).some((e) => NUMBERED_EYEBROW.test(e)) || x.f.numberedEyebrow) out.add("eyebrows");
    if (key === "showcase:hotspots") out.add("hotspots");
    if (MOCK_CHAT.has(key)) out.add("chat");
    if (x.f.ring) out.add("stamp");
    if (key === "marquee:tape") out.add("tape");
    if (key === "stats:big-numbers") out.add("bigNumbers");
    if (key === "beforeAfter:slider") out.add("slider");
    if (x.type === "urgency" && x.variant === "countdown") out.add("countdown");
    if (MOCK_PHONE.has(key)) out.add("phone");
    if (key === "footer:big") out.add("footerWord");
    const caption = [x.data.caption, x.data.figure].find((c) => typeof c === "string") as string | undefined;
    if (key === "showcase:figure" && caption && FIG_CAPTION.test(caption)) out.add("figCaption");
  }
  if (v.look?.kit.nb === "padded") out.add("padded");
  return [...out];
}

/** ≤ 0.3 ms: the slop items of one view and their score. */
export function slopItems(v: PageView, input: GateInput): { score: number; items: Item[] } {
  const items: Item[] = [];
  const t = input.theme.tokens;
  const dark = input.theme.scheme === "dark";
  // S01: purple / indigo accent and pop on a dark base
  const purple = (hex: string | undefined) => {
    if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return false;
    const o = toOklch(hex);
    return o.c > 0.12 && o.h >= 260 && o.h <= 310;
  };
  if (dark && purple(t["lp-accent"]) && purple(t["lp-pop"])) items.push(s("S01", 4, "design.slop.S01"));
  // S02: more than 2 glass surfaces
  if (v.counts.glass > 2) items.push(s("S02", 2 + (v.counts.glass - 3), "design.slop.S02", { vars: { count: v.counts.glass, limit: 2 } }));
  // S03: the radius ladder collapsed (the four tiers within 2 px)
  const radii = v.look
    ? null
    : ["lp-radius-xs", "lp-radius-s", "lp-radius-m", "lp-radius-media"].map((n) => Number((/(\d+(?:\.\d+)?)px/.exec(t[n] ?? "") ?? [])[1] ?? NaN)).filter((n) => Number.isFinite(n));
  if (radii && radii.length === 4 && Math.max(...radii) - Math.min(...radii) <= 2) items.push(s("S03", 3, "design.slop.S03"));
  // S04: ≥ 2 equal-card triplets
  if (v.counts.equalCardTriplets >= 2) items.push(s("S04", 3, "design.slop.S04", { vars: { count: v.counts.equalCardTriplets } }));
  // S05: > 60 % of the flow centred (body copy), or a centred dark hero with a glow and no product inside it
  const centred = v.flow.filter((x) => x.align === "center" && x.words > 0).length;
  const heroGlowBare = !!v.hero && dark && v.hero.align === "center" && GLOW.has(`hero:${v.hero.variant}`) && v.hero.images === 0;
  if ((v.flow.length && centred / v.flow.length > 0.6) || heroGlowBare) items.push(s("S05", 2, "design.slop.S05", { vars: { count: centred, total: v.flow.length } }));
  // S06: the single-radial glow on > 2 sections
  const glows = v.all.filter((x) => GLOW.has(`${x.type}:${x.variant}`));
  if (glows.length > 2) items.push(s("S06", 2, "design.slop.S06", { section: glows[2]!.id, vars: { count: glows.length } }));
  // S07: an icon above every block title in > 2 sections
  const icons = v.flow.filter((x) => x.f.iconHeads).length;
  if (icons > 2) items.push(s("S07", 1, "design.slop.S07", { vars: { count: icons } }));
  // S08: bento in > 1 section
  if (v.counts.bento > 1) items.push(s("S08", 1, "design.slop.S08", { vars: { count: v.counts.bento } }));
  // S09: bounce easing outside playground
  const bounce = v.look ? v.look.mo.f === "soft-spring" : /cubic-bezier\([^)]*,\s*1\.[1-9]/.test(t["lp-ease-spring"] ?? "") && input.theme.attrs["data-motion"] !== "off";
  if (bounce && v.genome.brand.G1 !== "playground") items.push(s("S09", 2, "design.slop.S09"));
  // S10: more than one signature animation per section on > 50 % of the sections
  const animated = v.flow.filter((x) => x.f.animatesLayout || (x.f.scroller && x.f.revealNodes > 2)).length;
  if (v.flow.length && animated / v.flow.length > 0.5) items.push(s("S10", 2, "design.slop.S10", { vars: { count: animated } }));
  // S11: more than 3 secondary details
  const details = v.all.reduce((n, x) => n + x.f.details, 0);
  if (details > 3) items.push(s("S11", Math.min(3, details - 3), "design.slop.S11", { vars: { count: details, limit: 3 } }));
  // S12: more than one giant decorative word, or an Arabic one wider than its column
  const ghosts = v.all.filter((x) => x.f.ghostWord);
  const arOverflow = v.ar && ghosts.some((x) => typeof x.data.bigWord === "string" && [...(x.data.bigWord as string)].length * 0.5 * 96 > 358);
  if (ghosts.length > 1 || arOverflow) items.push(s("S12", 2, "design.slop.S12", { section: ghosts[ghosts.length - 1]?.id, vars: { count: ghosts.length } }));
  // S13: chips over product photos: > 2 on one photo or on > 1 photo
  const chipped = v.all.filter((x) => x.f.overlayChips > 0 && x.images > 0);
  if (chipped.some((x) => x.f.overlayChips > 2) || chipped.length > 1) items.push(s("S13", 2, "design.slop.S13", { section: chipped[1]?.id ?? chipped[0]?.id, vars: { count: chipped.length } }));
  // S14: two or more scrolling strips
  if (v.counts.marquees >= 2) items.push(s("S14", 3, "design.slop.S14", { vars: { count: v.counts.marquees } }));
  // S15: numbered or edition eyebrows
  const numbered = v.all.filter((x) => x.f.numberedEyebrow || eyebrowsOf(x).some((e) => NUMBERED_EYEBROW.test(e)));
  if (numbered.length) items.push(s("S15", 2, "design.slop.S15", { section: numbered[0]!.id, vars: { count: numbered.length } }));
  // S16: decorative status dots
  const dots = v.all.filter((x) => x.f.dots);
  if (dots.length) items.push(s("S16", 1, "design.slop.S16", { section: dots[0]!.id }));
  // S17: the rotating-text ring badge
  const rings = v.all.filter((x) => x.f.ring);
  if (rings.length) items.push(s("S17", 3, "design.slop.S17", { section: rings[0]!.id }));
  // S18: identical section headers (kicker + title + lead) in ≥ 4 sections
  const heads = v.flow.filter((x) => x.kicker && x.title && (typeof x.data.lead === "string" || typeof x.data.subtitle === "string") && String(x.data.lead ?? x.data.subtitle).trim());
  if (heads.length >= 4) items.push(s("S18", 2, "design.slop.S18", { vars: { count: heads.length } }));
  // S19: per-word reveal spans (a page without look splits every animated title; a look reveals whole lines)
  const titled = v.flow.filter((x) => x.title).length;
  const split = !v.look && input.theme.attrs["data-motion"] !== "off";
  if (split && (v.ar ? titled > 0 : titled > 2)) items.push(s("S19", 2, "design.slop.S19", { vars: { count: titled } }));
  // S20 / S21: chat-mock and phone-mock frames
  const chat = v.all.filter((x) => MOCK_CHAT.has(`${x.type}:${x.variant}`));
  if (chat.length) items.push(s("S20", 2, "design.slop.S20", { section: chat[0]!.id }));
  const phone = v.all.filter((x) => MOCK_PHONE.has(`${x.type}:${x.variant}`));
  if (phone.length) items.push(s("S21", 2, "design.slop.S21", { section: phone[0]!.id }));
  // S22: big-number stats with footnoted "sources"
  const sourced = v.all.filter((x) => x.type === "stats" && ["source", "footnote", "sources"].some((k) => typeof x.data[k] === "string" && (x.data[k] as string).trim()));
  if (sourced.length) items.push(s("S22", 2, "design.slop.S22", { section: sourced[0]!.id }));
  // S23: the countdown outside the form chip (a section), or in more than one place
  const countdowns = v.all.filter((x) => x.type === "urgency" && x.variant === "countdown");
  const tickerCountdown = v.all.some((x) => x.type === "announcement" && x.data.countdown === true);
  if (countdowns.length && (v.look || countdowns.length > 1 || tickerCountdown)) items.push(s("S23", 2, "design.slop.S23", { section: countdowns[0]!.id }));
  // S24: the giant cut-off wordmark footer
  const footerWord = v.all.find((x) => x.type === "footer" && x.variant === "big");
  if (footerWord) items.push(s("S24", 1, "design.slop.S24", { section: footerWord.id }));
  // S25: hotspot callouts without merchant anchors
  for (const x of v.all.filter((y) => y.type === "showcase" && y.variant === "hotspots")) {
    const points = (Array.isArray(x.data.points) ? x.data.points : Array.isArray(x.data.hotspots) ? x.data.hotspots : []) as { x?: unknown; y?: unknown }[];
    if (!points.length || points.some((p) => typeof p?.x !== "number" || typeof p?.y !== "number")) items.push(s("S25", 2, "design.slop.S25", { section: x.id }));
  }
  // S26: the tell budget (≤ 2 of the thirteen devices)
  const tells = tellDevices(v);
  if (tells.length > 2) items.push(s("S26", 3 + (tells.length - 3), "design.slop.S26", { vars: { count: tells.length, limit: 2, devices: tells.join(", ") } }));
  return { score: items.reduce((n, x) => n + x.penalty, 0), items };
}

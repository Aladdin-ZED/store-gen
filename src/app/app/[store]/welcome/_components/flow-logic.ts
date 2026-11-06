/**
 * The welcome flow's pure rules (P2 SHELL; platform.md PLA-§22.2, PD23; UX-01): the step machine (resume, the views an
 * owner may go back to, transitions, skip), the typed price and the price before, the run's seed and the masked signup
 * phone. Isomorphic and dependency-free, so the shell selftest (`test:shell`) runs it in Node.
 *
 * Steps as the `onboarding` setting saves them (PLA-§2.4): photos → details → reveal → contact → done, or skipped.
 * `photos` and `details` are one save (`saveOnboardingDetailsAction` moves the saved step to `reveal`); the browser
 * moves between them on its own. Once "Use this design" made the page (`pageId`), the steps before `contact` are closed:
 * the page exists and a second reveal would make nothing.
 */

export const FLOW_STEPS = ["photos", "details", "reveal", "contact", "done"] as const;
export type FlowStep = (typeof FLOW_STEPS)[number];
export type SavedStep = FlowStep | "skipped";

const indexOf = (s: FlowStep) => FLOW_STEPS.indexOf(s);
const isFlowStep = (v: unknown): v is FlowStep => typeof v === "string" && (FLOW_STEPS as readonly string[]).includes(v);

/** May the owner open `view` while the saved step is `saved`? Never ahead of it; never before `contact` once the page exists. */
export function canView(view: FlowStep, saved: SavedStep, hasPage: boolean): boolean {
  if (saved === "skipped") return false;
  if (indexOf(view) > indexOf(saved)) return false;
  if (hasPage && indexOf(view) < indexOf("contact")) return false;
  // `done` is a result, not a form: it shows only once the flow is done
  return view !== "done" || saved === "done";
}

/**
 * The view the page opens on (a reload resumes, PLA-§22.2): the saved step, or the earlier one `?step=` names while
 * it is still open. `null` = the flow was skipped (the page sends the owner to the dashboard).
 */
export function initialView(saved: SavedStep, asked: string | undefined, hasPage: boolean): FlowStep | null {
  if (saved === "skipped") return null;
  if (isFlowStep(asked) && canView(asked, saved, hasPage)) return asked;
  return saved;
}

/** The next view after a step's own action succeeded. */
export function nextView(view: FlowStep): FlowStep {
  return FLOW_STEPS[Math.min(indexOf(view) + 1, FLOW_STEPS.length - 1)]!;
}

/**
 * The furthest step the owner reached: the saved one, or the browser's own `details` (photos → details is not a save).
 */
export function reachedStep(saved: SavedStep, view: FlowStep): SavedStep {
  if (saved === "skipped" || saved === "done") return saved;
  return indexOf(view) > indexOf(saved) ? view : saved;
}

/** "Back": the view before, when the owner may still open it; null on the first step and once the page exists. */
export function previousView(view: FlowStep, reached: SavedStep, hasPage: boolean): FlowStep | null {
  const i = indexOf(view);
  if (i <= 0 || view === "done") return null;
  const prev = FLOW_STEPS[i - 1]!;
  return canView(prev, reached, hasPage) ? prev : null;
}

/** "Skip for now" is offered until the page is made (after that the flow is one tap from done). */
export const canSkip = (view: FlowStep, hasPage: boolean) => !hasPage && indexOf(view) < indexOf("contact");

/** The progress bar: four segments (photos, details, reveal, contact); done fills them all. */
export const PROGRESS_SEGMENTS = 4;
export const progressOf = (view: FlowStep) => Math.min(indexOf(view) + 1, PROGRESS_SEGMENTS);

/* ------------------------------------------------------------------ */
/* the typed price (PD23, owner rule 4)                                */
/* ------------------------------------------------------------------ */

/** The largest price the flow takes, in minor units (OnboardingSchema's bound: 1,000,000.00). */
export const PRICE_MINOR_MAX = 100_000_000;

/** Arabic-Indic and Eastern Arabic-Indic digits as Latin ones (a phone keyboard in Arabic types them). */
function latinDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (d) => String((d.charCodeAt(0) & 0xf) % 10));
}

/**
 * What the owner typed as a price, in integer minor units: "199", "199.5", "199,50", "1 299", "١٩٩". `null` when it is
 * empty, not a number, more than two decimals, zero or above the maximum. Never rounds: "19.999" is not a price.
 */
export function parsePrice(text: string): number | null {
  const s = latinDigits(text)
    .trim()
    .replace(/[\s  ']/g, "");
  if (!s) return null;
  // one decimal separator, "," or "."; a thousands separator only as "1.299,00" / "1,299.00" is ambiguous: refused
  const m = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const minor = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return minor >= 1 && minor <= PRICE_MINOR_MAX ? minor : null;
}

/** Minor units as the field shows them: "199", "199.50". */
export function priceText(minor: number | null): string {
  if (minor === null || !Number.isFinite(minor)) return "";
  const whole = Math.floor(minor / 100);
  const cents = minor % 100;
  return cents ? `${whole}.${String(cents).padStart(2, "0")}` : String(whole);
}

/** The price before is kept only when typed and higher than the price (PLA-§22.2: "only a price you really sold at"). */
export function keptCompareAt(priceMinor: number | null, compareAtMinor: number | null): number | null {
  if (priceMinor === null || compareAtMinor === null) return null;
  return compareAtMinor > priceMinor ? compareAtMinor : null;
}

export interface DetailsDraft {
  category: string | null;
  productName: string;
  /** the price field's text, as typed */
  price: string;
  /** the price-before field's text, as typed ("" = none) */
  compareAt: string;
  fact: string;
}

export type DetailsField = "category" | "productName" | "priceMinor" | "compareAtMinor";
export type DetailsErrorKey = "onboarding.category_required" | "onboarding.name_required" | "onboarding.price_required" | "onboarding.price_invalid" | "onboarding.compare_invalid";

/** The details step's own checks, the same as the server's (OnboardingDetailsInput): field → message key. */
export function detailsErrors(d: DetailsDraft): Partial<Record<DetailsField, DetailsErrorKey>> {
  const out: Partial<Record<DetailsField, DetailsErrorKey>> = {};
  if (!d.category) out.category = "onboarding.category_required";
  if (!d.productName.trim()) out.productName = "onboarding.name_required";
  const price = parsePrice(d.price);
  if (!d.price.trim()) out.priceMinor = "onboarding.price_required";
  else if (price === null) out.priceMinor = "onboarding.price_invalid";
  if (d.compareAt.trim()) {
    const before = parsePrice(d.compareAt);
    if (before === null || (price !== null && before <= price)) out.compareAtMinor = "onboarding.compare_invalid";
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* the run's seed, the masked phone, the typed WhatsApp number         */
/* ------------------------------------------------------------------ */

/**
 * The reveal's `seedBase` (DES-§14.2: the store's `brandSeed`) as the generator's 31-bit integer, computed on the server
 * so the seed itself never reaches the browser; a reload shows the same three again.
 */
export function revealSeed(brandSeed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < brandSeed.length; i++) {
    h ^= brandSeed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 2_147_483_647;
}

/** "Show 3 more": round 1, 2 … of the same store's seed. */
export const roundSeed = (base: number, round: number) => (base + round * 104_729) % 2_147_483_647;

/** "+212612345634" → "+212 6•• ••• •34": the country code, the first national digit and the last two (the toggle's label). */
export function maskSignupPhone(e164: string): string | null {
  const digits = e164.replace(/[^\d+]/g, "");
  const m = /^\+(212|33|34|1|\d{2,3})(\d)(\d{5,12})(\d{2})$/.exec(digits);
  if (!m) return null;
  const hidden = "•".repeat(m[3]!.length);
  // grouped 2-3-1 like the label of PLA-§22.2: "6•• ••• •34"
  const masked = `${m[2]}${hidden}`;
  return `+${m[1]} ${masked.slice(0, 3)} ${masked.slice(3, 6)} ${masked.slice(6)}${m[4]}`.replace(/\s+/g, " ");
}

/**
 * A WhatsApp number as typed, as E.164 for the store's market: "06 12 34 56 78" → "+212612345678" in Morocco; "00…"
 * → "+…"; a number with its "+" stays. The server's E164 check stays the judge.
 */
export function typedWhatsapp(text: string, market: string): string {
  const s = latinDigits(text).replace(/[\s().-]/g, "");
  if (s.startsWith("+")) return s;
  if (s.startsWith("00")) return `+${s.slice(2)}`;
  if (market === "MA") {
    if (/^0[5-7]\d{8}$/.test(s)) return `+212${s.slice(1)}`;
    if (/^212[5-7]\d{8}$/.test(s)) return `+${s}`;
  }
  return s;
}

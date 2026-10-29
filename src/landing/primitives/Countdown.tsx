import { Fragment, type ReactElement } from "react";
import { pluralForms } from "../i18n";
import type { RenderContext } from "../types";
import { lookOf } from "./RichText";
import { cx, pad2 } from "./util";

/**
 * The Arabic day label by Intl.PluralRules category, under a look (design.md DES-§4.5.4 Countdown; RTL2): 2 days read
 * "يومان", never the oblique "يومين" after a numeral ("02 يومين"); 3-10 "أيام", 11-99 "يومًا". The runtime re-picks the
 * label from these forms on its first tick (src/landing/runtime/countdown.ts, unchanged).
 */
const AR_DAY_FORMS: Readonly<Record<string, string>> = { one: "يوم", two: "يومان", few: "أيام", many: "يومًا", other: "يوم" };

export interface CountdownProps {
  ctx: RenderContext;
  /** ISO end date set by the admin (never auto-resets) */
  end: string | undefined | null;
  /** one-line "02 jours 14:33:05" instead of labelled blocks */
  compact?: boolean;
  /** accessible name (default: "L'offre se termine dans") */
  label?: string;
  /** hide when it reaches zero (default true) */
  hideExpired?: boolean;
  className?: string;
}

/** "2026-10-07T18:30:00+01:00" → epoch ms. Only full ISO date-times WITH a zone (Z or ±hh:mm) are
 * accepted: a zoneless time would mean a different instant on the server and in the preview. */
const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|([+-])(\d{2}):?(\d{2}))$/;

/** Days since 1970-01-01 of a proleptic Gregorian date (Howard Hinnant's days_from_civil). */
function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of daysFromCivil → [y, m, d]. */
function civilFromDays(z: number): [number, number, number] {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return [era * 400 + yoe + (m <= 2 ? 1 : 0), m, d];
}

/** Pure ISO-8601 → epoch ms (no Date: deterministic in every runtime and time zone); NaN if invalid. */
export function isoToMs(iso: string): number {
  const m = ISO.exec(iso.trim());
  if (!m) return NaN;
  const [y, mo, d, h, mi, sec] = [1, 2, 3, 4, 5, 6].map((i) => Number(m[i] ?? 0)) as [number, number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 59) return NaN;
  const [cy, cm, cd] = civilFromDays(daysFromCivil(y, mo, d));
  if (cy !== y || cm !== mo || cd !== d) return NaN; // 31 February & co.
  const ms = m[7] ? Number(m[7].slice(0, 3).padEnd(3, "0")) : 0;
  const off = m[8] === "Z" ? 0 : (m[9] === "-" ? -1 : 1) * (Number(m[10]) * 60 + Number(m[11]));
  return ((daysFromCivil(y, mo, d) * 24 + h) * 60 + mi - off) * 60000 + sec * 1000 + ms;
}

/** epoch ms → "YYYY-MM-DDTHH:MM:SS.000Z" (what the runtime reads from data-countdown). */
function msToIso(ms: number): string {
  const days = Math.floor(ms / 86400000);
  let rest = ms - days * 86400000;
  const [y, mo, d] = civilFromDays(days);
  const h = Math.floor(rest / 3600000);
  rest -= h * 3600000;
  const mi = Math.floor(rest / 60000);
  rest -= mi * 60000;
  const s = Math.floor(rest / 1000);
  const msPart = rest - s * 1000;
  return `${String(y).padStart(4, "0")}-${pad2(mo)}-${pad2(d)}T${pad2(h)}:${pad2(mi)}:${pad2(s)}.${String(msPart).padStart(3, "0")}Z`;
}

/**
 * Real countdown (runtime contract: data-countdown + [data-cd=d|h|m|s]). Values are computed
 * from ctx.now so the static HTML is already correct; nothing renders once the end has passed.
 * The days slot is only rendered while at least one full day is left. Digits read LTR in every
 * language; default look = soft tiles with big tabular digits, `compact` = one inline line in the
 * host's own face (on RTL pages the days group leads the reading order — base.css §17).
 *
 * The page is static and visited long after it was rendered, so the runtime rewrites every value on
 * its first tick: the days label carries its plural forms (`data-cd-label="d"` + `data-forms`, JSON
 * of Intl.PluralRules categories) and is re-picked whenever the day count changes. In compact mode
 * the days group (`data-cd-collapse`) is hidden once less than a day is left ("23:59:59").
 */
export function Countdown({
  ctx,
  end,
  compact = false,
  label,
  hideExpired = true,
  className,
}: CountdownProps): ReactElement | null {
  if (!end) return null;
  const endMs = isoToMs(end);
  const nowMs = isoToMs(ctx.now);
  if (!Number.isFinite(endMs) || !Number.isFinite(nowMs) || endMs <= nowMs) return null;
  let s = Math.floor((endMs - nowMs) / 1000);
  const days = Math.floor(s / 86400);
  s -= days * 86400;
  const hours = Math.floor(s / 3600);
  s -= hours * 3600;
  const minutes = Math.floor(s / 60);
  const seconds = s - minutes * 60;
  // Less than a day left at render time → no days slot (time only goes down, so hours never
  // exceed 23 and the runtime's "hours carry the days" rule keeps it exact).
  const look = lookOf(ctx);
  const arLook = look && ctx.locale === "ar";
  const dayForms = days > 0 ? (arLook ? { ...AR_DAY_FORMS } : pluralForms(ctx.locale, "urgency.days")) : null;
  const dayLabel = arLook ? (AR_DAY_FORMS[new Intl.PluralRules("ar").select(days)] ?? AR_DAY_FORMS.other!) : ctx.t("urgency.days", { n: days });
  const units = [
    ...(days > 0 ? [{ k: "d", v: days, lab: dayLabel }] : []),
    { k: "h", v: hours, lab: ctx.t("urgency.hours") },
    { k: "m", v: minutes, lab: ctx.t("urgency.minutes") },
    { k: "s", v: seconds, lab: ctx.t("urgency.seconds") },
  ];
  return (
    <div
      className={cx("lp-cd", compact && "lp-cd--compact", className)}
      data-countdown={msToIso(endMs)}
      data-hide-expired={hideExpired ? "" : undefined}
      role="timer"
      aria-label={label ?? ctx.t("urgency.endsIn")}
    >
      {units.map((u, i) => (
        <Fragment key={u.k}>
          {i > 0 && !(compact && units[i - 1]!.k === "d") ? (
            <span className="lp-cd__sep" aria-hidden="true">
              :
            </span>
          ) : null}
          {look ? (
            // under a look the numeral and its unit are one LTR isolate (RTL1, RTL2), so the text around never reorders
            // them; the compact Arabic day group still reads figure first from the right (base.css §17 sets its
            // direction, as for a document without look)
            <bdi className="lp-cd__unit" dir="ltr" data-unit={u.k} data-cd-collapse={compact && u.k === "d" ? "" : undefined}>
              <span className="lp-cd__num" data-cd={u.k}>
                {pad2(u.v)}
              </span>
              <span
                className={cx("lp-cd__lab", compact && u.k !== "d" && "lp-visually-hidden")}
                data-cd-label={u.k === "d" && dayForms ? "d" : undefined}
                data-forms={u.k === "d" && dayForms ? JSON.stringify(dayForms) : undefined}
              >
                {u.lab}
              </span>
            </bdi>
          ) : (
            <span className="lp-cd__unit" data-unit={u.k} data-cd-collapse={compact && u.k === "d" ? "" : undefined}>
              <span className="lp-cd__num" data-cd={u.k}>
                {pad2(u.v)}
              </span>
              <span
                className={cx("lp-cd__lab", compact && u.k !== "d" && "lp-visually-hidden")}
                data-cd-label={u.k === "d" && dayForms ? "d" : undefined}
                data-forms={u.k === "d" && dayForms ? JSON.stringify(dayForms) : undefined}
              >
                {u.lab}
              </span>
            </span>
          )}
        </Fragment>
      ))}
    </div>
  );
}

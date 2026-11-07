import type { MarketingCopy } from "../copy";
import { MiniPage } from "./loom";
import L from "./living.module.css";

/*
 * The homepage's one SVG sprite (spec §1): the glyphs every model reuses through <use>, the scan gradient and the
 * static best_fit frame of the final band. Rendered once at the top of <main>, positioned off-layout with a zero box
 * (never display:none, which drops gradients and <use> targets in some engines). Glyphs draw in currentColor.
 */
export function Sprite({ t, rtl }: { t: MarketingCopy; rtl: boolean }) {
  return (
    <svg className={L.sprite} aria-hidden="true" focusable="false" width="0" height="0">
      <defs>
        <linearGradient id="sg-scan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className={L.scanStop} stopOpacity={0} />
          <stop offset="1" className={L.scanStop} stopOpacity={0.18} />
        </linearGradient>
        <symbol id="sg-glyph" viewBox="0 0 16 16">
          <path d="M3 10.5 8 13l5-2.5M3 7.5 8 10l5-2.5M8 3 3 5.5 8 8l5-2.5L8 3Z" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
        </symbol>
        <g fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <symbol id="sg-photo" viewBox="0 0 24 24">
            <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" fill="none" stroke="currentColor" strokeWidth={1.5} />
            <rect x="9.5" y="6.5" width="5" height="9.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth={1.5} />
            <path d="M7 18.25h10" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          </symbol>
          <symbol id="sg-page" viewBox="0 0 24 24">
            <rect x="4.5" y="2.5" width="15" height="19" rx="2.5" fill="none" stroke="currentColor" strokeWidth={1.5} />
            <path d="M8 7h8M8 10h5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
            <rect x="8" y="13.5" width="8" height="4" rx="2" fill="none" stroke="currentColor" strokeWidth={1.5} />
          </symbol>
          <symbol id="sg-parcel" viewBox="0 0 24 24">
            <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3ZM4 7.5 12 12l8-4.5M12 12v9M8 5.25l8 4.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          </symbol>
          <symbol id="sg-headset" viewBox="0 0 24 24">
            <path d="M5 13v-1a7 7 0 0 1 14 0v1M19 18v.5a3 3 0 0 1-3 3h-2.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
            <rect x="3.5" y="12.5" width="3.5" height="5.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth={1.5} />
            <rect x="17" y="12.5" width="3.5" height="5.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth={1.5} />
          </symbol>
          <symbol id="sg-sheet" viewBox="0 0 24 24">
            <rect x="4" y="3.5" width="16" height="17" rx="2.5" fill="none" stroke="currentColor" strokeWidth={1.5} />
            <path d="M4 9.25h16M4 14.75h16M9.5 3.5v17M14.5 3.5v17" fill="none" stroke="currentColor" strokeWidth={1.25} />
          </symbol>
          <symbol id="sg-pulse" viewBox="0 0 24 24">
            <path d="M3 12h4l2-5 3 10 2.5-7 1.5 2H21" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          </symbol>
          <symbol id="sg-plane" viewBox="0 0 24 24">
            <path d="M20.5 4.5 3.5 11.2l5.6 2.1 2.1 6.2 3-3.9 4.4 3.2 1.9-14.3ZM9.1 13.3l7.4-5.6" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          </symbol>
          <symbol id="sg-bubble" viewBox="0 0 24 24">
            <path d="M5 4.5h14a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-8l-4 3.25V17H5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
            <path d="M7 8.5h10M7 11h10M7 13.5h6" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" />
          </symbol>
          <symbol id="sg-clock" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth={1.5} />
            <path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </symbol>
          <symbol id="sg-check" viewBox="0 0 24 24">
            <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
          </symbol>
          <symbol id="sg-phone" viewBox="0 0 24 24">
            <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" fill="none" stroke="currentColor" strokeWidth={1.5} />
            <path d="M10.5 18.5h3" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          </symbol>
        </g>
        <symbol id="sg-frame-best" viewBox="0 0 300 552">
          <MiniPage slot="best_fit" t={t} rtl={rtl} label={t.home.slots.best_fit} />
        </symbol>
      </defs>
    </svg>
  );
}

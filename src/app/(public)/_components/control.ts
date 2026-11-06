/*
 * Touch ergonomics of the sign-in forms (platform.md PLA-§22.1, UX-37): controls are 52 px tall below 768 px and 48 px
 * above, with 16 px text below 768 px so iOS Safari never zooms on focus. A plain module, so server components (the
 * support button) and client forms share it.
 */
export const CONTROL_CLASS = "h-13 text-base md:h-12 md:text-[0.95rem]";

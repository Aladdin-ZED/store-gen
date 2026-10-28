/**
 * Lead capture per market (P3 LANDING; landing.md LD11, LAN-§10.1, §10.6; P0b, CCR P3-3). Pure: the store render
 * context asks it for every live and test document (src/lib/render/store-context.server.ts), and a page whose answer
 * is false carries no `endpoints.lead` in its runtime config (already optional there), so the frozen beacon never
 * fires. `capture` is the `landing` setting's `leads.capture`. P3 implements the rule (on for MA and INTL by default,
 * off for the EU markets until the EU pack adds consent); the signature is frozen (src/lib/contracts/r1-p0b-render.ts).
 *
 * Until P3 merges: true, today's behaviour (every page captures leads).
 */
export function leadCaptureOn(market: string, capture: "market_default" | "on" | "off"): boolean {
  void market;
  void capture;
  return true;
}

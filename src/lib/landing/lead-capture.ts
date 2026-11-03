/**
 * Lead capture per market (P3 LANDING; landing.md LD11, LAN-§10.1, §10.6; P0b, CCR P3-3). Pure: the store render
 * context asks it for every live and test document (src/lib/render/store-context.server.ts), and a page whose answer
 * is false carries no `endpoints.lead` in its runtime config (already optional there), so the frozen beacon never
 * fires; `upsertLead` asks it again and drops a beacon that still arrives (an export, an old tab). `capture` is the
 * `landing` setting's `leads.capture`; the signature is frozen (src/lib/contracts/r1-p0b-render.ts).
 *
 * The rule: the EU markets (FR, BE, ES, DE, IT, NL, PT) never capture, whatever the setting, until the EU pack (ST-21)
 * adds consent; every other market (MA, INTL) follows the setting, and `market_default` is on.
 */

/** Markets where a typed phone needs consent before submit (GDPR): capture stays off with no override (LD11). */
export const EU_LEAD_MARKETS: readonly string[] = ["FR", "BE", "ES", "DE", "IT", "NL", "PT"];

export function leadCaptureOn(market: string, capture: "market_default" | "on" | "off"): boolean {
  if (EU_LEAD_MARKETS.includes(market.toUpperCase())) return false;
  return capture !== "off";
}

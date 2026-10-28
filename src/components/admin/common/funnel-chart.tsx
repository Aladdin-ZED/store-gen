/**
 * FunnelChart (P2 SHELL; platform.md PLA-§22.12, §22.17, PD63; docs/STORE-SAAS.md §I.6, §I.8 rule 3): the order
 * funnel (orders, confirmed, shipped, delivered, collected) as horizontal stepped bars, delivered in jade. One of the
 * three places the dashboard draws numbers: a step whose data does not exist in this release (`value: null`) is the
 * neutral "with delivery tracking (R2)" line, never 0.
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts); P1 builds against them before P2 merges.
 * P0b stub: the track replaces the body, never the signature. The stub renders the period and one list item per
 * step with its label and, only when `value` is not null, its value (the rate as `data-rate`); a null step renders no
 * number. The bars and the R2 line are P2's.
 */
import type { ReactElement } from "react";

export interface FunnelChartProps {
  steps: { id: "orders" | "confirmed" | "shipped" | "delivered" | "collected"; label: string; value: number | null /* null = not available in this release */; rate?: number }[];
  period: string;
}

export function FunnelChart(p: FunnelChartProps): ReactElement | null {
  return (
    <figure>
      <figcaption>{p.period}</figcaption>
      <ol>
        {p.steps.map((step) => (
          <li key={step.id} data-step={step.id} data-rate={step.value !== null ? step.rate : undefined}>
            <span>{step.label}</span>
            {step.value !== null && (
              <>
                {" "}
                <data value={step.value}>{step.value}</data>
              </>
            )}
          </li>
        ))}
      </ol>
    </figure>
  );
}

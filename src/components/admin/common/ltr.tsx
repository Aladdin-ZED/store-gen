/**
 * A left-to-right island inside any text (docs/STORE-SAAS.md §I.5, §I.8 rule 7; DES-§16.15): phones, order ids, URLs,
 * handles and e-mails keep their reading order in an Arabic sentence ("+212 6•• ••• •34", "@atlas-home"), and the
 * sentence around them keeps its own. Server- and client-safe (no hooks).
 *
 *   <Ltr>{phone}</Ltr>   ·   <Ltr className="font-mono">{orderRef}</Ltr>
 */
import type { ReactNode } from "react";

export function Ltr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={className}>
      {children}
    </bdi>
  );
}

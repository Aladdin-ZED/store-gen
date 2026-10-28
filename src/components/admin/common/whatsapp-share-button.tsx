/**
 * WhatsAppShareButton (P2 SHELL; platform.md PLA-§22.12, §22.7, PD1, PD61): shares a text (the store address, a
 * private preview link) through a wa.me link, opened with noopener; with `phone`, to that number.
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts); P1 builds against them before P2 merges.
 * P0b stub: the track replaces the body, never the signature. The stub renders the wa.me link (the phone's digits, the
 * text encoded) named by `label`, or by the service's name without one; the icon and the button styling are P2's.
 */
import type { ReactElement } from "react";

export interface WhatsAppShareButtonProps {
  text: string;
  phone?: string | null;
  label?: string;
}

export function WhatsAppShareButton(p: WhatsAppShareButtonProps): ReactElement | null {
  const digits = (p.phone ?? "").replace(/\D/g, "");
  const href = `https://wa.me/${digits}?text=${encodeURIComponent(p.text)}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {p.label ?? "WhatsApp"}
    </a>
  );
}

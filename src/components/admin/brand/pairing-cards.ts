/**
 * The Type tab's cards (P6 DESIGN; design.md DES-§12.2, DES-§10.3): every loaded catalogue pairing with its family
 * names, built on the server per request (pure; the catalogue is static).
 */
import { loadCatalogue } from "@/lib/design/pairings";
import { fontData } from "@/lib/theme/fonts";
import type { PairingCard } from "./types";

export function pairingCards(): PairingCard[] {
  const family = (id: string) => fontData(id)?.family ?? id;
  return loadCatalogue().pairings.map((p) => ({
    id: p.id,
    note: p.note,
    archetype: p.archetype,
    alsoFits: [...p.alsoFits],
    display: p.display,
    displayAr: p.displayAr,
    body: p.body,
    displayWeight: p.displayWeight,
    displayWeightAr: p.displayWeightAr,
    families: { display: family(p.display), displayAr: family(p.displayAr), body: family(p.body) },
  }));
}

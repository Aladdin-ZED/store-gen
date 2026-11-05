/**
 * The designer seed genomes (P6 DESIGN; design.md DES-§17.2): ≥ 44, four per archetype, each with a distinct grammar.
 * They are the MAP-Elites elites of DES-§7.7 (R3) and the solver's regression set: every seed must stay valid when the
 * rules change (`test:design` seeds group). Parameters only (DES-§22: no store id or genome id in this folder).
 */
import type { Archetype } from "@/lib/page/schema";
import { seeds as apothecary } from "./apothecary";
import { seeds as bloom } from "./bloom";
import { seeds as circuit } from "./circuit";
import { seeds as editorial } from "./editorial";
import { seeds as field } from "./field";
import { seeds as garage } from "./garage";
import { seeds as hearth } from "./hearth";
import { seeds as kinetic } from "./kinetic";
import { seeds as maison } from "./maison";
import { seeds as playground } from "./playground";
import { seeds as souk } from "./souk";
import type { DesignerSeed } from "./types";

export type { DesignerSeed } from "./types";

export const DESIGNER_SEEDS: readonly DesignerSeed[] = [...maison, ...apothecary, ...souk, ...playground, ...kinetic, ...circuit, ...hearth, ...bloom, ...field, ...editorial, ...garage];

export const seedsFor = (archetype: Archetype): readonly DesignerSeed[] => DESIGNER_SEEDS.filter((s) => s.archetype === archetype);

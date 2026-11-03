"use client";
/**
 * The dashboard's density (P2 SHELL; design.md DES-§16.7; docs/STORE-SAAS.md §I.6): `[data-density="comfortable" |
 * "compact"]` on the store frame (rows 40 / 32 px, controls 36 / 30 px, type 14 / 13 px). Call agents and managers
 * start compact, everyone else comfortable; the viewer's own choice (the account menu) is remembered in localStorage,
 * a per-viewer convenience: every access is wrapped, and a blocked storage keeps the role's default. Touch targets
 * stay ≥ 44 px whatever the density.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { defaultDensity, type Density } from "./chrome-logic";

export { DENSITIES, defaultDensity, type Density } from "./chrome-logic";

const keyOf = (viewerId: string) => `sg:density:${viewerId}`;

function readDensity(viewerId: string): Density | null {
  try {
    const v = localStorage.getItem(keyOf(viewerId));
    return v === "comfortable" || v === "compact" ? v : null;
  } catch {
    return null;
  }
}

interface DensityApi {
  density: Density;
  setDensity(d: Density): void;
}

const DensityContext = createContext<DensityApi>({ density: "comfortable", setDensity: () => {} });

/** Wraps the frame: the attribute on a `display: contents` box, so every screen of the store inherits it. */
export function DensityProvider({ role, viewerId, children }: { role: string; viewerId: string; children: ReactNode }) {
  const [stored, setStored] = useState<Density | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setStored(readDensity(viewerId)), 0);
    return () => clearTimeout(timer);
  }, [viewerId]);
  const density = stored ?? defaultDensity(role);
  const setDensity = useCallback(
    (d: Density) => {
      setStored(d);
      try {
        localStorage.setItem(keyOf(viewerId), d);
      } catch {
        // storage blocked: the choice lasts for this visit
      }
    },
    [viewerId],
  );
  const api = useMemo(() => ({ density, setDensity }), [density, setDensity]);
  return (
    <DensityContext.Provider value={api}>
      <div data-density={density} className="contents">
        {children}
      </div>
    </DensityContext.Provider>
  );
}

export function useDensity(): DensityApi {
  return useContext(DensityContext);
}

"use client";
/**
 * What the shared primitives need to know about the viewer beyond the store (P2 SHELL; platform.md PLA-§10.2,
 * §22.12, PD56, PD69): whether this session is a staff member's read-only "view as store". The `[store]` layout
 * provides it from the seam's ctx; outside a provider the viewer is not impersonating.
 *
 * `MaskedValue` never offers a reveal and `IssueRow` disables its fix while it is true, whatever the caller passed: a
 * belt to the seam's braces (every write is refused server-side under impersonation anyway).
 */
import { createContext, useContext, type ReactNode } from "react";

export interface ViewerFlags {
  impersonating: boolean;
}

const ViewerFlagsContext = createContext<ViewerFlags>({ impersonating: false });

export function ViewerFlagsProvider({ value, children }: { value: ViewerFlags; children: ReactNode }) {
  return <ViewerFlagsContext.Provider value={value}>{children}</ViewerFlagsContext.Provider>;
}

export function useViewerFlags(): ViewerFlags {
  return useContext(ViewerFlagsContext);
}

"use client";
/**
 * The `platform_design` field group of the console's General settings (P6 DESIGN; platform.md PLA-§13.1, design.md
 * DES-§2.7, DES-R8; P0b CCR P1-5): the publish-gate thresholds, the slop limits and the incident switch, mounted by P1
 * on /admin/settings/general with `{ value, onSave }`. P6 merges after P1, so P1 builds against this stub.
 *
 * P0b stub: renders nothing (the console shows no design field until P6 merges; the setting keeps its stored value).
 * The props are frozen (src/lib/contracts/r1-p0b-design.ts); P6 replaces the body.
 */
import type { ReactElement } from "react";
import type { PlatformDesignSetting } from "@/lib/settings/keys/platform-design";

export function PlatformDesignFields(p: { value: PlatformDesignSetting; onSave(v: PlatformDesignSetting): Promise<void> }): ReactElement | null {
  void p;
  return null;
}

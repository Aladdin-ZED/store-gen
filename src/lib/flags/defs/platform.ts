/**
 * Release and ops flags of the platform track (P1 CONSOLE, platform.md PLA-§12.2).
 * Extension file (docs/STORE-SAAS.md §D.4, §K.3; PLA Q.16), created empty at P0 and imported by
 * src/lib/flags/registry.ts; the boot task seeds what the track declares here. Values are read through `flagValue()`
 * (src/lib/platform/flags.ts).
 */
import type { FlagDef } from "../registry";

export const flags: FlagDef[] = [
  {
    key: "console_perf_panel",
    kind: "ops",
    type: "boolean",
    description: "Shows request timings in the console footer for staff.",
    default: false,
    ownerTrack: "platform",
  },
  {
    key: "health_tenant_ring",
    kind: "release",
    type: "boolean",
    description: "Shows the Store Health ring and issue list to sellers. Off keeps the console flags and hides the ring from sellers.",
    default: true,
    ownerTrack: "platform",
  },
];

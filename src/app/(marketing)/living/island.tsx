"use client";

import { useEffect } from "react";

/*
 * The homepage's only client component (spec §1): it renders nothing and boots ./runtime.ts after the page has
 * loaded (the runtime itself waits for `load` plus an idle callback). Mounted once, at the end of <main>.
 */
export function LivingIsland() {
  useEffect(() => {
    let gone = false;
    let dispose: (() => void) | undefined;
    void import("./runtime").then((m) => {
      if (!gone) dispose = m.boot();
    });
    return () => {
      gone = true;
      dispose?.();
    };
  }, []);
  return null;
}

"use client";
/**
 * The reveal's progress line and novelty state (P6 DESIGN; design.md DES-§14.3 states, DES-§14.2 "failures degrade").
 * `RevealFolds`' props are frozen (core §K.2), so the real step ("Reading your photos", "Choosing type", "Checking
 * it's unique") and whether the uniqueness check answered travel from `buildRevealDirections` to the component
 * through this one tab-local value: written by the run in flight, read with `useSyncExternalStore`.
 */
import { useSyncExternalStore } from "react";
import type { PipelineStep } from "../pipeline";

export interface RevealStatus {
  step: PipelineStep | null;
  /** "unavailable": the check failed or took > 3 s, so no novelty words and the quiet line */
  novelty: "checked" | "unavailable" | "skipped";
}

const IDLE: RevealStatus = { step: null, novelty: "checked" };
let current: RevealStatus = IDLE;
const listeners: (() => void)[] = [];

export function setRevealStatus(next: Partial<RevealStatus>): void {
  current = { ...current, ...next };
  for (const l of listeners.slice()) l();
}

export function resetRevealStatus(): void {
  setRevealStatus(IDLE);
}

function subscribe(l: () => void): () => void {
  listeners.push(l);
  return () => {
    const at = listeners.indexOf(l);
    if (at >= 0) listeners.splice(at, 1);
  };
}

const read = () => current;
const readServer = () => IDLE;

export function useRevealStatus(): RevealStatus {
  return useSyncExternalStore(subscribe, read, readServer);
}

/**
 * Suggested facts (P7 AI; ai.md AI-04 acceptance (2) and (4), AI-§D.2 rule 7; rev 3 QUAL-18). Isomorphic and pure: the
 * reducer the wizard's Details step and P7's `SuggestedFacts` chips share.
 *
 *   const [facts, dispatch] = useReducer(factsReducer, initialFacts(product.facts));
 *   dispatch({ type: "suggest", facts: analysis.suggestedFacts });   // unticked chips
 *   dispatch({ type: "toggle", id });                                  // the owner's tick
 *   copyInput.product.facts = factsForCopy(facts);                     // owner-typed + ticked only
 *
 * A suggestion is never ticked by default, and only a ticked one enters `CopyPageInput.facts` (and so the numbers the
 * guard allows): a number read from a photo ("Contenance : 50 ml") reaches copy only after the owner ticks it. A new
 * analysis replaces the unticked chips and keeps the ticked ones; a suggestion the owner already typed is not shown.
 */

/** `TaskProduct.facts`: ≤ 6 facts × 200 chars (AI-§D.2 rule 7). */
export const FACT_LIMITS = { count: 6, chars: 200 } as const;
/** the chips shown at once (analyze answers ≤ 5) */
const MAX_SUGGESTIONS = 8;

export interface SuggestedFact {
  id: string;
  text: string;
  ticked: boolean;
}

export interface FactsState {
  /** the owner's own lines, as typed */
  typed: string[];
  suggestions: SuggestedFact[];
}

export type FactsAction =
  | { type: "typed"; facts: readonly string[] }
  | { type: "suggest"; facts: readonly string[] }
  | { type: "tick"; id: string }
  | { type: "untick"; id: string }
  | { type: "toggle"; id: string }
  | { type: "dismiss"; id: string }
  | { type: "clearSuggestions" };

const clean = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, FACT_LIMITS.chars);
const fold = (t: string) => clean(t).toLowerCase().normalize("NFKC");

/** A stable chip id from its text (the same suggestion keeps its id across analyses). */
export function suggestionId(text: string): string {
  let h = 0x811c9dc5;
  const f = fold(text);
  for (let i = 0; i < f.length; i++) {
    h ^= f.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `sf_${h.toString(36)}`;
}

export function initialFacts(typed: readonly string[] = []): FactsState {
  return { typed: typed.map(clean).filter(Boolean), suggestions: [] };
}

function setTick(state: FactsState, id: string, tick: (was: boolean) => boolean): FactsState {
  let changed = false;
  const suggestions = state.suggestions.map((s) => {
    if (s.id !== id) return s;
    const ticked = tick(s.ticked);
    if (ticked === s.ticked) return s;
    changed = true;
    return { ...s, ticked };
  });
  return changed ? { ...state, suggestions } : state;
}

export function factsReducer(state: FactsState, action: FactsAction): FactsState {
  switch (action.type) {
    case "typed": {
      const typed = action.facts.map(clean).filter(Boolean);
      const own = new Set(typed.map(fold));
      return { typed, suggestions: state.suggestions.filter((s) => !own.has(fold(s.text))) };
    }
    case "suggest": {
      const own = new Set(state.typed.map(fold));
      const kept = state.suggestions.filter((s) => s.ticked);
      const seen = new Set([...own, ...kept.map((s) => fold(s.text))]);
      const fresh: SuggestedFact[] = [];
      for (const raw of action.facts) {
        const text = clean(raw);
        const key = fold(text);
        if (!text || seen.has(key)) continue;
        seen.add(key);
        // never ticked by default (AI-04 (2))
        fresh.push({ id: suggestionId(text), text, ticked: false });
      }
      return { ...state, suggestions: [...kept, ...fresh].slice(0, MAX_SUGGESTIONS) };
    }
    case "tick":
      return setTick(state, action.id, () => true);
    case "untick":
      return setTick(state, action.id, () => false);
    case "toggle":
      return setTick(state, action.id, (was) => !was);
    case "dismiss":
      return state.suggestions.some((s) => s.id === action.id) ? { ...state, suggestions: state.suggestions.filter((s) => s.id !== action.id) } : state;
    case "clearSuggestions":
      return state.suggestions.length ? { ...state, suggestions: [] } : state;
  }
}

/** The facts a copy task may send: the owner's lines first, then the ticked suggestions; ≤ 6 × 200, no duplicates. */
export function factsForCopy(state: FactsState): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of [...state.typed, ...state.suggestions.filter((s) => s.ticked).map((s) => s.text)]) {
    const text = clean(t);
    const key = fold(text);
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= FACT_LIMITS.count) break;
  }
  return out;
}

/** The ticked suggestions that did not fit in the 6 facts (the chip row says so). */
export function overflowTicked(state: FactsState): SuggestedFact[] {
  const used = new Set(factsForCopy(state).map(fold));
  return state.suggestions.filter((s) => s.ticked && !used.has(fold(s.text)));
}

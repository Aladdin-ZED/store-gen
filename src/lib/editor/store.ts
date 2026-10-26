/**
 * Builder store: one vanilla zustand store per open page (immer for edits, zundo for undo/redo).
 *
 *  - Only `doc` is tracked by history (100 steps). Every edit names a `group`: consecutive edits of
 *    the same group within GROUP_MS collapse into one undo step (typing a headline = one step).
 *  - Dirty = `doc !== savedDoc` (reference check — undoing back to the saved doc is clean again).
 *  - "Live" = `doc === liveDoc` (the draft equals the published version).
 *  - Persistence state (saving / error / conflict) is written by the autosave hook; the store never
 *    talks to the server itself.
 */
import { temporal } from "zundo";
import { createStore } from "zustand/vanilla";
import { immer } from "zustand/middleware/immer";
import { castDraft, type Draft } from "immer";
import type { PreviewDevice } from "@/components/preview";
import { getSection } from "@/landing/registry";
import { FormConfig, Offers, Product, Seo, ThankYou, type PageDoc } from "@/lib/page/schema";
import { sectionIssues, valuesOfKind } from "./fields";
import { getAt, parsePath, setAt } from "./paths";
import { duplicateOf, isRequired, normalizeOrder, planInsert, zoneRange } from "./sections";
import type { EditorAsset, EditorBootstrap, EditorPageMeta, PageKind, VersionSummary } from "./types";

export type LeftTab = "sections" | "theme" | "product" | "offers" | "form" | "seo";

const LANDING_TABS: readonly LeftTab[] = ["sections", "theme", "product", "offers", "form", "seo"];
const STORE_PAGE_TABS: readonly LeftTab[] = ["sections", "theme", "seo"];

/**
 * The builder panels of a page kind (LND-30): a landing page sells its own product with offers and an order form;
 * a store page (R2 kinds: home, product, collection, …) takes its products from the catalog, so it has no
 * Product, Offers or Order form panel.
 */
export function tabsFor(kind: PageKind): readonly LeftTab[] {
  return kind === "landing" ? LANDING_TABS : STORE_PAGE_TABS;
}
export type ZoomLevel = "fit" | 0.5 | 0.75 | 1;

/** Edits of the same group closer than this become one undo step. */
const GROUP_MS = 900;
const HISTORY_LIMIT = 100;

export interface EditorData {
  doc: PageDoc;
  page: EditorPageMeta;
  assets: Record<string, EditorAsset>;
  /** last doc the server confirmed */
  savedDoc: PageDoc;
  /** doc equal to the published version (null: not published, or the draft differs) */
  liveDoc: PageDoc | null;
  versions: VersionSummary[];
  hasMoreVersions: boolean;

  selectedId: string | null;
  device: PreviewDevice;
  zoom: ZoomLevel;
  interactive: boolean;
  leftTab: LeftTab;
  leftOpen: boolean;
  libraryOpen: boolean;

  saving: boolean;
  savedAt: number | null;
  saveError: string | null;
  conflict: { serverUpdatedAt: number } | null;
}

export interface EditorActions {
  /** generic doc edit (one undo step per `group` burst) */
  updateDoc(recipe: (doc: Draft<PageDoc>) => void, group?: string | null): void;
  /** wholesale replacement (remix, restore): one undo step, selection kept when the section survives */
  replaceDoc(doc: PageDoc): void;
  setSectionField(sectionId: string, path: string, value: unknown, group?: string | null): void;
  patchSection(sectionId: string, patch: Partial<Pick<PageDoc["sections"][number], "variant" | "bg" | "divider" | "spacing" | "hidden">>): void;
  addSection(type: string, opts?: { variant?: string; afterId?: string | null }): string | null;
  duplicateSection(sectionId: string): string | null;
  removeSection(sectionId: string): boolean;
  moveSection(sectionId: string, delta: number): void;
  reorderSection(activeId: string, overId: string): void;
  /** inline edit from the preview; false when the value would make the page invalid */
  editText(sectionId: string, path: string, value: string): boolean;

  select(sectionId: string | null): void;
  selectSibling(delta: 1 | -1): void;
  setDevice(device: PreviewDevice): void;
  setZoom(zoom: ZoomLevel): void;
  setInteractive(on: boolean): void;
  setLeftTab(tab: LeftTab): void;
  setLeftOpen(open: boolean): void;
  setLibraryOpen(open: boolean): void;
  addAssets(rows: readonly EditorAsset[]): void;

  undo(): void;
  redo(): void;

  beginSave(): void;
  saveSucceeded(doc: PageDoc, updatedAt: number, version?: VersionSummary | null): void;
  saveFailed(message: string): void;
  saveConflict(serverUpdatedAt: number): void;
  setPage(patch: Partial<EditorPageMeta>): void;
  /** after a publish: the published doc becomes the live reference */
  markLive(doc: PageDoc | null): void;
  setVersions(versions: VersionSummary[], hasMore: boolean): void;
  upsertVersion(version: VersionSummary): void;
  patchVersion(id: string, patch: Partial<VersionSummary>): void;
  /** replace everything with a fresh bootstrap (reload after a conflict); clears history */
  reset(boot: EditorBootstrap): void;
}

export type EditorState = EditorData & EditorActions;

/** Top-level doc keys the inline editor may write outside section data, with their schema. */
const INLINE_ROOTS = { product: Product, offers: Offers, form: FormConfig, seo: Seo, thankYou: ThankYou } as const;

function initialData(boot: EditorBootstrap): EditorData {
  return {
    doc: boot.doc,
    page: boot.page,
    assets: boot.assets,
    savedDoc: boot.doc,
    liveDoc: boot.draftIsLive ? boot.doc : null,
    versions: boot.versions,
    hasMoreVersions: boot.hasMoreVersions,
    selectedId: null,
    device: "mobile",
    zoom: "fit",
    interactive: false,
    leftTab: "sections",
    leftOpen: true,
    libraryOpen: false,
    saving: false,
    savedAt: null,
    saveError: null,
    conflict: null,
  };
}

export function createEditorStore(boot: EditorBootstrap) {
  /** group of the edit being applied right now (read synchronously by the history hook) */
  let currentGroup: string | null = null;
  let lastGroup: string | null = null;
  let lastAt = 0;

  const store = createStore<EditorState>()(
    temporal(
      immer((set, get) => {
        const commit = (recipe: (s: Draft<EditorState>) => void, group: string | null = null) => {
          currentGroup = group;
          try {
            set(recipe);
          } finally {
            currentGroup = null;
          }
        };
        const section = (s: Draft<EditorState>, id: string) => s.doc.sections.find((x) => x.id === id);
        const cleanSelection = () => {
          const { selectedId, doc } = get();
          if (selectedId && !doc.sections.some((x) => x.id === selectedId)) set({ selectedId: null });
        };

        return {
          ...initialData(boot),

          updateDoc: (recipe, group = null) => commit((s) => recipe(s.doc), group),

          replaceDoc: (doc) => {
            if (doc === get().doc) return;
            const next = normalizeDoc(doc);
            commit((s) => {
              s.doc = castDraft(next);
            }, null);
            cleanSelection();
          },

          setSectionField: (sectionId, path, value, group) =>
            commit((s) => {
              const sec = section(s, sectionId);
              if (sec) setAt(sec.data, path, value);
            }, group ?? `field:${sectionId}:${path}`),

          patchSection: (sectionId, patch) =>
            commit((s) => {
              const sec = section(s, sectionId);
              if (!sec) return;
              if (patch.hidden && isRequired(sec.type)) delete patch.hidden;
              Object.assign(sec, patch);
            }),

          addSection: (type, opts = {}) => {
            const plan = planInsert(get().doc, type, opts);
            if (!plan) return null;
            commit((s) => {
              s.doc.sections.splice(plan.index, 0, castDraft(plan.section));
              s.selectedId = plan.section.id;
            });
            return plan.section.id;
          },

          duplicateSection: (sectionId) => {
            const plan = duplicateOf(get().doc, sectionId);
            if (!plan) return null;
            commit((s) => {
              s.doc.sections.splice(plan.index, 0, castDraft(plan.section));
              s.selectedId = plan.section.id;
            });
            return plan.section.id;
          },

          removeSection: (sectionId) => {
            const { doc, selectedId } = get();
            const index = doc.sections.findIndex((x) => x.id === sectionId);
            const target = doc.sections[index];
            if (!target || isRequired(target.type)) return false;
            const neighbour = doc.sections[index + 1] ?? doc.sections[index - 1];
            commit((s) => {
              s.doc.sections.splice(index, 1);
              if (selectedId === sectionId) s.selectedId = neighbour?.id ?? null;
            });
            return true;
          },

          moveSection: (sectionId, delta) => {
            const { doc } = get();
            const range = zoneRange(doc, sectionId);
            const from = doc.sections.findIndex((x) => x.id === sectionId);
            if (!range || from < 0) return;
            const to = Math.min(range[1] - 1, Math.max(range[0], from + delta));
            if (to === from) return;
            commit((s) => {
              const [moved] = s.doc.sections.splice(from, 1);
              if (moved) s.doc.sections.splice(to, 0, moved);
            });
          },

          reorderSection: (activeId, overId) => {
            const { doc } = get();
            const from = doc.sections.findIndex((x) => x.id === activeId);
            const to = doc.sections.findIndex((x) => x.id === overId);
            const range = zoneRange(doc, activeId);
            if (from < 0 || to < 0 || from === to || !range || to < range[0] || to >= range[1]) return;
            commit((s) => {
              const [moved] = s.doc.sections.splice(from, 1);
              if (moved) s.doc.sections.splice(to, 0, moved);
            });
          },

          editText: (sectionId, path, value) => {
            const { doc } = get();
            const sec = doc.sections.find((x) => x.id === sectionId);
            const def = sec ? getSection(sec.type) : undefined;
            const key = parsePath(path).join(".");
            const current = sec ? getAt(sec.data, path) : undefined;
            // an empty optional text shows the built-in wording in the preview: editing it fills the
            // field, as long as the section really declares a text field at that path
            const declared =
              current === undefined && !!def && valuesOfKind(def.fields, sec!.data, ["text", "textarea"]).some((v) => v.path === key);
            if (sec && (typeof current === "string" || declared)) {
              if (value === (current ?? "")) return true;
              if (def) {
                // refuse a value that breaks this very field (empty required text, too long) — the
                // preview would otherwise silently fall back to the default text
                const candidate = structuredClone(sec.data);
                if (!setAt(candidate, path, value)) return false;
                const broken = (data: unknown) => sectionIssues(def, data).some((i) => i.path === key);
                if (broken(candidate) && !broken(sec.data)) return false;
              }
              get().setSectionField(sectionId, path, value, `inline:${sectionId}:${path}`);
              return true;
            }
            const segs = parsePath(path);
            const root = segs[0] as keyof typeof INLINE_ROOTS | undefined;
            const before = getAt(doc, segs);
            if (!root || !(root in INLINE_ROOTS) || (typeof before !== "string" && before !== undefined)) return false;
            if (value === (before ?? "")) return true;
            const candidate = structuredClone(doc[root]) as unknown;
            if (!setAt({ [root]: candidate }, segs, value)) return false;
            // the root schema must accept the value and keep it (unknown keys are stripped)
            const parsed = INLINE_ROOTS[root].safeParse(candidate);
            if (!parsed.success || getAt({ [root]: parsed.data }, segs) !== value) return false;
            commit((s) => {
              setAt(s.doc, segs, value);
            }, `inline:${path}`);
            return true;
          },

          select: (sectionId) => set({ selectedId: sectionId }),

          selectSibling: (delta) => {
            const { doc, selectedId } = get();
            const list = doc.sections;
            if (!list.length) return;
            const at = selectedId ? list.findIndex((x) => x.id === selectedId) : -1;
            const next = at < 0 ? (delta > 0 ? 0 : list.length - 1) : Math.min(list.length - 1, Math.max(0, at + delta));
            set({ selectedId: list[next]?.id ?? null });
          },

          setDevice: (device) => set({ device }),
          setZoom: (zoom) => set({ zoom }),
          setInteractive: (interactive) => set({ interactive, ...(interactive ? { selectedId: null } : {}) }),
          setLeftTab: (leftTab) => set({ leftTab, leftOpen: true }),
          setLeftOpen: (leftOpen) => set({ leftOpen }),
          setLibraryOpen: (libraryOpen) => set({ libraryOpen }),
          addAssets: (rows) =>
            set((s) => {
              for (const r of rows) s.assets[r.id] = castDraft(r);
            }),

          undo: () => {
            lastGroup = null;
            store.temporal.getState().undo();
            cleanSelection();
          },
          redo: () => {
            lastGroup = null;
            store.temporal.getState().redo();
            cleanSelection();
          },

          beginSave: () => set({ saving: true }),
          saveSucceeded: (doc, updatedAt, version) =>
            set((s) => {
              s.saving = false;
              s.savedDoc = castDraft(doc);
              s.savedAt = Date.now();
              s.saveError = null;
              s.conflict = null;
              s.page.updatedAt = updatedAt;
              if (version && !s.versions.some((v) => v.id === version.id)) s.versions.unshift(version);
            }),
          saveFailed: (message) => set({ saving: false, saveError: message }),
          saveConflict: (serverUpdatedAt) => set({ saving: false, conflict: { serverUpdatedAt } }),
          setPage: (patch) =>
            set((s) => {
              Object.assign(s.page, patch);
            }),
          markLive: (doc) => set({ liveDoc: doc }),
          setVersions: (versions, hasMoreVersions) => set({ versions, hasMoreVersions }),
          upsertVersion: (version) =>
            set((s) => {
              const i = s.versions.findIndex((v) => v.id === version.id);
              if (i >= 0) s.versions[i] = version;
              else s.versions.unshift(version);
              s.versions.sort((a, b) => b.createdAt - a.createdAt);
            }),
          patchVersion: (id, patch) =>
            set((s) => {
              const v = s.versions.find((x) => x.id === id);
              if (v) Object.assign(v, patch);
            }),

          reset: (next) => {
            store.temporal.getState().pause();
            set((s) => {
              const keep = { device: s.device, zoom: s.zoom, leftTab: s.leftTab, leftOpen: s.leftOpen };
              Object.assign(s, initialData(next), keep);
            });
            store.temporal.getState().clear();
            store.temporal.getState().resume();
            lastGroup = null;
          },
        };
      }),
      {
        limit: HISTORY_LIMIT,
        partialize: (s): { doc: PageDoc } => ({ doc: s.doc }),
        equality: (a, b) => a.doc === b.doc,
        handleSet: (handleSet) => (pastState, replace, currentState, deltaState) => {
          const now = Date.now();
          const group = currentGroup;
          if (group !== null && group === lastGroup && now - lastAt < GROUP_MS) {
            lastAt = now;
            return;
          }
          lastGroup = group;
          lastAt = now;
          (handleSet as unknown as (...args: unknown[]) => void)(pastState, replace, currentState, deltaState);
        },
      },
    ),
  );

  // The order of zones (top bar → page → footer → floating) is an invariant of every doc we hold.
  // The renderer places those zones itself, so the sorted doc renders identically: it stays "saved".
  const doc = normalizeDoc(boot.doc);
  if (doc !== boot.doc) {
    store.temporal.getState().pause();
    store.setState({ doc, savedDoc: doc, liveDoc: boot.draftIsLive ? doc : null });
    store.temporal.getState().resume();
  }
  return store;
}

/** The doc with its sections in zone order (the same object when they already are). */
export function normalizeDoc(doc: PageDoc): PageDoc {
  const sorted = normalizeOrder(doc.sections);
  return sorted.some((s, i) => s !== doc.sections[i]) ? { ...doc, sections: sorted } : doc;
}

export type EditorStore = ReturnType<typeof createEditorStore>;

/* ------------------------------------------------------------------ */
/* selectors                                                           */
/* ------------------------------------------------------------------ */

export const selectDirty = (s: EditorState) => s.doc !== s.savedDoc;
export const selectSelected = (s: EditorState) => (s.selectedId ? (s.doc.sections.find((x) => x.id === s.selectedId) ?? null) : null);
export const selectIsLive = (s: EditorState) => s.page.status === "published" && s.liveDoc !== null && s.doc === s.liveDoc;

/** Section definition of an instance type (registry lookup kept here so UI code stays declarative). */
export const definitionOf = (type: string) => getSection(type);

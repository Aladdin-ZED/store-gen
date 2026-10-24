import type { ReactNode } from "react";

/*
 * The full-screen builder of a store (docs/STORE-SAAS.md §I.1): the `[store]` layout's frame leaves this group
 * without the sidebar and top bar (it reads the active segment), and keeps the store's providers (theme, toasts,
 * the store context for links and uploads). Every page below calls requireStoreMember with its own permission.
 */
export default function EditorLayout({ children }: { children: ReactNode }) {
  return children;
}

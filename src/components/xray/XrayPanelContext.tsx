import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

/**
 * Shared control of the single X-ray panel instance, so other UI (the guided
 * tour) can open it to a specific tab. The panel itself reads open/tab from
 * here instead of local state; nothing else changes.
 */
export type XrayTab = "calls" | "pipeline" | "rls" | "sql" | "code" | "arch"

interface XrayPanelState {
  open: boolean
  tab: XrayTab
  setOpen: (open: boolean) => void
  setTab: (tab: XrayTab) => void
  /** Open the panel directly on a given tab (used by the tour). */
  openTo: (tab: XrayTab) => void
}

const XrayPanelContext = createContext<XrayPanelState | null>(null)

export function XrayPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<XrayTab>("calls")
  const openTo = useCallback((t: XrayTab) => {
    setTab(t)
    setOpen(true)
  }, [])
  const value = useMemo(() => ({ open, tab, setOpen, setTab, openTo }), [open, tab, openTo])
  return <XrayPanelContext.Provider value={value}>{children}</XrayPanelContext.Provider>
}

export function useXrayPanel() {
  const ctx = useContext(XrayPanelContext)
  if (!ctx) throw new Error("useXrayPanel must be used within XrayPanelProvider")
  return ctx
}

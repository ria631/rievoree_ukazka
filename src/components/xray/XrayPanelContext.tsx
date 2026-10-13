import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

/**
 * Shared control of the single X-ray panel instance, so other UI (the guided
 * tour) can open it to a specific tab and drive the RLS "run as each role"
 * demo. The panel + RLS tab read from here instead of local state.
 */
export type XrayTab = "calls" | "pipeline" | "rls" | "sql" | "code" | "arch"

interface XrayPanelState {
  open: boolean
  tab: XrayTab
  setOpen: (open: boolean) => void
  setTab: (tab: XrayTab) => void
  /** Open the panel directly on a given tab (used by the tour). */
  openTo: (tab: XrayTab) => void
  /** Bumps each time the tour asks the RLS tab to auto-run all three roles. */
  rlsRunToken: number
  /** Ask the RLS tab to play viewer → manager → admin for the tour. */
  runRls: () => void
}

const XrayPanelContext = createContext<XrayPanelState | null>(null)

export function XrayPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<XrayTab>("calls")
  const [rlsRunToken, setRlsRunToken] = useState(0)
  const openTo = useCallback((t: XrayTab) => { setTab(t); setOpen(true) }, [])
  const runRls = useCallback(() => { setTab("rls"); setOpen(true); setRlsRunToken((n) => n + 1) }, [])
  const value = useMemo(
    () => ({ open, tab, setOpen, setTab, openTo, rlsRunToken, runRls }),
    [open, tab, openTo, rlsRunToken, runRls],
  )
  return <XrayPanelContext.Provider value={value}>{children}</XrayPanelContext.Provider>
}

export function useXrayPanel() {
  const ctx = useContext(XrayPanelContext)
  if (!ctx) throw new Error("useXrayPanel must be used within XrayPanelProvider")
  return ctx
}

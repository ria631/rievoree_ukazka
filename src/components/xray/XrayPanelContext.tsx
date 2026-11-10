import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import type { CodeTarget } from "./codeMap"

/**
 * Shared control of the single X-ray panel instance, so other UI (the guided
 * tour, the X-RAY CODE inspector) can open it to a specific tab, drive the RLS
 * "run as each role" demo, and open the full-screen code view on a specific
 * element's source. The panel + RLS tab read from here instead of local state.
 */
export type XrayTab = "calls" | "pipeline" | "rls" | "sql" | "code" | "arch"

/** What the full-screen code view shows: this page's file, one element's code
 *  (several related files as tabs, each focused on its block), or one file. */
export type CodeOpen =
  | { kind: "page" }
  | { kind: "target"; target: CodeTarget }
  | { kind: "file"; file: string }

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
  /** Full-screen code view (IDE-style). null = closed. */
  code: CodeOpen | null
  openCode: (c: CodeOpen) => void
  closeCode: () => void
  /** Back-compat: "open this page's source full screen". */
  codeFullscreen: boolean
  setCodeFullscreen: (on: boolean) => void
  /** X-RAY CODE inspect mode: click any outlined element to open its code. */
  inspecting: boolean
  setInspecting: (on: boolean) => void
}

const XrayPanelContext = createContext<XrayPanelState | null>(null)

export function XrayPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<XrayTab>("calls")
  const [rlsRunToken, setRlsRunToken] = useState(0)
  const [code, setCode] = useState<CodeOpen | null>(null)
  const [inspecting, setInspecting] = useState(false)
  const openTo = useCallback((t: XrayTab) => { setTab(t); setOpen(true) }, [])
  const runRls = useCallback(() => { setTab("rls"); setOpen(true); setRlsRunToken((n) => n + 1) }, [])
  const openCode = useCallback((c: CodeOpen) => { setInspecting(false); setCode(c) }, [])
  const closeCode = useCallback(() => setCode(null), [])
  const setCodeFullscreen = useCallback((on: boolean) => setCode(on ? { kind: "page" } : null), [])
  const value = useMemo(
    () => ({
      open, tab, setOpen, setTab, openTo, rlsRunToken, runRls,
      code, openCode, closeCode, codeFullscreen: code !== null, setCodeFullscreen,
      inspecting, setInspecting,
    }),
    [open, tab, openTo, rlsRunToken, runRls, code, openCode, closeCode, setCodeFullscreen, inspecting],
  )
  return <XrayPanelContext.Provider value={value}>{children}</XrayPanelContext.Provider>
}

export function useXrayPanel() {
  const ctx = useContext(XrayPanelContext)
  if (!ctx) throw new Error("useXrayPanel must be used within XrayPanelProvider")
  return ctx
}

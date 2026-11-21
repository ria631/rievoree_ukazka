import { useEffect } from "react"
import { X } from "lucide-react"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { BrandMark } from "@/components/BrandMark"
import { cn } from "@/lib/utils"
import { useXRayEvents } from "@/lib/xray/useXRayEvents"
import { useXrayPanel } from "./XrayPanelContext"
import { CallsTab } from "./tabs/CallsTab"
import { CodeTab } from "./tabs/CodeTab"
import { PipelineTab } from "./tabs/PipelineTab"
import { RlsTab } from "./tabs/RlsTab"
import { SqlTab } from "./tabs/SqlTab"
import { ArchTab } from "./tabs/ArchTab"

/**
 * X-ray panel — the exhibit that makes the backend visible. A lime pill floats
 * in the corner of every app page (or press X); it pulls out a dark console
 * with a torn lime edge:
 *   CALLS    — every request this page made, timed at the fetch seam
 *   PIPELINE — live pipeline_events timeline (Realtime)
 *   RLS      — "same query, three identities"
 *   SQL      — the real policies and functions behind the calls
 *   CODE     — where each element of the page lives in the repo
 *   ARCH     — the layers this session actually exercised
 */
const TABS = [
  { id: "calls", label: "Calls" },
  { id: "pipeline", label: "Pipeline" },
  { id: "rls", label: "RLS" },
  { id: "sql", label: "SQL" },
  { id: "code", label: "Code" },
  { id: "arch", label: "Arch" },
] as const

export function XRayPanel() {
  const events = useXRayEvents()
  // Open/tab live in a shared context so the guided tour can drive the panel.
  const { open, setOpen, tab, setTab } = useXrayPanel()

  // X toggles the panel from anywhere (but never while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return
      if (e.key === "x" || e.key === "X") { e.preventDefault(); setOpen(!open) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, setOpen])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open the X-ray panel"
        aria-expanded={open}
        data-tour="xray-button"
        className={cn(
          "fixed bottom-4 right-4 z-[70] inline-flex h-12 items-center gap-2.5 rounded-full bg-paper pl-3 pr-[18px] font-mono text-[13px] font-bold uppercase tracking-[0.06em] text-ink",
          "shadow-[0_14px_30px_-10px_rgba(0,0,0,0.7)] transition-[opacity,transform] hover:-translate-y-0.5 min-[900px]:bottom-[22px] min-[900px]:right-[22px]",
          open && "pointer-events-none opacity-0",
        )}
      >
        <BrandMark className="size-6 rounded-[5px]" />
        X-ray
        {events.length > 0 && (
          <span className="rounded-full bg-ink px-1.5 py-px text-[11px] tabular-nums text-paper">{events.length}</span>
        )}
        <kbd className="rounded bg-ink/15 px-1.5 py-px text-[11px] max-sm:hidden">X</kbd>
      </button>

      <Sheet open={open} onOpenChange={setOpen} modal={false}>
        <SheetContent
          overlay={false}
          showCloseButton={false}
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          className="dark torn-lip z-[75] flex w-full flex-col gap-0 border-l border-border bg-[#030C0B] p-0 text-foreground shadow-[-30px_0_60px_-30px_rgba(0,0,0,0.9)] sm:max-w-[520px]"
        >
          <div className="flex items-center gap-3 border-b border-border px-[18px] py-4">
            <SheetTitle className="font-display text-xl font-extrabold uppercase leading-none">X-ray</SheetTitle>
            <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-signal">
              <span className="live-dot size-[7px] rounded-full bg-signal shadow-[0_0_8px_var(--signal)]" /> live
            </span>
            <SheetClose className="ml-auto grid size-9 place-items-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground" aria-label="Close the X-ray panel">
              <X className="size-[18px]" />
            </SheetClose>
          </div>
          <SheetDescription className="sr-only">
            The backend behind this page: calls, pipeline events, row-level security, SQL, code and architecture.
          </SheetDescription>

          <div role="tablist" aria-label="X-ray sections"
            className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-2.5">
            {TABS.map((t) => {
              const active = t.id === tab
              return (
                <button
                  key={t.id}
                  role="tab"
                  data-tour={`xray-tab-${t.id}`}
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "whitespace-nowrap px-2.5 py-[11px] font-mono text-[12.5px] transition-colors",
                    active ? "text-accent shadow-[inset_0_-2px_0_var(--accent)]" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              )
            })}
          </div>

          <div data-tour={`xray-${tab}`} className="min-h-0 flex-1 overflow-hidden">
            {tab === "calls" && <CallsTab />}
            {tab === "pipeline" && <PipelineTab />}
            {tab === "rls" && <RlsTab />}
            {tab === "sql" && <SqlTab />}
            {tab === "code" && <CodeTab />}
            {tab === "arch" && <ArchTab />}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

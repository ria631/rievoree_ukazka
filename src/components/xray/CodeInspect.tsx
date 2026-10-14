import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Code2, X, FileCode2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useXrayPanel } from "./XrayPanelContext"
import { CODE_MAP } from "./codeMap"

/**
 * X-RAY CODE — "show me the code of THIS". The glowing button (next to Take the
 * tour) switches the page into inspect mode: every chart, table and control that
 * has mapped source gets outlined; hover one to see what it is, click it and the
 * full-screen IDE opens on its real code — where it's drawn, the component that
 * renders it, and the math/SQL behind its numbers, each block highlighted.
 */
export function CodeXrayButton({ className }: { className?: string }) {
  const { inspecting, setInspecting } = useXrayPanel()
  return (
    <button onClick={() => setInspecting(!inspecting)} aria-pressed={inspecting}
      title="Click any chart or table to open its real code"
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-[#0b0f0a] px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-accent ring-1 ring-accent transition hover:bg-[#121a0e]",
        !inspecting && "xray-glow",
        inspecting && "bg-accent text-accent-foreground",
        className,
      )}>
      <Code2 className="size-3.5" strokeWidth={2.5} /> {inspecting ? "Inspecting…" : "X-ray code"}
    </button>
  )
}

interface Box { id: string; title: string; top: number; left: number; width: number; height: number }

/** Walk up from a node to the nearest anchor that has mapped code. */
function mappedAnchor(node: Element | null): HTMLElement | null {
  let el = node?.closest<HTMLElement>("[data-tour]") ?? null
  while (el) {
    if (CODE_MAP[el.dataset.tour ?? ""]) return el
    el = el.parentElement?.closest<HTMLElement>("[data-tour]") ?? null
  }
  return null
}

export function InspectLayer() {
  const { inspecting, setInspecting, openCode } = useXrayPanel()
  const [boxes, setBoxes] = useState<Box[]>([])
  const [hover, setHover] = useState<string | null>(null)

  // Track every visible mapped element, every frame (scroll, panels, charts).
  useEffect(() => {
    if (!inspecting) { setBoxes([]); setHover(null); return }
    document.documentElement.classList.add("xray-inspecting")
    let raf = 0
    const loop = () => {
      const vh = window.innerHeight
      const out: Box[] = []
      document.querySelectorAll<HTMLElement>("[data-tour]").forEach((el) => {
        const id = el.dataset.tour ?? ""
        const t = CODE_MAP[id]
        if (!t) return
        const r = el.getBoundingClientRect()
        if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > vh) return
        out.push({ id, title: t.title, top: r.top, left: r.left, width: r.width, height: r.height })
      })
      setBoxes(out)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); document.documentElement.classList.remove("xray-inspecting") }
  }, [inspecting])

  // Hover → which element; click → open its code (and swallow the page click).
  useEffect(() => {
    if (!inspecting) return
    const onMove = (e: MouseEvent) => setHover(mappedAnchor(e.target as Element)?.dataset.tour ?? null)
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element
      if (t.closest("[data-inspect-ui]")) return
      e.preventDefault(); e.stopPropagation()
      const el = mappedAnchor(t)
      const target = el ? CODE_MAP[el.dataset.tour ?? ""] : null
      if (target) openCode({ kind: "target", target })
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setInspecting(false) }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("click", onClick, true)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("click", onClick, true)
      window.removeEventListener("keydown", onKey)
    }
  }, [inspecting, openCode, setInspecting])

  if (!inspecting) return null
  return createPortal(
    <>
      {/* Hint bar */}
      <div data-inspect-ui className="pointer-events-none fixed inset-x-0 bottom-[76px] z-[66] flex justify-center px-4">
        <div className="pointer-events-auto flex max-w-[min(92vw,780px)] flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-[#0b0f0a]/95 px-5 py-3 font-mono text-xs text-white/80 shadow-soft ring-1 ring-accent/60 backdrop-blur">
          <span className="inline-flex items-center gap-2 font-bold uppercase tracking-widest text-accent">
            <Code2 className="size-4" /> X-ray code
          </span>
          <span>Click any <span className="text-accent">outlined</span> chart, table or control to open its real code.</span>
          <button onClick={() => openCode({ kind: "page" })}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] uppercase tracking-wider text-white/75 ring-1 ring-white/20 transition hover:text-white hover:ring-accent">
            <FileCode2 className="size-3.5" /> whole page file
          </button>
          <button onClick={() => setInspecting(false)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] uppercase tracking-wider text-white/60 transition hover:text-white">
            Esc <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Outlines */}
      {boxes.map((b) => {
        const on = hover === b.id
        return (
          <div key={b.id + b.top} className="pointer-events-none fixed z-[64]"
            style={{ top: b.top - 4, left: b.left - 4, width: b.width + 8, height: b.height + 8 }}>
            <div className={cn("absolute inset-0 rounded-xl transition-all",
              on ? "bg-accent/[0.06] ring-2 ring-accent shadow-[0_0_30px_-4px_rgba(163,230,53,0.6)]"
                 : "border border-dashed border-accent/75 bg-accent/[0.025]")} />
            <span className={cn("absolute left-3 inline-flex", b.top < 18 ? "top-1.5" : "-top-3", " items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition",
              on ? "bg-accent text-accent-foreground" : "bg-[#0b0f0a] text-accent ring-1 ring-accent/50")}>
              <Code2 className="size-3" /> {on ? `open code · ${b.title}` : b.title}
            </span>
          </div>
        )
      })}
    </>,
    document.body,
  )
}

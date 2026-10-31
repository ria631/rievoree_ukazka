import { useEffect } from "react"
import { createPortal } from "react-dom"
import { Code2, X, FileCode2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { prewarmHighlighter } from "@/lib/code-xray"
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

/** Walk up from a node to the nearest anchor that has mapped code. */
function mappedAnchor(node: Element | null): HTMLElement | null {
  let el = node?.closest<HTMLElement>("[data-tour]") ?? null
  while (el) {
    if (CODE_MAP[el.dataset.tour ?? ""]) return el
    el = el.parentElement?.closest<HTMLElement>("[data-tour]") ?? null
  }
  return null
}

/** Mark every mapped element on the page; CSS draws its outline + label. */
function markAll() {
  document.querySelectorAll<HTMLElement>("[data-tour]").forEach((el) => {
    const t = CODE_MAP[el.dataset.tour ?? ""]
    if (!t || el.dataset.xrayTitle === t.title) return
    el.dataset.xrayTitle = t.title
    const cs = getComputedStyle(el)
    if (cs.overflowX !== "visible" || cs.overflowY !== "visible") el.dataset.xrayInset = ""
  })
}
function unmarkAll() {
  document.querySelectorAll<HTMLElement>("[data-xray-title]").forEach((el) => {
    delete el.dataset.xrayTitle
    delete el.dataset.xrayInset
    el.classList.remove("xray-hot")
  })
}

/**
 * Inspect mode. Deliberately cheap: the outlines and labels are CSS on the real
 * elements (the browser keeps them in place while you scroll), and the only
 * JavaScript is a class swap when the hovered element changes. Nothing runs per
 * animation frame, so the page stays as smooth as without it.
 */
export function InspectLayer() {
  const { inspecting, setInspecting, openCode } = useXrayPanel()

  useEffect(() => {
    if (!inspecting) return
    const html = document.documentElement
    html.classList.add("xray-inspecting")
    markAll()
    prewarmHighlighter() // so the code view opens instantly on the first click
    const rescan = window.setInterval(markAll, 1200) // late-mounting charts/panels

    let hot: HTMLElement | null = null
    const onMove = (e: MouseEvent) => {
      const el = mappedAnchor(e.target as Element)
      if (el === hot) return
      hot?.classList.remove("xray-hot")
      el?.classList.add("xray-hot")
      hot = el
    }
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element
      if (t.closest("[data-inspect-ui]")) return
      e.preventDefault(); e.stopPropagation()
      const el = mappedAnchor(t)
      const target = el ? CODE_MAP[el.dataset.tour ?? ""] : null
      if (target) openCode({ kind: "target", target })
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setInspecting(false) }
    window.addEventListener("mousemove", onMove, { passive: true })
    window.addEventListener("click", onClick, true)
    window.addEventListener("keydown", onKey)
    return () => {
      window.clearInterval(rescan)
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("click", onClick, true)
      window.removeEventListener("keydown", onKey)
      html.classList.remove("xray-inspecting")
      unmarkAll()
    }
  }, [inspecting, openCode, setInspecting])

  if (!inspecting) return null
  return createPortal(
    <div data-inspect-ui className="pointer-events-none fixed inset-x-0 bottom-[76px] z-[66] flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-[min(92vw,780px)] flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-[#0b0f0a] px-5 py-3 font-mono text-xs text-white/80 shadow-soft ring-1 ring-accent/60">
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
    </div>,
    document.body,
  )
}

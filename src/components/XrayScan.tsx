import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react"
import { animate } from "motion/react"
import { X } from "lucide-react"
import { XrayContext } from "@/components/XrayContext"

/**
 * X-RAY SCAN — the whole landing transforms IN PLACE into a real code editor of
 * its own source. Tapping the toggle sweeps a scan line down the entire viewport;
 * a full-bleed VS Code editor is revealed top-down behind it. Tap again and it
 * retracts. It is a transformation of the same surface, not navigation away.
 *
 * Mechanics / performance:
 *   - one CSS var `--scan` (0→1) animated via motion's animate() straight on the
 *     DOM node — NO React re-render per frame.
 *   - the editor is a fixed inset-0 layer; clip-path inset() driven by --scan
 *     reveals it top-down (GPU-composited). When --scan is 0 the layer is fully
 *     clipped, so the landing underneath stays interactive.
 *   - prefers-reduced-motion → instant switch, no sweep, no scan line.
 *
 * Scope: this heavy full-page effect is the landing showcase only. Inner pages
 * keep the lighter, functional X-ray panel.
 */
const XrayEditor = lazy(() => import("@/components/XrayEditor"))

const REDUCE = "(prefers-reduced-motion: reduce)"

export function XrayScan({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(false)
  const [mounted, setMounted] = useState(false) // keep editor in DOM once opened
  const root = useRef<HTMLDivElement>(null)
  const clipRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<HTMLDivElement>(null)
  const progress = useRef(0)

  useEffect(() => {
    const el = root.current
    if (!el) return
    const reduce = window.matchMedia(REDUCE).matches

    el.dataset.scan = reduce ? "idle" : "run" // scan line visible during the sweep
    // Animate ONLY the editor layer's clip and the line's transform. (This used
    // to animate a CSS variable on the landing's root, which re-styled the whole
    // page every frame and made the reveal stutter.)
    const paint = (v: number) => {
      progress.current = v
      if (clipRef.current) clipRef.current.style.clipPath = `inset(0 0 ${((1 - v) * 100).toFixed(2)}% 0)`
      if (lineRef.current) lineRef.current.style.transform = `translate3d(0, ${(v * 100).toFixed(2)}vh, 0)`
    }
    const controls = animate(progress.current, on ? 1 : 0, {
      ...(reduce ? { duration: 0 } : { duration: 0.9, ease: [0.45, 0, 0.2, 1] }),
      onUpdate: paint,
    })
    controls.finished.then(() => { el.dataset.scan = "idle" }).catch(() => {})

    // Lock body scroll while the editor owns the viewport.
    document.body.style.overflow = on ? "hidden" : ""

    return () => { controls.stop() }
  }, [on, mounted])

  useEffect(() => () => { document.body.style.overflow = "" }, [])

  function toggle() {
    setOn((v) => {
      const next = !v
      if (next) setMounted(true)
      return next
    })
  }

  return (
    <XrayContext.Provider value={{ on, toggle }}>
    <div ref={root} className="xray-scan relative">
      {/* The landing — always in normal flow; the editor reveals over it. */}
      {children}

      {/* Full-bleed editor — revealed top-down by the scan, clipped away at rest. */}
      {mounted && (
        <div ref={clipRef} className="xray-editor-clip fixed inset-0 z-50 overflow-hidden" aria-hidden={!on}
          style={{ clipPath: "inset(0 0 100% 0)" }}>
          <Suspense
            fallback={
              <div className="grid h-full w-full place-items-center bg-[#1e1e1e] font-mono text-xs text-white/40">
                loading source…
              </div>
            }
          >
            <XrayEditor />
          </Suspense>
        </div>
      )}

      {/* Scan line riding the reveal edge. */}
      <div ref={lineRef} aria-hidden className="xray-scanline" />

      {/* Exit control — only while x-rayed; entry lives on the hero panel button. */}
      {on && (
        <button
          onClick={toggle}
          aria-pressed={on}
          className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-md border border-accent bg-background/80 px-5 py-3 font-mono text-xs font-bold uppercase tracking-widest text-accent backdrop-blur transition hover:bg-accent hover:text-accent-foreground md:bottom-7 md:right-7"
        >
          <X className="size-4" strokeWidth={2.5} />
          Exit x-ray
        </button>
      )}
    </div>
    </XrayContext.Provider>
  )
}

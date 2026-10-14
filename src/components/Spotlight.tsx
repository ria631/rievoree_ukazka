import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

/**
 * Spotlight — dims the page and draws a bright ring around a target element, so
 * the guided tour can point at a specific chart or X-ray section ("here you find
 * this, this is how it's protected"). The dim mask is four rectangles AROUND the
 * hole with pointer-events off, so the page (and the X-ray drawer) underneath stay
 * interactive and keep animating. It tracks the target every frame (so it follows
 * the X-ray sheet sliding in, a chart growing, or a scroll) and brings it into
 * view once if it's off-screen. If the selector matches nothing yet, it renders
 * nothing and keeps polling — so it survives the navigate → data-load gap.
 */
interface Rect { top: number; left: number; width: number; height: number }

export function Spotlight({ selector, pad = 10 }: { selector: string | null; pad?: number }) {
  const [rect, setRect] = useState<Rect | null>(null)

  useEffect(() => {
    if (!selector) { setRect(null); return }
    let raf = 0
    let scrolled = false
    const measure = () => {
      const el = document.querySelector(selector) as HTMLElement | null
      if (!el) { setRect(null); return }
      const r = el.getBoundingClientRect()
      // Bring it into view once, and only if it's actually off-screen — avoids a
      // jarring re-scroll on an element (like the sticky nav) that's already shown.
      if (!scrolled) {
        scrolled = true
        const vh = window.innerHeight
        const offscreen = r.top < 72 || r.bottom > vh - 24
        if (offscreen) el.scrollIntoView({ block: "center", behavior: "smooth" })
      }
      setRect({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 })
    }
    const loop = () => { measure(); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [selector, pad])

  if (!selector || !rect) return null
  const vw = window.innerWidth, vh = window.innerHeight
  // Four dim panels around the hole (pointer-events none → page stays clickable).
  const panel = "fixed bg-black/60 pointer-events-none z-[55]"
  return createPortal(
    <>
      <div className={panel} style={{ top: 0, left: 0, width: vw, height: Math.max(0, rect.top) }} />
      <div className={panel} style={{ top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height }} />
      <div className={panel} style={{ top: rect.top, left: rect.left + rect.width, width: Math.max(0, vw - rect.left - rect.width), height: rect.height }} />
      <div className={panel} style={{ top: rect.top + rect.height, left: 0, width: vw, height: Math.max(0, vh - rect.top - rect.height) }} />
      {/* The ring around the target. */}
      <div className="pointer-events-none fixed z-[56] rounded-xl ring-2 ring-accent"
        style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height, boxShadow: "0 0 0 2px rgba(159,214,15,0.35), 0 0 40px -4px rgba(159,214,15,0.55)" }} />
    </>,
    document.body,
  )
}

import { createPortal } from "react-dom"

/**
 * Spotlight — dims the page and rings one element, so the guided tour can say
 * "this one". Purely presentational: the tour measures the target every frame
 * and passes its rect in (so the hole follows the X-ray drawer sliding in, a
 * chart re-rendering, or a scroll). The mask is four rectangles AROUND the hole
 * with pointer-events off, so the page underneath stays live and clickable.
 */
export interface Rect { top: number; left: number; width: number; height: number }

export function Spotlight({ rect, pad = 10 }: { rect: Rect | null; pad?: number }) {
  if (!rect) return null
  const r = { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
  const vw = window.innerWidth, vh = window.innerHeight
  const panel = "fixed bg-black/60 pointer-events-none z-[55]"
  return createPortal(
    <>
      <div className={panel} style={{ top: 0, left: 0, width: vw, height: Math.max(0, r.top) }} />
      <div className={panel} style={{ top: r.top, left: 0, width: Math.max(0, r.left), height: r.height }} />
      <div className={panel} style={{ top: r.top, left: r.left + r.width, width: Math.max(0, vw - r.left - r.width), height: r.height }} />
      <div className={panel} style={{ top: r.top + r.height, left: 0, width: vw, height: Math.max(0, vh - r.top - r.height) }} />
      <div className="pointer-events-none fixed z-[56] rounded-xl ring-2 ring-accent"
        style={{ top: r.top, left: r.left, width: r.width, height: r.height, boxShadow: "0 0 0 2px rgba(163,230,53,0.35), 0 0 40px -4px rgba(163,230,53,0.55)" }} />
    </>,
    document.body,
  )
}

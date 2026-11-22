/**
 * Is an element on screen? Worked out from the scroll position and geometry
 * measured up front — deliberately not with IntersectionObserver: in Chrome,
 * while any observer is active, every running transform animation on the page
 * is ticked on the main thread each frame (the browser has to recheck the
 * intersections), which is exactly the work that makes scrolling stutter.
 *
 * Geometry is re-measured when the page's size changes (ResizeObserver on
 * <body> and window resize), never during the scroll itself; the check is one
 * passive scroll listener, at most once per frame, comparing numbers.
 *
 * `amount` is how much of the element (or of the viewport, if the element is
 * taller) must be visible; `margin` widens the viewport by that many px.
 */
export function watchInView(
  el: Element,
  onChange: (inView: boolean) => void,
  { amount = 0, margin = 0 }: { amount?: number; margin?: number } = {},
): () => void {
  let top = 0
  let height = 0
  let state: boolean | null = null
  let raf = 0

  const measure = () => {
    const r = el.getBoundingClientRect()
    top = r.top + window.scrollY
    height = r.height
  }
  const check = () => {
    raf = 0
    const y = window.scrollY - margin
    const vh = window.innerHeight + margin * 2
    const seen = Math.min(top + height, y + vh) - Math.max(top, y)
    const need = amount * Math.min(height, vh)
    const inView = seen > 0 && seen >= need
    if (inView !== state) {
      state = inView
      onChange(inView)
    }
  }
  const queue = () => { if (!raf) raf = requestAnimationFrame(check) }
  const remeasure = () => { measure(); queue() }

  const ro = new ResizeObserver(remeasure)
  ro.observe(document.body)
  addEventListener("resize", remeasure)
  addEventListener("scroll", queue, { passive: true })
  measure()
  check()

  return () => {
    ro.disconnect()
    removeEventListener("resize", remeasure)
    removeEventListener("scroll", queue)
    cancelAnimationFrame(raf)
  }
}

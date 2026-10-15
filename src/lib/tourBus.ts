import { startTransition, useEffect, useRef } from "react"

/**
 * A tiny control bus between the guided tour and a page's own filters. The tour
 * animates its cursor onto a real control and then sends `tourControl(key, v)`;
 * the page applies it through its normal state setter — exactly what a click
 * would do, but reliable for Radix dropdowns (which open on pointer gestures a
 * script can't cleanly fake). Only the mounted page listens, so keys can repeat
 * across pages ("period" on P&L and Reports).
 */
const EVENT = "xray-tour-control"

export function tourControl(key: string, value: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { key, value } }))
}

export function useTourControl(key: string, handler: (value: string) => void) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ key: string; value: string }>).detail
      // A transition: the page re-renders in interruptible slices, so the tour's
      // cursor and spotlight keep gliding while seven charts recompute.
      if (d?.key === key) startTransition(() => ref.current(d.value))
    }
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [key])
}

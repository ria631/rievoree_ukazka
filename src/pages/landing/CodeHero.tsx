import { useEffect, useRef, type RefObject } from "react"
import type { Phase } from "./codeRain"
import "./code-hero.css"

/** What the screen is doing, said in one line under it. */
const SAY: Record<Phase, string> = {
  build: "Building the screen out of this repo's own code…",
  screen: "A report screen — every character of it is code.",
  xray: "X-ray →",
  code: "Underneath: the request, the SQL view and the RLS policy that made it.",
  release: "Every screen in the demo can do this. Press X there.",
  rain: "Every screen in the demo can do this. Press X there.",
}

/**
 * The hero's right side: where the report screen assembles out of the code
 * rain and then shows its own code. The rain and the screen are drawn by
 * codeRain.ts (loaded after first paint); this is the frame and the caption.
 */
export function CodeHero({ host, avoid }: { host: RefObject<HTMLElement | null>; avoid: RefObject<HTMLElement | null> }) {
  const zone = useRef<HTMLDivElement>(null)
  const fg = useRef<HTMLCanvasElement>(null)
  const lens = useRef<HTMLSpanElement>(null)
  const say = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let dispose: (() => void) | undefined
    let cancelled = false
    void import("./codeRain").then(({ mountCodeRain }) => {
      if (cancelled || !host.current || !zone.current || !fg.current) return
      dispose = mountCodeRain({
        host: host.current,
        zone: zone.current,
        fg: fg.current,
        avoid: avoid.current ?? undefined,
        lens: lens.current ?? undefined,
        onPhase: (p) => {
          if (say.current) say.current.textContent = SAY[p]
          zone.current?.setAttribute("data-phase", p)
        },
      })
    })
    return () => { cancelled = true; dispose?.() }
  }, [host, avoid])

  return (
    <figure className="cr">
      <div ref={zone} className="cr-zone">
        <canvas ref={fg} aria-label="A report screen assembled from the repo's code, then shown as the code behind it" role="img" />
        <span ref={lens} className="cr-lens" aria-hidden="true" />
      </div>
      <figcaption>
        <span ref={say} className="cr-say" aria-live="off">{SAY.build}</span>
        <span className="cr-hint">Hover the screen to look under it.</span>
      </figcaption>
    </figure>
  )
}

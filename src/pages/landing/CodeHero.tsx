import { useEffect, useRef, type RefObject } from "react"
import type { Phase } from "./codeRain"
import "./code-hero.css"

/** What's happening, said in one line under it. */
const SAY: Record<Phase, string> = {
  build: "A payment comes in…",
  money: "€500 of rent, paid to Danube Office Park.",
  morph: "…and turns into code.",
  code: "The bank line, the check, the booking, the policy, the report — the real code from this repo.",
  release: "That's how every number in the demo is made. Press X there to see it.",
  rain: "That's how every number in the demo is made. Press X there to see it.",
}

/**
 * The hero's right side: money forms out of the code rain and turns into the
 * code that handles it — how financial reporting is really made. The rain and
 * the cells are drawn by codeRain.ts (loaded after first paint); this is the
 * frame and the caption.
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
        <canvas ref={fg} aria-label="A €500 note and coins made of code characters, turning into the code that books and reports them" role="img" />
        <span ref={lens} className="cr-lens" aria-hidden="true" />
      </div>
      <figcaption>
        <span ref={say} className="cr-say" aria-live="off">{SAY.build}</span>
        <span className="cr-hint">Hover the money to see its code.</span>
      </figcaption>
    </figure>
  )
}

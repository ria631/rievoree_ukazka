import { useEffect, useRef } from "react"
import { SRC, hl } from "./repoSource"
import "./torn-hole.css"

/**
 * The closing sheet's torn hole — the brand's tear, drawn once as SVG/CSS (no
 * WebGL). A jagged opening through the lime paper shows the repo's own code
 * underneath; four flaps of the torn paper lie folded back on the page. It tears
 * open once when it comes into view (one transform), and it's the button that
 * opens the demo.
 */

function rng(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

/** The opening's outline on a 100 × 100 grid: a ragged circle with a few long tongues. */
function outline(seed: number): [number, number][] {
  const r = rng(seed)
  const N = 72
  const tongues = [0.6, 2.2, 3.7, 5.1].map((a) => a + r() * 0.4)
  return Array.from({ length: N }, (_, i) => {
    const a = (i / N) * Math.PI * 2
    const near = Math.max(...tongues.map((t) => Math.max(0, 1 - Math.abs(Math.atan2(Math.sin(a - t), Math.cos(a - t))) / 0.16)))
    const rad = 30 + r() * 3.2 + near * (9 + r() * 4) + (r() < 0.25 ? r() * 2.5 : 0)
    return [50 + Math.cos(a) * rad, 50 + Math.sin(a) * rad]
  })
}

/** Reflect p across the line a–b: where a flap's tip lands once folded back onto the page. */
function reflect(p: [number, number], a: [number, number], b: [number, number]): [number, number] {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)
  const fx = a[0] + t * dx
  const fy = a[1] + t * dy
  return [2 * fx - p[0], 2 * fy - p[1]]
}

const PTS = outline(77)
const PATH = `M${PTS.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L")}Z`
const CLIP = `polygon(${PTS.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(",")})`
// Four flaps between the tongues: the triangle of paper that once covered the
// hole (tip toward the centre), folded back across its rim chord onto the page.
const FLAPS = [17, 35, 52, 67].map((k, i) => {
  const a = PTS[(k - 5 + PTS.length) % PTS.length]
  const b = PTS[(k + 5) % PTS.length]
  const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const reach = 0.3 + (i % 2) * 0.08
  const inner: [number, number] = [mid[0] + (50 - mid[0]) * reach, mid[1] + (50 - mid[1]) * reach]
  const tip = reflect(inner, a, b)
  // The two torn edges are ragged: a few points nudged off the straight line.
  const r = rng(k)
  const ragged = (p: [number, number], q: [number, number]) => [1, 2, 3, 4].map((j) => {
    const t = j / 5
    const n = (r() - 0.5) * 1.6
    const dx = q[0] - p[0]
    const dy = q[1] - p[1]
    const len = Math.hypot(dx, dy) || 1
    return [p[0] + dx * t - (dy / len) * n, p[1] + dy * t + (dx / len) * n] as [number, number]
  })
  const pts = [a, ...ragged(a, tip), tip, ...ragged(tip, b), b]
  return { d: `M${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L")}Z`, k }
})
const CODE = SRC.fetch.split("\n").slice(0, 16).join("\n")

export function TornHole({ onOpen, busy }: { onOpen: () => void; busy: boolean }) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.classList.add("open"); io.disconnect() } }, { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <button ref={ref} type="button" className="th" onClick={onOpen} disabled={busy} aria-label="Open the live demo">
      <span className="th-tear">
        <span className="th-hole" style={{ clipPath: CLIP }}>
          <pre dangerouslySetInnerHTML={{ __html: hl(CODE) }} />
        </span>
        <svg className="th-rim" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <clipPath id="th-in"><path d={PATH} /></clipPath>
            <filter id="th-blur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.4" /></filter>
            <linearGradient id="th-flap" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#C6F36B" />
              <stop offset="1" stopColor="#93D52C" />
            </linearGradient>
          </defs>
          {/* the paper's thickness casting into the hole, then its pale torn fibre */}
          <path d={PATH} clipPath="url(#th-in)" fill="none" stroke="rgba(0,0,0,.6)" strokeWidth="5" filter="url(#th-blur)" />
          <path d={PATH} fill="none" stroke="#E6F8B8" strokeOpacity=".9" strokeWidth=".55" strokeLinejoin="round" />
          {FLAPS.map((f) => (
            <g key={f.k} className="th-flap">
              <path d={f.d} transform="translate(1 1.6)" fill="rgba(22,48,31,.22)" />
              <path d={f.d} fill="url(#th-flap)" stroke="#E6F8B8" strokeOpacity=".8" strokeWidth=".4" strokeLinejoin="round" />
            </g>
          ))}
        </svg>
      </span>
      <span className="th-label">{busy ? "Opening…" : "Open the demo ↗"}</span>
    </button>
  )
}

import { useEffect, useRef, type CSSProperties } from "react"
import { SRC, hl } from "./repoSource"
import "./xray-hero.css"

/**
 * The hero's explainer: a report screen with an X-ray lens moving over it.
 * Under each part of the screen the lens shows what's behind it: the request
 * behind the numbers, the SQL view behind the chart, the row-level-security
 * policy behind the table. Then "X" is pressed and the whole screen turns to
 * X-ray, as it does on every page of the demo.
 *
 * Plain HTML + CSS. The lens and the layer it shows move by transform only,
 * on one shared timeline; it pauses off screen. On a desktop the visitor can
 * take the lens and move it themselves. Reduced motion: the lens rests on the
 * numbers. The code comes from the repo files themselves (repoSource).
 */

// The real statements, trimmed to what fits: the view's shape and its tenant
// filter; the policy without its comment lines.
const VIEW = SRC.report.split("\n").filter((l) => /^(create view|select |from |where |\s+or )/.test(l)).slice(0, 5)
const POLICY = SRC.rls.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"))

const CALLS = [
  { m: "GET", p: "report_account_monthly", ms: 38, rows: "24 rows" },
  { m: "GET", p: "entities", ms: 21, rows: "1 row" },
  { m: "AUTH", p: "session · viewer", ms: 6, rows: "JWT" },
]

/** What sits under the screen — rendered twice: the full X-ray, and inside the lens. */
function Machinery() {
  return (
    <div className="xl-mach" aria-hidden="true">
      <div className="xm-chrome"><b>X-ray</b><span>press X on any screen</span></div>
      <div className="xm-a">
        <i className="xm-tag">1 · the request</i>
        {CALLS.map((c) => (
          <div key={c.p} className="xm-call">
            <em>{c.m}</em><span>{c.p}</span><b>{c.ms} ms</b><s style={{ "--w": `${Math.min(100, c.ms * 2.2)}%` } as CSSProperties} /><small>{c.rows}</small>
          </div>
        ))}
      </div>
      <div className="xm-b">
        <i className="xm-tag">2 · the SQL view</i>
        <pre dangerouslySetInnerHTML={{ __html: hl(VIEW.join("\n")) }} />
      </div>
      <div className="xm-c">
        <i className="xm-tag">3 · the RLS policy</i>
        <pre dangerouslySetInnerHTML={{ __html: hl(POLICY.join("\n")) }} />
        <span className="xm-chip">viewer → 1 of 4 companies</span>
      </div>
    </div>
  )
}

const NOI = [62, 66, 64, 70, 68, 74, 72, 79, 77, 83, 81, 86]

/** The screen a visitor sees: a small report, ink on paper. */
function Screen() {
  const pts = NOI.map((v, i) => `${14 + i * 40},${96 - (v - 55) * 2.4}`).join(" ")
  return (
    <div className="xl-ui" aria-hidden="true">
      <div className="xu-chrome"><i /><i /><i /><b>X-Ray · Overview</b><span>viewer</span></div>
      <div className="xu-kpis">
        <div><span>Revenue</span><b>€501,377</b><em>+0.1%</em></div>
        <div><span>NOI</span><b>€372,911</b><em>+2.4%</em></div>
        <div><span>Occupancy</span><b>88.1%</b><em>6,702 m² vacant</em></div>
      </div>
      <div className="xu-chart">
        <span>NOI · 12 months</span>
        <svg viewBox="0 0 470 100" preserveAspectRatio="none">
          {NOI.map((v, i) => <rect key={i} x={6 + i * 40} y={100 - (v - 40) * 1.6} width="16" height={(v - 40) * 1.6} rx="2" />)}
          <polyline points={pts} />
        </svg>
      </div>
      <div className="xu-table">
        <span>Companies you can see</span>
        <div className="xu-row"><i />Danube Office Park<b>€188k</b></div>
        <div className="xu-row ghost"><i />Showing 1 company</div>
      </div>
    </div>
  )
}

export function XrayHero() {
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    // Pause the whole timeline while the hero is off screen.
    const io = new IntersectionObserver(([e]) => el.classList.toggle("on", e.isIntersecting), { threshold: 0.15 })
    io.observe(el)

    // Desktop: take the lens. Its centre follows the pointer; the label says
    // which layer is under it. The auto timeline waits, paused, meanwhile.
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return () => io.disconnect()
    let raf = 0
    let x = 0
    let y = 0
    const apply = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const d = (190 / 520) * r.width
      el.style.setProperty("--lx", `${x - d / 2}px`)
      el.style.setProperty("--ly", `${y - d / 2}px`)
      const v = (y / r.height) * 380 // in screen units
      el.dataset.zone = v < 126 ? "1" : v < 254 ? "2" : "3"
    }
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      x = Math.max(0, Math.min(r.width, e.clientX - r.left))
      y = Math.max(0, Math.min(r.height, e.clientY - r.top))
      el.classList.add("manual")
      if (!raf) raf = requestAnimationFrame(apply)
    }
    const leave = () => { el.classList.remove("manual"); delete el.dataset.zone }
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerleave", leave)
    return () => {
      io.disconnect()
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerleave", leave)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <figure className="xl">
      <div ref={box} className="xl-box">
        <div className="xl-win">
          <Screen />
          <div className="xl-full"><Machinery /></div>
          <div className="xl-scan" />
        </div>
        <div className="xl-lens" aria-hidden="true">
          <div className="xl-glass"><div className="xl-in"><Machinery /></div></div>
          <i className="xl-handle" />
          <span className="xl-tag">
            <em className="t1">the request behind these numbers</em>
            <em className="t2">the SQL view behind this chart</em>
            <em className="t3">the policy behind these rows</em>
          </span>
        </div>
        <kbd className="xl-key" aria-hidden="true">X</kbd>
      </div>
      <figcaption>
        <span className="fine-pointer">Move the lens — </span>every screen can show the request, the SQL and the policy behind it.
        In the demo, press <kbd>X</kbd>.
      </figcaption>
    </figure>
  )
}

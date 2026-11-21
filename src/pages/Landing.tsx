import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { Link } from "@tanstack/react-router"
import { useExploreDemo } from "@/app/AppShell"
import { AUTHOR, EVIDENCE, TOP_TESTS, contactLinks, repoUrl } from "@/lib/author"
import { FILES, SRC, hl } from "./landing/repoSource"
import { CodeHero } from "./landing/CodeHero"
import { Desk, SkeletonList } from "./landing/Desk"
import "./landing/landing.css"

/**
 * The landing — a portfolio first, a product second. Five screens, each with
 * one job: who built this and what it is (money forming out of a rain of the
 * repo's own code, then turning into the code that books and reports it — the
 * product's idea in fifteen seconds), the moment that proves it
 * (row-level security, live in the browser), how it works (a live desk, then
 * its skeleton), what it shows its author can do — with the tests as
 * evidence — and how to reach her or open the demo.
 *
 * Light on purpose: no WebGL. One 2D canvas for the code rain at ~30 fps,
 * the rest HTML, SVG and CSS on transform and opacity — all paused off screen.
 */
export function Landing() {
  const { busy, explore } = useExploreDemo()
  const bar = useRef<HTMLElement>(null)
  const hero = useRef<HTMLElement>(null)
  const close = useRef<HTMLElement>(null)
  const copy = useRef<HTMLDivElement>(null)

  // Header: light text over the dark hero, a dark backing once the page
  // scrolls, paper over the closing sheet. One check per frame at most.
  useEffect(() => {
    let raf = 0
    const check = () => {
      raf = 0
      const b = bar.current
      const h = hero.current
      const c = close.current
      if (!b || !h || !c) return
      const onClose = c.getBoundingClientRect().top <= 64
      const scrolled = window.scrollY > 8 || h.getBoundingClientRect().top < -8
      b.classList.toggle("top-dark", !scrolled && !onClose)
      b.classList.toggle("is-dark", scrolled && !onClose)
      b.classList.toggle("is-paper", onClose)
    }
    const on = () => { if (!raf) raf = requestAnimationFrame(check) }
    check()
    addEventListener("scroll", on, { passive: true })
    return () => { removeEventListener("scroll", on); cancelAnimationFrame(raf) }
  }, [])

  const demoBtn = (cls: string, label = "Open the live demo") => (
    <button className={`btn ${cls}`} onClick={() => void explore()} disabled={busy}>{busy ? "Opening…" : label}</button>
  )
  const contacts = contactLinks()

  return (
    <div className="lp">
      <header ref={bar} className="bar">
        <div className="wrap">
          <Link to="/" className="brand" aria-label="X-Ray home"><img src="/xray-mark.svg" alt="" />X-Ray</Link>
          <nav aria-label="Sections">
            <a href="#rls">Security demo</a>
            <a href="#how">How it works</a>
            <a href="#skills">Skills</a>
            <a href="#contact">Contact</a>
          </nav>
          <span className="spacer" />
          {demoBtn("btn-ink btn-sm", "Open the demo")}
        </div>
      </header>

      <main id="top">
        {/* 1 · who, and what this is */}
        <section ref={hero} className="hero dark" aria-label="Introduction">
          <div className="wrap hero-grid">
            <div ref={copy} className="txt">
              <p className="kicker">Backend &amp; data engineer</p>
              <h1>
                <span className="lp-mask"><span className="name">{AUTHOR.name.split(" ")[0]}</span></span>
                <span className="lp-mask"><span className="name n2">{AUTHOR.name.split(" ").slice(1).join(" ")}</span></span>
              </h1>
              <p className="lede">
                <b>X-Ray</b> is a financial reporting engine I built from the database to the browser: messy
                spreadsheets in, checked and secured reports out — and every screen can show the queries,
                policies and code behind it.
              </p>
              <div className="ctas">
                {demoBtn("btn-ink")}
                <a className="btn btn-ghost" href={AUTHOR.repo} target="_blank" rel="noreferrer">Source on GitHub</a>
              </div>
              <p className="aside">
                Read-only demo with sample data — no sign-up.{" "}
                <a href="#contact">Get in touch ↓</a>
              </p>
            </div>
            <CodeHero host={hero} avoid={copy} />
          </div>
        </section>

        <div className="machinery">
          <div className="wrap">
            <WhoSeesWhat />
            <HowItWorks />
            <Skills />
          </div>

          {/* 5 · contact, and the demo */}
          <section ref={close} className="close" id="contact" aria-label="Contact and demo">
            <div className="wrap close-in">
              <div className="copy">
                <p className="kicker">The live demo</p>
                <h2>See it run on a real set of books</h2>
                <p>
                  The whole product on sample data: four property companies, two years of accounts and seven
                  reports, from the P&amp;L to the cash forecast. Read-only and without sign-up; it resets every hour.
                </p>
                <ul className="try">
                  <li><b>Switch roles.</b> As Viewer, Manager or Admin the same page returns one, two or four companies — Postgres decides, not the browser.</li>
                  <li><b>Press <kbd>X</kbd> on any page.</b> See the API calls behind it, the SQL view, the row-level policy and the source file.</li>
                  <li><b>Take the guided tour.</b> Two minutes through the reports, the data pipeline and the security model.</li>
                  <li><b>Use it for real.</b> Create your own workspace to invite your team, upload your CSV exports and connect a Google Sheet.</li>
                </ul>
                <div className="ctas">
                  {demoBtn("btn-ink")}
                  <a className="btn btn-ghost" href={AUTHOR.repo} target="_blank" rel="noreferrer">Source on GitHub</a>
                  <Link className="btn btn-ghost" to="/about">How it's built</Link>
                </div>
              </div>
              <figure className="peek">
                <div className="frame">
                  <div className="chrome" aria-hidden="true"><i /><i /><i /><span>X-Ray demo · Overview</span></div>
                  <img src="/img/demo-xray-rls.webp" width={1440} height={900} loading="lazy" decoding="async"
                    alt="The demo's Overview page with the X-ray panel open on its RLS tab: the same query run as Viewer, Manager and Admin returns one, two and four companies." />
                </div>
                <figcaption>The Overview with the X-ray panel open: one query, three people, three different answers — enforced by the database.</figcaption>
              </figure>
              <div className="work">
                <h3>Work with me</h3>
                <p>
                  I build reporting systems for groups of companies: importing and checking accounting data, a Postgres core
                  with row-level security and an audit trail, and the reports people rely on at month end. If that is what
                  you need, get in touch.
                </p>
                <div className="links">
                  {contacts.map((c) => (
                    <a key={c.href} className="btn btn-ghost btn-sm" href={c.href} {...(c.external ? { target: "_blank", rel: "noreferrer" } : {})}>{c.label}</a>
                  ))}
                </div>
              </div>
              <footer>
                <span className="me">{AUTHOR.name}</span>
                <a href={AUTHOR.github} target="_blank" rel="noreferrer">GitHub</a>
                <Link to="/about">About the project</Link>
                <span className="r">Sample data only</span>
              </footer>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

/* ───────────────────────── 2 · the proof: same query, different rows ───────────────────────── */

// Company names and memberships from supabase/seed.sql.
const ENTS = ["Danube Office Park", "Riverside Retail Park", "Lindenhof Residences", "Westgate Logistics Hub"]
const ROLES = {
  admin: { who: "admin@demo.local", see: [0, 1, 2, 3], line: 3, note: "The admin passes the first test, is_admin(), so every company comes back." },
  manager: { who: "manager@demo.local", see: [0, 1], line: 4, note: "A manager isn't an admin, so only the companies on their membership list come back." },
  viewer: { who: "viewer@demo.local", see: [0], line: 4, note: "This viewer was invited to one company. The other three never leave the database." },
} as const
type RoleKey = keyof typeof ROLES

function WhoSeesWhat() {
  const [role, setRole] = useState<RoleKey>("admin")
  const [shown, setShown] = useState<RoleKey>("admin")
  const [scanKey, setScanKey] = useState(0)
  const policy = useMemo(() => hl(SRC.rls.split("\n").slice(3).join("\n")).split("\n"), [])

  function pick(k: RoleKey) {
    setRole(k)
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(k); return }
    setScanKey((n) => n + 1)
    window.setTimeout(() => setShown(k), 380)
  }
  const R = ROLES[shown]
  return (
    <section className="sec" id="rls">
      <div className="sec-head">
        <h2>Same query. Different rows.</h2>
        <p>Three people run the identical query. The database — not the website — decides which companies each of them may see. Pick one.</p>
      </div>
      <div className="rls">
        <div className="rls-box">
          <div className="seg" role="group" aria-label="Signed in as">
            {(Object.keys(ROLES) as RoleKey[]).map((k) => (
              <button key={k} aria-pressed={role === k} onClick={() => pick(k)}>{k}</button>
            ))}
          </div>
          <div className="q"><code>select name from companies</code><span>as {ROLES[role].who}</span></div>
          <div className="rows">
            {scanKey > 0 && <div key={scanKey} className="scan go" />}
            {ENTS.map((n, i) => {
              const ok = (R.see as readonly number[]).includes(i)
              return (
                <div key={n} className={`erow${ok ? "" : " out"}`}>
                  <span className="ic" /><span className="nm">{n}</span><span className="why">{ok ? "returned" : "hidden by the policy"}</span>
                </div>
              )
            })}
          </div>
          <div className="count"><b>{R.see.length}</b><span>{R.see.length === 1 ? "company returned" : "companies returned"}</span></div>
        </div>
        <div className="pol">
          <p className="pol-title">The rule that decides it</p>
          <pre>{policy.map((l, i) => <span key={i} className={`ln${i === R.line ? " hl" : ""}`} dangerouslySetInnerHTML={{ __html: l || " " }} />)}</pre>
          <p className="pol-note">{R.note}</p>
          <a className="path" href={repoUrl(FILES.rls)} target="_blank" rel="noreferrer">the migration ↗</a>
        </div>
      </div>
      <p className="fine">A replay of the demo's memberships. In the live demo, X-ray → RLS signs in as each person and runs it against Postgres.</p>
    </section>
  )
}

/* ───────────────────────── 3 · how it works ───────────────────────── */

const STEPS = [
  {
    title: "Upload",
    plain: "A spreadsheet goes in — uploaded by hand, or pulled every hour from a shared Google Sheet.",
    tech: "React 19 · every request timed at one fetch seam",
    path: "src/lib/xray/instrumentedFetch.ts", label: "the fetch seam",
  },
  {
    title: "Check",
    plain: "Every row is validated and compared with its own history. Anything unusual waits for a person to approve.",
    tech: "Postgres functions · z-score screen · manual approval",
    path: "supabase/tests/detect_anomalies_test.sql", label: "the anomaly test",
  },
  {
    title: "Protect",
    plain: "Each company's figures are visible only to the people invited to it — enforced inside the database.",
    tech: "Row-level security on every table · tested in CI",
    path: "supabase/tests/security_isolation_test.sql", label: "the isolation test",
  },
  {
    title: "Report",
    plain: "Approved numbers flow into the P&L, rent roll, cash budget and forecast within a minute, on their own.",
    tech: "Trigger → refresh queue → pg_cron · materialized views",
    path: "supabase/migrations/20260610000006_pg_cron_refresh_and_housekeeping.sql", label: "the cron refresh",
  },
]

/** What the desk is doing in each act — over the desk, or under it on phones. */
const ACT_CAPTIONS = [
  "Three companies send this month's spreadsheets",
  "Every row is checked — one odd figure waits for a person",
  "Each company's numbers stay private to its own people",
  "The portfolio report rebuilds itself within a minute",
  "X-ray: the skeleton underneath — the real tables, jobs and policies",
]

type ActLoop = { pin: () => void; unpin: () => void }

/**
 * The month on a loop: act 1…4 (three seconds each, the report a little
 * longer), act 5 the X-ray of the whole solution, a fade, again. Sets
 * cumulative a1…a5 classes, `data-act` (which step card is lit, where the
 * token sits) and `out` on the section's flow; CSS does the rest. Runs only
 * while the desk is on screen and resumes where it paused. `pin` holds the
 * X-ray (the story jumps to its end under it); `unpin` fades back and starts
 * the month again. Reduced motion: the finished desk, no loop.
 */
function useActLoop(ref: RefObject<HTMLDivElement | null>) {
  const ctl = useRef<ActLoop>({ pin() {}, unpin() {} })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const acts = (k: number) => {
      for (let i = 1; i <= 5; i++) el.classList.toggle(`a${i}`, i <= k)
      el.dataset.act = String(k)
    }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const still = () => acts(4) // the finished desk, captioned as the report act
      el.classList.add("play", "on")
      still()
      ctl.current = { pin: () => acts(5), unpin: still }
      return
    }
    const plan: [number, () => void][] = [
      [0, () => { el.classList.remove("out", "skip"); acts(1) }],
      [3000, () => acts(2)],
      [6000, () => acts(3)],
      [9000, () => acts(4)],
      [12400, () => acts(5)],
      [19400, () => el.classList.add("out")],
      [19900, () => acts(0)],
    ]
    const CYCLE = 19960 // a beat after the reset, so the next act's animations restart
    const OUT = 5 // plan index of the fade
    let i = 0
    let timer = 0
    let left = 0
    let since = 0
    let started = false
    let pinned = false
    let visible = false
    const wait = (ms: number) => { left = ms; since = performance.now(); timer = window.setTimeout(step, ms) }
    function step() {
      const [at, run] = plan[i]
      run()
      i = (i + 1) % plan.length
      wait((i ? plan[i][0] : CYCLE) - at)
    }
    const io = new IntersectionObserver(([e]) => {
      clearTimeout(timer)
      visible = e.isIntersecting
      el.classList.toggle("on", visible)
      if (pinned) return
      if (visible) {
        if (started) wait(left)
        else { started = true; el.classList.add("play"); step() }
      } else if (started) left = Math.max(0, left - (performance.now() - since))
    }, { threshold: 0.25 })
    // Watch the desk itself: the whole flow can be taller than the screen.
    io.observe(el.querySelector(".desk") ?? el)
    ctl.current = {
      pin() {
        if (pinned) return
        pinned = true
        started = true
        clearTimeout(timer)
        el.classList.remove("out")
        el.classList.add("play", "skip")
        acts(5)
      },
      unpin() {
        // Back through the loop's own fade and reset, so pausing off screen
        // keeps working in the middle of it.
        if (!pinned) return
        pinned = false
        clearTimeout(timer)
        i = OUT
        left = 0
        if (visible) step()
      },
    }
    return () => { io.disconnect(); clearTimeout(timer) }
  }, [ref])
  return ctl
}

function HowItWorks() {
  const flow = useRef<HTMLDivElement>(null)
  const loop = useActLoop(flow)
  const [pinned, setPinned] = useState(false)
  const toggle = () => {
    if (pinned) loop.current.unpin()
    else loop.current.pin()
    setPinned(!pinned)
  }
  return (
    <section className="sec" id="how">
      <div className="sec-head">
        <h2>How it works</h2>
        <p>From a spreadsheet to a report a CFO can trust, in four steps — then the same month on X-ray, down to the tables and jobs that run it.</p>
      </div>
      <div ref={flow} className="flow">
        <div className="desk-wrap">
          <Desk />
          {/* What the desk is doing, under it — never over it, never under the sticky header */}
          <div className="dk-bar">
            <ol className="dk-dots" aria-hidden="true">{ACT_CAPTIONS.map((c, i) => <li key={c} className={`d${i + 1}`} />)}</ol>
            <div className="dk-cap" aria-live="off">
              {ACT_CAPTIONS.map((c, i) => <span key={c} className={`c${i + 1}`}><b>{i < 4 ? i + 1 : "X"}</b>{c}</span>)}
            </div>
            <button type="button" className="dk-xbtn" aria-pressed={pinned} onClick={toggle}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16" />
              </svg>
              {pinned ? "Back to the desk" : "See the skeleton"}
            </button>
          </div>
          {pinned && <SkeletonList />}
        </div>
        <div className="track" aria-hidden="true"><span className="line" /><span className="rail"><span className="token"><i /><i /><i /></span></span></div>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.title} style={{ ["--i" as string]: i }}>
              <span className="num">{String(i + 1).padStart(2, "0")}</span>
              <h3>{s.title}</h3>
              <p className="plain">{s.plain}</p>
              <p className="tech">{s.tech}</p>
              <a className="path" href={repoUrl(s.path)} target="_blank" rel="noreferrer">{s.label} ↗</a>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ───────────────────────── 4 · what it shows I can do ───────────────────────── */

function Skills() {
  return (
    <section className="sec" id="skills">
      <div className="sec-head">
        <h2>What this shows I can do</h2>
        <p>Each line links to the code that backs it.</p>
      </div>
      <div className="skills">
        <ul className="areas">
          {EVIDENCE.map((e) => (
            <li key={e.area}>
              <h3>{e.area}</h3>
              <p className="plain">{e.plain}</p>
              <p className="tech">{e.tech}</p>
              <p className="links">
                {e.where.map((w) => <a key={w.path} className="path" href={repoUrl(w.path)} target="_blank" rel="noreferrer">{w.label} ↗</a>)}
              </p>
            </li>
          ))}
        </ul>
        <aside className="proof">
          <h3>Tested on every change</h3>
          <dl>
            <div><dt>98</dt><dd>database assertions (pgTAP) against a real Postgres</dd></div>
            <div><dt>81</dt><dd>unit tests for the money maths</dd></div>
            <div><dt>14</dt><dd>tests for the file parser</dd></div>
          </dl>
          <p className="tech">Three of them:</p>
          <ul>
            {TOP_TESTS.map((t) => (
              <li key={t.path}><a href={repoUrl(t.path)} target="_blank" rel="noreferrer">{t.name}</a></li>
            ))}
          </ul>
          <p className="tech">Writing them found and fixed four real bugs in the reporting maths. Built with Claude Code as a pair programmer.</p>
        </aside>
      </div>
    </section>
  )
}

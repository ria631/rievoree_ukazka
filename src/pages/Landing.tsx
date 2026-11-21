import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "@tanstack/react-router"
import { useExploreDemo } from "@/app/AppShell"
import { AUTHOR, EVIDENCE, TOP_TESTS, contactLinks, repoUrl } from "@/lib/author"
import { FILES, SRC, hl } from "./landing/repoSource"
import type { LandingEls } from "./landing/tear"
import "./landing/landing.css"

/**
 * The landing — a portfolio first, a product second. Five screens, each with
 * one job: who built this and what it is (the torn sheet showing the repo's
 * own code), the moment that proves it (row-level security, live in the
 * browser), how it works in four plain steps, what it shows its author can
 * do — with the tests as evidence — and how to reach her or open the demo.
 */
export function Landing() {
  const { busy, explore } = useExploreDemo()
  const root = useRef<HTMLDivElement>(null)
  // The elements the WebGL scene drives, collected by callback refs.
  const els = useRef<Partial<LandingEls>>({})
  const bind = (k: keyof LandingEls) => (el: HTMLElement | null) => { els.current[k] = (el ?? undefined) as never }
  const exploreRef = useRef(explore)
  exploreRef.current = explore

  // The torn sheets load after first paint (three.js is its own chunk); without
  // WebGL the page stays a flat lime sheet with a dark window — still whole.
  useEffect(() => {
    let dispose: (() => void) | undefined
    let cancelled = false
    import("./landing/tear").then(({ mountLanding }) => {
      if (cancelled) return
      const all = els.current
      const keys: (keyof LandingEls)[] = ["hero", "stage", "canvas", "anchor", "hint", "bar", "close", "canvas2", "anchor2", "hint2"]
      if (keys.some((k) => !all[k])) return
      try { dispose = mountLanding(all as LandingEls, () => void exploreRef.current()) }
      catch { root.current?.classList.add("nogl") }
    }).catch(() => root.current?.classList.add("nogl"))
    return () => { cancelled = true; dispose?.() }
  }, []) // mount once: the refs are stable for the page's lifetime

  const demoBtn = (cls: string, label = "Open the live demo") => (
    <button className={`btn ${cls}`} onClick={() => void explore()} disabled={busy}>{busy ? "Opening…" : label}</button>
  )
  const contacts = contactLinks()

  return (
    <div ref={root} className="lp">
      <header ref={bind("bar")} className="bar">
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
        <section ref={bind("hero")} className="hero" aria-label="Introduction">
          <div ref={bind("stage")} className="hero-stage">
            <canvas ref={bind("canvas")} id="gl" aria-hidden="true" />
          </div>
          <div className="wrap hero-grid">
            <div className="txt">
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
            <figure className="hole">
              <div ref={bind("anchor")} className="anchor" aria-hidden="true" />
              <figcaption>The page, torn open on this repo's own code.</figcaption>
            </figure>
          </div>
        </section>
        <span ref={bind("hint")} className="dive-hint" aria-hidden="true">see how it works ↓</span>

        <div className="machinery">
          <div className="wrap">
            <WhoSeesWhat />
            <HowItWorks />
            <Skills />
          </div>

          {/* 5 · contact, and the demo */}
          <section ref={bind("close")} className="close" id="contact" aria-label="Contact and demo">
            <canvas ref={bind("canvas2")} id="gl2" aria-hidden="true" />
            <span ref={bind("hint2")} className="dive-hint" aria-hidden="true">open the demo</span>
            <div className="wrap close-in">
              <div className="copy">
                <h2>Now tear into the real one</h2>
                <p>The live demo is read-only, with sample data — no sign-up, and it resets every hour. Open any page, then press <kbd>X</kbd> to see the calls and policies behind it.</p>
                <div className="ctas">
                  {demoBtn("btn-ink")}
                  <a className="btn btn-ghost" href={AUTHOR.repo} target="_blank" rel="noreferrer">Source on GitHub</a>
                </div>
                <div className="work">
                  <h3>Work with me</h3>
                  <p>Reporting for groups of companies, data pipelines that hold up in an audit, and the backend underneath them.</p>
                  <div className="links">
                    {contacts.map((c) => (
                      <a key={c.href} className="btn btn-ghost btn-sm" href={c.href} {...(c.external ? { target: "_blank", rel: "noreferrer" } : {})}>{c.label}</a>
                    ))}
                  </div>
                </div>
              </div>
              <div ref={bind("anchor2")} className="anchor" aria-hidden="true" />
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

function HowItWorks() {
  return (
    <section className="sec" id="how">
      <div className="sec-head">
        <h2>How it works</h2>
        <p>From a spreadsheet to a report a CFO can trust, in four steps.</p>
      </div>
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <span className="num">{String(i + 1).padStart(2, "0")}</span>
            <h3>{s.title}</h3>
            <p className="plain">{s.plain}</p>
            <p className="tech">{s.tech}</p>
            <a className="path" href={repoUrl(s.path)} target="_blank" rel="noreferrer">{s.label} ↗</a>
          </li>
        ))}
      </ol>
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

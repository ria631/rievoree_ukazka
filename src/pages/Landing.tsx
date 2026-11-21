import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "@tanstack/react-router"
import { useExploreDemo } from "@/app/AppShell"
import { FILES, SRC, hl, lines } from "./landing/repoSource"
import type { LandingEls } from "./landing/tear"
import { AUTHOR, EVIDENCE, contactLinks, repoUrl } from "@/lib/author"
import "./landing/landing.css"

const GITHUB_URL = AUTHOR.repo

// The demo books as the Journal page reports them (shared demo, all four
// companies; it resets hourly to this state). Real figures, not invented ones —
// re-check them there if the generator changes.
const STATS = [
  ["€120.0M", "posted to the ledger, debit side"],
  ["4,708", "documents, every one balanced"],
  ["4", "companies, RLS-scoped"],
  ["24", "monthly periods"],
] as const

/**
 * The landing — one sheet of lime paper, torn open in real time (WebGL) on the
 * repo's own source. Scrolling dives through the hole into the machinery: the
 * app taken apart layer by layer, the row-level-security demo, the parts list
 * and the tests CI runs — then back onto the paper to open the demo.
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
      const keys: (keyof LandingEls)[] = ["hero", "stage", "canvas", "anchor", "txt", "stats", "inCopy", "hint", "bar", "close", "canvas2", "anchor2", "hint2"]
      if (keys.some((k) => !all[k])) return
      try { dispose = mountLanding(all as LandingEls, () => void exploreRef.current()) }
      catch { root.current?.classList.add("nogl") }
    }).catch(() => root.current?.classList.add("nogl"))
    return () => { cancelled = true; dispose?.() }
  }, [])

  const demoBtn = (cls: string) => (
    <button className={`btn ${cls}`} onClick={() => void explore()} disabled={busy}>{busy ? "Opening…" : "Explore the demo"}</button>
  )

  return (
    <div ref={root} className="lp">
      <header ref={bind("bar")} className="bar">
        <div className="wrap">
          <Link to="/" className="brand" aria-label="X-Ray home"><img src="/xray-mark.svg" alt="" />X-Ray</Link>
          <nav aria-label="Sections">
            <a href="#layers">Layers</a>
            <a href="#rls">Who sees what</a>
            <a href="#parts">Parts and tests</a>
            <a href="#author">Who built it</a>
          </nav>
          <span className="spacer" />
          <Link to="/login" className="signin">Sign in</Link>
          {demoBtn("btn-ink")}
        </div>
      </header>

      <main id="top">
        <section ref={bind("hero")} className="hero" aria-label="Introduction">
          <div ref={bind("stage")} className="hero-stage">
            <canvas ref={bind("canvas")} id="gl" aria-hidden="true" />
            <div className="wrap hero-copy">
              <div ref={bind("txt")} className="txt">
                <h1 aria-label="See the machinery of your finance">
                  <span className="lp-mask"><span className="l1">See the</span></span>
                  <span className="lp-mask"><span className="l2">
                    {"Machinery".split("").map((c, i) => <span key={i} aria-hidden="true" style={{ animationDelay: `${0.15 + i * 0.045}s` }}>{c}</span>)}
                  </span></span>
                  <span className="lp-mask"><span className="l3">of your finance</span></span>
                </h1>
                <p className="lede">A financial reporting engine: messy spreadsheets in, validated and anomaly-screened reports out. Built backend-first, with row-level security, a real ETL pipeline and scheduled jobs, and you can watch every layer work.</p>
                <div className="ctas">
                  {demoBtn("btn-ink")}
                  <a className="btn btn-ghost" href={GITHUB_URL} target="_blank" rel="noreferrer">Read the source</a>
                </div>
                <p className="byline">A portfolio project by <b>{AUTHOR.name}</b>, built end to end — database to browser.</p>
                <p className="note">The page is torn open on the <b>real source</b> beneath it: an RLS policy, the report view, the worker's queue claim. Move around it, then click the hole or scroll to go in.</p>
              </div>
              <div ref={bind("anchor")} className="anchor" aria-hidden="true" />
            </div>
            <div ref={bind("stats")} className="stats" aria-label="Demo dataset">
              <div className="wrap">
                {STATS.map(([v, l]) => <div key={l} className="stat"><div className="v">{v}</div><div className="l">{l}</div></div>)}
              </div>
            </div>
            <span ref={bind("hint")} className="dive-hint">click to go in</span>
            <div ref={bind("inCopy")} className="in-copy" aria-hidden="true">
              <div><h2>You're in<br />the machinery</h2><p>Every layer from here down is real code from the repo.</p></div>
            </div>
          </div>
        </section>

        <div className="machinery">
          <Exploded />

          <div className="wrap">
            <WhoSeesWhat />
            <PartsAndTests />
            <BuiltBy />
          </div>

          <section ref={bind("close")} className="close" id="open" aria-label="Open the demo">
            <canvas ref={bind("canvas2")} id="gl2" aria-hidden="true" />
            <span ref={bind("hint2")} className="dive-hint" style={{ position: "absolute" }}>open the demo</span>
            <div className="wrap close-in">
              <div className="copy">
                <h2>Now tear into the real one</h2>
                <p>The demo account is read-only, so nothing you do is saved. Open any page, then open the X-ray panel to see the calls and policies behind it.</p>
                <div className="ctas">
                  {demoBtn("btn-ink")}
                  <a className="btn btn-ghost" href={GITHUB_URL} target="_blank" rel="noreferrer">Read the source</a>
                </div>
                <dl className="facts">
                  <div><dt>Sign-in</dt><dd>none, the demo user is shared</dd></div>
                  <div><dt>Roles to try</dt><dd>viewer, manager, admin</dd></div>
                  <div><dt>Resets</dt><dd>every hour</dd></div>
                </dl>
              </div>
              <div ref={bind("anchor2")} className="anchor" aria-hidden="true" />
              <footer>
                <span className="me">Mariia Chernenko</span>
                <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
                <Link to="/about">About the project</Link>
                <span className="r">Fake data only</span>
              </footer>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

/* ───────────────────────── one app, four layers ───────────────────────── */

const LAYERS = [
  {
    k: "Layer 1 of 4", name: "Browser", sub: "React 19, TypeScript", file: FILES.fetch,
    what: "You drop a spreadsheet on the Ingest page. Every request leaves through one wrapped fetch, which times it and feeds the X-ray panel.",
    code: lines(SRC.fetch, "const startedAt", 6),
    ink: <><div className="mini-row" style={{ top: 62, width: 120 }} /><div className="mini-row" style={{ top: 86, right: "auto", width: 130, opacity: 0.6 }} /><div className="mini-row" style={{ top: 216 }} /><div className="mini-row" style={{ top: 240, opacity: 0.6 }} /><div className="ink" style={{ right: 14, top: 62, textAlign: "right" }}>{"Ingest\nfacility-costs.csv"}</div></>,
  },
  {
    k: "Layer 2 of 4", name: "Edge function", sub: "Deno, Supabase Edge", file: FILES.edge,
    what: "A Deno function on the edge checks that you may upload for this company — through the same row-level security — before it hands out a signed upload URL.",
    code: SRC.edge.split("\n").filter((l) => !/^\s*(if \(entityErr|log\(|return json\(500)/.test(l)).filter((l, i, a) => !(l.trim() === "}" && a[i - 1]?.trim() === "}")).join("\n"),
    ink: <><div className="ink" style={{ left: 14, top: 60 }}>{"Deno.serve(async (req) => {\n  …\n})"}</div><div className="ink" style={{ right: 14, bottom: 14, textAlign: "right" }}>{"ingest-submit\nnotify-review\nconnector-webhook\nadmin-users"}</div></>,
  },
  {
    k: "Layer 3 of 4", name: "Postgres", sub: "row-level security", file: FILES.rls,
    what: "The database filters every row by who's asking. Your batch can only land in the companies you belong to.",
    code: lines(SRC.rls, "create policy", 6),
    ink: <><div className="ink" style={{ left: 14, top: 60 }}>{"entities_select\njournal_entries\ningest_queue  deny all"}</div><div className="ink" style={{ right: 14, bottom: 14, textAlign: "right" }}>{"pg_cron  refresh-report-mv\npg_net   connector fetch"}</div></>,
  },
  {
    k: "Layer 4 of 4", name: "Worker", sub: "Deno in Docker, local stack", file: FILES.worker,
    what: "In the local stack a Deno worker claims each job without ever colliding with another one and reads the file, Excel included. (The hosted demo parses CSV in the browser instead.) Postgres validates, flags outliers by z-score and loads; once a minute pg_cron refreshes the report.",
    code: lines(SRC.worker, "order by run_after", 6),
    ink: <><div className="ink" style={{ left: 14, top: 60 }}>{"queue\n#1184 pending\n#1183 processing\n#1182 loaded"}</div><div className="ink" style={{ right: 14, bottom: 14, textAlign: "right" }}>{"z-score screen\ndelete-and-reload"}</div></>,
  },
]

/** The torn-hole outline used by the CSS holes (seeded, so it never changes). */
function tornPath(seed: number, base = 78, jag = 1) {
  let s = seed
  const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  const N = 64, ph = [r() * 6.28, r() * 6.28, r() * 6.28], pts: string[] = []
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2
    let rad = base + 7 * Math.sin(a * 3 + ph[0]) + 4 * Math.sin(a * 7 + ph[1]) + 2.5 * Math.sin(a * 13 + ph[2])
    rad += (r() - 0.5) * 9 * jag * (i % 2 ? 1 : 0.4)
    pts.push(`${(100 + Math.cos(a) * rad).toFixed(1)} ${(100 + Math.sin(a) * rad * 0.94).toFixed(1)}`)
  }
  return `M${pts.join(" L")} Z`
}
const HOLE = tornPath(7)
const FIBRE = tornPath(7, 82.5, 1.6)
const HOLE_MASK = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><path d='${HOLE}' fill='black'/></svg>`)}")`

function Rim({ id }: { id: string }) {
  return (
    <svg className="rimp" viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <clipPath id={`c${id}`}><path d={HOLE} /></clipPath>
        <filter id={`b${id}`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>
      <g clipPath={`url(#c${id})`}><path d={HOLE} fill="none" stroke="#010605" strokeWidth="12" filter={`url(#b${id})`} opacity=".85" /></g>
      <path d={FIBRE} fill="none" stroke="#9FD7C2" strokeWidth="2.4" strokeLinejoin="round" opacity=".7" vectorEffect="non-scaling-stroke" />
      <path d={HOLE} fill="none" stroke="#CFEFE2" strokeWidth="1.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Scroll takes the app apart: four plates spread, a cube (one upload) falls
 *  through them, and each plate shows the code that handles it. Positions are
 *  written straight to the DOM from the scroll handler — no re-render per frame. */
function Exploded() {
  const sec = useRef<HTMLElement>(null)
  const plates = useRef<(HTMLDivElement | null)[]>([])
  const cube = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(-1)

  useEffect(() => {
    const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
    const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t) }
    let last = -2
    const run = () => {
      const el = sec.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const p = clamp(-rect.top / (rect.height - innerHeight))
      const spread = smooth(0, 0.3, p), gap = 10 + spread * (innerWidth < 980 ? 92 : 128), mid = ((LAYERS.length - 1) * gap) / 2
      const zs = LAYERS.map((_, i) => (LAYERS.length - 1 - i) * gap - mid)
      plates.current.forEach((pl, i) => { if (pl) pl.style.transform = `translateZ(${zs[i]}px)` })
      const fall = smooth(0.3, 0.94, p), zTop = zs[0] + 110, z = zTop + (zs[zs.length - 1] - zTop) * fall
      if (cube.current) {
        cube.current.style.transform = `translateZ(${(z + 14).toFixed(1)}px) rotateZ(${fall * 360}deg)`
        cube.current.style.opacity = p < 0.24 ? "0" : "1"
      }
      let a = -1
      if (p >= 0.3) { a = 0; zs.forEach((zz, i) => { if (z <= zz + 40) a = i }) }
      if (a !== last) { last = a; setActive(a) }
    }
    addEventListener("scroll", run, { passive: true })
    addEventListener("resize", run)
    run()
    return () => { removeEventListener("scroll", run); removeEventListener("resize", run) }
  }, [])

  const L = active >= 0 ? LAYERS[active] : null
  const recess = useMemo(() => LAYERS.map((l) => hl(l.code)), [])
  return (
    <section ref={sec} className="explode" id="layers" aria-label="The four layers of the app">
      <div className="ex-sticky">
        <div className="wrap ex-grid">
          <div className="ex-insp" aria-live="polite">
            <div className="step">{L ? L.k : "Assembled"}</div>
            <h2>{L ? L.name : "One app, four layers"}</h2>
            <p className="what">{L ? L.what : "Keep scrolling to take it apart. One upload falls through every layer, and each one shows the code that handles it."}</p>
            <div className="file">{L?.file ?? ""}</div>
            <pre dangerouslySetInnerHTML={{ __html: L ? recess[active] : '<span class="c">// scroll</span>' }} />
            <div className="ex-pips">{LAYERS.map((_, i) => <span key={i} className={i <= active ? "on" : ""} />)}</div>
          </div>
          <div className="ex-stage" aria-hidden="true">
            <div className="assembly" style={{ ["--hole" as string]: HOLE_MASK }}>
              <div className="ex-floor" />
              {LAYERS.map((l, i) => (
                <div key={l.name} ref={(el) => { plates.current[i] = el }} className={`plate${i === active ? " on" : ""}`}>
                  <div className="side"><pre className="recess" dangerouslySetInnerHTML={{ __html: recess[i] }} /></div>
                  <div className="face"><div className="tag">{l.name}<small>{l.sub}</small></div>{l.ink}</div>
                  <Rim id={`p${i}`} />
                </div>
              ))}
              <div ref={cube} className="cube">{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ───────────────────────── who sees what ───────────────────────── */

// Entity names and memberships from supabase/seed.sql.
const ENTS = ["Danube Office Park s.r.o.", "Riverside Retail Park s.r.o.", "Lindenhof Residences s.r.o.", "Westgate Logistics Hub s.r.o."]
const ROLES = {
  admin: { who: "admin@demo.local", see: [0, 1, 2, 3], line: 3, note: "An admin passes the first test, is_admin(), so every company comes back." },
  manager: { who: "manager@demo.local", see: [0, 1], line: 4, note: "A manager isn't an admin, so only the companies in their membership list come back: the office and the retail park." },
  viewer: { who: "viewer@demo.local", see: [0], line: 4, note: "A viewer was invited to one company, so one row comes back. The other three never leave the database." },
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
    window.setTimeout(() => setShown(k), 420)
  }
  const R = ROLES[shown]
  return (
    <section className="lp-block" id="rls">
      <div className="sec-head">
        <h2>Same query. Different rows.</h2>
        <p>Who sees which company is decided inside Postgres, not in the frontend. Pick a person and the policy filters the table for them. <span className="replay">A replay of the seeded memberships — in the demo, X-ray → RLS runs it live.</span></p>
      </div>
      <div className="rls">
        <div className="rls-box">
          <div className="seg" role="group" aria-label="Signed in as">
            {(Object.keys(ROLES) as RoleKey[]).map((k) => (
              <button key={k} aria-pressed={role === k} onClick={() => pick(k)}>{k}</button>
            ))}
          </div>
          <div className="q">signed in as <b>{ROLES[role].who}</b><br /><b>select</b> name <b>from</b> public.entities</div>
          <div className="rows">
            {scanKey > 0 && <div key={scanKey} className="scan go" />}
            {ENTS.map((n, i) => {
              const ok = (R.see as readonly number[]).includes(i)
              return (
                <div key={n} className={`erow${ok ? "" : " out"}`}>
                  <span className="ic" /><span className="nm">{n}</span><span className="why">{ok ? "returned" : "filtered by policy"}</span>
                </div>
              )
            })}
          </div>
          <div className="count"><b>{R.see.length}</b><span>{R.see.length === 1 ? "row returned" : "rows returned"}</span></div>
        </div>
        <div className="pol">
          <div className="fn">{FILES.rls}</div>
          <pre>{policy.map((l, i) => <span key={i} className={`ln${i === R.line ? " hl" : ""}`} dangerouslySetInnerHTML={{ __html: l || " " }} />)}</pre>
          <p>{R.note}</p>
        </div>
      </div>
    </section>
  )
}

/* ───────────────────────── parts + tests ───────────────────────── */

const BOM = [
  ["React 19", "pages you click through", "src/pages/"],
  ["X-ray panel", "calls, pipeline events and policies, live", "src/components/xray/"],
  ["Postgres", "the ledger, with row-level security on every table", "supabase/migrations/"],
  ["Edge functions", "uploads, review emails, signed webhooks, users", "supabase/functions/"],
  ["ETL worker", "parse, validate, z-score, load", "worker/src/"],
  ["pg_cron and pg_net", "scheduled refresh and spreadsheet fetch, inside the database", "…pg_cron_refresh_and_housekeeping.sql"],
  ["Auth", "four roles, two-factor codes, invites, Google and GitHub sign-in", "src/lib/auth/"],
] as const
const TESTS = [
  ["Companies can't see each other's data", "supabase/tests/security_isolation_test.sql"],
  ["Outliers get flagged by z-score", "supabase/tests/detect_anomalies_test.sql"],
  ["Raw rows become clean journal lines", "supabase/tests/transform_batch_test.sql"],
  ["Reloading a batch doesn't double it", "supabase/tests/load_batch_test.sql"],
  ["Linked spreadsheets sync by month", "supabase/tests/sheet_link_connector_test.sql"],
  ["Demo users stay read-only", "supabase/tests/demo_staff_test.sql"],
  ["A demo account never sees a real one", "supabase/tests/demo_members_privacy_test.sql"],
  ["New companies get balanced books and delete cleanly", "supabase/tests/account_lifecycle_test.sql"],
  ["Spreadsheet formulas can't run on open", "worker/src/sanitize.test.ts"],
  ["The dashboard's KPIs add up", "src/lib/data"],
] as const

function PartsAndTests() {
  return (
    <section className="lp-block" id="parts">
      <div className="sec-head">
        <h2>Parts list and test bench</h2>
        <p>What it's built from, where each part lives in the repo, and the tests CI runs on every push.</p>
      </div>
      <div className="two">
        <div className="list">
          <h3>Parts</h3>
          {BOM.map(([a, b, c]) => (
            <div key={a} className="li"><span className="mk" /><span className="t">{a} <span>{b}</span></span><a className="f" href={repoUrl(c.startsWith("…") ? "supabase/migrations/20260610000006_pg_cron_refresh_and_housekeeping.sql" : c.replace(/\/$/, ""))} target="_blank" rel="noreferrer">{c}</a></div>
          ))}
        </div>
        <div className="list">
          <h3>Tests</h3>
          {TESTS.map(([a, c]) => (
            <div key={a} className="li"><span className="lamp" /><span className="t">{a}</span><a className="f" href={repoUrl(c)} target="_blank" rel="noreferrer">{c}</a></div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ───────────────────────── who built it ───────────────────────── */

function BuiltBy() {
  return (
    <section className="lp-block" id="author" aria-label="Who built it">
      <div className="sec-head">
        <h2>Built by {AUTHOR.name}</h2>
        <p>One person, every layer: the data model and its security, the ETL and the anomaly screen, the scheduled jobs, the edge functions, the React app and the X-ray that shows them working. Each claim below links to the code that backs it.</p>
      </div>
      <div className="author">
        <ul className="proof">
          {EVIDENCE.map((e) => (
            <li key={e.area}>
              <span className="area">{e.area}</span>
              <span className="claim">{e.claim}</span>
              <span className="where">
                {e.where.map((w) => <a key={w.path} href={repoUrl(w.path)} target="_blank" rel="noreferrer">{w.label}</a>)}
              </span>
            </li>
          ))}
        </ul>
        <div className="contact">
          <h3>Work with me</h3>
          <p>Reporting for groups of companies, data pipelines that hold up in an audit, and the backend underneath them.</p>
          <div className="links">
            {contactLinks().map((c) => (
              <a key={c.href} className={`btn ${c.external ? "btn-line" : "btn-lime"}`} href={c.href}
                {...(c.external ? { target: "_blank", rel: "noreferrer" } : {})}>{c.label}</a>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

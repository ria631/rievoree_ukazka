import { useEffect, useRef } from "react"
import { watchInView } from "./viewport"
import "./move.css"

/**
 * "Moving off an old system?" — a database migration, shown as an animation:
 * the old sources on the left, rows flowing through mapping and checks, and the
 * new database on the right reconciling to the source before the switch.
 *
 * Like the MCP section it's an illustration, not a live tool: a migration runs
 * on a client's own data. One 12-second CSS timeline (transform and opacity
 * only), running only while on screen; reduced motion shows the end state.
 */

const SOURCES = [
  { name: "Excel workbooks", meta: "12 files · 40 sheets" },
  { name: "Access database", meta: "orders.mdb" },
  { name: "SQL Server 2008", meta: "erp_prod" },
  { name: "Accounting exports", meta: "CSV · monthly" },
]

const CHECKS = [
  { k: "c1", t: "Rows", v: "48,210 / 48,210" },
  { k: "c2", t: "Totals per month", v: "match to the cent" },
  { k: "c3", t: "Differences", v: "0" },
]

const TABLES = ["companies", "accounts", "journal_entries", "invoices", "documents", "…"]

const STEPS = [
  { t: "Map", s: "Every old field gets a home in the new schema — and every odd value a rule, written down." },
  { t: "Rehearse", s: "Copy, compare row for row and total for total, fix, repeat — until there are no differences left." },
  { t: "Switch", s: "One planned cut-over. The old system stays read-only as a fallback until you're sure." },
]

export function MoveYourData() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    return watchInView(el, (v) => el.classList.toggle("on", v), { amount: 0.2 })
  }, [])

  return (
    <section className="sec" id="migrate">
      <div className="sec-head">
        <p className="eyebrow">Option 3 · moving your data</p>
        <h2>Stuck on spreadsheets or an old system? Move it without losing a row.</h2>
        <p>
          Reporting and AI both need a clean database underneath. If your data lives in Excel, Access, an ageing SQL
          server or an accounting system's exports, I move it to <b>PostgreSQL / Supabase</b>: mapped, checked row for
          row against the source, and switched over only when the numbers match.
        </p>
      </div>

      <div ref={ref} className="mig" aria-label="Animation: data from Excel, Access, an old SQL server and accounting exports flows through mapping and checks into a new PostgreSQL database; row counts and totals are compared with the source until there are no differences, then the system switches over.">
        <div className="mig-col mig-src">
          <div className="mig-head"><i className="dot amber" />Today</div>
          <ul>
            {SOURCES.map((s, i) => (
              <li key={s.name} className={`a s${i + 1}`}><b>{s.name}</b><span>{s.meta}</span></li>
            ))}
          </ul>
          <p className="mig-foot old a gone">Old system · read-only from cut-over</p>
        </div>

        <div className="mig-pipe" aria-hidden="true">
          <div className="lane"><span className="row a r1" /><span className="row a r2" /><span className="row a r3" /><span className="row a r4" /></div>
          <ol className="stages">
            <li className="a g1">map</li>
            <li className="a g2">clean</li>
            <li className="a g3">compare</li>
          </ol>
          <div className="lane"><span className="row a r5" /><span className="row a r6" /><span className="row a r7" /><span className="row a r8" /></div>
        </div>

        <div className="mig-col mig-dst">
          <div className="mig-head"><i className="dot teal" />New database · PostgreSQL</div>
          <ul className="checks">
            {CHECKS.map((c) => (
              <li key={c.k} className={`a ${c.k}`}><span>{c.t}</span><b><em className="w">checking…</em><em className="v">{c.v}</em></b><i>✓</i></li>
            ))}
          </ul>
          <p className="mig-schema"><span>Clean schema · keys · history</span>{TABLES.map((t) => <code key={t}>{t}</code>)}</p>
          <p className="mig-foot live a sw"><span>Switched over</span> · reports and AI read from here</p>
        </div>
      </div>

      <ol className="mig-steps">
        {STEPS.map((s, i) => (
          <li key={s.t}><b>{String(i + 1).padStart(2, "0")} · {s.t}</b>{s.s}</li>
        ))}
      </ol>
    </section>
  )
}

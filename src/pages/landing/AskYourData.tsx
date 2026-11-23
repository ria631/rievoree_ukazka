import { useEffect, useRef } from "react"
import { watchInView } from "./viewport"
import "./ask.css"

/**
 * "Rather ask than click?" — the AI a team already uses, working on their
 * database through an MCP server.
 *
 * Left: the chat as the team sees it — a question is typed, the AI calls its
 * tools and hands back an Excel file that fills in row by row; then a booking
 * is proposed, double-checked and approved. Right: what happens behind it —
 * the MCP server's tools and the database tables light up as they're used.
 *
 * Shown as an animation, not a live demo, on purpose: an MCP opens a real
 * database to an AI, so each one is built for one company. One 16-second CSS
 * timeline (transform and opacity only, keyframes in ask.css), running only
 * while the section is on screen; reduced motion shows the finished chat.
 */

/** What teams typically use it for — generic, no client details. */
const USES = ["Excel and PDF reports on request", "Questions about the numbers", "Bookings drafted for approval", "Approvals by chat"]

const Q1 = "Make an Excel: Danube's September P&L + unpaid invoices"
const Q2 = "Book the new electricity invoice"

/** The sheet the AI hands back (figures from the demo's sample data). */
const SHEET: [string, string, string][] = [
  ["Revenue", "€188,400", ""],
  ["Operating costs", "−€47,200", ""],
  ["NOI", "€141,200", "pos"],
  ["Unpaid invoices (3)", "€12,900", "neg"],
]

/** NOI by month for the chart beside it (relative heights, September last). */
const BARS: [string, number][] = [["Apr", 0.72], ["May", 0.78], ["Jun", 0.7], ["Jul", 0.84], ["Aug", 0.8], ["Sep", 0.95]]

export function AskYourData() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    return watchInView(el, (v) => el.classList.toggle("on", v), { amount: 0.2 })
  }, [])

  return (
    <section className="sec" id="ai">
      <div className="sec-head">
        <p className="eyebrow">02 · AI on your database</p>
        <h2>Rather ask than click? Talk to your data.</h2>
        <p>
          An <b>MCP server</b> lets the AI your team already uses — Claude, ChatGPT, Copilot — work with your database:
          answer questions, build Excel reports, draft bookings. It sees only what that person may see and changes
          nothing without a person's approval.
        </p>
      </div>

      <div ref={ref} className="mcp" aria-label="Animation: in an AI chat someone asks for an Excel with September's P&L and unpaid invoices; the AI reads the company database through an MCP server and returns a spreadsheet. Then they ask it to book an invoice; the booking is proposed, checked by a second model, approved by an accountant and written.">
        <p className="mcp-lbl l1">What your team sees</p>
        <p className="mcp-lbl l2">What happens behind it</p>

        {/* the chat, as in any AI assistant */}
        <div className="chat">
          <div className="chat-top">
            <span className="win" aria-hidden="true"><i /><i /><i /></span>
            <span className="ttl">AI assistant</span>
            <span className="conn"><i />company database · MCP</span>
          </div>

          <div className="msgs">
            <p className="u a u1">{Q1}</p>

            <div className="calls">
              <p className="think a th" aria-hidden="true"><i /><i /><i /></p>
              <span className="call a c1"><i className="sp a" /><b className="ok a">✓</b>get_schema</span>
              <span className="call a c2"><i className="sp a" /><b className="ok a">✓</b>read_rows · monthly report</span>
              <span className="call a c3"><i className="sp a" /><b className="ok a">✓</b>read_rows · invoices</span>
            </div>

            <div className="ai a a1">
              <span className="av" aria-hidden="true">✦</span>
              <p>Here's September for <b>Danube Office Park</b> — two sheets and a chart, ready to open:</p>
            </div>

            <div className="files">
            <div className="xl a x0">
              <div className="xl-head">
                <span className="xl-ico" aria-hidden="true">X</span>
                <span className="xl-name"><b>Danube_September.xlsx</b><span>2 sheets · 14 KB</span></span>
                <span className="xl-btn a xb">Open in Excel</span>
              </div>
              <div className="xl-grid">
                <span className="xl-row hdr"><span className="hd" /><span className="hd">A</span><span className="hd">B</span></span>
                {SHEET.map(([k, v, tone], i) => (
                  <span key={k} className={`xl-row a xr${i + 1}`}>
                    <span className="hd">{i + 1}</span><span>{k}</span><span className={`num ${tone}`}>{v}</span>
                  </span>
                ))}
              </div>
              <div className="xl-tabs"><span className="on">P&amp;L</span><span>Unpaid invoices</span></div>
            </div>
            <div className="chart a g0">
              <p className="chart-h"><b>NOI by month</b><span>chart in the file</span></p>
              <div className="cbars">
                {BARS.map(([m, h], i) => (
                  <span key={m} className="cbar"><i className={`a g${i + 1}`} style={{ ["--h" as string]: h }} /><em>{m}</em></span>
                ))}
              </div>
            </div>
            </div>

            <p className="u a u2">{Q2}</p>

            <div className="calls">
              <span className="call a c4"><i className="sp a" /><b className="ok a">✓</b>propose_change</span>
              <span className="call a c5"><i className="sp a" /><b className="ok a">✓</b>review_change · second model</span>
            </div>

            <div className="appr a ap">
              <span className="st w a">⏳ Booking proposed — waiting for your accountant</span>
              <span className="st k a">✓ Approved by your accountant · booked as #2841</span>
            </div>
          </div>

          <div className="inp" aria-hidden="true">
            <span className="ph a">Ask anything…</span>
            <span className="ty a ty1">{Q1}<i className="cv a cv1" /></span>
            <span className="ty a ty2">{Q2}<i className="cv a cv2" /></span>
            <span className="send a">↑</span>
          </div>
        </div>

        <div className="wire h" aria-hidden="true"><span className="pk a p1" /><span className="pk a p2" /><span className="pk a p3" /><span className="pk back a p4" /><span className="pk a p5" /><span className="pk back a p6" /></div>

        {/* behind it: the MCP server and the database */}
        <div className="side">
          <div className="card srv">
            <div className="card-head"><i className="dot lime" />MCP server · your company</div>
            <ul className="tools">
              <li className="a k1"><code>get_schema</code><span>what's in the database</span></li>
              <li className="a k2"><code>read_rows</code><span>only rows this person may see</span></li>
              <li className="a k3"><code>propose_change</code><span>a draft, never a direct write</span></li>
              <li className="a k4"><code>review_change</code><span>a second model checks it</span></li>
            </ul>
          </div>
          <div className="wire v" aria-hidden="true"><span className="pk a v1" /><span className="pk a v2" /><span className="pk back a v3" /><span className="pk a v4" /></div>
          <div className="card db">
            <div className="card-head"><i className="dot teal" />Your database</div>
            <ul className="tbls">
              <li className="a d1">report_account_monthly<span>revenue · costs · NOI</span></li>
              <li className="a d2">invoices<span>open items · ageing</span></li>
              <li className="a d3">journal_entries<span className="pend a">+ 1 proposed</span><span className="done a">+ 1 booked</span></li>
            </ul>
            <p className="lock">Row-level security · audit log</p>
          </div>
        </div>
      </div>

      <ul className="mcp-points">
        <li><b>Read-only by default.</b> The AI asks; the database answers within that person's permissions.</li>
        <li><b>Writes are proposals.</b> Bookings and changes wait for a person to approve them.</li>
        <li><b>On the record.</b> Every question and every change is logged — who, when, what.</li>
      </ul>
      <p className="mcp-uses">
        <b>Typical uses</b>
        {USES.map((u) => <span key={u}>{u}</span>)}
      </p>
      <p className="fine">Each MCP is built for one company, on its own data and permissions — so here it's shown as an animation.</p>
    </section>
  )
}

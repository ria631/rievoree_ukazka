import { useEffect, useRef } from "react"
import { watchInView } from "./viewport"
import "./ask.css"

/**
 * "Rather ask than click?" — the other way to work with the same data: the AI
 * a team already uses talks to their database through an MCP server.
 *
 * Shown as an animation, not a live demo, on purpose: an MCP opens a real
 * database to an AI, so each one is built per client, on their data, their
 * permissions and their assistant. One 14-second CSS timeline (transform and
 * opacity only), running only while the section is on screen; reduced motion
 * shows the finished conversation.
 */

/** What teams typically use it for — generic, no client details. */
const USES = ["Questions about the numbers", "Bookings drafted for approval", "Approvals by chat", "Routine checks on a schedule"]

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
          An <b>MCP server</b> lets the AI your team already uses — Claude, ChatGPT, Copilot — work with your database.
          It sees only what that person may see and changes nothing without a person's approval.
        </p>
      </div>

      <div ref={ref} className="mcp" aria-label="Animation: a question in an AI chat goes through an MCP server to the company's database and back with an answer; a booking is proposed, checked by a second model, approved by an accountant, then written.">
        <div className="mcp-col mcp-chat">
          <div className="mcp-head"><i className="dot" />Your AI assistant</div>
          <div className="mcp-msgs">
            <p className="b me a q1">What did Danube Office Park earn in September — and what's still unpaid?</p>
            <p className="b ai think a t1"><i /><i /><i /></p>
            <div className="b ai a r1">
              <p>Revenue <b>€188,400</b>, NOI <b>€141,200</b>.</p>
              <p><b>3 invoices</b> unpaid, €12,900 — the oldest 41 days.</p>
            </div>
            <p className="b me a q2">Book the new electricity invoice.</p>
            <div className="b ai a r2"><p>Proposed and double-checked — waiting for your accountant.</p></div>
            <div className="b ai a r3"><p>Approved and booked. Logged as change <b>#2841</b>.</p></div>
          </div>
        </div>

        <div className="mcp-wire" aria-hidden="true"><span className="pk a p1" /><span className="pk back a p2" /><span className="pk a p3" /></div>

        <div className="mcp-col mcp-srv">
          <div className="mcp-head"><i className="dot lime" />MCP server · your company</div>
          <ul className="tools">
            <li className="a k1"><code>get_schema</code><span>what's in the database</span></li>
            <li className="a k2"><code>read_rows</code><span>only rows this person may see</span></li>
            <li className="a k3"><code>propose_change</code><span>a draft, never a direct write</span></li>
            <li className="a k4"><code>review_change</code><span>a second model checks it</span></li>
          </ul>
          <div className="appr a ap">
            <span className="who">Accountant</span>
            <span className="st wait">Waiting for approval…</span>
            <span className="st ok">Approved ✓</span>
          </div>
        </div>

        <div className="mcp-wire" aria-hidden="true"><span className="pk a p1b" /><span className="pk back a p2b" /><span className="pk a p3b" /></div>

        <div className="mcp-col mcp-db">
          <div className="mcp-head"><i className="dot teal" />Your database</div>
          <ul className="tbls">
            <li className="a d1">report_account_monthly<span>revenue · costs · NOI</span></li>
            <li className="a d2">invoices<span>open items · ageing</span></li>
            <li className="a d3">journal_entries<span className="pend">+ 1 proposed</span><span className="done">+ 1 booked</span></li>
            <li>documents · users · …</li>
          </ul>
          <p className="lock">Row-level security · audit log</p>
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

import "./services.css"

/**
 * What I do, right under the hero: three offers, each with one sentence and a
 * link to the part of the page that shows it. Replaces both a page map and a
 * longer services list — one place that answers "what can I get here?".
 */
const OFFERS = [
  {
    n: "01", href: "#how", tag: "Live demo on this page",
    title: "Reporting",
    body: "Numbers from many companies in one place — P&L, cash, receivables, forecasts. Each person sees only their companies.",
    see: "See how it works",
  },
  {
    n: "02", href: "#ai", tag: "Shown as an animation",
    title: "AI on your database",
    body: "Your team asks Claude, ChatGPT or Copilot about the numbers in plain language — safely, through an MCP server.",
    see: "See it in action",
  },
  {
    n: "03", href: "#migrate", tag: "Shown as an animation",
    title: "Database migration",
    body: "Off spreadsheets or an old system into PostgreSQL — checked row for row, switched over only when it all matches.",
    see: "See it in action",
  },
]

export function Offer() {
  return (
    <section className="sec offer-sec" id="offer">
      <div className="sec-head">
        <p className="eyebrow">What I do</p>
        <h2>Three ways I can help</h2>
        <p>Pick one or combine them — all three stand on the same thing: a clean, secure database.</p>
      </div>
      <ol className="offers">
        {OFFERS.map((o) => (
          <li key={o.n}>
            <a className="offer" href={o.href}>
              <span className="n">{o.n}</span>
              <span className="tag">{o.tag}</span>
              <h3>{o.title}</h3>
              <p>{o.body}</p>
              <span className="see">{o.see} ↓</span>
            </a>
          </li>
        ))}
      </ol>
      <p className="also"><b>Part of every project:</b> data imports and integrations · access control · automatic checks and approvals</p>
    </section>
  )
}

import "./services.css"

/**
 * What I build — the page shows one of these working (X-Ray); the others are
 * what the same skills do for a client. Each card says where it can be seen:
 * live on this page, in client work, or on request.
 */
type Where = "live" | "client" | "request"
const WHERE: Record<Where, string> = { live: "Live on this page", client: "From client work", request: "On request" }

const OFFERS: { title: string; body: string; also?: string; where: Where; href?: string }[] = [
  {
    title: "Reporting your team can trust",
    body: "P&L, cash, receivables, budgets and forecasts for a group of companies — each person sees only their companies, and every number traces back to its source.",
    also: "Shown here: X-Ray, seven reports on sample data.",
    where: "live", href: "#how",
  },
  {
    title: "AI access to your database (MCP)",
    body: "Your team's AI — Claude, ChatGPT, Copilot — answers questions about your data, drafts bookings and prepares approvals, within each person's permissions.",
    also: "Instead of dashboards, or next to them.",
    where: "client", href: "#ai",
  },
  {
    title: "Database migration",
    body: "From spreadsheets, Access, an old SQL server or an accounting system's exports to PostgreSQL / Supabase — mapped, checked row for row against the source, and switched over without downtime.",
    also: "Shown above as an animation; runs on your own data.",
    where: "request", href: "#migrate",
  },
  {
    title: "Data pipelines & integrations",
    body: "Spreadsheets, CSV and Excel uploads, shared Google Sheets and signed webhooks flow in on their own, checked on the way.",
    also: "Also: bank statements, accounting systems and ERP exports.",
    where: "live", href: "#how",
  },
  {
    title: "Security & access control",
    body: "Row-level security in the database, roles and invitations, a locked-down public demo, and tests that prove one company never sees another's data.",
    where: "live", href: "#rls",
  },
  {
    title: "Checks & approvals",
    body: "Every incoming row is validated and compared with its history; anything unusual waits for a person before it reaches a report.",
    where: "live", href: "#how",
  },
]

export function Services() {
  return (
    <section className="sec" id="build">
      <div className="sec-head">
        <p className="eyebrow">What I build</p>
        <h2>This page shows one system. Here's the rest.</h2>
        <p>
          X-Ray is one way to use a company's data. The same foundation — a clean, secured database — can feed
          reports, an AI assistant, or a new system you're moving to. Pick what you need; they combine.
        </p>
      </div>
      <ul className="offers">
        {OFFERS.map((o) => (
          <li key={o.title} className={`offer ${o.where}`}>
            <span className="where">{WHERE[o.where]}</span>
            <h3>{o.title}</h3>
            <p>{o.body}</p>
            {o.also && <p className="also">{o.also}</p>}
            {o.href && <a className="see" href={o.href}>See it ↑</a>}
          </li>
        ))}
      </ul>
    </section>
  )
}

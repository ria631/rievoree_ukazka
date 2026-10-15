import type { ReactNode } from "react"
import type { XrayTab } from "@/components/xray/XrayPanelContext"
import { OpenPageCode, TourDataGenerator, TourCloseSlot } from "./slots"

/**
 * The guided tour's script. Each step points at ONE real element (a chart, a
 * table, a control — by its data-tour anchor), says what it shows and how to
 * read it, what it means for the money, and how the data behind it is pulled
 * and protected. Steps can also ACT: an animated cursor moves onto a real
 * control and clicks it (or drives the page's own filter), so the visitor
 * watches the app respond instead of reading about it.
 */
export type Chapter =
  | "Welcome" | "Dashboard" | "P&L" | "Rent roll" | "AR / AP" | "Budget flow" | "Forecast" | "Journal"
  | "X-ray" | "Upload data" | "Connectors" | "Your turn"

export const CHAPTERS: Chapter[] = [
  "Welcome", "Dashboard", "P&L", "Rent roll", "AR / AP", "Budget flow", "Forecast", "Journal",
  "X-ray", "Upload data", "Connectors", "Your turn",
]

export interface TourAction {
  /** data-tour id the cursor moves onto. */
  to: string
  /** What the agent says it's doing, shown live in the card. */
  say: string
  /** Drive the page's own filter (Radix dropdowns) instead of a DOM click. */
  control?: [key: string, value: string]
  /** Skip the click when this is already true (e.g. a <details> already open). */
  skipIf?: (el: HTMLElement) => boolean
  /** Only for a shared demo identity (never re-sign a real user). */
  demoOnly?: boolean
  /** Move the spotlight to this anchor for the action (e.g. a menu it opened). */
  spot?: string
  /** After the click, wait until the session has become this demo identity. */
  awaitIdentity?: "manager"
  /** Linger after the action (ms). */
  wait?: number
}

export interface Step {
  id: string
  chapter: Chapter
  route?: string
  /** Needs the Manager demo identity (Upload data, Connectors). */
  as?: "manager"
  /** Open the X-ray on this tab ("keep" = leave it as is); omitted = closed. */
  xray?: XrayTab | "keep"
  /** data-tour id to spotlight. */
  target?: string
  /** The target may legitimately be missing (e.g. no batch waiting for
   *  review) — then the step is skipped instead of shown without its subject. */
  optional?: boolean
  title: string
  body: string
  /** What it means for the money. */
  money?: string
  /** Under the hood: how the data is pulled / protected. */
  tech?: string
  /** Show live figures read from data-live attributes — in the target (true)
   *  or in another anchor (its data-tour id). */
  live?: boolean | string
  actions?: TourAction[]
  /** CODE_MAP key → "Show the code of this". */
  code?: string
  render?: () => ReactNode
  /** Ask the visitor a yes/no question (stored in tour_feedback). */
  ask?: string
}

const isOpen = (el: HTMLElement) => !!(el.parentElement as HTMLDetailsElement | null)?.open

export const STEPS: Step[] = [
  // ───────────────────────── Welcome
  {
    id: "welcome", chapter: "Welcome", route: "/dashboard",
    title: "The books of a small property group",
    body: "Four buildings — an office park, a retail park, a block of flats and a logistics hub — each owned by its own company. This engine turns their accounting into the reports a CFO and an asset manager work with. I'll point at every chart and table, click things so you see them react, and say what each shows, what it means for the money, and how its data is pulled and protected.",
    money: "Built end-to-end by Mariia Chernenko: React front end, Postgres with row-level security, an ingest pipeline with anomaly detection, and live observability (the X-ray).",
    tech: "Next / Back to move, ☰ to jump between chapters, or Auto to just watch — it pauses while your mouse is on this card. Any element can open its real source code.",
  },

  // ───────────────────────── Dashboard
  {
    id: "dash-top", chapter: "Dashboard", route: "/dashboard", target: "dash-top", live: "dash-kpis", code: "dash-kpis",
    title: "The monthly pulse of the portfolio",
    body: "Last month's revenue (rent, service charges, parking), NOI — what the buildings earn after their running costs — occupancy, and cash in the bank. The arrow compares with the month before, the line shows the last 12 months. Watch: I'll narrow it to one building and the whole page recalculates.",
    money: "NOI is the number a building is valued and financed on: at a 6% yield every €1 of yearly NOI is worth about €17 of property value.",
    tech: "One query to report_account_monthly, read in 1,000-row pages. Row-level security filters it to the companies YOUR login may see before a single row leaves Postgres; the tiles are computed from those rows in the browser.",
    actions: [
      { to: "dash-filter", say: "Showing one building only…", control: ["entity", "@first"], wait: 2200 },
      { to: "dash-filter", say: "…and back to the whole portfolio", control: ["entity", "all"], wait: 1200 },
    ],
  },
  {
    id: "dash-ratios", chapter: "Dashboard", route: "/dashboard", target: "dash-ratios", live: true, code: "dash-ratios",
    title: "Would the bank be comfortable?",
    body: "NOI margin — how much of each euro of revenue the buildings keep. WALT — how many years of rent are contractually secured. DSCR — NOI ÷ what the loans cost per year (interest + repayments). LTV — the loans as a share of what the buildings are worth. Green = inside the comfortable range.",
    money: "Loan agreements set limits (here DSCR ≥ 1.20×, LTV ≤ 60%). Break one and the bank can demand repayment — these four are watched every month.",
    tech: "Same rows, no second query: DSCR uses the interest and loan-repayment postings, LTV the loan balance against the latest valuation of each property.",
  },
  {
    id: "dash-noi", chapter: "Dashboard", route: "/dashboard", target: "dash-noi", code: "dash-noi",
    title: "Income, running costs — and what's left",
    body: "Green is revenue, violet the cost of running the buildings, amber the gap between them: NOI. Costs rise every winter (heating); revenue steps up when rents are indexed and down when a tenant leaves. Hover any month for the exact figures.",
    money: "A flat revenue line with a creeping cost line is a margin squeeze you'd see here first.",
    tech: "classify() sorts every account into revenue, operating cost, depreciation or interest — by the chart's codes first, then by name, so a custom chart of accounts still lands in the right line.",
  },
  {
    id: "dash-buildings", chapter: "Dashboard", route: "/dashboard", target: "dash-buildings", code: "dash-buildings",
    title: "Which building earns the most",
    body: "Each building's NOI over the last 12 months. The logistics hub leads: big halls, long leases, and tenants who pay most of their own running costs. The flats earn least — small units, more turnover, more management.",
    money: "Where capital works hardest — and which building would hurt most if it lost a tenant.",
  },
  {
    id: "dash-costs", chapter: "Dashboard", route: "/dashboard", target: "dash-costs", code: "dash-costs",
    title: "Where the running costs go",
    body: "Every operating cost as a box — the bigger the box, the bigger the spend over the last 12 months. Hover a box for its share.",
    money: "Utilities and cleaning/security are mostly passed on to tenants as service charges — the boxes that really hit NOI are repairs, management and property tax.",
  },

  // ───────────────────────── P&L
  {
    id: "pl-filters", chapter: "P&L", route: "/pl", target: "pl-filters", code: "pl-filters",
    title: "Did we make money? Pick the building and period",
    body: "The income statement for any building and any period: year to date, the last 12 months, last year, or one month. I'll switch to the latest month and back — every number on the page follows.",
    money: "The monthly close ends here: profit, and where it came from.",
    actions: [
      { to: "pl-filters", say: "Switching to the latest month…", control: ["period", "@latest"], wait: 2000 },
      { to: "pl-filters", say: "…and back to year to date", control: ["period", "ytd"], wait: 900 },
    ],
  },
  {
    id: "pl-bridge", chapter: "P&L", route: "/pl", target: "pl-bridge", code: "pl-bridge",
    title: "From revenue to profit, step by step",
    body: "Start with revenue, subtract the costs of running the buildings — that's NOI. Then depreciation (the buildings wearing out, a cost that moves no cash) and interest (the bank's share) — what's left is profit before tax.",
    money: "Shows exactly which layer eats the profit: here interest takes more than a third of NOI.",
  },
  {
    id: "pl-variance", chapter: "P&L", route: "/pl", target: "pl-variance", code: "pl-variance",
    title: "Where we're off budget — and why",
    body: "Every line against its budget, biggest first. Right and green = better than planned, left and red = worse. Rental income is the big miss: the budget assumed the empty units would be let by April — they weren't. Letting fees are 'better' for the same reason.",
    money: "Variance analysis turns 'profit is down' into a list of reasons someone can act on.",
    tech: "lineVariances() signs each difference so + always means favourable: more income is good, more cost is bad.",
  },
  {
    id: "pl-table", chapter: "P&L", route: "/pl", target: "pl-table", code: "pl-table",
    title: "The statement itself",
    body: "Actual, budget, variance and a 12-month trend for every line, with subtotals — total revenue, NOI, operating profit, profit before tax. Sections fold; I'll fold Revenue and open it again.",
    tech: "The budget is its own table, built per month from the rent roll: leases signed before the year at their contract rent, empty space assumed let at market rent.",
    actions: [
      { to: "pl-section", say: "Folding the revenue section…", wait: 1100 },
      { to: "pl-section", say: "…and opening it again", wait: 700 },
    ],
  },

  // ───────────────────────── Rent roll
  {
    id: "roll-kpis", chapter: "Rent roll", route: "/rent-roll", target: "roll-kpis", live: true, code: "roll-kpis",
    title: "The contracts behind the income",
    body: "Occupancy (let space ÷ lettable space), passing rent (what tenants pay today, per year), WALT, reversion — market rent (ERV) against what's being paid — and rent arrears.",
    money: "Positive reversion means rents are below market: upside at the next renewal. Negative means renewals may bring rents down.",
    tech: "Three tables — properties, units, leases — each protected by the same per-company row-level security; the rent roll is assembled in the browser as at the last closed month.",
  },
  {
    id: "roll-expiry", chapter: "Rent roll", route: "/rent-roll", target: "roll-expiry", code: "roll-expiry",
    title: "When does today's income run out?",
    body: "Yearly rent grouped by how long its lease has left. The amber bar expires within 12 months — the leases to renegotiate or re-let now.",
    money: "A tall bar soon is re-letting risk; banks look at this before they refinance.",
  },
  {
    id: "roll-tenants", chapter: "Rent roll", route: "/rent-roll", target: "roll-tenants", code: "roll-tenants",
    title: "How much depends on a few tenants",
    body: "Each tenant's share of the total rent. The biggest — a freight company in the logistics hub — pays about an eighth of everything.",
    money: "If one tenant leaves, how much income goes with it? Concentration is a risk lenders and buyers price in.",
  },
  {
    id: "roll-filters", chapter: "Rent roll", route: "/rent-roll", target: "roll-filters", live: "roll-table",
    title: "Find the space that needs attention",
    body: "Filter the units: only the vacant ones, or the leases expiring within a year. I'll click through both.",
    actions: [
      { to: "roll-status-vacant", say: "Showing the vacant units…", wait: 1800 },
      { to: "roll-status-expiring", say: "…the leases expiring within 12 months…", wait: 1800 },
      { to: "roll-status-all", say: "…and every unit again", wait: 700 },
    ],
  },
  {
    id: "roll-table", chapter: "Rent roll", route: "/rent-roll", target: "roll-table", code: "roll-table",
    title: "Every unit on one line",
    body: "Tenant, lease dates (amber = expiring within a year), years left, rent per month and per m², market rent per m², reversion and arrears. The 42 flats are folded — click their row to open them.",
    money: "Rent below market with a lease ending soon is the cheapest income increase there is.",
  },

  // ───────────────────────── AR / AP
  {
    id: "rp-kpis", chapter: "AR / AP", route: "/receivables", target: "rp-kpis", live: true, code: "rp-kpis",
    title: "Who owes us — and how late",
    body: "Rent is billed in advance around the 24th and due on the 5th, so at every month end next month's rent is already billed but not yet due. Overdue is what's past its due date; DSO is how many days of billing are sitting unpaid; on time is how much of last quarter's rent arrived by the due date.",
    money: "Overdue rent is income you've earned but can't spend.",
    tech: "Open invoices come from their own table under the same row-level security; buildAging-style maths runs in the browser.",
  },
  {
    id: "rp-tieout", chapter: "AR / AP", route: "/receivables", target: "rp-tieout", live: true, code: "rp-tieout",
    title: "The check an auditor does first",
    body: "The open invoices (the sub-ledger) must add up to exactly the balance of the receivables account in the general ledger. Here they do, to the cent.",
    money: "If they ever differ, something was posted outside invoicing — the first thing to investigate.",
    tech: "Two independent sources: the invoices table and the journal (account 1100) — compared live, never copied from one another.",
  },
  {
    id: "rp-aging", chapter: "AR / AP", route: "/receivables", target: "rp-aging", code: "rp-aging",
    title: "How late, by building",
    body: "Each building's open balance split by days past due — green not yet due, then yellow, orange, red, dark red for 90+. The retail park's tall tail is a fashion shop that stopped paying four months ago.",
    money: "Money 90+ days late is often never collected — it's where a bad-debt provision starts.",
  },
  {
    id: "rp-settlement", chapter: "AR / AP", route: "/receivables", target: "rp-settlement", code: "rp-settlement",
    title: "Rent billed — what happened to it",
    body: "Each month's invoices: paid on time, paid late, or still open. The last bar is mostly red only because next month's rent was billed days ago and isn't due yet.",
    money: "A growing amber share is the early sign of tenants under strain.",
    tech: "A Postgres view (report_invoice_monthly) sums it per month, so the browser gets 24 rows instead of 1,600 invoices.",
  },
  {
    id: "rp-switch", chapter: "AR / AP", route: "/receivables", target: "rp-filters", live: "rp-kpis",
    title: "The other direction: what we owe",
    body: "Payables are the supplier bills we still have to pay — mostly not yet due, plus one repair invoice held back as disputed. I'll switch the page over and back.",
    money: "'Due in the next 14 days' is the cash to keep ready.",
    actions: [
      { to: "rp-kind-ap", say: "Switching to payables…", wait: 2400 },
      { to: "rp-kind-ar", say: "…back to receivables", wait: 800 },
    ],
  },
  {
    id: "rp-parties", chapter: "AR / AP", route: "/receivables", target: "rp-parties", code: "rp-parties",
    title: "Who to call first",
    body: "Tenants with an open balance, worst first, with how late their oldest invoice is. Next to it: every open invoice with its document number — the same number you'll find in the journal.",
  },

  // ───────────────────────── Budget flow
  {
    id: "cf-kpis", chapter: "Budget flow", route: "/budget-flow", target: "cf-kpis", live: true, code: "cf-kpis",
    title: "The cash plan for the year",
    body: "Cash today, the year's net cash flow against plan, the year-end outlook (actuals so far plus the plan for the rest), and the lowest balance the year reaches against a minimum buffer.",
    money: "Profit isn't cash: building works, loan repayments and dividends never touch the P&L, but they empty the bank account.",
  },
  {
    id: "cf-balance", chapter: "Budget flow", route: "/budget-flow", target: "cf-balance", code: "cf-balance",
    title: "Cash through the year",
    body: "Solid = what the bank statements say; dashed = the plan; dotted = the outlook for the months still open. The drop in June is the dividend and a loan repayment landing together. The red line is the buffer: three months of debt service.",
    money: "If the outlook ever dips under the buffer, it's time to delay a project or a dividend — months before it hurts.",
  },
  {
    id: "cf-bridge", chapter: "Budget flow", route: "/budget-flow", target: "cf-bridge", code: "cf-bridge",
    title: "Where the cash went",
    body: "From the balance on 1 January to cash today: rent received, running costs and tax paid, building works, the bank's interest and repayments, and the dividend.",
  },
  {
    id: "cf-table", chapter: "Budget flow", route: "/budget-flow", target: "cf-table", code: "cf-table",
    title: "The cash budget itself",
    body: "Months across, cash categories down, in € thousands. Closed months show actuals, open months the plan in italics. Switch to Variance to see where each month beat or missed the plan — I'll do it.",
    money: "Capex a month earlier than planned is timing, not overspend — this view tells the two apart.",
    tech: "Actuals are the bank lines of the journal, each tagged with a cash-flow category and summed by a Postgres view; the plan is its own table.",
    actions: [
      { to: "cf-view-variance", say: "Switching to variance…", wait: 2200 },
      { to: "cf-view-values", say: "…back to actual / plan", wait: 700 },
    ],
  },

  // ───────────────────────── Forecast
  {
    id: "fc-controls", chapter: "Forecast", route: "/forecast", target: "fc-controls", live: "fc-kpis", code: "fc-controls",
    title: "The next 12 months, lease by lease",
    body: "Built bottom-up from the rent roll: every lease runs to its end date with its indexation; when it ends, part renews and the rest re-lets after some empty months. Three scenarios set those assumptions — watch the numbers as I switch them.",
    money: "Downside to upside is the range the board should plan for — not a single number.",
    actions: [
      { to: "fc-scenario-downside", say: "Downside: fewer renewals, longer voids…", wait: 2200 },
      { to: "fc-scenario-upside", say: "…upside…", wait: 2000 },
      { to: "fc-scenario-base", say: "…and back to base", wait: 900 },
    ],
  },
  {
    id: "fc-drivers", chapter: "Forecast", route: "/forecast", target: "fc-drivers", code: "fc-drivers",
    title: "Five drivers you can move yourself",
    body: "Lease renewals, months of void before re-letting, indexation, cost inflation and bad debt. Drag any slider — every figure below recalculates instantly.",
    tech: "runForecast() runs in the browser over data it already has (rent roll, history, budget): no server call per change, so it keeps up with the slider.",
  },
  {
    id: "fc-chart", chapter: "Forecast", route: "/forecast", target: "fc-chart", code: "fc-chart",
    title: "NOI: actual → forecast, against budget",
    body: "Left of the 'last close' line is what happened, right of it what's expected; the slate dashes are the budget. The dip after the line is two big leases ending — weighted by the chance they renew.",
    money: "The gap to budget, months in advance: time to act instead of explain.",
  },
  {
    id: "fc-outlook", chapter: "Forecast", route: "/forecast", target: "fc-outlook", code: "fc-outlook",
    title: "The full-year outlook",
    body: "Actual to date + forecast for the rest of the year = the outlook, against the full-year budget. This 'latest estimate' is what a CFO reports to the board every month.",
  },
  {
    id: "fc-events", chapter: "Forecast", route: "/forecast", target: "fc-events", code: "fc-events",
    title: "What drives it",
    body: "The leases ending within the horizon, biggest rent first, and the empty units waiting to be let — with their market rent.",
    money: "These few lines explain most of the forecast: the asset manager's to-do list.",
  },

  // ───────────────────────── Journal
  {
    id: "jr-kpis", chapter: "Journal", route: "/journal", target: "jr-kpis", live: true, code: "jr-kpis",
    title: "The book everything comes from",
    body: "Every report you've seen is computed from these postings: thousands of documents, two to four lines each, every euro posted on both sides.",
    tech: "A summary view counts documents per month and type, and flags any that don't balance — so the page never has to download the journal itself.",
  },
  {
    id: "jr-proof", chapter: "Journal", route: "/journal", target: "jr-proof", live: true, code: "jr-proof",
    title: "Debits = credits",
    body: "Double entry: every euro leaves one account and lands in another, so total debits always equal total credits — for every document, every month, the whole book.",
    money: "If this ever showed a difference, no report built on top could be trusted.",
    tech: "A database constraint forces every line to have exactly one side; the balance per document is checked in SQL.",
  },
  {
    id: "jr-types", chapter: "Journal", route: "/journal", target: "jr-types", live: "jr-kpis", code: "jr-types",
    title: "Every number has a source document",
    body: "SI — rent invoices to tenants. PI — supplier bills. BS — bank statement items. GJ — journal vouchers: depreciation, insurance and tax spread month by month, rent moved from 'billed in advance' to income. OB — opening balances. I'll show only the bank items.",
    actions: [
      { to: "jr-type-BS", say: "Only bank statement items…", wait: 1900 },
      { to: "jr-type-all", say: "…all documents again", wait: 700 },
    ],
  },
  {
    id: "jr-volume", chapter: "Journal", route: "/journal", target: "jr-volume", code: "jr-volume",
    title: "Posting volume, month by month",
    body: "How many documents each month brought, by type. A steady shape is a healthy close; a sudden spike or gap is worth a question.",
  },
  {
    id: "jr-tb", chapter: "Journal", route: "/journal", target: "jr-tb", code: "jr-tb",
    title: "The trial balance",
    body: "Every account's total debits and credits — the accountant's starting point for any statement. The two totals at the bottom are equal.",
  },
  {
    id: "jr-docs", chapter: "Journal", route: "/journal", target: "jr-docs", code: "jr-docs",
    title: "Open any document",
    body: "Documents, newest first: date, number, what it was, its lines and whether it balances. I'll open one — its lines show the accounts, and bank lines carry the cash-flow tag the cash budget uses.",
    tech: "Server-side paging: Postgres filters, sorts and slices; the browser holds 25 documents at a time, never all 4,700.",
    actions: [{ to: "jr-doc-row", say: "Opening the newest document…", wait: 2000 }],
  },

  // ───────────────────────── X-ray
  {
    id: "xray-open", chapter: "X-ray", route: "/journal", target: "xray-button",
    title: "The X-ray: the backend, made visible",
    body: "Most demos hide the engine. This one has an X-ray: a panel that shows, live, what the app is doing behind each screen. I'll open it.",
    actions: [{ to: "xray-button", say: "Opening the X-ray…", wait: 900 }],
  },
  {
    id: "xray-calls", chapter: "X-ray", route: "/journal", xray: "calls", target: "xray-calls", code: "xray-calls",
    title: "Every request, logged live",
    body: "Each line is one real call this page made to the backend — what it asked for, the status, how long it took. The report table needed several 1,000-row pages; the journal page asked for exactly 25 documents. I'll open one call.",
    money: "Nothing is faked or pre-baked: the numbers you saw were fetched exactly like this.",
    tech: "One instrumented fetch wraps the Supabase client, so every request is captured at a single seam — REST, RPC, auth, storage and edge functions alike.",
    actions: [{ to: "xray-call-row", say: "Expanding a call…", wait: 900 }],
  },
  {
    id: "xray-rls", chapter: "X-ray", route: "/journal", xray: "rls", target: "xray-rls", code: "xray-rls",
    title: "How the data is protected",
    body: "The SAME query, run as three different users. A Viewer sees one building, a Manager two, an Admin all four — because Postgres decides, not the screen. I'll run each; it happens in an isolated session, so your own view doesn't change.",
    money: "In a multi-company product, one client seeing another's books is a company-ending bug. Here it's impossible by design.",
    tech: "Row-level security on every table checks auth.uid() against the companies a user belongs to; seeing everything needs an explicit platform-staff flag.",
    actions: [
      { to: "rls-run-viewer", say: "Running it as a Viewer…", wait: 2200 },
      { to: "rls-run-manager", say: "…as a Manager…", wait: 2200 },
      { to: "rls-run-admin", say: "…and as an Admin", wait: 2200 },
    ],
  },
  {
    id: "xray-sql", chapter: "X-ray", route: "/journal", xray: "sql", target: "xray-sql", code: "xray-sql",
    title: "The actual SQL behind it",
    body: "The real policies and functions, straight from the database migrations: who may read which company, who may approve a batch. A 'seen' tag marks the ones this session actually hit; 'Open file' shows the whole migration.",
  },
  {
    id: "xray-code", chapter: "X-ray", route: "/journal", xray: "code", target: "xray-code",
    title: "Where every element lives in the code",
    body: "Every chart, table and control on this page — and the real files behind each: where it's drawn, the component, the maths or SQL. Click one and a full-screen editor opens on exactly those lines.",
    render: () => <OpenPageCode />,
  },
  {
    id: "xray-arch", chapter: "X-ray", route: "/journal", xray: "arch", target: "xray-arch",
    title: "Where it all runs",
    body: "Browser → auth → edge functions → database API → Postgres (security policies, triggers, pg_cron, pg_net) → storage → the ETL worker. Layers light up only when this session actually used them.",
  },

  // ───────────────────────── Upload data
  {
    id: "role", chapter: "Upload data", route: "/journal", target: "role-switch", code: "role-switch",
    title: "Switching you to a Manager",
    body: "A Viewer only reads reports. A Manager can also upload data, review it and approve it. In the demo you switch here — I'll click it for you.",
    money: "Who may put a number into the books is a control in itself (segregation of duties).",
    tech: "Both demo identities are locked read-only in the database: a trigger refuses their writes, whatever the screen shows.",
    actions: [
      { to: "role-switch", say: "Opening the role menu…", demoOnly: true, wait: 700 },
      { to: "role-manager", spot: "role-menu", say: "Choosing Manager…", demoOnly: true, awaitIdentity: "manager", wait: 1200 },
    ],
  },
  {
    id: "nav", chapter: "Upload data", as: "manager", route: "/dashboard", target: "main-nav",
    title: "New pages appeared",
    body: "As a Manager the menu now has Ingest (upload data) and Connectors (automatic import) — and the reports show the two buildings this Manager looks after. Let's open Ingest.",
    actions: [{ to: "nav-ingest", say: "Opening Ingest…", wait: 1200 }],
  },
  {
    id: "ingest-guide", chapter: "Upload data", as: "manager", route: "/ingest", target: "ingest-guide", code: "ingest-guide",
    title: "Step 1 — what file to upload",
    body: "A plain CSV export from any accounting system: account number, date, debit, credit, currency. Different column names are fine — you map them after choosing the file. There's a template to download.",
    actions: [{ to: "ingest-guide-toggle", say: "Opening the file guide…", skipIf: isOpen, wait: 900 }],
  },
  {
    id: "ingest-upload", chapter: "Upload data", as: "manager", route: "/ingest", target: "ingest-upload", code: "ingest-upload",
    title: "Step 2 — upload it",
    body: "Choose the company, the month and the file, then Upload. The file is read in your browser, sent to private storage and checked row by row. In this shared demo uploads are blocked — with a free account it runs for real. Here's a month of a building's books, with one planted anomaly:",
    tech: "An edge function issues a signed upload URL to private storage; the parsed rows go to a SECURITY DEFINER function that validates them and runs the anomaly screen.",
    render: () => <TourDataGenerator />,
  },
  {
    id: "ingest-batches", chapter: "Upload data", as: "manager", route: "/ingest", target: "batches-table", live: "ingest-batches", code: "ingest-batches",
    title: "Step 3 — where it shows up",
    body: "Every upload becomes a batch: Waiting → Processing → Needs review → Done. 'Needs review' means something was flagged. I'll open the facility-cost upload waiting for review.",
    actions: [{ to: "batch-review-row", say: "Opening the batch waiting for review…", wait: 1600 }],
  },
  {
    id: "batch-summary", chapter: "Upload data", as: "manager", route: "/ingest", target: "batch-summary", optional: true, live: true, code: "batch-detail",
    title: "Step 4 — review before anything reaches a report",
    body: "How many rows will load, how many are held as anomalies, how many have errors. Nothing reaches the books until a Manager presses Approve — and then only the clean rows.",
    money: "Catches the wrong number BEFORE it reaches the CFO — here a utilities bill at four times its usual size.",
    tech: "Approve is a database function: it locks the batch row, re-checks your role for that company, and fails closed. Demo accounts are refused by a trigger.",
  },
  {
    id: "batch-rows", chapter: "Upload data", as: "manager", route: "/ingest", target: "batch-rows", optional: true, code: "batch-detail",
    title: "…and exactly why a row is held",
    body: "Every row with its status. The held one says why in plain numbers — this month's utilities against the mean and spread of the last 12 — so a reviewer decides in seconds instead of hunting through a spreadsheet.",
    tech: "The screen is a z-score per account against its own trailing 12 months (flag above 3σ, needs 3+ months of history), computed in SQL during the transform.",
  },
  {
    id: "pipeline", chapter: "Upload data", as: "manager", route: "/ingest", xray: "pipeline", target: "xray-pipeline", code: "xray-pipeline",
    title: "Step 5 — after Approve, it runs by itself",
    body: "Approving writes the journal; a database trigger queues a refresh; pg_cron rebuilds the reporting tables every minute; pg_net notifies a reviewer. This timeline streams those events live.",
    money: "Upload → review → reports, with no one exporting or copy-pasting anything.",
  },

  // ───────────────────────── Connectors
  {
    id: "connectors-add", chapter: "Connectors", as: "manager", route: "/connectors", target: "connectors-add", code: "connectors-add",
    title: "Skip the manual upload — link a spreadsheet",
    body: "Pick the company and a type: Spreadsheet link (paste the link of a Google Sheet shared with 'anyone with the link', or any public CSV — Dropbox, OneDrive) or Webhook (your accounting system posts files to a signed URL).",
    money: "Month-end data arrives on its own, and goes through the same checks and review.",
    tech: "The database validates the link (public https host only) and turns an ordinary Sheets link into its CSV export.",
  },
  {
    id: "connectors-sync", chapter: "Connectors", as: "manager", route: "/connectors", target: "connectors-showcase", optional: true, code: "connectors-showcase",
    title: "Watch it read a real spreadsheet",
    body: "This one points at a shared cost sheet. Sync now asks the DATABASE to download the link, reads the CSV in SQL and reports what it found: rows, period, debits against credits, accounts it doesn't know. Here it's a preview — the demo is read-only; on your account it becomes a batch waiting for review.",
    money: "Whoever keeps the cost sheet keeps working in Sheets; the books pick it up every hour.",
    tech: "pg_net makes the HTTP request from Postgres; the answer is parsed in SQL and fed to the same ingest function as an upload. Content already imported (same SHA-256) is skipped.",
    actions: [{ to: "connectors-sync", say: "Sync now — the database fetches the sheet…", wait: 3200 }],
  },
  {
    id: "connectors-how", chapter: "Connectors", as: "manager", route: "/connectors", target: "connectors-how", code: "connectors-how",
    title: "Connect your own Google Sheet",
    body: "Share the sheet as 'anyone with the link', paste the link, done — pg_cron re-reads it every hour. The first row is the header (Account, Date, Debit, Credit — Slovak names work too). Systems that push instead use the webhook, verified with an HMAC signature compared in constant time.",
  },

  // ───────────────────────── Your turn
  {
    id: "demo-ok", chapter: "Your turn", target: "demo-banner",
    title: "As a demo visitor, this is what you get",
    body: "You've seen every report, the live backend and the whole upload-to-report flow — but nothing you do here is saved: the demo is shared, so it's read-only and resets every hour.",
    ask: "Is this enough to judge it — or did you want to try it with your own data?",
  },
  {
    id: "close", chapter: "Your turn",
    title: "Make it yours",
    body: "Create a free account to upload your own files, approve batches, switch roles and pin a connector — your data stays private to you. Or leave a note:",
    render: () => <TourCloseSlot />,
  },
]

import type { ReactNode } from "react"
import type { XrayTab } from "@/components/xray/XrayPanelContext"
import { OpenPageCode, TourDataGenerator, TourCloseSlot } from "./slots"

/**
 * The guided tour's script. Each step points at ONE real element (a chart, a
 * table, a control — by its data-tour anchor), says what it shows and how to
 * use it, what it means for the money, and how the data behind it is pulled and
 * protected. Steps can also ACT: an animated cursor moves onto a real control and
 * clicks it (or drives the page's own filter), so the visitor watches the app
 * respond instead of reading about it.
 */
export type Chapter =
  | "Welcome" | "Dashboard" | "P&L" | "Balance sheet" | "Pivot" | "Variance"
  | "Aging" | "Reports" | "X-ray" | "Upload data" | "Connectors" | "Your turn"

export const CHAPTERS: Chapter[] = [
  "Welcome", "Dashboard", "P&L", "Balance sheet", "Pivot", "Variance",
  "Aging", "Reports", "X-ray", "Upload data", "Connectors", "Your turn",
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
  /** Linger after the action (ms). */
  wait?: number
}

export type Side = "right" | "left" | "bottom" | "top"

export interface Step {
  id: string
  chapter: Chapter
  route?: string
  /** Needs the Manager demo identity (Upload data, Connectors). */
  as?: "manager"
  /** Open the X-ray on this tab ("keep" = leave it as is); omitted = closed. */
  xray?: XrayTab | "keep"
  /** data-tour id to spotlight + anchor the card to. */
  target?: string
  prefer?: Side[]
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
const isCollapsed = (el: HTMLElement) => !!el.querySelector(".-rotate-90")

export const STEPS: Step[] = [
  // ───────────────────────── Welcome
  {
    id: "welcome", chapter: "Welcome", route: "/dashboard",
    title: "I'll show you every part of it",
    body: "This is a financial reporting engine — it turns a company's raw accounting files into the reports a CFO uses. I'll walk you through every chart and table, click things for you so you see them react, and for each one tell you what it shows, how to read it, how its data is pulled and how it's protected. Any element can also open its real source code.",
    money: "Built end-to-end by Mariia Chernenko: React front end, Postgres with row-level security, an ingest pipeline with anomaly detection, and live observability (the X-ray).",
    tech: "Use Next / Back, jump between chapters with the ☰ list, or switch on Auto and just watch.",
  },

  // ───────────────────────── Dashboard
  {
    id: "dash-top", chapter: "Dashboard", route: "/dashboard", target: "dash-top", live: true, code: "dash-kpis",
    title: "The monthly health check",
    body: "Four tiles: last month's revenue, EBITDA (operating profit), cash position and DSO (how many days customers take to pay). The small arrow is the change against the month before; the line is the last 18 months. Watch — I'll filter to one company and the whole page recalculates.",
    money: "Green arrow = moving the right way (for DSO, DOWN is good — customers pay faster). This is the first thing a CFO looks at every month.",
    tech: "One query to report_account_monthly — a Postgres view over a materialized roll-up. Row-level security filters it to the companies YOUR login may see before a single row leaves the database; the tiles are computed from those rows in the browser.",
    actions: [
      { to: "dash-filter", say: "Filtering to one company…", control: ["entity", "@first"], wait: 2200 },
      { to: "dash-filter", say: "…and back to all of them", control: ["entity", "all"], wait: 1200 },
    ],
  },
  {
    id: "dash-ratios", chapter: "Dashboard", route: "/dashboard", target: "dash-ratios", live: true, code: "dash-ratios",
    title: "Four ratios that say if the business is safe",
    body: "Gross margin — how much of each euro of sales is left after the direct cost of selling it. Current ratio — short-term assets ÷ short-term debts. DPO — how long we take to pay suppliers. Cash runway — months the cash lasts at the current burn (∞ = we're cash-positive). A ratio turns green when it's in a healthy range.",
    money: "Margin pays for everything else; a current ratio above ~1.5× means bills can be paid; runway under 12 months is a fundraising alarm.",
    tech: "financialRatios() in aggregate.ts — plain, tested formulas over the same RLS-filtered rows. No second query.",
  },
  {
    id: "dash-combo", chapter: "Dashboard", route: "/dashboard", target: "dash-combo", code: "dash-combo",
    title: "Revenue and margin, 18 months",
    body: "Bars are monthly revenue, the line is operating margin (%). Read them together: bars rising while the line falls means we're growing but each sale earns less. Hover any month for the exact figures.",
    money: "Spots the 'busy but less profitable' trap months before it shows in the bank account.",
    tech: "executiveSeries() turns the rows into one point per month. Two different units (€ and %) get two aligned panels on one shared time axis and one hover — never two scales squeezed onto one chart.",
  },
  {
    id: "dash-growth", chapter: "Dashboard", route: "/dashboard", target: "dash-growth", code: "dash-growth",
    title: "Momentum — what's growing faster?",
    body: "Month-over-month growth of revenue next to expenses. When the expense bar is taller than the revenue bar for a few months in a row, costs are outrunning sales.",
    money: "An early warning: margin squeeze shows here first.",
  },
  {
    id: "dash-pnl", chapter: "Dashboard", route: "/dashboard", target: "dash-pnl", code: "dash-pnl",
    title: "Revenue vs expenses vs profit",
    body: "Three lines over time — the gap between revenue and expenses IS the profit line. Seasonality and one-off spikes are easy to see here.",
    money: "Answers 'which months make our year?' at a glance.",
    tech: "monthlyPnl() sums revenue (credit accounts) and expenses (debit accounts) by period, respecting the accounting sign convention.",
  },
  {
    id: "dash-treemap", chapter: "Dashboard", route: "/dashboard", target: "dash-treemap", code: "dash-treemap",
    title: "Where the money goes",
    body: "Every cost account as a box — the bigger the box, the bigger the spend. Hover a box for its share.",
    money: "Where to cut first: the two or three biggest boxes are usually most of the cost.",
  },

  // ───────────────────────── P&L
  {
    id: "pl-filters", chapter: "P&L", route: "/pl", target: "pl-filters", code: "pl-filters",
    title: "Did we make money? Pick the company and month",
    body: "The income statement for any company and any month — or all 18 months together. I'll narrow it to the latest month; everything on this page follows the choice.",
    money: "THE monthly report: did we profit, and where did it come from?",
    actions: [{ to: "pl-filters", say: "Switching to the latest month…", control: ["period", "@latest"], wait: 1600 }],
  },
  {
    id: "pl-bridge", chapter: "P&L", route: "/pl", target: "pl-bridge", code: "pl-bridge",
    title: "From revenue to operating profit, step by step",
    body: "A waterfall: start with revenue, subtract the cost of what we sold (gross profit), subtract operating costs — what's left is EBITDA. Green steps add, red steps take away.",
    money: "Shows exactly which layer of cost eats the profit.",
    tech: "marginBridge() classifies accounts by type (revenue / COGS / opex) from the chart of accounts.",
  },
  {
    id: "pl-top", chapter: "P&L", route: "/pl", target: "pl-top", code: "pl-top",
    title: "The biggest lines of money",
    body: "The six largest accounts this period, revenue and expense side by side, ranked by size.",
    money: "Focus: in most companies a handful of lines are 80% of the money.",
  },
  {
    id: "pl-table", chapter: "P&L", route: "/pl", target: "pl-table", code: "pl-table",
    title: "The full statement — Actual vs Budget",
    body: "Every line with Actual, Budget, the difference and the difference in %, plus a mini-trend. Red means worse than plan (for costs: over budget). Sections fold away so you can read just the subtotals — watch.",
    money: "Budget vs actual is how a board holds management to the plan.",
    tech: "buildPl() builds the subtotals (gross profit, EBITDA) and sign conventions; budgets come from their own RLS-protected table.",
    actions: [
      { to: "pl-section", say: "Folding the revenue detail away — its subtotal stays", skipIf: isCollapsed, wait: 1300 },
      { to: "pl-table", say: "Back to all 18 months", control: ["period", "all"], wait: 700 },
    ],
  },

  // ───────────────────────── Balance
  {
    id: "balance-check", chapter: "Balance sheet", route: "/balance", target: "balance-check", live: true, code: "balance-check",
    title: "What we own vs what we owe — and proof it adds up",
    body: "A balance sheet must satisfy one rule: Assets = Liabilities + Equity. This badge checks it on every load, to the cent. If an upload ever broke the books, it would turn red here.",
    money: "Trust: a balance sheet that doesn't tie is the first thing an auditor catches.",
    tech: "buildBalanceSheet() derives the sheet from the same ledger roll-up, folding the period's profit into equity, then computes the difference.",
  },
  {
    id: "balance-sections", chapter: "Balance sheet", route: "/balance", target: "balance-sections", code: "balance-sections",
    title: "Assets, liabilities, equity — line by line",
    body: "Left: what the company owns (cash, receivables, equipment). Right: what it owes (payables, loans) and what belongs to the owners. Each line keeps its account number for traceability.",
    money: "Solvency at a glance — can the company cover what it owes?",
  },
  {
    id: "balance-cash", chapter: "Balance sheet", route: "/balance", target: "balance-cash", code: "balance-cash",
    title: "Cash position over time",
    body: "The cash balance at each month end. A steady climb is healthy; a slope down is burn.",
    money: "Cash, not profit, is what keeps a company alive.",
  },
  {
    id: "balance-capital", chapter: "Balance sheet", route: "/balance", target: "balance-capital", code: "balance-capital",
    title: "How the company is financed",
    body: "One bar split into debt (liabilities) and owners' money (equity). The bigger the debt share, the more leveraged — and the riskier.",
    money: "A quick leverage read that banks and investors check first.",
  },
  {
    id: "balance-cf", chapter: "Balance sheet", route: "/balance", target: "balance-cf", code: "balance-cf",
    title: "Where the cash actually went",
    body: "An indirect cash-flow waterfall: from operating cash through investing (equipment) and financing (loans, owners) to the closing balance.",
    money: "Explains why cash moved differently from profit.",
    tech: "cashFlowSteps() — the indirect method over account movements, trailing 12 months.",
  },

  // ───────────────────────── Pivot
  {
    id: "pivot-controls", chapter: "Pivot", route: "/pivot", target: "pivot-controls", code: "pivot-controls",
    title: "Ask your own question of the ledger",
    body: "Choose what goes in the rows, what goes in the columns and what to measure. Watch: I'll put Accounts in the rows, keep Companies in the columns, then swap them.",
    money: "The 'let me look at it myself' tool — no analyst, no export to Excel.",
    actions: [
      { to: "pivot-rows", say: "Rows → Account", control: ["pivot.rows", "account"], wait: 1400 },
      { to: "pivot-cols", say: "Columns → Entity (company)", control: ["pivot.cols", "entity"], wait: 1000 },
      { to: "pivot-swap", say: "Swapping rows ↔ columns…", wait: 1500 },
      { to: "pivot-swap", say: "…and back", wait: 900 },
    ],
  },
  {
    id: "pivot-grid", chapter: "Pivot", route: "/pivot", target: "pivot-grid", live: "pivot-caption", code: "pivot-grid",
    title: "How to find something in it",
    body: "Every cell is one account in one company. The darker the green, the more money. To find a problem: run your eye along a row to its darkest cell — that's where that account is biggest. (Brackets) are credits, e.g. revenue. Totals sit on the right; the bottom row is €0 on purpose — in double-entry books debits always equal credits, so a non-zero there would mean broken data.",
    money: "Find the leak: which account, which company, which month is costing the most.",
    tech: "buildPivot() pivots the RLS-filtered rows in the browser — every re-pivot is instant and never re-queries the database.",
  },
  {
    id: "pivot-bars", chapter: "Pivot", route: "/pivot", target: "pivot-bars", code: "pivot-bars",
    title: "The same table, ranked",
    body: "The row totals as bars, biggest first — the table's heat turned into a ranking you read in two seconds.",
  },

  // ───────────────────────── Variance
  {
    id: "variance-controls", chapter: "Variance", route: "/variance", target: "variance-controls", live: true, code: "variance-controls",
    title: "Why did profit change?",
    body: "Pick a month and compare it with the month before (or with the budget). The badge on the right is the total change in operating income.",
    money: "Turns 'profit dropped' into 'profit dropped because of these three lines'.",
  },
  {
    id: "variance-bridge", chapter: "Variance", route: "/variance", target: "variance-bridge", code: "variance-bridge",
    title: "The profit bridge",
    body: "Start at last month's operating income, then each line adds (green) or removes (red) its share, ending at this month. The steps always sum exactly to the total change.",
    money: "Explain a profit swing to a board in one picture.",
    tech: "buildVarianceBridge() computes each driver's favourable/unfavourable impact with the right sign per account type.",
  },
  {
    id: "variance-table", chapter: "Variance", route: "/variance", target: "variance-table", code: "variance-table",
    title: "The numbers behind each step",
    body: "Each driver with its base, actual, the change, and its impact on operating income — sorted so the biggest movers are on top.",
  },

  // ───────────────────────── Aging
  {
    id: "aging-kpis", chapter: "Aging", route: "/aging", target: "aging-kpis", live: true, code: "aging-kpis",
    title: "Who owes us money — and how late",
    body: "Unpaid invoices: the total, what's still on time (0–30 days), what's overdue, and what's over 90 days late.",
    money: "Money stuck in unpaid invoices is money you can't spend. 90+ days is at real risk of never coming.",
    tech: "Invoices come from their own table, protected by the same per-company row-level security; buildAging() buckets them by days past due.",
  },
  {
    id: "aging-toggle", chapter: "Aging", route: "/aging", target: "aging-toggle", code: "aging-toggle",
    title: "Both directions: receivables and payables",
    body: "Receivables = what customers owe US. Payables = what WE owe suppliers. Watch the whole page switch.",
    actions: [
      { to: "aging-ap", say: "Switching to payables — what we owe…", wait: 1900 },
      { to: "aging-ar", say: "…back to receivables — what we're owed", wait: 900 },
    ],
  },
  {
    id: "aging-stacked", chapter: "Aging", route: "/aging", target: "aging-stacked", code: "aging-stacked",
    title: "Per company, by how late",
    body: "One bar per company, split by age bucket — green is fresh, red is 90+. A long red end means that company's customers aren't paying.",
    money: "Tells collections who to call first.",
  },
  {
    id: "aging-risk", chapter: "Aging", route: "/aging", target: "aging-risk", code: "aging-risk",
    title: "Collection risk in one bar",
    body: "The share of all open money in each age bucket. The further the weight sits to the right, the slower the cash comes in.",
  },
  {
    id: "aging-heat", chapter: "Aging", route: "/aging", target: "aging-heat", code: "aging-heat",
    title: "The exact amounts",
    body: "Company × age bucket, shaded by size — the darker, the bigger the amount waiting.",
  },

  // ───────────────────────── Reports
  {
    id: "reports-trend", chapter: "Reports", route: "/reports", target: "reports-trend", code: "reports-trend",
    title: "Click a month to drill in",
    body: "This chart is interactive: clicking a month filters the detailed table below to just that month. I'll do it for the latest one.",
    actions: [{ to: "reports-trend", say: "Drilling into the latest month…", control: ["period", "@latest"], wait: 1300 }],
  },
  {
    id: "reports-table", chapter: "Reports", route: "/reports", target: "reports-table", live: "reports-filters", code: "reports-table",
    title: "The raw roll-up every report is built from",
    body: "Each row: one account, one company, one month — debit, credit and net. Every chart in this app is computed from exactly these rows.",
    money: "Full traceability: any number on any chart can be traced back to these lines.",
    tech: "report_account_monthly is a security_invoker view over a materialized roll-up; its WHERE clause (is_admin() OR your companies) is the barrier between tenants.",
    actions: [{ to: "reports-table", say: "Back to all months", control: ["period", "all"], wait: 600 }],
  },

  // ───────────────────────── X-ray
  {
    id: "xray-open", chapter: "X-ray", route: "/reports", target: "xray-button", prefer: ["bottom", "left"],
    title: "The X-ray: the backend, made visible",
    body: "Most demos hide the engine. This one has an X-ray: a panel that shows, live, what the app is doing behind each screen. I'll open it.",
    actions: [{ to: "xray-button", say: "Opening the X-ray…", wait: 900 }],
  },
  {
    id: "xray-calls", chapter: "X-ray", route: "/reports", xray: "calls", target: "xray-calls", code: "xray-calls",
    title: "Every request, logged live",
    body: "Each line is one real call this page made to the backend — what it asked for, the status, how many milliseconds it took. The bars on top are latency. I'll open one call.",
    money: "Nothing is faked or pre-baked: the numbers you saw were fetched exactly like this.",
    tech: "One instrumented fetch wraps the Supabase client, so every request is captured at a single seam — REST, RPC, auth, storage and edge functions alike.",
    actions: [{ to: "xray-call-row", say: "Expanding a call…", wait: 900 }],
  },
  {
    id: "xray-rls", chapter: "X-ray", route: "/reports", xray: "rls", target: "xray-rls", code: "xray-rls",
    title: "How your data is protected",
    body: "The SAME query, run as three different users. I'll click each one: a Viewer, a Manager and an Admin get different rows — because Postgres decides, not the screen. These run in an isolated session, so your own view doesn't change.",
    money: "In a multi-company product, one customer seeing another's numbers is a company-ending bug. Here it's impossible by design.",
    tech: "Row-level security policies on every table check auth.uid() against the companies a user is a member of. Global access needs an explicit platform-staff flag — a hardening added after a privilege-escalation review.",
    actions: [
      { to: "rls-run-viewer", say: "Running it as a Viewer…", wait: 2200 },
      { to: "rls-run-manager", say: "…as a Manager…", wait: 2200 },
      { to: "rls-run-admin", say: "…and as an Admin", wait: 2200 },
    ],
  },
  {
    id: "xray-sql", chapter: "X-ray", route: "/reports", xray: "sql", target: "xray-sql", code: "xray-sql",
    title: "The actual SQL behind it",
    body: "The real policies and functions, straight from the database migrations: who may read which company, who may approve a batch, and the admin hardening. A 'seen' tag marks the ones this session actually hit. 'Open file' shows the whole migration.",
  },
  {
    id: "xray-code", chapter: "X-ray", route: "/reports", xray: "code", target: "xray-code",
    title: "The real code of this page",
    body: "The React component that rendered the page you're on — the actual repository file, not a screenshot. Open it full screen and it's a proper code editor with an Explorer of the files behind every chart.",
    render: () => <OpenPageCode />,
  },
  {
    id: "xray-arch", chapter: "X-ray", route: "/reports", xray: "arch", target: "xray-arch",
    title: "Where it all runs",
    body: "Browser → auth → edge functions → database API → Postgres (security policies, triggers, pg_cron, pg_net) → storage → the ETL worker. Layers light up only when this session actually used them — nothing is lit for show.",
  },

  // ───────────────────────── Upload data
  {
    id: "role", chapter: "Upload data", route: "/reports", target: "role-switch", prefer: ["bottom", "left"], code: "role-switch",
    title: "Switching you to a Manager",
    body: "A Viewer only reads reports. A Manager can also upload data, review it and approve it. In the demo you switch here — I'll click it for you.",
    money: "Who may put a number into the books is a control in itself (segregation of duties).",
    tech: "Both demo identities are locked read-only in the database: a trigger refuses their writes, whatever the screen shows.",
    actions: [
      { to: "role-switch", say: "Opening the role menu…", demoOnly: true, wait: 700 },
      { to: "role-manager", spot: "role-menu", say: "Choosing Manager…", demoOnly: true, wait: 2200 },
    ],
  },
  {
    id: "nav", chapter: "Upload data", as: "manager", route: "/reports", target: "main-nav", prefer: ["bottom"],
    title: "New pages appeared",
    body: "As a Manager the menu now has Ingest (upload data) and Connectors (automatic import). A Viewer never sees them. Let's open Ingest.",
    actions: [{ to: "nav-ingest", say: "Opening Ingest…", wait: 1200 }],
  },
  {
    id: "ingest-guide", chapter: "Upload data", as: "manager", route: "/ingest", target: "ingest-guide", code: "ingest-guide",
    title: "Step 1 — what file to upload",
    body: "A plain CSV export from any accounting tool: account number, date, debit, credit, currency. Different column names are fine — you map them after choosing the file. There's a template to download.",
    actions: [{ to: "ingest-guide-toggle", say: "Opening the file guide…", skipIf: isOpen, wait: 900 }],
  },
  {
    id: "ingest-upload", chapter: "Upload data", as: "manager", route: "/ingest", target: "ingest-upload", code: "ingest-upload",
    title: "Step 2 — upload it",
    body: "Choose the company, the month and the file, then Upload. The file is read in your browser, sent to private storage and checked row by row. In this demo uploads are blocked (it's shared and read-only) — with a free account it runs for real. Here's a file shaped like real books, with one planted anomaly:",
    tech: "An edge function issues a signed upload URL to private storage; the parsed rows go to a SECURITY DEFINER function that validates them and runs the anomaly screen.",
    render: () => <TourDataGenerator />,
  },
  {
    id: "ingest-batches", chapter: "Upload data", as: "manager", route: "/ingest", target: "batches-table", live: "ingest-batches", code: "ingest-batches",
    title: "Step 3 — where it shows up",
    body: "Every upload becomes a batch: Waiting → Processing → Needs review → Done. 'Needs review' means something was flagged. I'll open the one waiting for review.",
    actions: [{ to: "batch-review-row", say: "Opening the batch waiting for review…", wait: 1600 }],
  },
  {
    id: "batch-summary", chapter: "Upload data", as: "manager", route: "/ingest", target: "batch-summary", live: true, code: "batch-detail",
    title: "Step 4 — review before anything reaches a report",
    body: "The batch is checked before a single number reaches the reports: how many rows will load, how many are held as anomalies, how many have errors — and whether debits equal credits. Nothing loads until a Manager presses Approve (below), and then only the clean rows.",
    money: "Catches the wrong number BEFORE it reaches the CFO — e.g. utilities at 10× their usual level.",
    tech: "Approve is a database function: it locks the batch row, re-checks your role for that company, and fails closed. Demo accounts are refused by a trigger.",
  },
  {
    id: "batch-rows", chapter: "Upload data", as: "manager", route: "/ingest", target: "batch-rows", code: "batch-detail",
    title: "…and exactly why each row is held",
    body: "Every row with its status. A held row says why in plain numbers — e.g. “month net 5000 is 107σ vs the 12-month mean 1364” — so a reviewer can decide in seconds instead of hunting through a spreadsheet.",
    tech: "The anomaly screen is a z-score per account against its own trailing 12 months (flag at 3σ, needs 3+ months of history), computed in SQL during the transform.",
  },
  {
    id: "pipeline", chapter: "Upload data", as: "manager", route: "/ingest", xray: "pipeline", target: "xray-pipeline", code: "xray-pipeline",
    title: "Step 5 — after Approve, it runs by itself",
    body: "Approving writes the journal; a database trigger queues a refresh; pg_cron rebuilds the reporting tables every minute; pg_net notifies a reviewer. This timeline streams those events live as they happen.",
    money: "Upload → review → reports, with no one exporting or copy-pasting anything.",
  },

  // ───────────────────────── Connectors
  {
    id: "connectors-add", chapter: "Connectors", as: "manager", route: "/connectors", target: "connectors-add", code: "connectors-add",
    title: "Skip the manual upload — pin a connector",
    body: "Choose the company and a type: Google Drive (pick a folder, approve access once, new files are pulled automatically) or Webhook (you get a URL + secret; your accounting system posts files to it). Name it, press Add.",
    money: "Month-end data arrives on its own, and goes through the same checks and review.",
  },
  {
    id: "connectors-how", chapter: "Connectors", as: "manager", route: "/connectors", target: "connectors-how", code: "connectors-how",
    title: "How it works — and how to test it without Google",
    body: "Drive uses real OAuth and resumes where it stopped; each file is imported at most once. 'Simulate sync' pushes a sample file through the exact same pipeline with one click — no Google sign-in. Webhooks are verified with an HMAC signature compared in constant time.",
  },

  // ───────────────────────── Your turn
  {
    id: "demo-ok", chapter: "Your turn", target: "demo-banner", prefer: ["bottom"],
    title: "As a demo visitor, this is what you get",
    body: "You've seen every report, the live backend, and the whole upload-to-report flow — but nothing you do here is saved: the demo is shared, so it's read-only and resets every hour.",
    ask: "Is this enough to judge it — or did you want to try it with your own data?",
  },
  {
    id: "close", chapter: "Your turn",
    title: "Make it yours",
    body: "Create a free account to upload your own files, approve batches, switch roles and pin a connector — your data stays private to you. Or leave a note:",
    render: () => <TourCloseSlot />,
  },
]

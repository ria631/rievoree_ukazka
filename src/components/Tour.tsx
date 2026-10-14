import { useEffect, useState, type ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { AnimatePresence, motion } from "motion/react"
import { ScanLine, X, Check, Wand2, MousePointerClick } from "lucide-react"
import { useXrayPanel, type XrayTab } from "@/components/xray/XrayPanelContext"
import { DataGenerator } from "@/components/DataGenerator"
import { Spotlight } from "@/components/Spotlight"
import { supabase } from "@/lib/supabase"

/**
 * Guided tour — the part that SELLS the project. It actually DRIVES the demo:
 * it walks the real menu pages (Dashboard, P&L, Balance, Pivot, Variance, Aging,
 * Reports), opens the X-ray to the right lens at each stop, and even plays the
 * "same query as three roles" RLS demo for you. At each step it says what you're
 * seeing AND where that skill matters in a real product. Fully client-safe: no
 * writes to tenant data.
 *
 * When a visitor enters the demo they first choose: let the tour drive (with
 * animation), or explore on their own.
 */
const SEEN_KEY = "xray-tour-choice"

interface StepCtx {
  runRls: () => void
  navigate: (to: string) => void
  signInAs: (email: string) => Promise<void>
}
interface Step {
  title: string
  body: string
  sell?: string                 // "where this helps" line
  go?: string                   // navigate here
  xray?: XrayTab                // open the panel on this tab
  highlight?: string            // CSS selector to spotlight (dim everything else)
  onEnter?: (ctx: StepCtx) => void | Promise<void>
  render?: () => ReactNode      // custom content (generator, feedback)
}

const DEMO_PASSWORD = "demo123456"

const STEPS: Step[] = [
  {
    title: "See the machinery — I'll drive",
    body: "This is a financial reporting engine built backend-first by Mariia Chernenko. In about three minutes I'll click through the whole thing myself — the reports that tell you if you're making money, and the secured backend working under every number. I'll spotlight what matters as we go.",
    sell: "What this demonstrates: production-grade full-stack — security, data pipelines, and the judgement to make them observable.",
    go: "/dashboard",
  },
  {
    title: "1 · The CFO snapshot",
    body: "Start here every month. These four tiles — revenue, EBITDA, cash position and DSO — are the one-glance “are we healthy?”, each with an 18-month sparkline and its month-over-month move. Scroll down and you'll find the revenue-vs-margin trend, momentum, and the cost structure.",
    sell: "How it counts money: margin falling, cash rising, how fast customers actually pay — the health read a CFO scans first.",
    go: "/dashboard",
    highlight: "[data-tour=\"dash-kpis\"]",
  },
  {
    title: "2 · How every number arrives",
    body: "Open the X-ray. Every figure on that dashboard came through ONE instrumented fetch layer — and here it is, logged live: each request's endpoint, status and milliseconds. Nothing is faked or hard-coded; the data is pulled exactly like this, in the open.",
    sell: "Where it helps: an engineer sees the real request path and timings — observability built in, not bolted on.",
    go: "/dashboard",
    xray: "calls",
    highlight: "[data-tour=\"xray-calls\"]",
  },
  {
    title: "3 · The real code, in place",
    body: "Same panel, Code tab: the actual React component rendering this page — real repo source, syntax-highlighted. Hit “Full screen” and it reads like an IDE. No screenshots, no hand-waving — what you see is what's shipped.",
    sell: "Where it helps: honesty. A reviewer reads exactly how it's built, line by line.",
    go: "/dashboard",
    xray: "code",
    highlight: "[data-tour=\"xray-code\"]",
  },
  {
    title: "4 · Did we make money? (P&L)",
    body: "The income statement. This bridge walks revenue → gross profit → EBITDA; beside it, the biggest lines of money. Below, every line as Actual vs Budget vs Variance with the accounting sign convention and a per-line trend.",
    sell: "How it counts money: THE monthly report — did we profit, and where did it come from?",
    go: "/pl",
    highlight: "[data-tour=\"pl-charts\"]",
  },
  {
    title: "5 · What we own vs owe (Balance sheet)",
    body: "Assets, liabilities and equity — and this badge is the proof it ties: Assets = Liabilities + Equity, to the cent. Below it, an indirect cash-flow waterfall showing where the cash actually went this year.",
    sell: "How it counts money: is the business solvent, and did the cash move where you'd expect?",
    go: "/balance",
    highlight: "[data-tour=\"balance-check\"]",
  },
  {
    title: "6 · Where does money move? (Pivot)",
    body: "Pivot the entire ledger across any two dimensions — entity, account, type, period — heat-mapped by magnitude. Swap orientation, change the measure. Multi-entity pivoting most dashboards skip.",
    sell: "How it counts money: find the leak — which account, which month, which entity is bleeding cash.",
    go: "/pivot",
    highlight: "[data-tour=\"pivot-grid\"]",
  },
  {
    title: "7 · Why did profit move? (Variance)",
    body: "An operating-income bridge: base → each line's favourable or unfavourable driver → actual. The drivers sum exactly to the total variance, so you can trace a swing from end to end.",
    sell: "How it counts money: explain a profit swing to the board in one chart.",
    go: "/variance",
    highlight: "[data-tour=\"variance-bridge\"]",
  },
  {
    title: "8 · Who owes you, and how late (Aging)",
    body: "AR and AP open balances bucketed by days past due — 0–30 / 31–60 / 61–90 / 90+. The further right the weight sits, the slower the cash and the harder it is to collect.",
    sell: "How it counts money: chase the right invoices first; 90+ is money at real risk.",
    go: "/aging",
    highlight: "[data-tour=\"aging-chart\"]",
  },
  {
    title: "9 · How your data is protected",
    body: "The core trick. The SAME query runs as Viewer, Manager and Admin — I'm switching identity for you now, in an isolated session. Different rows each time, decided by Postgres row-level security, NOT the frontend. One tenant can never see another's numbers.",
    sell: "Where it helps: multi-tenant SaaS, where a leak between customers is a company-ending bug. (The SQL tab shows the exact policy and the privilege-escalation it was hardened against.)",
    go: "/reports",
    xray: "rls",
    highlight: "[data-tour=\"xray-rls\"]",
    onEnter: ({ runRls }) => runRls(),
  },
  {
    title: "10 · Watch the menu change",
    body: "Now I'm signing you in as a Manager. Watch the top navigation — new pages appear: Upload data and Connectors. This is the write side of the app, the part a Viewer role never even sees.",
    sell: "How roles count money: who may approve a figure into the books is itself a control — segregation of duties, enforced server-side.",
    highlight: "[data-tour=\"main-nav\"]",
    onEnter: async ({ signInAs, navigate }) => { await signInAs("manager@demo.local"); navigate("/ingest") },
  },
  {
    title: "11 · Messy spreadsheets in → clean reports out",
    body: "This is Upload data — where a client's raw books come in. We check each row and flag anything far outside its own history (a z-score screen) before it can reach a report. A manager approves, it loads, and every report above refreshes automatically. Here's data shaped like yours to try, with a planted anomaly:",
    sell: "How it counts money: this is the whole value — turn raw books into trustworthy reports, and catch the bad number before it costs someone a decision.",
    go: "/ingest",
    highlight: "[data-tour=\"ingest-upload\"]",
    render: () => <DataGenerator />,
  },
  {
    title: "12 · The async machinery, live",
    body: "A batch sits at “Needs review” until approved. On approval, database triggers + pg_cron + pg_net load the rows and rebuild the materialized views — and the Pipeline tab streams each event as it fires. The backend talking to itself, in the open.",
    sell: "Where it helps: scheduled, event-driven jobs you can actually watch instead of trusting a black box.",
    go: "/ingest",
    xray: "pipeline",
    highlight: "[data-tour=\"ingest-batches\"]",
  },
  {
    title: "13 · Skip the manual step — pin a connector",
    body: "Don't want to upload by hand? Pin a connector. A Google Drive folder (real OAuth, resumable page token) or an HMAC-signed webhook — new files flow through the EXACT same validate → z-score → review path. One click of “Simulate sync” runs a file through the whole chain live.",
    sell: "Where it helps: real, automated ingestion — the same pipeline, now fed by a source instead of a person.",
    go: "/connectors",
    highlight: "[data-tour=\"connectors-add\"]",
  },
  {
    title: "You saw everything — and could change nothing",
    body: "That's the full picture: the reports, the security, the pipeline, the connectors, the real code. As a read-only demo you could look everywhere but write nowhere — which is exactly the guarantee a real tenant needs, enforced by the database, not the UI. To make it yours — upload your own data, switch your own roles, approve batches, pin a connector — grab a free account. Or just tell me what you thought:",
    render: () => <TourClose />,
  },
]

export function Tour({ autoOffer }: { autoOffer?: boolean }) {
  const navigate = useNavigate()
  const { openTo, setOpen, runRls } = useXrayPanel()
  const [running, setRunning] = useState(false)
  const [i, setI] = useState(0)
  const [choice, setChoice] = useState<"pending" | "made">("made")

  // First visit: offer the choice (guided vs self). Remembered per browser.
  useEffect(() => {
    if (!autoOffer) return
    try {
      if (localStorage.getItem(SEEN_KEY) !== "1") setChoice("pending")
    } catch { /* private mode → skip the offer */ }
  }, [autoOffer])

  function remember() { try { localStorage.setItem(SEEN_KEY, "1") } catch { /* ignore */ } }

  async function signInAs(email: string) {
    await supabase.auth.signInWithPassword({ email, password: DEMO_PASSWORD })
    // Give AuthProvider a tick to propagate the new session before we navigate.
    await new Promise((r) => setTimeout(r, 350))
  }
  function applyStep(step: Step) {
    if (step.go) navigate({ to: step.go })
    // Open the X-ray to the step's tab, or close it so a highlighted chart on the
    // page isn't covered by the drawer.
    if (step.xray) openTo(step.xray)
    else setOpen(false)
    void step.onEnter?.({ runRls, navigate: (to) => navigate({ to }), signInAs })
  }
  function start() { remember(); setChoice("made"); setI(0); setRunning(true); applyStep(STEPS[0]) }
  function chooseSelf() { remember(); setChoice("made") }
  function next() { if (i >= STEPS.length - 1) { end(); return } const n = i + 1; setI(n); applyStep(STEPS[n]) }
  function back() { if (i === 0) return; const n = i - 1; setI(n); applyStep(STEPS[n]) }
  function end() { setRunning(false); setOpen(false) }

  const step = STEPS[i]
  const isLast = i >= STEPS.length - 1

  return (
    <>
      {/* Persistent launcher */}
      {!running && (
        <button onClick={start}
          className="fixed bottom-5 left-5 z-50 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-accent-foreground shadow-soft transition hover:brightness-110">
          <ScanLine className="size-3.5" strokeWidth={2.25} /> Take the tour
        </button>
      )}

      {/* First-visit choice — guided agent vs explore yourself */}
      <AnimatePresence>
        {choice === "pending" && !running && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-soft ring-1 ring-border md:p-8">
              <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">Welcome to the demo</span>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">How do you want to look around?</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                It's read-only — nothing you do is saved. Pick a path:
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button onClick={start}
                  className="group flex flex-col items-start gap-2 rounded-xl border border-accent bg-accent/10 p-4 text-left transition hover:bg-accent/15">
                  <Wand2 className="size-5 text-accent" />
                  <span className="font-semibold">Guide me through it</span>
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    A 3-minute animated walkthrough — I open each page and show the backend working.
                  </span>
                </button>
                <button onClick={chooseSelf}
                  className="group flex flex-col items-start gap-2 rounded-xl border border-border p-4 text-left transition hover:border-accent/60 hover:bg-foreground/[0.03]">
                  <MousePointerClick className="size-5 text-foreground" />
                  <span className="font-semibold">I'll explore myself</span>
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    Click around freely. You can start the tour any time from the button, bottom-left.
                  </span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spotlight — dims the page and rings the element this step points at. */}
      {running && <Spotlight selector={step.highlight ?? null} />}

      {/* The step card — above the spotlight dim (z-55) so it stays readable. */}
      <AnimatePresence>
        {running && (
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-5 left-5 z-[60] flex max-h-[85vh] w-[min(93vw,24rem)] flex-col rounded-2xl border border-border bg-card shadow-soft ring-1 ring-border">
            <div className="flex items-start justify-between gap-3 px-5 pt-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-accent">Tour · {i + 1} / {STEPS.length}</span>
              <button onClick={end} aria-label="End tour" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            </div>
            <div className="flex gap-1 px-5 pt-2">
              {STEPS.map((_, idx) => (
                <span key={idx} className={`h-1 flex-1 rounded-full ${idx <= i ? "bg-accent" : "bg-border"}`} />
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              <h3 className="text-lg font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              {step.sell && (
                <p className="mt-3 border-l-2 border-accent/50 pl-3 text-sm leading-relaxed text-foreground/90">{step.sell}</p>
              )}
              {step.render && <div className="mt-4">{step.render()}</div>}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
              <button onClick={back} disabled={i === 0}
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground disabled:opacity-40 hover:text-foreground">← Back</button>
              <button onClick={next}
                className="rounded-full bg-foreground px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-background transition hover:scale-[1.03]">
                {isLast ? "Done" : "Next →"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

/** Closing step: a quick 👍/👎 + note (→ tour_feedback), an email capture
 *  (→ leads), and the CTAs. All insert-only, read-nobody tables. */
function TourClose() {
  const [helpful, setHelpful] = useState<boolean | null>(null)
  const [note, setNote] = useState("")
  const [email, setEmail] = useState("")
  const [sentFb, setSentFb] = useState(false)
  const [sentEmail, setSentEmail] = useState(false)

  async function sendFeedback(h: boolean) {
    setHelpful(h)
    try { await supabase.from("tour_feedback").insert({ helpful: h, note: note.trim() || null, step: "end" }) } catch { /* best-effort */ }
    setSentFb(true)
  }
  async function sendEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    try { await supabase.from("leads").insert({ email: email.trim(), source: "tour" }) } catch { /* best-effort */ }
    setSentEmail(true); setEmail("")
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-background/40 p-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Was this useful?</p>
        {sentFb ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-accent"><Check className="size-4" /> Thanks for the feedback.</p>
        ) : (
          <>
            <div className="mt-2 flex gap-2">
              <button onClick={() => sendFeedback(true)}
                className={`rounded-md border px-3 py-1.5 text-sm transition ${helpful === true ? "border-accent bg-accent/10" : "border-border hover:border-accent"}`}>👍 Yes</button>
              <button onClick={() => sendFeedback(false)}
                className={`rounded-md border px-3 py-1.5 text-sm transition ${helpful === false ? "border-accent bg-accent/10" : "border-border hover:border-accent"}`}>👎 Not really</button>
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional — one line of feedback"
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-xs outline-none transition focus:border-accent" />
          </>
        )}
      </div>

      <div className="rounded-xl border border-border bg-background/40 p-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Leave an email (optional)</p>
        {sentEmail ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-accent"><Check className="size-4" /> Noted — thank you.</p>
        ) : (
          <form onSubmit={sendEmail} className="mt-2 flex gap-2">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs outline-none transition focus:border-accent" />
            <button type="submit" className="shrink-0 rounded-md bg-foreground px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-background">Send</button>
          </form>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <a href="/register" className="rounded-full bg-accent px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110">Create account</a>
        <a href="/login" className="rounded-full border border-border px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-foreground transition hover:border-accent">Sign in</a>
        <a href="https://github.com/ria631/rievoree_ukazka" target="_blank" rel="noreferrer" className="rounded-full border border-border px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-foreground transition hover:border-accent">Code ↗</a>
      </div>
    </div>
  )
}

import { useEffect, useState, type ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { AnimatePresence, motion } from "motion/react"
import { ScanLine, X, Check, Wand2, MousePointerClick } from "lucide-react"
import { useXrayPanel, type XrayTab } from "@/components/xray/XrayPanelContext"
import { DataGenerator } from "@/components/DataGenerator"
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

interface Step {
  title: string
  body: string
  sell?: string                 // "where this helps" line
  go?: string                   // navigate here
  xray?: XrayTab                // open the panel on this tab
  onEnter?: (ctx: { runRls: () => void }) => void
  render?: () => ReactNode      // custom content (generator, feedback)
}

const STEPS: Step[] = [
  {
    title: "See the machinery — I'll drive",
    body: "A 3-minute walk through a financial reporting engine built backend-first by Mariia Chernenko. Sit back — I'll open each page and show the backend working underneath.",
    sell: "What this demonstrates: production-grade full-stack — security, data pipelines, and the judgement to make them observable.",
    go: "/dashboard",
  },
  {
    title: "1 · Live, timed numbers",
    body: "This is the CFO dashboard. Every figure came from Postgres through one instrumented fetch — the X-ray Calls panel logs each request with its status and milliseconds.",
    sell: "Where it helps: proving performance and debugging a slow page in production without guessing.",
    go: "/dashboard",
    xray: "calls",
  },
  {
    title: "2 · The real code, in place",
    body: "The Code tab is the actual React component rendering this page — real source from the repo, syntax-highlighted, not a screenshot.",
    sell: "Where it helps: honesty. A reviewer can read exactly how it's built.",
    go: "/dashboard",
    xray: "code",
  },
  {
    title: "3 · Income statement (P&L)",
    body: "Profit & loss with Actual / Budget / Variance, subtotals, the accounting sign convention and a trend per line. Real double-entry, not a mock-up.",
    sell: "Where it helps: the report a CFO actually reads every month.",
    go: "/pl",
  },
  {
    title: "4 · Balance sheet & cash flow",
    body: "Assets, liabilities & equity — with the fundamental check that it ties (A = L + E) — plus an indirect cash-flow waterfall.",
    sell: "Where it helps: catching a books-don't-balance error the moment it happens.",
    go: "/balance",
  },
  {
    title: "5 · Pivot — slice any way",
    body: "Pivot the ledger across any two dimensions (entity, account, type, period), heat-mapped by magnitude. Multi-entity pivoting most dashboards skip.",
    sell: "Where it helps: answering an ad-hoc 'show me X by Y' without a data analyst.",
    go: "/pivot",
  },
  {
    title: "6 · Variance bridge & aging",
    body: "An operating-income bridge (base → per-line drivers → actual) and AR/AP aging bucketed by days past due. We'll glance at both.",
    sell: "Where it helps: explaining WHY a number moved, and chasing overdue cash.",
    go: "/variance",
  },
  {
    title: "7 · Reports, RLS-filtered",
    body: "The per-account monthly roll-up — filtered to the entities your role may see. Click a month to filter the table.",
    sell: "Where it helps: one report, safely scoped per user.",
    go: "/reports",
  },
  {
    title: "8 · Row-level security — watch the roles switch",
    body: "Here's the core. The SAME query runs as Viewer, Manager and Admin — I'm switching identity for you now. Different rows each time, decided by the database, not the UI. (The SQL tab shows the policy, and the privilege-escalation it was hardened against.)",
    sell: "Where it helps: multi-tenant SaaS, where one customer seeing another's data is a company-ending bug.",
    go: "/dashboard",
    onEnter: ({ runRls }) => runRls(),
  },
  {
    title: "9 · The ETL pipeline — try it with your data",
    body: "Uploading a spreadsheet runs validate → z-score anomaly screen → approval → idempotent load → auto-refresh. Uploading lives on the Ingest page (sign in to use it). Generate a month of data shaped like yours — with a planted anomaly — and take it with you:",
    sell: "Where it helps: onboarding a client's books and catching bad numbers before they hit a report.",
    render: () => <DataGenerator />,
  },
  {
    title: "10 · The async machinery, live",
    body: "On approval, database triggers + pg_cron + pg_net load the rows and refresh the reports. The Pipeline tab streams those events as they fire — the backend talking to itself, in the open.",
    sell: "Where it helps: scheduled, event-driven jobs you can actually see.",
    go: "/dashboard",
    xray: "pipeline",
  },
  {
    title: "That's the machinery",
    body: "Thanks for looking. If this is the kind of work you'd want on your team — or you'd just like to say what you thought:",
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

  function applyStep(step: Step) {
    if (step.go) navigate({ to: step.go })
    if (step.xray) openTo(step.xray)
    else if (!step.onEnter) setOpen(false)
    step.onEnter?.({ runRls })
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

      {/* The step card */}
      <AnimatePresence>
        {running && (
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-5 left-5 z-50 flex max-h-[85vh] w-[min(93vw,24rem)] flex-col rounded-2xl border border-border bg-card shadow-soft ring-1 ring-border">
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
